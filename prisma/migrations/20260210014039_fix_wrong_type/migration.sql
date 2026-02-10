/*
  Warnings:

  - You are about to drop the column `deadlined_at` on the `assistant_orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "assistant_orders" DROP COLUMN "deadlined_at",
ADD COLUMN     "deadline_at" TIMESTAMP(3);
