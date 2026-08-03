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

  it("cada test arranca con la base vacía", async () => {
    // Si el truncate del beforeEach no corriera, el tenant del test anterior
    // seguiría acá y este test fallaría.
    expect(await prisma.tenant.count()).toBe(0);
  });
});
