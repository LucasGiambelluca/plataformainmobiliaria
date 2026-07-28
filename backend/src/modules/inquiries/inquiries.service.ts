import type { InquiryStatus } from "@prisma/client";
import { NotFoundError } from "@/shared/errors";
import type { Notifier } from "@/modules/notifications";

export interface InquiryRecord {
  id: string;
  tenantId: string;
  propertyId: string | null;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: InquiryStatus;
  createdAt: Date;
  /** Título de la propiedad consultada, o null si fue borrada. */
  propertyTitle: string | null;
}

export interface CreateInquiryInput {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

export interface ListInquiriesInput {
  status?: InquiryStatus;
  propertyId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface InquiriesRepository {
  /**
   * Propiedad visible al público, con su tenant. Es la única fuente del
   * tenantId de una consulta: nunca se toma del cliente.
   */
  findPublicProperty(
    propertyId: string,
  ): Promise<{ id: string; tenantId: string; title: string } | null>;
  /** A quién avisarle que llegó una consulta. */
  findNotificationTarget(
    tenantId: string,
  ): Promise<{ email: string | null; agencyName: string } | null>;
  createInquiry(data: {
    tenantId: string;
    propertyId: string;
    name: string;
    email: string;
    phone?: string;
    message: string;
  }): Promise<InquiryRecord>;
  list(
    tenantId: string,
    input: ListInquiriesInput & { page: number; pageSize: number },
  ): Promise<{ items: InquiryRecord[]; total: number }>;
  /** Cuántas sin abrir: alimenta el badge del panel. */
  countNew(tenantId: string): Promise<number>;
  findById(id: string, tenantId: string): Promise<InquiryRecord | null>;
  updateStatus(
    id: string,
    tenantId: string,
    status: InquiryStatus,
  ): Promise<InquiryRecord>;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export class InquiriesService {
  constructor(
    private readonly repo: InquiriesRepository,
    private readonly notifier: Notifier,
    private readonly leadsUrl: string,
  ) {}

  /**
   * Alta desde la ficha pública. La propiedad tiene que ser visible: no se
   * pueden generar consultas sobre un borrador ni sobre las de una
   * inmobiliaria suspendida, ni siquiera conociendo el id.
   */
  async createFromProperty(
    propertyId: string,
    input: CreateInquiryInput,
  ): Promise<{ id: string; createdAt: Date }> {
    const property = await this.repo.findPublicProperty(propertyId);
    if (!property) throw new NotFoundError("Propiedad no encontrada");

    const inquiry = await this.repo.createInquiry({
      tenantId: property.tenantId,
      propertyId: property.id,
      name: input.name,
      email: input.email,
      ...(input.phone ? { phone: input.phone } : {}),
      message: input.message,
    });

    // El aviso va después de guardar y sin await sobre la respuesta: si el
    // correo falla, la consulta ya está en la bandeja igual.
    const destino = await this.repo.findNotificationTarget(property.tenantId);
    await this.notifier.leadRecibido(destino?.email ?? null, {
      agencyName: destino?.agencyName ?? "",
      propertyTitle: property.title,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      message: input.message,
      panelUrl: this.leadsUrl,
    });

    // La respuesta al visitante es deliberadamente mínima: confirma que se
    // envió y nada más. Devolver la consulta completa no le aporta y expone
    // datos internos de la inmobiliaria.
    return { id: inquiry.id, createdAt: inquiry.createdAt };
  }

  async list(tenantId: string, input: ListInquiriesInput) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE),
    );

    const [{ items, total }, nuevas] = await Promise.all([
      this.repo.list(tenantId, { ...input, page, pageSize }),
      this.repo.countNew(tenantId),
    ]);

    return { items, total, page, pageSize, newCount: nuevas };
  }

  async changeStatus(
    id: string,
    tenantId: string,
    status: InquiryStatus,
  ): Promise<InquiryRecord> {
    const inquiry = await this.repo.findById(id, tenantId);
    if (!inquiry) throw new NotFoundError("Consulta no encontrada");
    if (inquiry.status === status) return inquiry;

    return this.repo.updateStatus(id, tenantId, status);
  }
}
