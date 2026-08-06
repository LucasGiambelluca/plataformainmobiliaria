import { Prisma } from "@prisma/client";
import { prisma } from "@/config/database";
import type {
  AppraisalRecord,
  AppraisalsRepository,
  AppraisalStatus,
  ListQuery,
  Paginated,
  ParticipantAgency,
} from "./appraisals.service";

/**
 * Solicitudes de tasación.
 *
 * **No extiende BaseRepository y no es una excepción a la regla, sino un caso
 * que la regla no contempla**: una solicitud nace sin dueño y se le asigna uno
 * después, así que `tenantId` es nullable y `BaseRepository` exige que no lo
 * sea. El aislamiento sigue vigente donde importa: `findByIdForTenant` y
 * `updateStatus` filtran por `{ id, tenantId }` y devuelven null si la fila es
 * de otra inmobiliaria, exactamente como haría la clase base.
 */

/**
 * Quién puede recibir tasaciones: inmobiliaria activa, con suscripción vigente
 * y con un plan que habilite la capacidad.
 *
 * `trialing` entra junto con `active`: durante la prueba el plan está vigente y
 * negarle la función sería venderle algo que no puede usar.
 */
const participaEnTasaciones: Prisma.TenantWhereInput = {
  isActive: true,
  subscriptions: {
    some: {
      status: { in: ["active", "trialing"] },
      plan: { hasOnlineAppraisals: true, isActive: true },
    },
  },
};

const participantSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  contactEmail: true,
  lastAppraisalAssignedAt: true,
} as const;

type ParticipantRow = Prisma.TenantGetPayload<{ select: typeof participantSelect }>;

function aParticipante(fila: ParticipantRow): ParticipantAgency {
  return {
    id: fila.id,
    name: fila.name,
    slug: fila.slug,
    logoUrl: fila.logoUrl,
    contactEmail: fila.contactEmail,
    lastAssignedAt: fila.lastAppraisalAssignedAt,
  };
}

const appraisalSelect = {
  id: true,
  tenantId: true,
  name: true,
  phone: true,
  email: true,
  city: true,
  neighborhood: true,
  address: true,
  propertyType: true,
  purpose: true,
  areaM2: true,
  rooms: true,
  bathrooms: true,
  condition: true,
  comments: true,
  details: true,
  status: true,
  assignedAutomatically: true,
  assignedAt: true,
  createdAt: true,
} as const;

type AppraisalRow = Prisma.AppraisalGetPayload<{ select: typeof appraisalSelect }>;

/** Los Decimal de Prisma se pasan a string acá, como en el resto del proyecto. */
function aRegistro(fila: AppraisalRow): AppraisalRecord {
  return {
    ...fila,
    areaM2: fila.areaM2 === null ? null : fila.areaM2.toString(),
  } as AppraisalRecord;
}

export class PrismaAppraisalsRepository implements AppraisalsRepository {
  /**
   * Participantes, opcionalmente las que operan en una localidad.
   *
   * "Opera en una localidad" se deriva de tener propiedades **visibles**
   * publicadas ahí — la misma noción que usa el directorio del portal. Tiene
   * una consecuencia que conviene tener presente: una inmobiliaria premium sin
   * ninguna propiedad publicada no aparece en el reparto automático de ninguna
   * localidad, aunque sí en el listado general para que la elijan a mano.
   */
  async listParticipants(city?: string): Promise<ParticipantAgency[]> {
    const where: Prisma.TenantWhereInput = city
      ? {
          ...participaEnTasaciones,
          properties: {
            some: {
              city: { equals: city, mode: "insensitive" },
              status: { in: ["published", "featured"] },
            },
          },
        }
      : participaEnTasaciones;

    const filas = await prisma.tenant.findMany({
      where,
      select: participantSelect,
      orderBy: { name: "asc" },
    });

    return filas.map(aParticipante);
  }

  /** Null si no existe o si no participa: el llamador no distingue, a propósito. */
  async findParticipantById(tenantId: string): Promise<ParticipantAgency | null> {
    const fila = await prisma.tenant.findFirst({
      where: { id: tenantId, ...participaEnTasaciones },
      select: participantSelect,
    });

    return fila ? aParticipante(fila) : null;
  }

  async create(
    data: Omit<AppraisalRecord, "id" | "createdAt">,
  ): Promise<AppraisalRecord> {
    const fila = await prisma.appraisal.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        city: data.city,
        neighborhood: data.neighborhood ?? null,
        address: data.address,
        propertyType: data.propertyType,
        purpose: data.purpose,
        areaM2: data.areaM2 ?? null,
        rooms: data.rooms ?? null,
        bathrooms: data.bathrooms ?? null,
        condition: data.condition ?? null,
        comments: data.comments ?? null,
        details: (data.details ?? Prisma.DbNull) as Prisma.InputJsonValue,
        status: data.status,
        assignedAutomatically: data.assignedAutomatically,
        assignedAt: data.assignedAt ?? null,
      },
      select: appraisalSelect,
    });

    return aRegistro(fila);
  }

  async touchAssignment(tenantId: string, cuando: Date): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { lastAppraisalAssignedAt: cuando },
    });
  }

  /**
   * Vincula las fotos del draft a la solicitud recién creada.
   *
   * Solo las confirmadas: una fila sin confirmar es una firma que se emitió y
   * cuyo archivo nunca se verificó contra el storage.
   */
  async attachMedia(appraisalId: string, draftId: string): Promise<number> {
    const { count } = await prisma.appraisalMedia.updateMany({
      where: { draftId, appraisalId: null, confirmedAt: { not: null } },
      data: { appraisalId },
    });

    return count;
  }

  async listByTenant(
    tenantId: string,
    query: ListQuery,
  ): Promise<Paginated<AppraisalRecord>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.AppraisalWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [filas, total] = await Promise.all([
      prisma.appraisal.findMany({
        where,
        select: appraisalSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.appraisal.count({ where }),
    ]);

    return { items: filas.map(aRegistro), total };
  }

  async findByIdForTenant(
    id: string,
    tenantId: string,
  ): Promise<AppraisalRecord | null> {
    const fila = await prisma.appraisal.findFirst({
      where: { id, tenantId },
      select: appraisalSelect,
    });

    return fila ? aRegistro(fila) : null;
  }

  /**
   * Cambia el estado solo si la solicitud es de esa inmobiliaria.
   *
   * `updateMany` con el filtro compuesto evita el ida y vuelta de leer y
   * después escribir, y de paso cierra la carrera entre las dos consultas.
   */
  async updateStatus(
    id: string,
    tenantId: string,
    status: AppraisalStatus,
  ): Promise<AppraisalRecord | null> {
    const { count } = await prisma.appraisal.updateMany({
      where: { id, tenantId },
      data: { status },
    });

    if (count === 0) return null;

    return this.findByIdForTenant(id, tenantId);
  }

  async listUnassigned(query: ListQuery): Promise<Paginated<AppraisalRecord>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    // `status: "unassigned"` además de `tenantId: null`, y las dos condiciones
    // hacen falta. La relación con Tenant es ON DELETE SET NULL, así que borrar
    // una inmobiliaria le pone tenant_id en null a TODAS sus tasaciones sin
    // tocarles el estado: sin este filtro, su historial entero —contactadas,
    // completadas, descartadas— aparecía en la cola del super admin mezclado
    // con las que de verdad nadie pudo tomar.
    //
    // El filtro de estado que llega por query se respeta dentro de eso, igual
    // que en `listByTenant`. Antes se ignoraba en silencio: el endpoint
    // aceptaba `?status=` y devolvía todo igual, con un 200 y sin ninguna señal
    // de que el filtro no había hecho nada.
    const where: Prisma.AppraisalWhereInput = {
      tenantId: null,
      status: query.status ?? "unassigned",
    };

    const [filas, total] = await Promise.all([
      prisma.appraisal.findMany({
        where,
        select: appraisalSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.appraisal.count({ where }),
    ]);

    return { items: filas.map(aRegistro), total };
  }
}

export const appraisalsRepository = new PrismaAppraisalsRepository();
