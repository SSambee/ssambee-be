/*
  Warnings:

  - Added the required column `title` to the `assistant_orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "assistant_orders" ADD COLUMN     "title" TEXT NOT NULL;
