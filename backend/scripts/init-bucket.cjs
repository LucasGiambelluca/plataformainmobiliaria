/**
 * Crea el bucket de multimedia y lo deja de lectura pública.
 *
 * Es el equivalente del servicio `minio-init` del docker-compose, para cuando
 * MinIO corre sin Docker (por ejemplo el binario portable en la PC de
 * desarrollo). Idempotente: se puede correr las veces que haga falta.
 *
 *   node scripts/init-bucket.cjs
 *
 * Toma la configuración de las mismas S3_* del .env. Ojo: usa credenciales de
 * administrador del storage, no las de la app.
 */
const {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");

// Node >= 20.12 carga .env sin dependencias extra.
try {
  process.loadEnvFile?.();
} catch {
  /* sin archivo .env: se usan las variables del entorno */
}

const BUCKET = process.env.S3_BUCKET || "inmobiliaria-media";
const ENDPOINT = process.env.S3_ENDPOINT || "http://127.0.0.1:9000";

const client = new S3Client({
  endpoint: ENDPOINT,
  region: process.env.S3_REGION || "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "minioadmin",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "devminiopassword",
  },
});

// Las fotos de las propiedades se publican en catálogos abiertos: son públicas
// por diseño. La escritura sigue exigiendo URL firmada.
const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${BUCKET}/*`],
    },
  ],
};

async function main() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`• bucket ${BUCKET} ya existía`);
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`✔ bucket ${BUCKET} creado en ${ENDPOINT}`);
  }

  await client.send(
    new PutBucketPolicyCommand({ Bucket: BUCKET, Policy: JSON.stringify(policy) }),
  );
  console.log("✔ política de lectura pública aplicada");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
