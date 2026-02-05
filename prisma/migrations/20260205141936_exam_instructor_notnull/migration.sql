/*
  Warnings:

  - Made the column `instructor_id` on table `exams` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "exams" DROP CONSTRAINT "exams_instructor_id_fkey";

-- AlterTable
ALTER TABLE "exams" ALTER COLUMN "instructor_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
