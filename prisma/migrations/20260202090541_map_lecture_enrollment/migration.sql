/*
  Warnings:

  - You are about to drop the column `enrollmentId` on the `lecture_enrollments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[instructor_id,student_phone]` on the table `enrollments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[lecture_id,enrollment_id,id]` on the table `lecture_enrollments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `enrollment_id` to the `lecture_enrollments` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "grades" DROP CONSTRAINT "grades_lecture_id_lecture_enrollment_id_id_fkey";

-- DropForeignKey
ALTER TABLE "lecture_enrollments" DROP CONSTRAINT "lecture_enrollments_enrollmentId_fkey";

-- DropForeignKey
ALTER TABLE "student_answers" DROP CONSTRAINT "student_answers_lecture_id_lecture_enrollment_id_id_fkey";

-- DropIndex
DROP INDEX "lecture_enrollments_enrollmentId_idx";

-- DropIndex
DROP INDEX "lecture_enrollments_lecture_id_enrollmentId_id_key";

-- AlterTable
ALTER TABLE "lecture_enrollments" DROP COLUMN "enrollmentId",
ADD COLUMN     "enrollment_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_instructor_id_student_phone_key" ON "enrollments"("instructor_id", "student_phone");

-- CreateIndex
CREATE INDEX "lecture_enrollments_enrollment_id_idx" ON "lecture_enrollments"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "lecture_enrollments_lecture_id_enrollment_id_id_key" ON "lecture_enrollments"("lecture_id", "enrollment_id", "id");

-- AddForeignKey
ALTER TABLE "lecture_enrollments" ADD CONSTRAINT "lecture_enrollments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_lecture_id_lecture_enrollment_id_id_fkey" FOREIGN KEY ("lecture_id", "lecture_enrollment_id", "id") REFERENCES "lecture_enrollments"("lecture_id", "enrollment_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_lecture_id_lecture_enrollment_id_id_fkey" FOREIGN KEY ("lecture_id", "lecture_enrollment_id", "id") REFERENCES "lecture_enrollments"("lecture_id", "enrollment_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
