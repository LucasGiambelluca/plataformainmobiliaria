import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
  },
  {
    name: "Pro",
    slug: "pro",
    priceAmount: "29999",
    maxProperties: 100,
    maxUsers: 10,
    maxStorageMb: 5000,
    maxDomains: 1,
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    priceAmount: "79999",
    maxProperties: 1000,
    maxUsers: 50,
    maxStorageMb: 50000,
    maxDomains: 5,
  },
];

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
      },
      create: { ...p, priceCurrency: "ARS", billingInterval: "monthly" },
    });
  }
  console.log(`✔ ${plans.length} planes sembrados`);

  // Super admin (tenantId null). Único por (tenantId, email).
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
