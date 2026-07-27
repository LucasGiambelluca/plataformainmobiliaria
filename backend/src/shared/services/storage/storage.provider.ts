/**
 * Contrato de almacenamiento de multimedia.
 *
 * Decisión fijada en plan_estrategico.md: el archivo NUNCA pasa por el backend
 * en la subida. El backend solo firma una URL y el navegador sube directo al
 * storage. Por eso la interfaz habla de "firmar", no de "guardar".
 *
 * La implementación por defecto es S3-compatible (MinIO sobre el VPS propio,
 * intercambiable por S3/R2 sin tocar código: son solo variables de entorno).
 */
export interface SignedUpload {
  /** URL a la que el navegador hace PUT con el archivo crudo. */
  uploadUrl: string;
  /** Header Content-Type que el navegador DEBE mandar (va en la firma). */
  contentType: string;
  /** Clave del objeto dentro del bucket. */
  key: string;
  /** URL pública final, la que se guarda en la base. */
  publicUrl: string;
  /** Momento en que la firma deja de servir. */
  expiresAt: Date;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

export interface StorageProvider {
  readonly name: string;

  /** Firma una subida directa del navegador al storage. */
  createSignedUpload(params: {
    key: string;
    contentType: string;
  }): Promise<SignedUpload>;

  /**
   * Metadatos reales del objeto ya subido. Se usa para verificar el tamaño
   * declarado por el cliente: sin esto, un cliente mentiroso podría saltarse
   * el límite de storage del plan.
   */
  head(key: string): Promise<StoredObject | null>;

  /** Borra el objeto. Idempotente: borrar algo inexistente no es un error. */
  remove(key: string): Promise<void>;

  /** URL pública de lectura para una clave. */
  publicUrlFor(key: string): string;

  /** Clave a partir de una URL pública previamente generada, o null. */
  keyFromPublicUrl(url: string): string | null;
}
