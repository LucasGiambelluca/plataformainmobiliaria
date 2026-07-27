import type { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import { BaseRepository } from "@/shared/repository/BaseRepository";
import type {
  CreatePropertyInput,
  ListPropertiesInput,
  PropertiesRepository,
  PropertyListItem,
  PropertyRecord,
  UpdatePropertyInput,
} from "./properties.service";

const detailInclude = {
  features: { select: { feature: true }, orderBy: { feature: "asc" } },
  media: {
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.PropertyInclude;

const listInclude = {
  // Solo la portada (o la primera imagen si nadie marcó portada) y el total.
  media: {
    orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    take: 1,
    select: { url: true, thumbnailUrl: true },
  },
  _count: { select: { media: true } },
} satisfies Prisma.PropertyInclude;

type PropertyWithDetail = Prisma.PropertyGetPayload<{ include: typeof detailInclude }>;
type PropertyWithList = Prisma.PropertyGetPayload<{ include: typeof listInclude }>;

// Los Decimal de Prisma se pasan a string y los BigInt a number: JSON.stringify
// no sabe serializar ninguno de los dos (con BigInt directamente tira).
const decimal = (value: Prisma.Decimal | null): string | null =>
  value === null ? null : value.toString();

function toRecord(row: PropertyWithDetail): PropertyRecord {
  return {
    ...commonFields(row),
    features: row.features.map((f) => f.feature),
    media: row.media.map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      sizeBytes: Number(m.sizeBytes),
      sortOrder: m.sortOrder,
      isCover: m.isCover,
      status: m.status,
    })),
  };
}

function toListItem(row: PropertyWithList): PropertyListItem {
  const cover = row.media[0];
  return {
    ...commonFields(row),
    coverUrl: cover?.thumbnailUrl ?? cover?.url ?? null,
    mediaCount: row._count.media,
  };
}

function commonFields(row: PropertyWithDetail | PropertyWithList) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    propertyType: row.propertyType,
    operationType: row.operationType,
    price: row.price.toString(),
    currency: row.currency,
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country,
    lat: decimal(row.lat),
    lng: decimal(row.lng),
    areaM2: decimal(row.areaM2),
    rooms: row.rooms,
    bathrooms: row.bathrooms,
    parking: row.parking,
    floor: row.floor,
    yearBuilt: row.yearBuilt,
    status: row.status,
    viewsCount: row.viewsCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    description: row.description,
  };
}

const ORDER_BY: Record<
  NonNullable<ListPropertiesInput["sort"]>,
  Prisma.PropertyOrderByWithRelationInput
> = {
  recent: { createdAt: "desc" },
  price_asc: { price: "asc" },
  price_desc: { price: "desc" },
  views: { viewsCount: "desc" },
};

// Extiende BaseRepository: todas las operaciones quedan aisladas por tenant.
class PropertiesPrismaRepository
  extends BaseRepository<PropertyRecord>
  implements PropertiesRepository
{
  constructor() {
    super(prisma.property);
  }

  async list(
    tenantId: string,
    input: ListPropertiesInput & { page: number; pageSize: number },
  ): Promise<{ items: PropertyListItem[]; total: number }> {
    const where: Prisma.PropertyWhereInput = {
      tenantId,
      ...(input.status && { status: input.status }),
      ...(input.propertyType && { propertyType: input.propertyType }),
      ...(input.operationType && { operationType: input.operationType }),
      ...(input.city && { city: { contains: input.city, mode: "insensitive" } }),
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
        orderBy: ORDER_BY[input.sort ?? "recent"],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: listInclude,
      }),
      prisma.property.count({ where }),
    ]);

    return { items: rows.map(toListItem), total };
  }

  async findDetail(id: string, tenantId: string): Promise<PropertyRecord | null> {
    const row = await prisma.property.findFirst({
      where: { id, tenantId },
      include: detailInclude,
    });
    return row ? toRecord(row) : null;
  }

  async createProperty(
    tenantId: string,
    data: Omit<CreatePropertyInput, "features">,
    features: string[],
    createdBy: string | null,
  ): Promise<PropertyRecord> {
    const row = await prisma.property.create({
      data: {
        ...data,
        tenantId,
        createdBy,
        ...(features.length > 0 && {
          features: { create: features.map((feature) => ({ feature })) },
        }),
      },
      include: detailInclude,
    });
    return toRecord(row);
  }

  async updateProperty(
    id: string,
    tenantId: string,
    data: Omit<UpdatePropertyInput, "features">,
    features: string[] | undefined,
  ): Promise<PropertyRecord> {
    // Verifica pertenencia antes de escribir (garantía de BaseRepository).
    await this.findByIdOrThrow(id, tenantId);

    const row = await prisma.$transaction(async (tx) => {
      if (features !== undefined) {
        // Reemplazo completo: el cliente manda la lista final, no un delta.
        await tx.propertyFeature.deleteMany({ where: { propertyId: id } });
        if (features.length > 0) {
          await tx.propertyFeature.createMany({
            data: features.map((feature) => ({ propertyId: id, feature })),
          });
        }
      }
      return tx.property.update({
        where: { id },
        data,
        include: detailInclude,
      });
    });

    return toRecord(row);
  }

  async deleteProperty(id: string, tenantId: string): Promise<{ mediaUrls: string[] }> {
    await this.findByIdOrThrow(id, tenantId);

    return prisma.$transaction(async (tx) => {
      const media = await tx.propertyMedia.findMany({
        where: { propertyId: id, tenantId },
        select: { url: true },
      });
      // property_media y property_features caen por cascada.
      await tx.property.delete({ where: { id } });
      return { mediaUrls: media.map((m) => m.url) };
    });
  }
}

export const propertiesRepository: PropertiesRepository = new PropertiesPrismaRepository();
