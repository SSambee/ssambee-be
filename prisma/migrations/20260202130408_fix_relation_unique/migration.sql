/*
  Warnings:

  - A unique constraint covering the columns `[lecture_id,enrollment_id]` on the table `lecture_enrollments` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "grades" DROP CONSTRAINT "grades_lecture_id_lecture_enrollment_id_id_fkey";

-- DropForeignKey
ALTER TABLE "student_answers" DROP CONSTRAINT "student_answers_lecture_id_lecture_enrollment_id_id_fkey";

-- DropIndex
DROP INDEX "lecture_enrollments_lecture_id_enrollment_id_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "lecture_enrollments_lecture_id_enrollment_id_key" ON "lecture_enrollments"("lecture_id", "enrollment_id");

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_lecture_id_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_id", "lecture_enrollment_id") REFERENCES "lecture_enrollments"("lecture_id", "enrollment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_lecture_id_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_id", "lecture_enrollment_id") REFERENCES "lecture_enrollments"("lecture_id", "enrollment_id") ON DELETE CASCADE ON UPDATE CASCADE;
