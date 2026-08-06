import { randomUUID } from "node:crypto";
import { logger } from "@/config/logger";
import { LimitExceededError, NotFoundError, ValidationError } from "@/shared/errors";
import type { StorageProvider } from "@/shared/services/storage";

/**
 * Fotos de una solicitud de tasación.
 *
 * Quien sube acá es un propietario **sin cuenta**, antes de que exista la
 * solicitud y antes de que haya inmobiliaria asignada. Eso lo diferencia de
 * `media`, donde siempre hay un tenant al que descontarle cupo y un usuario
 * autenticado al que responsabilizar.
 *
 * Como no hay cupo de plan que sirva de freno, los límites son propios y
 * duros: solo imágenes, tope por archivo y tope por solicitud. La otra mitad
 * del control está en el router (rate limit por IP).
 */

const MB = 1024 * 1024;

/** Tope por foto. Más chico que el de una propiedad publicada: es un anónimo. */
export const MAX_SIZE_BYTES = 5 * MB;

/** Tope de fotos por solicitud. Sin cupo de plan detrás, este es el freno. */
export const MAX_FILES_POR_SOLICITUD = 8;

/** Horas que vive un draft sin enviarse antes de considerarse abandonado. */
export const DRAFT_TTL_HORAS = 24;

/**
 * Solo imágenes. Los videos quedan afuera a propósito: pesan mucho más, no
 * aportan a una tasación y ampliarían la superficie de un endpoint abierto.
 */
export const TIPOS_PERMITIDOS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type TipoPermitido = keyof typeof TIPOS_PERMITIDOS;

const TIPO_POR_EXT: Record<string, TipoPermitido> = Object.entries(
  TIPOS_PERMITIDOS,
).reduce<Record<string, TipoPermitido>>((acc, [tipo, ext]) => {
  acc[ext] = tipo as TipoPermitido;
  return acc;
}, {});

export interface AppraisalMediaRow {
  id: string;
  draftId: string;
  url: string;
  sizeBytes: number;
  confirmedAt: Date | null;
}

export interface AppraisalMediaRepository {
  countByDraft(draftId: string): Promise<number>;
  create(data: { draftId: string; url: string; sizeBytes: number }): Promise<AppraisalMediaRow>;
  /** Fila pendiente de confirmar, solo si pertenece a ese draft. */
  findPending(id: string, draftId: string): Promise<AppraisalMediaRow | null>;
  confirm(id: string, sizeBytesReal: number): Promise<void>;
  remove(id: string): Promise<void>;
  /** Borra los drafts vencidos sin enviar y devuelve las URLs que quedaron. */
  deleteExpiredDrafts(antesDe: Date): Promise<string[]>;
}

export interface UploadUrlInput {
  draftId?: string;
  contentType: TipoPermitido;
  sizeBytes: number;
}

export interface UploadUrlResult {
  draftId: string;
  mediaId: string;
  uploadUrl: string;
  /** Header que el navegador DEBE mandar: va dentro de la firma. */
  contentType: string;
  expiresAt: Date;
}

function extensionOf(clave: string): string {
  const punto = clave.lastIndexOf(".");
  return punto === -1 ? "" : clave.slice(punto + 1).toLowerCase();
}

export class AppraisalMediaService {
  constructor(
    private readonly repo: AppraisalMediaRepository,
    private readonly storage: StorageProvider,
  ) {}

  async createUploadUrl(input: UploadUrlInput): Promise<UploadUrlResult> {
    const ext = TIPOS_PERMITIDOS[input.contentType];
    if (!ext) {
      throw new ValidationError(
        "Solo se pueden adjuntar fotos (JPG, PNG o WebP).",
      );
    }

    if (input.sizeBytes > MAX_SIZE_BYTES) {
      throw new ValidationError(
        `Cada foto puede pesar hasta ${MAX_SIZE_BYTES / MB} MB.`,
      );
    }

    // **El draft lo emite el servidor.** Un `draftId` que llega del cliente
    // solo se acepta si ya tiene fotos, o sea si salió de una llamada anterior
    // a este mismo método; uno inventado se descarta y se emite uno nuevo.
    //
    // Antes se tomaba tal cual venía (`input.draftId ?? randomUUID()`), lo que
    // dejaba al cliente fijar el identificador: podía elegir el prefijo bajo el
    // que se guardan los archivos y anclar el conteo a un id de su elección,
    // cuando el comentario de arriba decía justo lo contrario.
    //
    // Esto NO convierte el draft en un secreto a prueba de todo: sigue siendo
    // la única credencial que separa a dos anónimos, así que quien lo obtenga
    // puede reclamar esas fotos al dar de alta la solicitud. Eso es el diseño y
    // está documentado; lo que se cierra acá es que cualquiera pueda decidir el
    // identificador sin haber subido nada. El tope real contra la subida masiva
    // sigue siendo el rate limit por IP, porque pedir un draft nuevo en cada
    // llamada siempre va a estar permitido.
    const propuesto = input.draftId;
    const yaExiste = propuesto ? (await this.repo.countByDraft(propuesto)) > 0 : false;
    const draftId = yaExiste && propuesto ? propuesto : randomUUID();

    const yaSubidas = await this.repo.countByDraft(draftId);
    if (yaSubidas >= MAX_FILES_POR_SOLICITUD) {
      throw new LimitExceededError(
        "fotos",
        `Podés adjuntar hasta ${MAX_FILES_POR_SOLICITUD} fotos por solicitud.`,
      );
    }

    // Prefijo propio, fuera del árbol de las propiedades publicadas: así una
    // política de borrado sobre tasaciones no puede tocar el catálogo.
    const key = `appraisals/${draftId}/${randomUUID()}.${ext}`;

    const firmada = await this.storage.createSignedUpload({
      key,
      contentType: input.contentType,
    });

    const fila = await this.repo.create({
      draftId,
      url: firmada.publicUrl,
      sizeBytes: input.sizeBytes,
    });

    return {
      draftId,
      mediaId: fila.id,
      uploadUrl: firmada.uploadUrl,
      contentType: firmada.contentType,
      expiresAt: firmada.expiresAt,
    };
  }

  /**
   * Contrasta lo que quedó en el storage contra lo que se declaró.
   *
   * El tamaño se toma del objeto real y no del que mandó el cliente: sin este
   * paso, declarar 1 byte y subir 4 GB pasaría el tope sin que nadie se entere.
   * El Content-Type se vuelve a verificar por la misma razón que en `media`:
   * el bucket es de lectura pública y un HTML alojado en el dominio del CDN es
   * un problema, aunque la clave termine en .jpg.
   */
  async confirm(mediaId: string, draftId: string): Promise<void> {
    const fila = await this.repo.findPending(mediaId, draftId);
    if (!fila) throw new NotFoundError("Foto no encontrada");

    const key = this.storage.keyFromPublicUrl(fila.url);
    if (!key) throw new ValidationError("No se pudo ubicar el archivo subido");

    const objeto = await this.storage.head(key);
    if (!objeto) {
      throw new ValidationError("La foto no llegó al servidor. Probá de nuevo.");
    }

    const esperado = TIPO_POR_EXT[extensionOf(key)];
    if (objeto.contentType && esperado && objeto.contentType !== esperado) {
      await this.descartar(mediaId, key);
      throw new ValidationError("El archivo subido no es una foto válida.");
    }

    if (objeto.sizeBytes > MAX_SIZE_BYTES) {
      await this.descartar(mediaId, key);
      throw new ValidationError(
        `Cada foto puede pesar hasta ${MAX_SIZE_BYTES / MB} MB.`,
      );
    }

    await this.repo.confirm(mediaId, objeto.sizeBytes);
  }

  /** Saca de la base y del storage algo que no pasó la verificación. */
  private async descartar(mediaId: string, key: string): Promise<void> {
    await this.storage.remove(key);
    await this.repo.remove(mediaId);
  }

  /**
   * Borra las fotos de drafts que nunca se enviaron.
   *
   * Va perezosa, disparada por el alta, en vez de por un scheduler: el
   * proyecto no tiene infraestructura de jobs y montarla para esto no se paga.
   * Mismo criterio que el refresco de la caché de índices.
   *
   * **Nunca propaga errores**: es tarea de fondo, y fallar limpiando no puede
   * voltear la solicitud que la disparó.
   */
  async limpiarHuerfanos(): Promise<void> {
    try {
      const corte = new Date(Date.now() - DRAFT_TTL_HORAS * 60 * 60 * 1000);
      const urls = await this.repo.deleteExpiredDrafts(corte);

      for (const url of urls) {
        const key = this.storage.keyFromPublicUrl(url);
        if (key) await this.storage.remove(key);
      }
    } catch (err) {
      logger.error({ err }, "No se pudieron limpiar las fotos de tasaciones vencidas");
    }
  }
}
