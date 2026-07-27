import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { AppError } from "@/shared/errors";
import { FakeStorageProvider } from "./fake.provider";
import { S3StorageProvider } from "./s3.provider";
import type { StorageProvider } from "./storage.provider";

export type {
  SignedUpload,
  StorageProvider,
  StoredObject,
} from "./storage.provider";
export { FakeStorageProvider } from "./fake.provider";
export { S3StorageProvider } from "./s3.provider";

/**
 * Provider que se niega a trabajar. Se usa cuando STORAGE_PROVIDER apunta a
 * algo que todavía no está implementado: el resto de la API sigue funcionando
 * y el error aparece en el endpoint de upload, con el motivo exacto.
 */
class UnavailableStorageProvider implements StorageProvider {
  readonly name: string;

  constructor(private readonly reason: string) {
    this.name = "unavailable";
  }

  private fail(): never {
    throw new AppError(this.reason, 503, "STORAGE_UNAVAILABLE");
  }

  createSignedUpload(): Promise<never> {
    return this.fail();
  }
  head(): Promise<never> {
    return this.fail();
  }
  remove(): Promise<never> {
    return this.fail();
  }
  publicUrlFor(): string {
    return this.fail();
  }
  keyFromPublicUrl(): string | null {
    return this.fail();
  }
}

export function createStorageProvider(): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case "s3":
      // env.ts ya validó que las credenciales estén cuando el provider es s3.
      return new S3StorageProvider({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        bucket: env.S3_BUCKET,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        publicUrl: env.S3_PUBLIC_URL,
        uploadUrlTtlMinutes: env.S3_UPLOAD_URL_TTL_MIN,
      });

    case "fake":
      logger.warn(
        "STORAGE_PROVIDER=fake: las subidas de multimedia no persisten. Configurá S3/MinIO para usarlas de verdad.",
      );
      return new FakeStorageProvider();

    case "cloudinary":
      return new UnavailableStorageProvider(
        "El provider de storage cloudinary todavía no está implementado. Usá STORAGE_PROVIDER=s3.",
      );
  }
}

/** Instancia compartida por los módulos que guardan archivos. */
export const storageProvider = createStorageProvider();
