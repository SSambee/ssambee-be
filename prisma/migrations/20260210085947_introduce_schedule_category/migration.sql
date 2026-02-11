/*
  Warnings:

  - You are about to drop the column `linked_clinic_id` on the `schedules` table. All the data in the column will be lost.
  - You are about to drop the column `linked_exam_id` on the `schedules` table. All the data in the column will be lost.
  - Added the required column `author_name` to the `schedules` table without a default value. This is not possible if the table is not empty.
  - Added the required column `author_role` to the `schedules` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category_id` to the `schedules` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_linked_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_linked_exam_id_fkey";

-- DropIndex
DROP INDEX "schedules_linked_clinic_id_key";

-- DropIndex
DROP INDEX "schedules_linked_exam_id_key";

-- AlterTable
ALTER TABLE "schedules" DROP COLUMN "linked_clinic_id",
DROP COLUMN "linked_exam_id",
ADD COLUMN     "author_name" TEXT NOT NULL,
ADD COLUMN     "author_role" TEXT NOT NULL,
ADD COLUMN     "category_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "schedule_categories" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "schedule_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_categories_instructor_id_idx" ON "schedule_categories"("instructor_id");

-- AddForeignKey
ALTER TABLE "schedule_categories" ADD CONSTRAINT "schedule_categories_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "schedule_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
