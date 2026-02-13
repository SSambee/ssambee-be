/*
  Warnings:

  - You are about to drop the column `createdAt` on the `assignment_categories` table. All the data in the column will be lost.
  - You are about to drop the column `instructorId` on the `assignment_categories` table. All the data in the column will be lost.
  - You are about to drop the column `resultPresets` on the `assignment_categories` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `assignments` table. All the data in the column will be lost.
  - You are about to drop the column `instructorId` on the `assignments` table. All the data in the column will be lost.
  - You are about to drop the column `lectureId` on the `assignments` table. All the data in the column will be lost.
  - Added the required column `instructor_id` to the `assignment_categories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_id` to the `assignments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `instructor_id` to the `assignments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lecture_id` to the `assignments` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "assignment_categories" DROP CONSTRAINT "assignment_categories_instructorId_fkey";

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_instructorId_fkey";

-- DropForeignKey
ALTER TABLE "assignments" DROP CONSTRAINT "assignments_lectureId_fkey";

-- DropIndex
DROP INDEX "assignment_categories_instructorId_idx";

-- DropIndex
DROP INDEX "assignments_categoryId_idx";

-- DropIndex
DROP INDEX "assignments_lectureId_idx";

-- AlterTable
ALTER TABLE "assignment_categories" DROP COLUMN "createdAt",
DROP COLUMN "instructorId",
DROP COLUMN "resultPresets",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "instructor_id" TEXT NOT NULL,
ADD COLUMN     "result_presets" TEXT[];

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "categoryId",
DROP COLUMN "instructorId",
DROP COLUMN "lectureId",
ADD COLUMN     "category_id" TEXT NOT NULL,
ADD COLUMN     "instructor_id" TEXT NOT NULL,
ADD COLUMN     "lecture_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "assignment_categories_instructor_id_idx" ON "assignment_categories"("instructor_id");

-- CreateIndex
CREATE INDEX "assignments_lecture_id_idx" ON "assignments"("lecture_id");

-- CreateIndex
CREATE INDEX "assignments_category_id_idx" ON "assignments"("category_id");

-- AddForeignKey
ALTER TABLE "assignment_categories" ADD CONSTRAINT "assignment_categories_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "assignment_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
