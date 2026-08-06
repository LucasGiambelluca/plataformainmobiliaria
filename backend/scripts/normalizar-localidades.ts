import { PrismaClient } from "@prisma/client";
import { normalizarLocalidad } from "../src/shared/constants/localidades";

/**
 * Normaliza las localidades cargadas antes de que existiera el catálogo.
 *
 * `property.city` y `appraisal.city` eran texto libre, así que la base puede
 * tener "Parana", "PARANÁ" y "  Paraná " conviviendo como si fueran ciudades
 * distintas. Desde que el catálogo es cerrado, nada nuevo entra así, pero lo
 * viejo queda: una propiedad con "Parana" no aparece bajo el filtro "Paraná" y
 * no cuenta para el reparto de tasaciones de esa localidad.
 *
 * Corre en seco por defecto y no toca nada sin `--apply`. Lo que no puede
 * mapear lo lista en vez de adivinar: una ciudad de otra provincia o un nombre
 * mal escrito necesita que alguien decida qué hacer, y elegirle una localidad
 * al azar a una propiedad es peor que dejarla como está.
 *
 *   npx tsx scripts/normalizar-localidades.ts            # informe, sin escribir
 *   npx tsx scripts/normalizar-localidades.ts --apply    # aplica los cambios
 */

const prisma = new PrismaClient();
const aplicar = process.argv.includes("--apply");

interface Cambio {
  de: string;
  a: string;
  propiedades: number;
  tasaciones: number;
}

async function main(): Promise<void> {
  const [propiedades, tasaciones] = await Promise.all([
    prisma.property.groupBy({ by: ["city"], _count: { _all: true } }),
    prisma.appraisal.groupBy({ by: ["city"], _count: { _all: true } }),
  ]);

  const conteo = new Map<string, { propiedades: number; tasaciones: number }>();

  for (const fila of propiedades) {
    if (!fila.city) continue;
    const actual = conteo.get(fila.city) ?? { propiedades: 0, tasaciones: 0 };
    actual.propiedades += fila._count._all;
    conteo.set(fila.city, actual);
  }

  for (const fila of tasaciones) {
    const actual = conteo.get(fila.city) ?? { propiedades: 0, tasaciones: 0 };
    actual.tasaciones += fila._count._all;
    conteo.set(fila.city, actual);
  }

  const cambios: Cambio[] = [];
  const huerfanas: Cambio[] = [];

  for (const [escrito, { propiedades: p, tasaciones: t }] of conteo) {
    const canonica = normalizarLocalidad(escrito);

    if (canonica === null) {
      huerfanas.push({ de: escrito, a: "", propiedades: p, tasaciones: t });
      continue;
    }
    // Ya está bien escrita: no hay nada que hacer.
    if (canonica === escrito) continue;

    cambios.push({ de: escrito, a: canonica, propiedades: p, tasaciones: t });
  }

  const sinLocalidad = await prisma.property.count({ where: { city: null } });

  console.log(`Valores distintos en la base: ${conteo.size}`);
  console.log(`Ya canónicos: ${conteo.size - cambios.length - huerfanas.length}`);
  console.log(`A normalizar: ${cambios.length}`);
  console.log(`Sin correspondencia en el catálogo: ${huerfanas.length}`);
  console.log(`Propiedades sin localidad: ${sinLocalidad}`);

  if (cambios.length > 0) {
    console.log("\nSe van a reescribir:");
    for (const c of cambios) {
      console.log(`  "${c.de}" → "${c.a}"  (${c.propiedades} prop., ${c.tasaciones} tas.)`);
    }
  }

  if (huerfanas.length > 0) {
    console.log("\nSin correspondencia — quedan como están, hay que resolverlas a mano:");
    for (const h of huerfanas) {
      console.log(`  "${h.de}"  (${h.propiedades} prop., ${h.tasaciones} tas.)`);
    }
  }

  if (sinLocalidad > 0) {
    console.log(
      "\nLas propiedades sin localidad no salen en el filtro del portal ni cuentan" +
        "\npara el reparto de tasaciones. Hay que asignarles una desde el panel.",
    );
  }

  if (!aplicar) {
    console.log("\nCorrida en seco: no se escribió nada. Volvé a correr con --apply.");
    return;
  }

  if (cambios.length === 0) {
    console.log("\nNo hay nada que reescribir.");
    return;
  }

  // Cada valor en su propio updateMany, todo dentro de una transacción: si
  // fallara a mitad, la base quedaría con parte de las ciudades normalizadas y
  // parte no, que es justo el estado que este script viene a arreglar.
  await prisma.$transaction([
    ...cambios.map((c) =>
      prisma.property.updateMany({ where: { city: c.de }, data: { city: c.a } }),
    ),
    ...cambios.map((c) =>
      prisma.appraisal.updateMany({ where: { city: c.de }, data: { city: c.a } }),
    ),
  ]);

  console.log(`\nListo: ${cambios.length} valores normalizados.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
