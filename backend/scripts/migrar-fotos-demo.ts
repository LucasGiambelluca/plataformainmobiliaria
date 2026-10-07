/**
 * Pasa las fotos de la demo de picsum.photos al storage propio.
 *
 * El seed-demo.ts deja las imágenes apuntando a picsum.photos para que se vean
 * sin depender del storage local. Eso está bien para desarrollo y mal para una
 * demo que se le muestra a un cliente: si picsum se cae, queda bloqueando, o
 * tarda, la demo muestra cuadros rotos — y el cuadro roto siempre se atribuye a
 * la plataforma, nunca al servicio de terceros.
 *
 * Así que acá se descargan una vez, se suben a MinIO y se reescribe la columna
 * `url`. Después de esto la demo no le debe nada a nadie.
 *
 * Idempotente: solo toca las filas que todavía apuntan a picsum.
 *
 *   set -a && . /etc/m2props/backend.env && set +a
 *   sudo -u m2props -E npx tsx scripts/migrar-fotos-demo.ts
 */

import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { env } from "../src/config/env";

const prisma = new PrismaClient();
const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

const CON_PREF = `${env.S3_PUBLIC_URL.replace(/\/+$/, "")}/`;

interface Resultado {
  ok: number;
  descargadas: number;
  fallidas: string[];
}

/** Un JPEG válido y chico, para cuando la descarga de picsum no llega. */
function jpegDeEmergencia(etiqueta: string): Buffer {
  // 1x1 en JPEG, con la etiqueta en lametadata del comentario.
  const base =
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  const buf = Buffer.from(base, "base64");
  return Buffer.concat([buf, Buffer.from(`\n${etiqueta}`)]);
}

async function main(): Promise<void> {
  const r: Resultado = { ok: 0, descargadas: 0, fallidas: [] };

  const filas = await prisma.propertyMedia.findMany({
    where: { url: { contains: "picsum.photos" } },
    select: { id: true, propertyId: true, url: true, type: true },
  });

  if (filas.length === 0) {
    console.log("No hay fotos de picsum. Nada que hacer.");
    return;
  }
  console.log(`Fotos de la demo a migrar: ${filas.length}`);

  for (const [i, fila] of filas.entries()) {
    const orden = i + 1;
    let cuerpo: Buffer;
    let contentType = "image/jpeg";

    try {
      // follow redirect: picsum responde 302 hacia el CDN de imágenes.
      const res = await fetch(fila.url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cuerpo = Buffer.from(await res.arrayBuffer());
      if (cuerpo.length < 1_000) throw new Error(`respuesta de ${cuerpo.length} bytes`);
      r.descargadas++;
    } catch (err) {
      // Un fallback para que la demo nunca quede con un cuadro roto.
      cuerpo = jpegDeEmergencia(fila.id);
      r.fallidas.push(`${fila.id}: ${(err as Error).message}`);
    }

    // La clave se deriva del id, así que volver a correr no duplica objetos.
    const clave = `demo/${fila.propertyId}/${fila.id}.jpg`;
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: clave,
        Body: cuerpo,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    const nuevaUrl = `${CON_PREF}${clave}`;
    await prisma.propertyMedia.update({
      where: { id: fila.id },
      data: {
        url: nuevaUrl,
        // El seed declaraba un tamaño de mentira; ahora va el real, que es lo
        // que consume el cálculo de storage del plan.
        sizeBytes: BigInt(cuerpo.length),
      },
    });
    r.ok++;
    if (orden % 10 === 0) console.log(`  ${orden}/${filas.length}...`);
  }

  const restantes = await prisma.propertyMedia.count({
    where: { url: { contains: "picsum.photos" } },
  });

  console.log(`\n✔ Migradas: ${r.ok} (${r.descargadas} bajadas de picsum)`);
  console.log(`✔ Quedan apuntando a picsum: ${restantes}`);
  if (r.fallidas.length) {
    console.log(`\n${r.fallidas.length} no se pudieron bajar (se puso una imagen minima):`);
    r.fallidas.forEach((f) => console.log(`  ${f}`));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
