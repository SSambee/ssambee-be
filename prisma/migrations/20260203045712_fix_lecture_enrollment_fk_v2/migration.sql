-- DropForeignKey
ALTER TABLE "grades" DROP CONSTRAINT "grades_lecture_id_lecture_enrollment_id_fkey";

-- DropForeignKey
ALTER TABLE "student_answers" DROP CONSTRAINT "student_answers_lecture_id_lecture_enrollment_id_fkey";

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_enrollment_id") REFERENCES "lecture_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_enrollment_id") REFERENCES "lecture_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
