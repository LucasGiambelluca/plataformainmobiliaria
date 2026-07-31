import { logger } from "@/config/logger";

/**
 * Acciones que se auditan. Lista cerrada a propósito: si cualquiera puede
 * inventar un nombre de acción, la tabla se vuelve ilegible en tres meses.
 */
export const AUDIT_ACTIONS = [
  "tenant.create",
  "tenant.update",
  "tenant.suspend",
  "tenant.activate",
  "plan.create",
  "plan.update",
  "user.create",
  "user.deactivate",
  "property.delete",
  "subscription.cancel",
  "payment.received",
  "payment.failed",
  "site.publish",
  "site.unpublish",
  "domain.create",
  "domain.verify",
  "domain.delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  /** null para acciones globales del super admin. */
  tenantId: string | null;
  userId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface ListAuditInput {
  action?: string;
  tenantId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface AuditRepository {
  record(entry: AuditEntry): Promise<void>;
  list(
    input: ListAuditInput & { page: number; pageSize: number },
  ): Promise<{ items: AuditRecord[]; total: number }>;
}

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** Lo mínimo que necesita quien solo quiere registrar, no consultar. */
export interface Auditor {
  record(entry: AuditEntry): Promise<void>;
}

export class AuditService implements Auditor {
  constructor(private readonly repo: AuditRepository) {}

  /**
   * Registra sin propagar errores. Misma regla que las notificaciones: que
   * falle el log de auditoría no puede tumbar la suspensión de una
   * inmobiliaria ni el borrado de una propiedad. Se pierde el registro, queda
   * en el log de la aplicación, y la operación sigue.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.record(entry);
    } catch (err) {
      logger.error({ err, action: entry.action }, "No se pudo registrar la auditoría");
    }
  }

  async list(input: ListAuditInput) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const { items, total } = await this.repo.list({ ...input, page, pageSize });
    return { items, total, page, pageSize };
  }
}

/** Doble inerte para tests y para consumidores que no auditan. */
export const noopAuditor: Auditor = { record: () => Promise.resolve() };

