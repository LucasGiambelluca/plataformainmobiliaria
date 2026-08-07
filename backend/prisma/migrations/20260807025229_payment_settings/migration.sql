-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('sandbox', 'production');

-- CreateTable
CREATE TABLE "payment_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "active_mode" "PaymentMode" NOT NULL DEFAULT 'sandbox',
    "sandbox_access_token" TEXT,
    "sandbox_webhook_secret" TEXT,
    "production_access_token" TEXT,
    "production_webhook_secret" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);
