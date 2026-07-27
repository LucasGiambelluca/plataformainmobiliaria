import { randomUUID } from "node:crypto";
import type { MediaStatus, MediaType } from "@prisma/client";
import type { LimitService } from "@/modules/subscriptions/limit.service";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import type { StorageProvider } from "@/shared/services/storage";
import {
  ALLOWED_CONTENT_TYPES,
  CONTENT_TYPE_BY_EXT,
  MAX_SIZE_BYTES,
  type AllowedContentType,
} from "./media.schemas";

export interface MediaRecord {
  id: string;
  propertyId: string;
  tenantId: string;
  type: MediaType;
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  durationSec: number | null;
  sortOrder: number;
  isCover: boolean;
  status: MediaStatus;
  createdAt: Date;
}

export interface SignedUploadResult {
  media: MediaRecord;
  upload: {
    uploadUrl: string;
    /** El navegador DEBE mandar este Content-Type: va dentro de la firma. */
    contentType: string;
    expiresAt: Date;
  };
}

export interface MediaRepository {
  /** Existencia de la propiedad dentro del tenant (no filtra la de otros). */
  propertyExists(propertyId: string, tenantId: string): Promise<boolean>;
  listByProperty(propertyId: string, tenantId: string): Promise<MediaRecord[]>;
  findById(id: string, tenantId: string): Promise<MediaRecord | null>;
  nextSortOrder(propertyId: string, tenantId: string): Promise<number>;
  countByProperty(propertyId: string, tenantId: string): Promise<number>;
  createMedia(data: {
    id: string;
    propertyId: string;
    tenantId: string;
    type: MediaType;
    url: string;
    sizeBytes: number;
    sortOrder: number;
    isCover: boolean;
  }): Promise<MediaRecord>;
  updateMedia(
    id: string,
    tenantId: string,
    data: { sizeBytes?: number; status?: MediaStatus; sortOrder?: number },
  ): Promise<MediaRecord>;
  /** Marca una como portada y desmarca el resto de la misma propiedad. */
  setCover(id: string, propertyId: string, tenantId: string): Promise<MediaRecord>;
  /** Aplica el orden recibido; falla si algún id no es de la propiedad. */
  reorder(propertyId: string, tenantId: string, ids: string[]): Promise<MediaRecord[]>;
  deleteMedia(id: string, tenantId: string): Promise<void>;
}

export class MediaService {
  constructor(
    private readonly repo: MediaRepository,
    private readonly limitService: LimitService,
    private readonly storage: StorageProvider,
  ) {}

  async list(propertyId: string, tenantId: string): Promise<MediaRecord[]> {
    await this.assertProperty(propertyId, tenantId);
    return this.repo.listByProperty(propertyId, tenantId);
  }

  /**
   * Paso 1 de la subida: valida, reserva el cupo de storage y firma la URL.
   * El archivo va del navegador al storage sin pasar por acá.
   */
  async createUpload(
    propertyId: string,
    tenantId: string,
    input: { contentType: AllowedContentType; sizeBytes: number },
  ): Promise<SignedUploadResult> {
    await this.assertProperty(propertyId, tenantId);

    const { type, ext } = ALLOWED_CONTENT_TYPES[input.contentType];
    if (input.sizeBytes > MAX_SIZE_BYTES[type]) {
      const maxMb = Math.round(MAX_SIZE_BYTES[type] / (1024 * 1024));
      throw new BadRequestError(
        `El archivo supera el máximo de ${maxMb} MB para ${type === "image" ? "imágenes" : "videos"}`,
      );
    }

    // Enforcement del límite maxStorageMb del plan (tarea 1.12).
    await this.limitService.assertCanAddStorage(tenantId, input.sizeBytes);

    // El id se genera acá para poder armar la clave del objeto antes de
    // escribir la fila: así la clave es derivable y no hace falta guardarla.
    const id = randomUUID();
    const key = `tenants/${tenantId}/properties/${propertyId}/${id}.${ext}`;
    const signed = await this.storage.createSignedUpload({
      key,
      contentType: input.contentType,
    });

    const [sortOrder, existing] = await Promise.all([
      this.repo.nextSortOrder(propertyId, tenantId),
      this.repo.countByProperty(propertyId, tenantId),
    ]);

    const media = await this.repo.createMedia({
      id,
      propertyId,
      tenantId,
      type,
      url: signed.publicUrl,
      // Tamaño declarado: ya cuenta para el plan, así una subida a medio
      // terminar no deja cupo libre para saltarse el límite.
      sizeBytes: input.sizeBytes,
      sortOrder,
      isCover: existing === 0,
    });

    return {
      media,
      upload: {
        uploadUrl: signed.uploadUrl,
        contentType: signed.contentType,
        expiresAt: signed.expiresAt,
      },
    };
  }

  /**
   * Paso 2: el navegador terminó el PUT. Se contrasta el tamaño real contra el
   * declarado — sin esto, declarar 1 byte y subir 4 GB saltearía el límite.
   */
  async confirmUpload(
    propertyId: string,
    mediaId: string,
    tenantId: string,
  ): Promise<MediaRecord> {
    const media = await this.getOwned(propertyId, mediaId, tenantId);
    if (media.status === "ready") return media;

    const key = this.keyOf(media.url);
    const object = key ? await this.storage.head(key) : null;

    if (!object) {
      await this.repo.updateMedia(mediaId, tenantId, { status: "failed" });
      throw new BadRequestError("El archivo no llegó al storage. Reintentá la subida.");
    }

    // Defensa en profundidad sobre el Content-Type: la firma ya lo ata, pero no
    // todos los proveedores S3-compatibles lo hacen cumplir igual. El bucket es
    // de lectura pública, así que un objeto con Content-Type text/html sería
    // contenido arbitrario servido desde nuestro dominio.
    const esperado = CONTENT_TYPE_BY_EXT[extensionOf(key ?? "")];
    if (esperado && object.contentType && object.contentType !== esperado) {
      if (key) await this.storage.remove(key);
      await this.repo.deleteMedia(mediaId, tenantId);
      throw new BadRequestError(
        `El archivo subido no es del tipo declarado (${esperado})`,
      );
    }

    const delta = object.sizeBytes - media.sizeBytes;
    if (delta > 0) {
      // El declarado ya está sumado, así que solo se valida la diferencia.
      try {
        await this.limitService.assertCanAddStorage(tenantId, delta);
      } catch (err) {
        // El archivo real no entra en el plan: se descarta entero.
        if (key) await this.storage.remove(key);
        await this.repo.deleteMedia(mediaId, tenantId);
        throw err;
      }
    }

    return this.repo.updateMedia(mediaId, tenantId, {
      sizeBytes: object.sizeBytes,
      status: "ready",
    });
  }

  /**
   * Edición puntual de un archivo. `isCover` no es un campo suelto: marca una
   * portada implica desmarcar la anterior, por eso pasa por `setCover`.
   */
  async update(
    propertyId: string,
    mediaId: string,
    tenantId: string,
    input: { sortOrder?: number; isCover?: boolean },
  ): Promise<MediaRecord> {
    let media = await this.getOwned(propertyId, mediaId, tenantId);

    if (input.isCover === false) {
      throw new BadRequestError(
        "Para cambiar la portada marcá otra imagen, no destildes la actual",
      );
    }

    if (input.sortOrder !== undefined) {
      media = await this.repo.updateMedia(mediaId, tenantId, {
        sortOrder: input.sortOrder,
      });
    }

    if (input.isCover) {
      if (media.status !== "ready") {
        throw new BadRequestError("Solo se puede usar de portada un archivo ya subido");
      }
      media = await this.repo.setCover(mediaId, propertyId, tenantId);
    }

    return media;
  }

  async reorder(
    propertyId: string,
    tenantId: string,
    ids: string[],
  ): Promise<MediaRecord[]> {
    await this.assertProperty(propertyId, tenantId);

    if (new Set(ids).size !== ids.length) {
      throw new BadRequestError("La lista de orden tiene ids repetidos");
    }
    return this.repo.reorder(propertyId, tenantId, ids);
  }

  async remove(propertyId: string, mediaId: string, tenantId: string): Promise<void> {
    const media = await this.getOwned(propertyId, mediaId, tenantId);

    // Primero la fila: si el borrado del objeto falla, no queda una fila
    // apuntando a un archivo que ya no está.
    await this.repo.deleteMedia(mediaId, tenantId);

    const key = this.keyOf(media.url);
    if (key) await this.storage.remove(key);
  }

  private async assertProperty(propertyId: string, tenantId: string): Promise<void> {
    if (!(await this.repo.propertyExists(propertyId, tenantId))) {
      throw new NotFoundError("Propiedad no encontrada");
    }
  }

  private async getOwned(
    propertyId: string,
    mediaId: string,
    tenantId: string,
  ): Promise<MediaRecord> {
    const media = await this.repo.findById(mediaId, tenantId);
    // Se compara propertyId para que un id de otra propiedad del mismo tenant
    // no se pueda operar desde una ruta ajena.
    if (!media || media.propertyId !== propertyId) {
      throw new NotFoundError("Archivo no encontrado");
    }
    return media;
  }

  private keyOf(url: string): string | null {
    return this.storage.keyFromPublicUrl(url);
  }
}

/** "…/abc.jpg" → "jpg". Cadena vacía si no tiene extensión. */
function extensionOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? "" : key.slice(dot + 1).toLowerCase();
}
