import type { OperationType, PropertyStatus, PropertyType } from "@prisma/client";
import type { LimitService } from "@/modules/subscriptions/limit.service";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import type { StorageProvider } from "@/shared/services/storage";

export interface PropertyMediaSummary {
  id: string;
  type: "image" | "video";
  url: string;
  thumbnailUrl: string | null;
  sizeBytes: number;
  sortOrder: number;
  isCover: boolean;
  status: "processing" | "ready" | "failed";
}

export interface PropertyRecord {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  propertyType: PropertyType;
  operationType: OperationType;
  price: string;
  currency: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: string | null;
  lng: string | null;
  areaM2: string | null;
  rooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  floor: number | null;
  yearBuilt: number | null;
  status: PropertyStatus;
  viewsCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  features: string[];
  media: PropertyMediaSummary[];
}

export interface PropertyListItem
  extends Omit<PropertyRecord, "features" | "media" | "description"> {
  coverUrl: string | null;
  mediaCount: number;
}

export interface CreatePropertyInput {
  title: string;
  description?: string;
  propertyType: PropertyType;
  operationType: OperationType;
  price: string;
  currency?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
  areaM2?: number;
  rooms?: number;
  bathrooms?: number;
  parking?: number;
  floor?: number;
  yearBuilt?: number;
  features?: string[];
}

export type UpdatePropertyInput = Partial<CreatePropertyInput> & {
  status?: PropertyStatus;
};

export interface ListPropertiesInput {
  search?: string;
  status?: PropertyStatus;
  propertyType?: PropertyType;
  operationType?: OperationType;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
  sort?: "recent" | "price_asc" | "price_desc" | "views";
}

/**
 * Contrato de persistencia. La implementación extiende BaseRepository, así que
 * toda operación queda aislada por tenant.
 */
export interface PropertiesRepository {
  list(
    tenantId: string,
    input: ListPropertiesInput & { page: number; pageSize: number },
  ): Promise<{ items: PropertyListItem[]; total: number }>;
  findDetail(id: string, tenantId: string): Promise<PropertyRecord | null>;
  createProperty(
    tenantId: string,
    data: Omit<CreatePropertyInput, "features">,
    features: string[],
    createdBy: string | null,
  ): Promise<PropertyRecord>;
  updateProperty(
    id: string,
    tenantId: string,
    data: Omit<UpdatePropertyInput, "features">,
    features: string[] | undefined,
  ): Promise<PropertyRecord>;
  /** Borra la propiedad y devuelve las URLs de su multimedia para limpiar el storage. */
  deleteProperty(id: string, tenantId: string): Promise<{ mediaUrls: string[] }>;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Transiciones permitidas de estado.
 *
 * `featured` ("super destacada" del home) solo se alcanza desde `published`:
 * no se promociona algo que todavía no está visible. Toda propiedad puede
 * volver a `draft` para editarla fuera de la vista del público.
 */
const ALLOWED_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  draft: ["published"],
  published: ["draft", "paused", "featured"],
  paused: ["draft", "published"],
  featured: ["draft", "paused", "published"],
};

export class PropertiesService {
  constructor(
    private readonly repo: PropertiesRepository,
    private readonly limitService: LimitService,
    private readonly storage: StorageProvider,
  ) {}

  // async a propósito: así un input inválido rechaza la promesa en vez de tirar
  // sincrónicamente, y quien llama maneja un solo tipo de falla.
  async list(tenantId: string, input: ListPropertiesInput) {
    if (
      input.minPrice !== undefined &&
      input.maxPrice !== undefined &&
      input.minPrice > input.maxPrice
    ) {
      throw new BadRequestError("El precio mínimo no puede superar al máximo");
    }

    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const { items, total } = await this.repo.list(tenantId, {
      ...input,
      page,
      pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getById(id: string, tenantId: string): Promise<PropertyRecord> {
    const property = await this.repo.findDetail(id, tenantId);
    if (!property) throw new NotFoundError("Propiedad no encontrada");
    return property;
  }

  async create(
    tenantId: string,
    input: CreatePropertyInput,
    createdBy: string | null,
  ): Promise<PropertyRecord> {
    // Enforcement centralizado del límite maxProperties del plan (tarea 1.12).
    await this.limitService.assertCanAddProperty(tenantId);

    const { features = [], ...data } = input;
    return this.repo.createProperty(tenantId, data, dedupeFeatures(features), createdBy);
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdatePropertyInput,
  ): Promise<PropertyRecord> {
    const current = await this.getById(id, tenantId);

    if (input.status && input.status !== current.status) {
      this.assertTransition(current.status, input.status);
    }

    const { features, ...data } = input;
    return this.repo.updateProperty(
      id,
      tenantId,
      data,
      features === undefined ? undefined : dedupeFeatures(features),
    );
  }

  /** Cambio de estado explícito (publicar, pausar, destacar, volver a borrador). */
  async changeStatus(
    id: string,
    tenantId: string,
    status: PropertyStatus,
  ): Promise<PropertyRecord> {
    const current = await this.getById(id, tenantId);
    // Idempotente: dejar en el estado en el que ya está no es un error.
    if (current.status === status) return current;

    this.assertTransition(current.status, status);
    return this.repo.updateProperty(id, tenantId, { status }, undefined);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.getById(id, tenantId);
    // Las filas de property_media caen por cascada; los objetos del storage no,
    // así que se borran acá para no dejar archivos huérfanos ocupando el plan.
    const { mediaUrls } = await this.repo.deleteProperty(id, tenantId);

    await Promise.all(
      mediaUrls.map(async (url) => {
        const key = this.storage.keyFromPublicUrl(url);
        if (key) await this.storage.remove(key);
      }),
    );
  }

  private assertTransition(from: PropertyStatus, to: PropertyStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new BadRequestError(
        `No se puede pasar una propiedad de "${from}" a "${to}"`,
      );
    }
  }
}

/** Normaliza y quita repetidos conservando el orden de carga. */
function dedupeFeatures(features: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of features) {
    const feature = raw.trim();
    const key = feature.toLowerCase();
    if (!feature || seen.has(key)) continue;
    seen.add(key);
    result.push(feature);
  }
  return result;
}
