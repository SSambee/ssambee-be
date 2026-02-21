/*
  Warnings:

  - You are about to drop the column `category_id` on the `assignments` table. All the data in the column will be lost.
  - You are about to drop the `assignment_categories` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "assignment_categories" DROP CONSTRAINT "assignment_categories_instructor_id_fkey";

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_category_id_fkey";

-- DropIndex
DROP INDEX "assignments_category_id_idx";

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "category_id",
ADD COLUMN     "result_presets" TEXT[];

-- DropTable
DROP TABLE "assignment_categories";
