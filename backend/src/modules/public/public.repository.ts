import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import {
  VISIBLE_STATUSES,
  type CatalogInput,
  type PublicAgencyListItem,
  type PublicPropertyCard,
  type PublicPropertyDetail,
  type PublicRepository,
} from "./public.service";

/**
 * Implementación del catálogo público. Lee a través de todos los tenants a
 * propósito, así que no extiende BaseRepository.
 *
 * `visibilidad` es la única puerta: TODA consulta de este archivo la usa. Si
 * una query nueva la olvida, se filtran borradores o propiedades de una
 * inmobiliaria suspendida por falta de pago.
 */
const visibilidad = {
  status: { in: [...VISIBLE_STATUSES] },
  tenant: { isActive: true },
} satisfies Prisma.PropertyWhereInput;

const cardSelect = {
  id: true,
  title: true,
  propertyType: true,
  operationType: true,
  price: true,
  currency: true,
  address: true,
  city: true,
  state: true,
  rooms: true,
  bathrooms: true,
  areaM2: true,
  status: true,
  tenant: { select: { name: true, slug: true, logoUrl: true } },
  media: {
    where: { status: "ready" as const },
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
    take: 1,
    select: { url: true, thumbnailUrl: true },
  },
} satisfies Prisma.PropertySelect;

type CardRow = Prisma.PropertyGetPayload<{ select: typeof cardSelect }>;

const decimal = (value: Prisma.Decimal | null) =>
  value === null ? null : value.toString();

function toCard(row: CardRow): PublicPropertyCard {
  const cover = row.media[0];
  return {
    id: row.id,
    title: row.title,
    propertyType: row.propertyType,
    operationType: row.operationType,
    price: row.price.toString(),
    currency: row.currency,
    address: row.address,
    city: row.city,
    state: row.state,
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    areaM2: decimal(row.areaM2),
    featured: row.status === "featured",
    coverUrl: cover?.thumbnailUrl ?? cover?.url ?? null,
    agency: {
      name: row.tenant.name,
      slug: row.tenant.slug,
      logoUrl: row.tenant.logoUrl,
    },
  };
}

const ORDER_BY: Record<
  NonNullable<CatalogInput["sort"]>,
  Prisma.PropertyOrderByWithRelationInput[]
> = {
  // Las destacadas primero: es el lugar que paga el plan superior. En el orden
  // del enum `featured` va después de `published`, por eso desc.
  relevance: [{ status: "desc" }, { createdAt: "desc" }],
  recent: [{ createdAt: "desc" }],
  price_asc: [{ price: "asc" }],
  price_desc: [{ price: "desc" }],
};

export const publicRepository: PublicRepository = {
  async listProperties(input) {
    const where: Prisma.PropertyWhereInput = {
      ...visibilidad,
      // Restringe dentro de lo visible; nunca lo amplía.
      ...(input.onlyFeatured && { status: { in: ["featured" as const] } }),
      ...(input.operationType && { operationType: input.operationType }),
      ...(input.propertyType && { propertyType: input.propertyType }),
      ...(input.city && { city: { contains: input.city, mode: "insensitive" } }),
      ...(input.minRooms !== undefined && { rooms: { gte: input.minRooms } }),
      ...(input.agency && { tenant: { isActive: true, slug: input.agency } }),
      ...(input.minPrice !== undefined || input.maxPrice !== undefined
        ? {
            price: {
              ...(input.minPrice !== undefined && { gte: input.minPrice }),
              ...(input.maxPrice !== undefined && { lte: input.maxPrice }),
            },
          }
        : {}),
      ...(input.search && {
        OR: [
          { title: { contains: input.search, mode: "insensitive" } },
          { address: { contains: input.search, mode: "insensitive" } },
          { city: { contains: input.search, mode: "insensitive" } },
        ],
      }),
    };

    const [rows, total] = await Promise.all([
      prisma.property.findMany({
        where,
        orderBy: ORDER_BY[input.sort ?? "relevance"],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: cardSelect,
      }),
      prisma.property.count({ where }),
    ]);

    return { items: rows.map(toCard), total };
  },

  async findPropertyById(id: string): Promise<PublicPropertyDetail | null> {
    const row = await prisma.property.findFirst({
      where: { id, ...visibilidad },
      select: {
        ...cardSelect,
        description: true,
        country: true,
        lat: true,
        lng: true,
        parking: true,
        floor: true,
        yearBuilt: true,
        viewsCount: true,
        createdAt: true,
        features: { select: { feature: true }, orderBy: { feature: "asc" } },
        tenant: {
          select: {
            name: true,
            slug: true,
            logoUrl: true,
            description: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
        media: {
          where: { status: "ready" },
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
          select: { id: true, type: true, url: true, thumbnailUrl: true },
        },
      },
    });
    if (!row) return null;

    return {
      ...toCard({
        ...row,
        // La ficha trae la galería completa; la tarjeta solo mira la portada.
        media: row.media
          .slice(0, 1)
          .map((m) => ({ url: m.url, thumbnailUrl: m.thumbnailUrl })),
      }),
      description: row.description,
      country: row.country,
      lat: decimal(row.lat),
      lng: decimal(row.lng),
      parking: row.parking,
      floor: row.floor,
      yearBuilt: row.yearBuilt,
      viewsCount: row.viewsCount,
      createdAt: row.createdAt,
      features: row.features.map((f) => f.feature),
      media: row.media.map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
      })),
      agencyContact: {
        email: row.tenant.contactEmail,
        phone: row.tenant.contactPhone,
        description: row.tenant.description,
      },
    };
  },

  async incrementViews(id: string): Promise<void> {
    // updateMany y no update: si la propiedad dejó de ser visible entre la
    // lectura y esta escritura, simplemente no actualiza nada.
    await prisma.property.updateMany({
      where: { id, ...visibilidad },
      data: { viewsCount: { increment: 1 } },
    });
  },

  async listAgencies(): Promise<PublicAgencyListItem[]> {
    const rows = await prisma.tenant.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        description: true,
        contactEmail: true,
        contactPhone: true,
        _count: { select: { properties: { where: visibilidad } } },
      },
    });

    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logoUrl,
      description: t.description,
      contactEmail: t.contactEmail,
      contactPhone: t.contactPhone,
      propertiesCount: t._count.properties,
    }));
  },

  async listActivePlans() {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceAmount: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        priceAmount: true,
        priceCurrency: true,
        billingInterval: true,
        maxProperties: true,
        maxUsers: true,
        maxStorageMb: true,
        maxDomains: true,
      },
    });
    return plans.map((p) => ({ ...p, priceAmount: p.priceAmount.toString() }));
  },

  async listCities(): Promise<{ city: string; count: number }[]> {
    const rows = await prisma.property.groupBy({
      by: ["city"],
      where: { ...visibilidad, city: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { city: "desc" } },
      take: 30,
    });

    return rows
      .filter((r): r is typeof r & { city: string } => r.city !== null)
      .map((r) => ({ city: r.city, count: r._count._all }));
  },
};
