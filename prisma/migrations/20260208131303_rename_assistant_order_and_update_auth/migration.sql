/*
  Warnings:

  - You are about to drop the `AssistantOrder` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AssistantOrder" DROP CONSTRAINT "AssistantOrder_assistant_id_fkey";

-- DropForeignKey
ALTER TABLE "AssistantOrder" DROP CONSTRAINT "AssistantOrder_instructor_id_fkey";

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "banExpires" TIMESTAMP(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN DEFAULT false,
ADD COLUMN     "role" TEXT;

-- DropTable
DROP TABLE "AssistantOrder";

-- CreateTable
CREATE TABLE "assistant_orders" (
    "id" TEXT NOT NULL,
    "assistant_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "material_id" TEXT,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "deadlined_at" TIMESTAMP(3),

    CONSTRAINT "assistant_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_orders_assistant_id_idx" ON "assistant_orders"("assistant_id");

-- CreateIndex
CREATE INDEX "assistant_orders_instructor_id_idx" ON "assistant_orders"("instructor_id");

-- CreateIndex
CREATE INDEX "assistant_orders_lecture_id_idx" ON "assistant_orders"("lecture_id");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- AddForeignKey
ALTER TABLE "assistant_orders" ADD CONSTRAINT "assistant_orders_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_orders" ADD CONSTRAINT "assistant_orders_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
