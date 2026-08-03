import request from "supertest";
import { createApp } from "@/app";
import { prisma } from "./helpers/db";
import { crearTenant } from "./helpers/factories";

const app = createApp();

describe("arnés de integración", () => {
  it("la app responde /health contra la base real", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.env).toBe("test");
  });

  it("escribe y lee de la base de verdad", async () => {
    await crearTenant("humo");

    const encontrado = await prisma.tenant.findUnique({ where: { slug: "humo" } });
    expect(encontrado?.name).toBe("Inmobiliaria humo");
  });

  // Dos veces el mismo test a propósito: cada uno afirma que arranca vacío y
  // deja una fila. El segundo solo puede pasar si el truncate corrió.
  it.each([1, 2])("cada test arranca con la base vacía (%i)", async () => {
    expect(await prisma.tenant.count()).toBe(0);
    await crearTenant("humo");
  });
});
