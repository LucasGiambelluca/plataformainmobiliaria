import type { Prisma, SiteCarouselImage, TenantSiteConfig } from "@prisma/client";
import { prisma } from "@/config/database";
import { BadRequestError } from "@/shared/errors";
import type { TenantResolverRepository } from "@/shared/middleware/resolveTenant";
import type {
  CarouselImage,
  PublicSite,
  SitesRepository,
  SiteWithCarousel,
} from "./sites.service";

const carouselOrder = [{ sortOrder: "asc" }, { createdAt: "asc" }] as const;

function toCarousel(row: SiteCarouselImage): CarouselImage {
  return {
    id: row.id,
    imageUrl: row.imageUrl,
    linkUrl: row.linkUrl,
    caption: row.caption,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function toSite(
  row: TenantSiteConfig & {
    carousel: SiteCarouselImage[];
    tenant: { slug: string; name: string };
  },
): SiteWithCarousel {
  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.tenant.slug,
    tenantName: row.tenant.name,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    heroTitle: row.heroTitle,
    heroSubtitle: row.heroSubtitle,
    aboutText: row.aboutText,
    socialFacebook: row.socialFacebook,
    socialInstagram: row.socialInstagram,
    socialWhatsapp: row.socialWhatsapp,
    showFeaturedOnly: row.showFeaturedOnly,
    template: row.template,
    isPublished: row.isPublished,
    carousel: row.carousel.map(toCarousel),
  };
}

export const sitesRepository: SitesRepository = {
  async ensureConfig(tenantId: string): Promise<SiteWithCarousel> {
    // upsert y no create: la config se crea sola la primera vez que la
    // inmobiliaria entra a "Mi Sitio", sin un paso de alta explícito.
    const row = await prisma.tenantSiteConfig.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId },
      include: { carousel: { orderBy: [...carouselOrder] }, tenant: { select: { slug: true, name: true } } },
    });
    return toSite(row);
  },

  async findByTenant(tenantId: string): Promise<SiteWithCarousel | null> {
    const row = await prisma.tenantSiteConfig.findUnique({
      where: { tenantId },
      include: { carousel: { orderBy: [...carouselOrder] }, tenant: { select: { slug: true, name: true } } },
    });
    return row ? toSite(row) : null;
  },

  async updateConfig(tenantId, data): Promise<SiteWithCarousel> {
    const row = await prisma.tenantSiteConfig.update({
      where: { tenantId },
      data,
      include: { carousel: { orderBy: [...carouselOrder] }, tenant: { select: { slug: true, name: true } } },
    });
    return toSite(row);
  },

  async findPublicBySlug(slug: string): Promise<PublicSite | null> {
    const tenant = await prisma.tenant.findFirst({
      // isActive va acá y no después: una inmobiliaria suspendida no tiene web.
      where: { slug, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        description: true,
        contactEmail: true,
        contactPhone: true,
        siteConfig: {
          include: {
            carousel: {
              where: { isActive: true },
              orderBy: [...carouselOrder],
            },
          },
        },
      },
    });

    // Sin config o sin publicar: para el visitante es lo mismo que no existir.
    if (!tenant?.siteConfig?.isPublished) return null;
    const config = tenant.siteConfig;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logoUrl: tenant.logoUrl,
        description: tenant.description,
        contactEmail: tenant.contactEmail,
        contactPhone: tenant.contactPhone,
      },
      site: {
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        heroTitle: config.heroTitle,
        heroSubtitle: config.heroSubtitle,
        aboutText: config.aboutText,
        socialFacebook: config.socialFacebook,
        socialInstagram: config.socialInstagram,
        socialWhatsapp: config.socialWhatsapp,
        showFeaturedOnly: config.showFeaturedOnly,
        template: config.template,
      },
      carousel: config.carousel.map(toCarousel),
    };
  },

  countCarousel(tenantId: string): Promise<number> {
    return prisma.siteCarouselImage.count({ where: { tenantId } });
  },

  async nextCarouselOrder(tenantId: string): Promise<number> {
    const last = await prisma.siteCarouselImage.findFirst({
      where: { tenantId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return last ? last.sortOrder + 1 : 0;
  },

  async createCarouselImage(data): Promise<CarouselImage> {
    const row = await prisma.siteCarouselImage.create({ data });
    return toCarousel(row);
  },

  async findCarouselImage(id: string, tenantId: string): Promise<CarouselImage | null> {
    // Filtra por tenantId además del id: nadie toca el carrousel de otra.
    const row = await prisma.siteCarouselImage.findFirst({ where: { id, tenantId } });
    return row ? toCarousel(row) : null;
  },

  async updateCarouselImage(id, tenantId, data): Promise<CarouselImage> {
    const { count } = await prisma.siteCarouselImage.updateMany({
      where: { id, tenantId },
      data: data as Prisma.SiteCarouselImageUpdateManyMutationInput,
    });
    if (count === 0) throw new BadRequestError("Imagen no encontrada");

    const row = await prisma.siteCarouselImage.findFirstOrThrow({
      where: { id, tenantId },
    });
    return toCarousel(row);
  },

  async deleteCarouselImage(id: string, tenantId: string): Promise<void> {
    await prisma.siteCarouselImage.deleteMany({ where: { id, tenantId } });
  },

  async reorderCarousel(tenantId: string, ids: string[]): Promise<CarouselImage[]> {
    const propias = await prisma.siteCarouselImage.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const conocidas = new Set(propias.map((i) => i.id));

    if (ids.some((id) => !conocidas.has(id))) {
      throw new BadRequestError("La lista incluye imágenes de otro carrousel");
    }
    if (ids.length !== propias.length) {
      throw new BadRequestError("La lista de orden debe incluir todas las imágenes");
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.siteCarouselImage.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    const rows = await prisma.siteCarouselImage.findMany({
      where: { tenantId },
      orderBy: [...carouselOrder],
    });
    return rows.map(toCarousel);
  },
};

/**
 * Búsquedas que usa el middleware de resolución de tenant. Vive acá porque es
 * el mismo dominio: qué inmobiliaria responde en cada host.
 */
export const tenantResolverRepository: TenantResolverRepository = {
  findActiveBySlug(slug: string) {
    return prisma.tenant.findFirst({
      where: { slug, isActive: true },
      select: { id: true, slug: true },
    });
  },

  async findActiveByVerifiedDomain(domain: string) {
    const row = await prisma.tenantDomain.findFirst({
      // Solo dominios verificados: uno pendiente no sirve la web todavía.
      where: { domain, status: "active", tenant: { isActive: true } },
      select: { tenant: { select: { id: true, slug: true } } },
    });
    return row?.tenant ?? null;
  },
};

