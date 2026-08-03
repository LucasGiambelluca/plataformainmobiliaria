import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "@/app";
import { REFRESH_COOKIE } from "@/modules/auth/auth.router";
import { prisma } from "./helpers/db";
import { crearPlan } from "./helpers/factories";

/**
 * Autenticación de punta a punta contra la base real: alta self-serve, login,
 * rotación de refresh y /me.
 *
 * Tres propiedades sostienen el esquema entero y son las que hay que leer acá:
 *
 * 1. Dos secretos distintos. El access token (15 min, cabecera Authorization)
 *    se firma con JWT_SECRET; el refresh (7 días, cookie httpOnly) con
 *    JWT_REFRESH_SECRET. Unificarlos convertiría un refresh robado en un
 *    bearer válido por una semana.
 * 2. Rotación. Cada /refresh revoca el token que usó y emite otro: la ventana
 *    de un token filtrado es de un solo uso.
 * 3. Detección de robo. Reusar un token ya rotado revoca TODAS las sesiones
 *    del usuario. Es agresivo a propósito: ante dos usos del mismo token no
 *    hay forma de saber cuál es el dueño, así que se echa a los dos, y el
 *    legítimo se entera porque tiene que volver a entrar.
 */
const app = createApp();

/** El alta self-serve exige que exista el plan por defecto. */
beforeEach(async () => {
  await crearPlan({ slug: "basico" });
});

const ALTA = {
  tenantName: "Inmobiliaria Nueva",
  slug: "nueva",
  email: "admin@nueva.test",
  password: "una-clave-larga",
  name: "Ana",
};

/** Extrae la cookie de refresh de la respuesta, para poder reusarla o pisarla. */
function cookieDeRefresh(res: request.Response): string {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = (cookies ?? []).find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) throw new Error("La respuesta no trajo cookie de refresh");
  return cookie.split(";")[0];
}

describe("alta self-serve", () => {
  it("crea la inmobiliaria, el admin y deja la sesión abierta", async () => {
    const res = await request(app).post("/api/auth/register").send(ALTA);

    expect(res.status).toBe(201);
    expect(res.body.tenant.slug).toBe("nueva");
    expect(res.body.accessToken).toEqual(expect.any(String));

    // La contraseña nunca se guarda en claro ni vuelve en la respuesta.
    const user = await prisma.user.findFirst({ where: { email: ALTA.email } });
    // El hash tiene que tener forma de bcrypt: not.toBe(password) pasaría
    // igual con sha1(password) o con password + "!", y también si `user`
    // viniera null. Si el proyecto migrara a argon2 este assert se pondría
    // en rojo a propósito: el cambio de algoritmo merece tocar el test.
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(res.body)).not.toContain(ALTA.password);
  });

  it("el refresh viaja en cookie httpOnly, no en el cuerpo", async () => {
    // Si el refresh token quedara accesible desde JavaScript, un XSS se lo
    // llevaría y la rotación no serviría de nada.
    const res = await request(app).post("/api/auth/register").send(ALTA);

    // La cookie entera, con atributos: cookieDeRefresh() los corta.
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    expect(refresh).toContain("HttpOnly");
    // COOKIE_PATH acota la cookie a los endpoints de auth: sin este assert,
    // sacarla silenciosamente mandaría el refresh a cualquier request.
    expect(refresh).toContain("Path=/api/auth");
    expect(res.body.refreshToken).toBeUndefined();
  });

  it("el alta nace con suscripción al plan básico", async () => {
    await request(app).post("/api/auth/register").send(ALTA);

    const sub = await prisma.subscription.findFirst({
      where: { tenant: { slug: "nueva" } },
      include: { plan: true },
    });
    expect(sub?.plan.slug).toBe("basico");
  });

  it("un slug repetido devuelve 409 y no crea nada a medias", async () => {
    await request(app).post("/api/auth/register").send(ALTA);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...ALTA, email: "otro@nueva.test" });

    expect(res.status).toBe(409);
    // Los dos chequeos de unicidad de `provision` corren ANTES de abrir la
    // transacción, así que este 409 ni la toca. Lo que se prueba es que ese
    // chequeo previo corta el alta ENTERA —tenant, admin y suscripción—, no
    // solo la pieza que chocó.
    expect(await prisma.tenant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("un email ya registrado devuelve 409 sin dejar el tenant huérfano", async () => {
    await request(app).post("/api/auth/register").send(ALTA);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...ALTA, slug: "otra-mas" });

    expect(res.status).toBe(409);
    // Mismo chequeo previo que el caso del slug: corta antes de crear el
    // tenant. Que la transacción de createTenantWithAdmin revierta bien es
    // otra cosa, y no se puede probar desde acá: el único fallo alcanzable
    // desde la API pública es el unique de slug, y ese salta en el primer
    // statement de la transacción, cuando todavía no hay nada que revertir.
    expect(await prisma.tenant.count()).toBe(1);
  });
});

describe("login", () => {
  // Sobre el plan que sembró el beforeEach del archivo: el login necesita un
  // usuario, y darlo de alta por la API es lo que garantiza que el hash sea
  // el real.
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(ALTA);
  });

  it("con las credenciales correctas devuelve un access token de 15 minutos", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: ALTA.password });

    expect(res.status).toBe(200);
    // Se decodifica en vez de conformarse con expect.any(String): un token
    // vacío pasaría esa aserción. Y el TTL no está escrito en ningún test:
    // `expiresIn: "15"` —sin la "m"— son 15 milisegundos para jsonwebtoken.
    const payload = jwt.decode(res.body.accessToken) as {
      exp: number;
      iat: number;
      role: string;
    };
    expect(payload.role).toBe("tenant_admin");
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("con la contraseña equivocada devuelve 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: "cualquier-otra" });

    expect(res.status).toBe(401);
  });

  it("un email inexistente devuelve el mismo 401 que una clave mala", async () => {
    // Mensajes distintos permitirían enumerar qué emails están registrados.
    const inexistente = await request(app)
      .post("/api/auth/login")
      .send({ email: "nadie@test.com", password: ALTA.password });
    const claveMala = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: "cualquier-otra" });

    expect(inexistente.status).toBe(claveMala.status);
    expect(inexistente.body.error.message).toBe(claveMala.body.error.message);
  });

  it("un usuario dado de baja no puede entrar", async () => {
    await prisma.user.updateMany({
      where: { email: ALTA.email },
      data: { isActive: false },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: ALTA.password });

    expect(res.status).toBe(401);
  });
});

describe("rotación y cierre de sesión", () => {
  it("cada refresh devuelve una cookie nueva y revoca la anterior", async () => {
    const alta = await request(app).post("/api/auth/register").send(ALTA);
    const primera = cookieDeRefresh(alta);

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", primera);
    expect(refresh.status).toBe(200);

    const segunda = cookieDeRefresh(refresh);
    expect(segunda).not.toBe(primera);
  });

  it("reusar un refresh ya rotado revoca TODAS las sesiones del usuario", async () => {
    // Es la defensa contra el robo de token: si el atacante lo usa, el legítimo
    // se cae también, y el dueño se entera porque tiene que volver a entrar.
    const alta = await request(app).post("/api/auth/register").send(ALTA);
    const primera = cookieDeRefresh(alta);

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", primera);
    const segunda = cookieDeRefresh(refresh);

    // El atacante reusa la vieja.
    const reuso = await request(app).post("/api/auth/refresh").set("Cookie", primera);
    expect(reuso.status).toBe(401);

    // Y la del usuario legítimo también quedó muerta.
    const legitima = await request(app).post("/api/auth/refresh").set("Cookie", segunda);
    expect(legitima.status).toBe(401);

    const vivos = await prisma.refreshToken.count({ where: { revokedAt: null } });
    expect(vivos).toBe(0);
  });

  it("logout revoca el refresh y borra la cookie", async () => {
    const alta = await request(app).post("/api/auth/register").send(ALTA);
    const cookie = cookieDeRefresh(alta);

    const salida = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(salida.status).toBe(204);

    const despues = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(despues.status).toBe(401);
  });

  it("sin cookie, refresh devuelve 401", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("el refresh no sirve como bearer, ni el access como cookie de refresh", async () => {
    // Los dos secretos son distintos a propósito. Si alguien los unificara
    // "para simplificar", este test es lo único que se pondría en rojo: nada
    // más en la suite distingue un secreto de otro.
    const alta = await request(app).post("/api/auth/register").send(ALTA);
    const refresh = cookieDeRefresh(alta).split("=")[1];

    const comoBearer = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refresh}`);
    expect(comoBearer.status).toBe(401);

    const comoCookie = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE}=${alta.body.accessToken}`);
    expect(comoCookie.status).toBe(401);
  });

  it("dos sesiones del mismo usuario conviven", async () => {
    // El escritorio y el celular. Vale escribirlo porque el test de reuso de
    // arriba revoca TODAS las sesiones, y de ahí se concluye fácil que solo
    // hay una: revocar la anterior en cada login parecería una mejora.
    await request(app).post("/api/auth/register").send(ALTA);
    const escritorio = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: ALTA.password });
    const celular = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: ALTA.password });

    const desdeElEscritorio = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookieDeRefresh(escritorio));
    const desdeElCelular = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookieDeRefresh(celular));

    expect(desdeElEscritorio.status).toBe(200);
    expect(desdeElCelular.status).toBe(200);
  });
});

describe("/me", () => {
  it("sin token devuelve 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("con un token inventado devuelve 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer no.es.un.jwt");
    expect(res.status).toBe(401);
  });

  it("con token válido devuelve el usuario sin el hash de contraseña", async () => {
    const alta = await request(app).post("/api/auth/register").send(ALTA);

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${alta.body.accessToken}`);

    expect(res.status).toBe(200);
    // `/me` devuelve lo que trae el access token —id, tenant y rol— y nada más.
    // NO esperes el email acá: agregárselo obligaría a pegarle a la base en
    // cada request autenticado. El email sí viaja en /register y /login.
    expect(res.body.user.id).toBe(alta.body.user.id);
    expect(res.body.user.role).toBe("tenant_admin");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});
