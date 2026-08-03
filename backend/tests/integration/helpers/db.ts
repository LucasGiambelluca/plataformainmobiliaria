/**
 * Se reusa el cliente Prisma de la app y no uno propio a propósito: los tests
 * y el código bajo prueba tienen que ver la MISMA base y compartir el pool de
 * conexiones. Con dos clientes, un dato escrito por el test podría no verse
 * desde el endpoint que se está probando.
 */
import { prisma, disconnectDatabase } from "@/config/database";

export { prisma };

const BASE_DE_TEST = "realestate_test";

/**
 * Corta la ejecución si `DATABASE_URL` no apunta a la base de test.
 *
 * Compara el nombre de la base exacto (vía `URL`), no una substring de la
 * cadena completa: `/realestate_test/.test(url)` daba falsos positivos con
 * una password que se llamara "realestate_test" o una base "realestate" con
 * host "realestate_test.example.com", ambos apuntando a la base equivocada.
 * El mensaje de error tampoco repite la URL completa: incluye la password.
 */
export function exigirBaseDeTest(): void {
  const url = process.env.DATABASE_URL ?? "";
  let nombre = "";
  try {
    nombre = new URL(url).pathname.slice(1);
  } catch {
    /* URL inválida: cae en el error de abajo */
  }
  if (nombre !== BASE_DE_TEST) {
    throw new Error(
      `Los tests de integración solo corren contra ${BASE_DE_TEST}, y DATABASE_URL apunta a "${nombre || url}". Corré: npm run test:db`,
    );
  }
}

/**
 * Vacía todas las tablas de negocio.
 *
 * TRUNCATE ... CASCADE y no DELETE: es más rápido y no pelea con las claves
 * foráneas. `_prisma_migrations` queda afuera — borrarla haría que Prisma crea
 * que la base está sin migrar.
 */
export async function truncateAll(): Promise<void> {
  exigirBaseDeTest();

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
