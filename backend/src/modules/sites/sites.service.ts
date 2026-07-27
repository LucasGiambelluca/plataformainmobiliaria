import { randomUUID } from "node:crypto";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import type { StorageProvider } from "@/shared/services/storage";
import {
  ALLOWED_CAROUSEL_TYPES,
  MAX_CAROUSEL_BYTES,
  MAX_CAROUSEL_IMAGES,
  type CarouselContentType,
  type UpdateCarouselBody,
  type UpdateSiteConfigBody,
} from "./sites.schemas";

export interface CarouselImage {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  caption: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface SiteConfig {
  id: string;
  tenantId: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  heroTitle: string | null;
  heroSubtitle: string | null;
  aboutText: string | null;
  socialFacebook: string | null;
  socialInstagram: string | null;
  socialWhatsapp: string | null;
  showFeaturedOnly: boolean;
  template: string | null;
  isPublished: boolean;
}

export interface SiteWithCarousel extends SiteConfig {
  carousel: CarouselImage[];
  // Slug y nombre del tenant: el panel los necesita para armar el enlace al
  // sitio, y no viajan en el JWT.
  slug: string;
  tenantName: string;
}

/** Lo que ve un visitante: perfil de la inmobiliaria + su configuración visual. */
export interface PublicSite {
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    description: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  site: Omit<SiteConfig, "id" | "tenantId" | "isPublished">;
  carousel: CarouselImage[];
}

export interface SitesRepository {
  /** Crea la config con los valores por defecto si el tenant todavía no la tiene. */
  ensureConfig(tenantId: string): Promise<SiteWithCarousel>;
  findByTenant(tenantId: string): Promise<SiteWithCarousel | null>;
  updateConfig(tenantId: string, data: UpdateSiteConfigBody): Promise<SiteWithCarousel>;
  /** Sitio público por slug; null si el tenant no existe, está inactivo o el sitio no está publicado. */
  findPublicBySlug(slug: string): Promise<PublicSite | null>;

  countCarousel(tenantId: string): Promise<number>;
  nextCarouselOrder(tenantId: string): Promise<number>;
  createCarouselImage(data: {
    id: string;
    tenantId: string;
    siteConfigId: string;
    imageUrl: string;
    caption?: string;
    linkUrl?: string;
    sortOrder: number;
  }): Promise<CarouselImage>;
  findCarouselImage(id: string, tenantId: string): Promise<CarouselImage | null>;
  updateCarouselImage(
    id: string,
    tenantId: string,
    data: UpdateCarouselBody,
  ): Promise<CarouselImage>;
  deleteCarouselImage(id: string, tenantId: string): Promise<void>;
  reorderCarousel(tenantId: string, ids: string[]): Promise<CarouselImage[]>;
}

export class SitesService {
  constructor(
    private readonly repo: SitesRepository,
    private readonly storage: StorageProvider,
  ) {}

  /** Config del tenant autenticado. Se crea al vuelo la primera vez. */
  getOwn(tenantId: string): Promise<SiteWithCarousel> {
    return this.repo.ensureConfig(tenantId);
  }

  async update(tenantId: string, input: UpdateSiteConfigBody): Promise<SiteWithCarousel> {
    await this.repo.ensureConfig(tenantId);
    return this.repo.updateConfig(tenantId, input);
  }

  /**
   * Sitio público. El 404 cubre tres casos distintos a propósito — no existe,
   * la inmobiliaria está suspendida, o el sitio no está publicado — para no
   * filtrar en cuál de los tres está.
   */
  async getPublic(slug: string): Promise<PublicSite> {
    const site = await this.repo.findPublicBySlug(slug);
    if (!site) throw new NotFoundError("Sitio no encontrado");
    return site;
  }

  /** Paso 1 de la carga de una imagen del carrousel: valida y firma. */
  async createCarouselUpload(
    tenantId: string,
    input: { contentType: CarouselContentType; sizeBytes: number; caption?: string; linkUrl?: string },
  ) {
    if (input.sizeBytes > MAX_CAROUSEL_BYTES) {
      const maxMb = Math.round(MAX_CAROUSEL_BYTES / (1024 * 1024));
      throw new BadRequestError(`La imagen supera el máximo de ${maxMb} MB`);
    }

    const config = await this.repo.ensureConfig(tenantId);
    const cuantas = await this.repo.countCarousel(tenantId);
    if (cuantas >= MAX_CAROUSEL_IMAGES) {
      throw new BadRequestError(
        `El carrousel admite hasta ${MAX_CAROUSEL_IMAGES} imágenes. Borrá alguna para subir otra.`,
      );
    }

    const id = randomUUID();
    const ext = ALLOWED_CAROUSEL_TYPES[input.contentType];
    // Fuera de la carpeta de propiedades: son imágenes del sitio, no de una
    // publicación, y sobreviven al borrado de cualquier propiedad.
    const key = `tenants/${tenantId}/site/carousel/${id}.${ext}`;
    const signed = await this.storage.createSignedUpload({
      key,
      contentType: input.contentType,
    });

    const image = await this.repo.createCarouselImage({
      id,
      tenantId,
      siteConfigId: config.id,
      imageUrl: signed.publicUrl,
      caption: input.caption,
      linkUrl: input.linkUrl,
      sortOrder: await this.repo.nextCarouselOrder(tenantId),
    });

    return {
      image,
      upload: {
        uploadUrl: signed.uploadUrl,
        contentType: signed.contentType,
        expiresAt: signed.expiresAt,
      },
    };
  }

  /** Paso 2: se verifica que el archivo llegó de verdad al storage. */
  async confirmCarouselUpload(tenantId: string, id: string): Promise<CarouselImage> {
    const image = await this.getCarouselOwned(id, tenantId);
    const key = this.storage.keyFromPublicUrl(image.imageUrl);
    const objeto = key ? await this.storage.head(key) : null;

    if (!objeto) {
      await this.repo.deleteCarouselImage(id, tenantId);
      throw new BadRequestError("La imagen no llegó al storage. Reintentá la subida.");
    }
    return image;
  }

  updateCarousel(
    tenantId: string,
    id: string,
    input: UpdateCarouselBody,
  ): Promise<CarouselImage> {
    return this.getCarouselOwned(id, tenantId).then(() =>
      this.repo.updateCarouselImage(id, tenantId, input),
    );
  }

  async reorderCarousel(tenantId: string, ids: string[]): Promise<CarouselImage[]> {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestError("La lista de orden tiene ids repetidos");
    }
    return this.repo.reorderCarousel(tenantId, ids);
  }

  async removeCarousel(tenantId: string, id: string): Promise<void> {
    const image = await this.getCarouselOwned(id, tenantId);

    await this.repo.deleteCarouselImage(id, tenantId);

    const key = this.storage.keyFromPublicUrl(image.imageUrl);
    if (key) await this.storage.remove(key);
  }

  private async getCarouselOwned(id: string, tenantId: string): Promise<CarouselImage> {
    const image = await this.repo.findCarouselImage(id, tenantId);
    if (!image) throw new NotFoundError("Imagen no encontrada");
    return image;
  }
}
