import type {
  SignedUpload,
  StorageProvider,
  StoredObject,
} from "./storage.provider";

/**
 * Provider en memoria. Dos usos:
 *
 * 1. Tests: permite ejercitar el módulo de media sin red ni contenedor.
 * 2. Desarrollo sin storage configurado: el backend arranca igual y falla con
 *    un mensaje claro recién cuando alguien intenta subir algo, en vez de
 *    romper el resto de la API.
 *
 * `head` devuelve lo que se le haya registrado con `pretendUploaded`, así se
 * puede simular tanto una subida exitosa como una que nunca llegó.
 */
export class FakeStorageProvider implements StorageProvider {
  readonly name = "fake";
  readonly uploads: SignedUpload[] = [];
  readonly removed: string[] = [];
  private readonly objects = new Map<string, StoredObject>();

  constructor(private readonly publicBase = "https://storage.local") {}

  createSignedUpload({
    key,
    contentType,
  }: {
    key: string;
    contentType: string;
  }): Promise<SignedUpload> {
    const upload: SignedUpload = {
      uploadUrl: `${this.publicBase}/upload/${key}?firma=fake`,
      contentType,
      key,
      publicUrl: this.publicUrlFor(key),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    this.uploads.push(upload);
    return Promise.resolve(upload);
  }

  /** Simula que el navegador completó el PUT. */
  pretendUploaded(key: string, sizeBytes: number, contentType = "image/jpeg"): void {
    this.objects.set(key, { sizeBytes, contentType });
  }

  head(key: string): Promise<StoredObject | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  remove(key: string): Promise<void> {
    this.removed.push(key);
    this.objects.delete(key);
    return Promise.resolve();
  }

  publicUrlFor(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  keyFromPublicUrl(url: string): string | null {
    const prefix = `${this.publicBase}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}
