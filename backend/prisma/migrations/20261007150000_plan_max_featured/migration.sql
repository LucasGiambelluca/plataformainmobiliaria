-- Cupo de propiedades destacadas por plan (H6 de AUDITORIA.md).
ALTER TABLE "plans" ADD COLUMN "max_featured" INTEGER NOT NULL DEFAULT 0;

-- Valores iniciales de los planes sembrados, para no depender de volver a
-- correr el seed en producción. Un plan que no existe no se toca.
UPDATE "plans" SET "max_featured" = 5 WHERE "slug" = 'pro';
UPDATE "plans" SET "max_featured" = 20 WHERE "slug" = 'enterprise';
