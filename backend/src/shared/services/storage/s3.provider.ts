import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  SignedUpload,
  StorageProvider,
  StoredObject,
} from "./storage.provider";

export interface S3Config {
  /** Vacío para AWS real; con valor para S3-compatibles (MinIO, R2). */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base pública de lectura, sin barra final. */
  publicUrl: string;
  uploadUrlTtlMinutes: number;
}

const trimSlashes = (value: string) => value.replace(/\/+$/, "");

/**
 * Implementación S3-compatible. Probada contra MinIO, que es lo que corre en el
 * VPS; el mismo código sirve para S3 o R2 cambiando endpoint y credenciales.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly publicBase: string;

  constructor(private readonly config: S3Config) {
    this.publicBase = trimSlashes(config.publicUrl);
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      // MinIO no soporta virtual-hosted-style salvo con DNS por bucket.
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createSignedUpload({
    key,
    contentType,
  }: {
    key: string;
    contentType: string;
  }): Promise<SignedUpload> {
    const ttlSeconds = this.config.uploadUrlTtlMinutes * 60;
    // `signableHeaders` es imprescindible: sin él, el presigner firma solo el
    // host y el storage acepta CUALQUIER Content-Type en el PUT. Verificado
    // contra MinIO — pedir firma para image/png y subir application/octet-stream
    // funcionaba. Con el bucket de lectura pública eso permite alojar HTML en
    // el dominio del CDN. Incluyéndolo en la firma, un PUT con otro header falla.
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: ttlSeconds, signableHeaders: new Set(["content-type"]) },
    );

    return {
      uploadUrl,
      contentType,
      key,
      publicUrl: this.publicUrlFor(key),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return {
        sizeBytes: Number(res.ContentLength ?? 0),
        contentType: res.ContentType ?? null,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
    } catch (err) {
      // Idempotente: si ya no está, el resultado deseado se cumple igual.
      if (!isNotFound(err)) throw err;
    }
  }

  publicUrlFor(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  keyFromPublicUrl(url: string): string | null {
    const prefix = `${this.publicBase}/`;
    return url.startsWith(prefix) ? url.slice(prefix.length) : null;
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { name, $metadata } = err as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return name === "NotFound" || name === "NoSuchKey" || $metadata?.httpStatusCode === 404;
}
