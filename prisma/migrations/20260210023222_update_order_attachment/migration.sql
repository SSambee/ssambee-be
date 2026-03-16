/*
  Warnings:

  - You are about to drop the column `material_id` on the `assistant_orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assistant_orders" DROP COLUMN "material_id",
ALTER COLUMN "lecture_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "order_attachments" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_url" TEXT,
    "order_id" TEXT NOT NULL,
    "material_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_attachments_order_id_idx" ON "order_attachments"("order_id");

-- AddForeignKey
ALTER TABLE "assistant_orders" ADD CONSTRAINT "assistant_orders_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "lectures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "assistant_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_attachments" ADD CONSTRAINT "order_attachments_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
