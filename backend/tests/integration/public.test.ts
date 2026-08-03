import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearInmobiliariaCompleta, crearPropiedad } from "./helpers/factories";

const app = createApp();

/**
 * Es el complemento en caliente de `public.repository.test.ts`: aquel prueba,
 * con Prisma mockeado, que ningún `where` del catálogo sale sin `visibilidad`
 * (solo publicadas/destacadas de inmobiliarias activas). Acá se siembran datos
 * reales —un borrador, una pausada, una publicada, una destacada y una de una
 * inmobiliaria suspendida— y se comprueba que nada de lo que no debería verse
 * se escapa por ningún endpoint del módulo `public`.
 *
 * Cada 404/exclusión va acompañado de un control positivo: sin eso, un
 * endpoint que devolviera 404 (o una lista vacía) a todo el mundo pasaría
 * igual los casos negativos sin estar aislando nada.
 */
describe("catálogo público", () => {
  let idPublicada: string;
  let idBorrador: string;
  let idDeSuspendida: string;

  beforeEach(async () => {
    const activa = await crearInmobiliariaCompleta("activa");
    const suspendida = await crearInmobiliariaCompleta("suspendida", { isActive: false });

    idPublicada = (
      await crearPropiedad(activa.tenant.id, { title: "Publicada", status: "published" })
    ).id;
    await crearPropiedad(activa.tenant.id, { title: "Destacada", status: "featured" });
    idBorrador = (
      await crearPropiedad(activa.tenant.id, { title: "Borrador", status: "draft" })
    ).id;
    await crearPropiedad(activa.tenant.id, { title: "Pausada", status: "paused" });
    idDeSuspendida = (
      await crearPropiedad(suspendida.tenant.id, {
        title: "De suspendida",
        status: "published",
      })
    ).id;
  });

  it("el listado solo trae publicadas y destacadas de inmobiliarias activas", async () => {
    const res = await request(app).get("/api/public/properties");

    expect(res.status).toBe(200);
    const titulos = res.body.items.map((p: { title: string }) => p.title).sort();
    expect(titulos).toEqual(["Destacada", "Publicada"]);
  });

  it("una propiedad publicada se ve por su ficha", async () => {
    // Control positivo de los dos 404 de abajo: sin este caso, un endpoint
    // que devolviera 404 siempre pasaría "borrador" y "suspendida" sin que el
    // filtro de visibilidad tuviera nada que ver.
    const res = await request(app).get(`/api/public/properties/${idPublicada}`);

    expect(res.status).toBe(200);
    expect(res.body.property.title).toBe("Publicada");
  });

  it("un borrador da 404 en la ficha, igual que si no existiera", async () => {
    const res = await request(app).get(`/api/public/properties/${idBorrador}`);
    expect(res.status).toBe(404);
  });

  it("una propiedad de una inmobiliaria suspendida da el mismo 404", async () => {
    // Suspender por falta de pago tiene que bajar la web al instante, no
    // esperar a que alguien despublique las propiedades a mano.
    const res = await request(app).get(`/api/public/properties/${idDeSuspendida}`);
    expect(res.status).toBe(404);
  });

  it("no se puede pedir un estado por query", async () => {
    // publicCatalogQuerySchema ni siquiera declara `status`: si se expusiera,
    // ?status=draft listaría los borradores de toda la plataforma.
    const res = await request(app).get("/api/public/properties?status=draft");

    expect(res.status).toBe(200);
    const titulos = res.body.items.map((p: { title: string }) => p.title);
    expect(titulos).not.toContain("Borrador");
  });

  it("el total coincide con lo que devuelve la página", async () => {
    // Solo tiene sentido si los datos entran en una página: hay 2 propiedades
    // visibles y el tamaño de página por defecto es 24 (DEFAULT_PAGE_SIZE).
    const res = await request(app).get("/api/public/properties");

    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(res.body.total);
  });

  it("ver una ficha suma una vista, aunque el conteo no bloquee la respuesta", async () => {
    const antes = await prisma.property.findUniqueOrThrow({ where: { id: idPublicada } });
    expect(antes.viewsCount).toBe(0);

    const res = await request(app).get(`/api/public/properties/${idPublicada}`);
    expect(res.status).toBe(200);

    // El servicio no espera a `incrementViews` (`void ... .catch(...)`) para no
    // demorar la ficha: leer el contador apenas vuelve la respuesta puede
    // llegar antes que la escritura. Se reintenta en vez de dormir un tiempo
    // fijo, que sería lento cuando sobra margen y frágil cuando falta.
    const sumada = await esperarA(async () => {
      const p = await prisma.property.findUnique({ where: { id: idPublicada } });
      return p!.viewsCount === 1;
    });
    expect(sumada).toBe(true);
  });

  it("el directorio no lista inmobiliarias suspendidas", async () => {
    const res = await request(app).get("/api/public/agencies");

    const slugs = res.body.agencies.map((a: { slug: string }) => a.slug);
    expect(slugs).toContain("activa");
    expect(slugs).not.toContain("suspendida");
  });

  it("las localidades del directorio salen solo de propiedades visibles", async () => {
    const tenantActiva = await prisma.tenant.findUniqueOrThrow({ where: { slug: "activa" } });
    await crearPropiedad(tenantActiva.id, {
      title: "Oculta en Colón",
      status: "draft",
      city: "Colón",
    });

    const res = await request(app).get("/api/public/agencies");
    const activa = res.body.agencies.find((a: { slug: string }) => a.slug === "activa");

    expect(activa.cities).not.toContain("Colón");
    // Control positivo: Paraná es donde están las propiedades visibles del
    // beforeEach (crearPropiedad por defecto). Sin esto, un directorio que
    // nunca listara ninguna ciudad pasaría igual el assert de arriba.
    expect(activa.cities).toContain("Paraná");
  });

  it("el sitemap del portal no incluye borradores ni la de una suspendida", async () => {
    // El portal se sirve desde el dominio pelado (PLATFORM_DOMAIN por
    // defecto en tests: "plataforma.com"), no un subdominio de tenant: con
    // ese host, resolveTenant no resuelve ninguno y el sitemap es el del
    // portal completo, no el de una inmobiliaria puntual.
    const res = await request(app).get("/sitemap.xml").set("Host", "plataforma.com");

    expect(res.status).toBe(200);
    // Control positivo: la publicada sí tiene que estar, para que las
    // exclusiones de abajo signifiquen algo y no salgan de un sitemap vacío
    // por error.
    expect(res.text).toContain(idPublicada);
    expect(res.text).not.toContain(idBorrador);
    expect(res.text).not.toContain(idDeSuspendida);
  });
});

/**
 * Reintenta una condición hasta que se cumple o se acaban los intentos.
 * Sirve para lo que el backend hace sin `await` a propósito, como el contador
 * de vistas: dormir un tiempo fijo sería lento cuando sobra margen y frágil
 * cuando falta.
 */
async function esperarA(condicion: () => Promise<boolean>, intentos = 40): Promise<boolean> {
  for (let i = 0; i < intentos; i++) {
    if (await condicion()) return true;
    await new Promise((r) => setImmediate(r));
  }
  return false;
}
