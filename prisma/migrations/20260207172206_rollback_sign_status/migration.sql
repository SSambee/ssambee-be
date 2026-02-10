/*
  Warnings:

  - You are about to drop the column `is_signed` on the `assistants` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assistants" DROP COLUMN "is_signed",
ADD COLUMN     "sign_status" TEXT NOT NULL DEFAULT 'PENDING';
