ALTER TABLE "billing_products"
ADD COLUMN "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
