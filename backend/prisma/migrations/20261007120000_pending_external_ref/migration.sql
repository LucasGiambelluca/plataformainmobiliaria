-- Débito automático del checkout abierto y todavía no pagado (ver schema.prisma).
ALTER TABLE "subscriptions" ADD COLUMN "pending_external_ref" TEXT;
