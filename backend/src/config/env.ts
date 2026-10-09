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
  // Interfaz de escucha. El default es 0.0.0.0 porque en Docker el backend
  // tiene que ser alcanzable desde los otros contenedores del compose; en un
  // despliegue nativo lo bajan a 127.0.0.1, donde el proxy local es el único
  // que llega.
  HOST: z.string().default("0.0.0.0"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  // Subpath bajo el que se sirve la API, sin barras: "" en la raíz del host,
  // "/m2prop" cuando la app vive en un subpath de un dominio que ya tiene otro
  // sitio en la raíz. Solo lo usa la cookie de refresh (auth.router.ts): su
  // `path` tiene que coincidir con la ruta por la que realmente viaja la
  // petición, o el navegador deja de mandarla y la sesión se cae al recargar.
  APP_BASE_PATH: z
    .string()
    .default("")
    .transform((v) => {
      const limpio = v.trim().replace(/^\/+|\/+$/g, "");
      return limpio ? `/${limpio}` : "";
    }),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  PLATFORM_DOMAIN: z.string().min(1).default("plataforma.com"),
  CUSTOM_DOMAIN_TARGET: z.string().min(1).default("plataforma.com"),
  // "fake" no consulta el DNS real: sirve para desarrollo local, donde ningún
  // dominio de prueba apunta a esta máquina. En producción va "node".
  DNS_RESOLVER: z.enum(["node", "fake"]).default("node"),

  // Índices de las calculadoras. "oficial" sale al BCRA (ICL) y a
  // datos.gob.ar (IPC); "fake" usa series inventadas y no toca la red.
  INDEX_PROVIDER: z.enum(["oficial", "fake"]).default("oficial"),
  // Horas que vale lo cacheado antes de volver a pedir la serie. El ICL se
  // publica una vez por día y el IPC una vez por mes: refrescar más seguido
  // solo agrega carga sobre APIs ajenas.
  INDEX_TTL_HORAS: z.coerce.number().positive().default(12),

  // Secreto que Caddy manda al preguntar si puede emitir un certificado para
  // un host. Vacío = el endpoint no autoriza nada, que es lo correcto fuera de
  // producción: sin Caddy adelante, nadie tiene por qué preguntar.
  CADDY_ASK_TOKEN: z.string().optional().default(""),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET debe tener al menos 32 caracteres"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  // Duración de una sesión de suplantación. No se puede renovar: cuando vence,
  // el super admin vuelve a su identidad. Por eso es más larga que el access
  // token normal, que sí se refresca solo.
  IMPERSONATION_EXPIRES_IN: z.string().default("30m"),

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

  // "fake" no envía nada: solo loguea. El backend arranca sin cuenta de correo.
  EMAIL_PROVIDER: z.enum(["resend", "sendgrid", "fake"]).default("fake"),
  EMAIL_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("Entre Rios Propiedades <no-reply@plataforma.com>"),

  // "fake" simula los cobros: el backend arranca sin cuenta de MercadoPago.
  PAYMENT_PROVIDER: z.enum(["mercadopago", "stripe", "fake"]).default("fake"),
  PAYMENT_API_KEY: z.string().optional().default(""),
  PAYMENT_WEBHOOK_SECRET: z.string().optional().default(""),
  // Clave de cifrado de los secretos guardados en base (32 bytes en hex).
  // A diferencia de las credenciales de la pasarela, esta NO cambia: se pone
  // una vez. Es lo que hace que rotar el access token deje de ser un deploy.
  CREDENTIALS_ENCRYPTION_KEY: z.string().optional().default(""),
  // URL pública del backend: la pasarela la necesita para el notification_url,
  // así que no puede ser localhost en producción.
  BACKEND_URL: z.string().url().default("http://localhost:3000"),
});

// Con STORAGE_PROVIDER=s3 las credenciales dejan de ser opcionales: es
// preferible no arrancar a descubrirlo cuando alguien intenta subir una foto.
const envWithStorageRules = envSchema
  .superRefine((env, ctx) => {
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
  })
  .superRefine((env, ctx) => {
    // Las credenciales de la pasarela ya no viven acá: se cargan desde el
    // panel del super admin y se guardan cifradas. Lo que sí tiene que estar
    // es la clave con la que se descifran, porque sin ella el backend no puede
    // leer lo que él mismo guardó.
    if (env.PAYMENT_PROVIDER !== "mercadopago") return;
    if (!/^[0-9a-fA-F]{64}$/.test(env.CREDENTIALS_ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CREDENTIALS_ENCRYPTION_KEY"],
        message:
          "Requerida cuando PAYMENT_PROVIDER=mercadopago: 64 caracteres hex (32 bytes). Generala con: openssl rand -hex 32",
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER !== "resend") return;
    if (!env.EMAIL_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_API_KEY"],
        message: `Requerida cuando EMAIL_PROVIDER=resend`,
      });
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
