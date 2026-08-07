import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encryptSecret } from "../src/shared/services/crypto/secretBox";

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@plataforma.com";
const SUPER_ADMIN_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "ChangeMe123!";

const plans = [
  // El plan gratuito no incluye dominio propio: se sirve por slug y subdominio.
  {
    name: "Básico",
    slug: "basico",
    priceAmount: "0",
    maxProperties: 10,
    maxUsers: 2,
    maxStorageMb: 500,
    maxDomains: 0,
    hasOnlineAppraisals: false,
  },
  {
    name: "Pro",
    slug: "pro",
    priceAmount: "29999",
    maxProperties: 100,
    maxUsers: 10,
    maxStorageMb: 5000,
    maxDomains: 1,
    hasOnlineAppraisals: false,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    priceAmount: "79999",
    maxProperties: 1000,
    maxUsers: 50,
    maxStorageMb: 50000,
    maxDomains: 5,
    // Las tasaciones online son del plan premium: es la capacidad que lo
    // distingue además de los cupos.
    hasOnlineAppraisals: true,
  },
];

/**
 * Migración de las credenciales que estaban en el .env.
 *
 * Va acá y no en server.ts porque `npm run prisma:seed` ya es un paso
 * documentado del despliegue y es idempotente por naturaleza, mientras que en
 * el arranque sería código que se ejecuta en cada deploy durante años para una
 * condición que se cumple una sola vez.
 */
async function seedPaymentSettings(): Promise<void> {
  const existente = await prisma.paymentSettings.findUnique({
    where: { id: "singleton" },
  });
  if (existente) {
    console.log("• Credenciales de la pasarela ya configuradas, se omite");
    return;
  }

  const token = process.env.PAYMENT_API_KEY;
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!token || !secret) {
    console.log("• Sin PAYMENT_API_KEY en el entorno: se cargan desde /admin/pagos");
    return;
  }

  await prisma.paymentSettings.create({
    data: {
      id: "singleton",
      activeMode: "production",
      productionAccessToken: encryptSecret(token),
      productionWebhookSecret: encryptSecret(secret),
    },
  });
  console.log("✔ Credenciales del .env migradas a la base como producción");
}

async function main(): Promise<void> {
  // Planes (idempotente por slug).
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        priceAmount: p.priceAmount,
        maxProperties: p.maxProperties,
        maxUsers: p.maxUsers,
        maxStorageMb: p.maxStorageMb,
        maxDomains: p.maxDomains,
        hasOnlineAppraisals: p.hasOnlineAppraisals,
      },
      create: { ...p, priceCurrency: "ARS", billingInterval: "monthly" },
    });
  }
  console.log(`✔ ${plans.length} planes sembrados`);

  // Super admin (tenantId null). El email es único en TODA la plataforma, no
  // por tenant: si alguien ya lo tomó desde una inmobiliaria, este create
  // explota con P2002 en vez de dejar dos filas con el mismo email. Es el
  // fallo ruidoso correcto — con dos, el login no sabría cuál devolver.
  const existing = await prisma.user.findFirst({
    where: { tenantId: null, email: SUPER_ADMIN_EMAIL },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        tenantId: null,
        email: SUPER_ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12),
        role: "super_admin",
        name: "Super Admin",
        isActive: true,
      },
    });
    console.log(`✔ Super admin creado: ${SUPER_ADMIN_EMAIL}`);
  } else {
    console.log("• Super admin ya existe, se omite");
  }

  await seedPaymentSettings();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
