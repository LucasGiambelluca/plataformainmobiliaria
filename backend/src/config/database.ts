import { PrismaClient } from "@prisma/client";
import { env, isProd } from "./env";

// Singleton de Prisma. En dev evita múltiples instancias con hot-reload (tsx watch).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["warn", "error"] : ["query", "warn", "error"],
  });

if (!isProd) globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

void env; // asegura validación de env al importar la capa de datos
