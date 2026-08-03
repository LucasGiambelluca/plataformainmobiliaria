import request from "supertest";
import { createApp } from "@/app";
import { REFRESH_COOKIE } from "@/modules/auth/auth.router";
import { prisma } from "./helpers/db";
import { crearPlan } from "./helpers/factories";

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
    expect(user?.passwordHash).not.toBe(ALTA.password);
    expect(JSON.stringify(res.body)).not.toContain(ALTA.password);
  });

  it("el refresh viaja en cookie httpOnly, no en el cuerpo", async () => {
    // Si el refresh token quedara accesible desde JavaScript, un XSS se lo
    // llevaría y la rotación no serviría de nada.
    const res = await request(app).post("/api/auth/register").send(ALTA);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    const refresh = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
    expect(refresh).toContain("HttpOnly");
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
    expect(await prisma.tenant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });

  it("un email ya registrado devuelve 409 sin dejar el tenant huérfano", async () => {
    await request(app).post("/api/auth/register").send(ALTA);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...ALTA, slug: "otra-mas" });

    expect(res.status).toBe(409);
    // Lo que se prueba es que la transacción no dejó el tenant creado con el
    // usuario sin crear: sería una inmobiliaria a la que nadie puede entrar.
    expect(await prisma.tenant.count()).toBe(1);
  });
});

describe("login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(ALTA);
  });

  it("con las credenciales correctas devuelve access token", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: ALTA.email, password: ALTA.password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
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

describe("rotación de refresh tokens", () => {
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
    expect(salida.status).toBeLessThan(300);

    const despues = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(despues.status).toBe(401);
  });

  it("sin cookie, refresh devuelve 401", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
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
