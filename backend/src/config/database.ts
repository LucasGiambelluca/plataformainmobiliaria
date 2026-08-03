import { PrismaClient } from "@prisma/client";
import { env, isProd } from "./env";

// Singleton de Prisma. En dev evita múltiples instancias con hot-reload (tsx watch).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// "query" es oro cuando se depura una consulta, pero en la suite de integración
// son miles de líneas que entierran el test que falló. LOG_LEVEL=silent
// (tests/setup-env.ts) calla también a Prisma; para ver el SQL de un test:
// LOG_LEVEL=debug npm run test:integration
const verboso = !isProd && env.LOG_LEVEL !== "silent";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: verboso ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (!isProd) globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

void env; // asegura validación de env al importar la capa de datos
