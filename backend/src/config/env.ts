import { z } from "zod";

// Carga .env (Node >= 20.12). No falla si el archivo no existe (ej. producción con env reales).
// En test no se carga el archivo: el entorno lo fija tests/setup-env.ts.
if (process.env.NODE_ENV !== "test") {
  try {
    process.loadEnvFile?.();
  } catch {
    /* sin archivo .env: se usan las variables del entorno */
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  PLATFORM_DOMAIN: z.string().min(1).default("plataforma.com"),
  CUSTOM_DOMAIN_TARGET: z.string().min(1).default("plataforma.com"),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET debe tener al menos 32 caracteres"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // "fake" no sube nada: sirve para tests y para levantar el backend sin
  // storage configurado. Cualquier intento de firmar un upload avisa.
  STORAGE_PROVIDER: z.enum(["s3", "cloudinary", "fake"]).default("fake"),
  CLOUDINARY_URL: z.string().optional().default(""),

  // S3 / MinIO. S3_ENDPOINT solo hace falta para S3-compatibles (MinIO, R2);
  // vacío usa el endpoint real de AWS para la región.
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  // Base pública desde donde el navegador lee los archivos (Caddy delante de
  // MinIO). Sin esto las URLs guardadas apuntarían a un host interno.
  S3_PUBLIC_URL: z.string().optional().default(""),
  // Minutos de validez de la URL de subida firmada.
  S3_UPLOAD_URL_TTL_MIN: z.coerce.number().int().positive().default(10),

  EMAIL_PROVIDER: z.enum(["resend", "sendgrid"]).default("resend"),
  EMAIL_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("no-reply@plataforma.com"),

  PAYMENT_PROVIDER: z.enum(["mercadopago", "stripe"]).default("mercadopago"),
  PAYMENT_API_KEY: z.string().optional().default(""),
  PAYMENT_WEBHOOK_SECRET: z.string().optional().default(""),
});

// Con STORAGE_PROVIDER=s3 las credenciales dejan de ser opcionales: es
// preferible no arrancar a descubrirlo cuando alguien intenta subir una foto.
const envWithStorageRules = envSchema.superRefine((env, ctx) => {
  if (env.STORAGE_PROVIDER !== "s3") return;
  const required = [
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_PUBLIC_URL",
  ] as const;
  for (const key of required) {
    if (!env[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `Requerida cuando STORAGE_PROVIDER=s3`,
      });
    }
  }
});

const parsed = envWithStorageRules.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // eslint-disable-next-line no-console
  console.error(`\n❌ Variables de entorno inválidas:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
