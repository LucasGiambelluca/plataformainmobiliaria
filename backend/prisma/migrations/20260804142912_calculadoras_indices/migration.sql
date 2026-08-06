-- CreateTable
CREATE TABLE "index_values" (
    "serie" VARCHAR(10) NOT NULL,
    "fecha" DATE NOT NULL,
    "valor" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "index_values_pkey" PRIMARY KEY ("serie","fecha")
);

-- CreateTable
CREATE TABLE "index_syncs" (
    "serie" VARCHAR(10) NOT NULL,
    "ultimo_dato" DATE NOT NULL,
    "sincronizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "index_syncs_pkey" PRIMARY KEY ("serie")
);
