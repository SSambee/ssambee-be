-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "external_download_url" TEXT,
ADD COLUMN     "subject" TEXT;

-- CreateIndex
CREATE INDEX "materials_deleted_at_idx" ON "materials"("deleted_at");
