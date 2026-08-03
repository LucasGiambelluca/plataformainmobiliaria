import { prisma, disconnectDatabase } from "@/config/database";

export { prisma };

/**
 * Se reusa el cliente Prisma de la app y no uno propio a propósito: los tests
 * y el código bajo prueba tienen que ver la MISMA base y compartir el pool de
 * conexiones. Con dos clientes, un dato escrito por el test podría no verse
 * desde el endpoint, y Postgres se queda sin conexiones a la tercera suite.
 */

/**
 * Vacía todas las tablas de negocio.
 *
 * TRUNCATE ... CASCADE y no DELETE: es más rápido y no pelea con las claves
 * foráneas. `_prisma_migrations` queda afuera — borrarla haría que Prisma crea
 * que la base está sin migrar.
 */
export async function truncateAll(): Promise<void> {
  guardarBaseDeTest();

  const tablas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tablas.length === 0) return;

  const lista = tablas.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
  await disconnectDatabase();
}

/**
 * Cortafuegos: si por un error de configuración DATABASE_URL apunta a la base
 * de desarrollo, truncar la borraría entera. Preferible que la suite no arranque.
 */
function guardarBaseDeTest(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/realestate_test/.test(url)) {
    throw new Error(
      `Los tests de integración solo corren contra realestate_test. DATABASE_URL apunta a: ${url}`,
    );
  }
}
