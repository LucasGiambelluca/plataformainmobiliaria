-- CreateEnum
CREATE TYPE "AppraisalStatus" AS ENUM ('unassigned', 'new', 'contacted', 'completed', 'discarded');

-- CreateEnum
CREATE TYPE "AppraisalPropertyType" AS ENUM ('house', 'apartment', 'ph', 'duplex', 'commercial', 'office', 'warehouse', 'land', 'farm', 'country_house', 'ranch', 'other');

-- CreateEnum
CREATE TYPE "AppraisalPurpose" AS ENUM ('sale', 'rent', 'sale_and_rent', 'other');

-- CreateEnum
CREATE TYPE "AppraisalCondition" AS ENUM ('excellent', 'very_good', 'good', 'fair', 'to_renovate');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "has_online_appraisals" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "last_appraisal_assigned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "appraisals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "neighborhood" VARCHAR(120),
    "address" VARCHAR(255) NOT NULL,
    "property_type" "AppraisalPropertyType" NOT NULL,
    "purpose" "AppraisalPurpose" NOT NULL,
    "area_m2" DECIMAL(10,2),
    "rooms" INTEGER,
    "bathrooms" INTEGER,
    "condition" "AppraisalCondition",
    "comments" TEXT,
    "details" JSONB,
    "status" "AppraisalStatus" NOT NULL DEFAULT 'new',
    "assigned_automatically" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal_media" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "appraisal_id" UUID,
    "url" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appraisal_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appraisals_tenant_id_status_idx" ON "appraisals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "appraisals_status_idx" ON "appraisals"("status");

-- CreateIndex
CREATE INDEX "appraisal_media_draft_id_idx" ON "appraisal_media"("draft_id");

-- CreateIndex
CREATE INDEX "appraisal_media_appraisal_id_idx" ON "appraisal_media"("appraisal_id");

-- AddForeignKey
ALTER TABLE "appraisals" ADD CONSTRAINT "appraisals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal_media" ADD CONSTRAINT "appraisal_media_appraisal_id_fkey" FOREIGN KEY ("appraisal_id") REFERENCES "appraisals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
