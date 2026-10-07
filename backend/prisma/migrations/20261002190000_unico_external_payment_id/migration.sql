-- Un pago se puede registrar dos veces (tarea B1 de AUDITORIA.md).
--
-- `payments.external_payment_id` no tenía restricción de unicidad, y
-- `BillingRepository.upsertPayment` resolvía la idempotencia con un
-- `findFirst` seguido de un `create`, sin transacción. Mercado Pago reintenta
-- el webhook sin esperar a que termine el anterior: dos entregas concurrentes
-- pasaban las dos el `findFirst` y las dos insertaban. Dos filas para un solo
-- cobro, con los ingresos y el MRR del panel inflados.
--
-- La migración deduplica antes de indexar, porque agregar el índice sobre una
-- tabla que ya tiene repetidos falla y deja la migración a medias.

-- 1. Deduplicar conservando la fila más antigua de cada external_payment_id.
--    La más antigua es la que se escribió primero, que es la que refleja el
--    estado en que la pasarela confirmó el cobro; las posteriores son las
--    reentregas que se colaron.
DELETE FROM "payments" p
USING "payments" d
WHERE p."external_payment_id" = d."external_payment_id"
  AND p."external_payment_id" IS NOT NULL
  AND p."created_at" > d."created_at";

-- 2. La restricción que cierra la carrera. NULLS NOT DISTINCT no hace falta:
--    en un índice único de PostgreSQL los NULL no se consideran duplicados
--    entre sí, y los pagos sin id externo pueden convivir.
CREATE UNIQUE INDEX "payments_external_payment_id_key" ON "payments"("external_payment_id");
