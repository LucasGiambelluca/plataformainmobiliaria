import type { OperationType, PropertyType } from "@prisma/client";
import { BadRequestError, NotFoundError } from "@/shared/errors";
import { LOCALIDADES, type Localidad } from "@/shared/constants/localidades";

/**
 * Estados que el público puede ver. Es la regla de negocio más delicada de este
 * módulo: un borrador o una propiedad pausada NO se muestran, y el cliente no
 * puede pedir otra cosa porque el filtro de estado no se expone en la query.
 */
export const VISIBLE_STATUSES = ["published", "featured"] as const;

export interface PublicAgency {
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface PublicPropertyCard {
  id: string;
  title: string;
  propertyType: PropertyType;
  operationType: OperationType;
  price: string;
  currency: string;
  address: string | null;
  city: string | null;
  state: string | null;
  rooms: number | null;
  bathrooms: number | null;
  areaM2: string | null;
  featured: boolean;
  coverUrl: string | null;
  agency: PublicAgency;
}

export interface PublicPropertyDetail extends PublicPropertyCard {
  description: string | null;
  country: string | null;
  lat: string | null;
  lng: string | null;
  parking: number | null;
  floor: number | null;
  yearBuilt: number | null;
  viewsCount: number;
  createdAt: Date;
  features: string[];
  media: {
    id: string;
    type: "image" | "video";
    url: string;
    thumbnailUrl: string | null;
  }[];
  agencyContact: {
    email: string | null;
    phone: string | null;
    description: string | null;
  };
}

export interface PublicAgencyListItem extends PublicAgency {
  id: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  propertiesCount: number;
  /**
   * Localidades donde la inmobiliaria tiene propiedades visibles, de la que
   * más publica a la que menos.
   *
   * No sale de un campo del tenant: la tabla no tiene domicilio, y aunque lo
   * tuviera diría dónde está la oficina, no dónde vende. El directorio agrupa
   * por dónde hay propiedades, así que se calcula desde el catálogo.
   */
  cities: string[];
  /**
   * Si tiene la web propia publicada. El directorio la necesita para decidir si
   * ofrece el enlace: una web sin publicar responde 404, igual que una que no
   * existe, así que linkearla a ciegas manda al visitante a una pantalla rota.
   */
  hasPublishedSite: boolean;
}

/** Una URL del sitemap: la fecha permite que el crawler no reprocese lo viejo. */
export interface SitemapEntry {
  path: string;
  updatedAt: Date;
}

export interface CatalogInput {
  search?: string;
  operationType?: OperationType;
  propertyType?: PropertyType;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  agency?: string;
  onlyFeatured?: boolean;
  page?: number;
  pageSize?: number;
  sort?: "relevance" | "recent" | "price_asc" | "price_desc";
}

/**
 * Contrato de persistencia del catálogo público.
 *
 * A diferencia del resto de los módulos, este NO extiende BaseRepository: lee a
 * propósito a través de todos los tenants, que es justo lo que BaseRepository
 * prohíbe. La contrapartida es que el aislamiento se reemplaza por dos reglas
 * que la implementación tiene que garantizar siempre, y que los tests fijan:
 * solo estados visibles, y solo inmobiliarias activas.
 */
export interface PublicRepository {
  listProperties(
    input: CatalogInput & { page: number; pageSize: number },
  ): Promise<{ items: PublicPropertyCard[]; total: number }>;
  findPropertyById(id: string): Promise<PublicPropertyDetail | null>;
  /** Suma una vista. Sin await en la respuesta: no debe demorar la ficha. */
  incrementViews(id: string): Promise<void>;
  listAgencies(): Promise<PublicAgencyListItem[]>;
  listCities(): Promise<{ city: string; count: number }[]>;
  /** Solo planes activos: uno dado de baja no se ofrece más. */
  listActivePlans(): Promise<PublicPlan[]>;
  /**
   * Propiedades para el sitemap. Con `tenantId` devuelve solo las de esa
   * inmobiliaria: es el sitemap de su dominio propio, que no debe listar el
   * catálogo entero de la plataforma.
   */
  listSitemapProperties(tenantId?: string): Promise<SitemapEntry[]>;
  /** Inmobiliarias con la web publicada: las que no lo están dan 404. */
  listSitemapAgencies(): Promise<SitemapEntry[]>;
}

export interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  priceAmount: string;
  priceCurrency: string;
  billingInterval: string;
  maxProperties: number;
  maxUsers: number;
  maxStorageMb: number;
  maxDomains: number;
  maxFeatured: number;
}

const MAX_PAGE_SIZE = 60;
const DEFAULT_PAGE_SIZE = 24;

export class PublicService {
  constructor(private readonly repo: PublicRepository) {}

  async catalog(input: CatalogInput) {
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
    const { items, total } = await this.repo.listProperties({
      ...input,
      page,
      pageSize,
    });
    return { items, total, page, pageSize };
  }

  async property(id: string): Promise<PublicPropertyDetail> {
    const property = await this.repo.findPropertyById(id);
    // Mismo 404 para "no existe" y para "existe pero está en borrador": desde
    // afuera no se puede distinguir una cosa de la otra.
    if (!property) throw new NotFoundError("Propiedad no encontrada");

    // La vista se cuenta sin bloquear la respuesta ni romperla si falla.
    void this.repo.incrementViews(id).catch(() => undefined);

    return property;
  }

  agencies(): Promise<PublicAgencyListItem[]> {
    return this.repo.listAgencies();
  }

  cities(): Promise<{ city: string; count: number }[]> {
    return this.repo.listCities();
  }

  /**
   * Catálogo de localidades donde opera la plataforma.
   *
   * No sale de la base ni del repositorio: es una constante del código. Existe
   * como endpoint para que los formularios no repitan la lista del otro lado
   * —si divergieran, el desplegable ofrecería una localidad que el servidor
   * rechaza con 422— y es distinto de `cities()`, que devuelve solo las
   * localidades **con propiedades publicadas** y por eso sirve para filtrar
   * pero no para dar de alta.
   */
  localidades(): readonly Localidad[] {
    return LOCALIDADES;
  }

  plans(): Promise<PublicPlan[]> {
    return this.repo.listActivePlans();
  }

  /**
   * URLs indexables (tarea 4.9).
   *
   * Con `tenantId` es el sitemap de una web propia: solo sus propiedades, y sin
   * el directorio de inmobiliarias, que pertenece al portal. Sin `tenantId` es
   * el del portal, que sí lista a todas.
   */
  async sitemap(
    tenantId?: string,
  ): Promise<{ properties: SitemapEntry[]; agencies: SitemapEntry[] }> {
    const [properties, agencies] = await Promise.all([
      this.repo.listSitemapProperties(tenantId),
      tenantId ? Promise.resolve<SitemapEntry[]>([]) : this.repo.listSitemapAgencies(),
    ]);
    return { properties, agencies };
  }
}
