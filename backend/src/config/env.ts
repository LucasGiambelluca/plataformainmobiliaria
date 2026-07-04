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

  STORAGE_PROVIDER: z.enum(["cloudinary", "s3"]).default("cloudinary"),
  CLOUDINARY_URL: z.string().optional().default(""),

  EMAIL_PROVIDER: z.enum(["resend", "sendgrid"]).default("resend"),
  EMAIL_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("no-reply@plataforma.com"),

  PAYMENT_PROVIDER: z.enum(["mercadopago", "stripe"]).default("mercadopago"),
  PAYMENT_API_KEY: z.string().optional().default(""),
  PAYMENT_WEBHOOK_SECRET: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

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
