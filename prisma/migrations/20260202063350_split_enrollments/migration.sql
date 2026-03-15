/*
  Warnings:

  - You are about to drop the column `updated_at` on the `app_parents` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `app_students` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `assistants` table. All the data in the column will be lost.
  - You are about to drop the column `enrollment_id` on the `attendances` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `clinics` table. All the data in the column will be lost.
  - You are about to drop the column `enrollment_id` on the `clinics` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `clinics` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `comments` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `enrollments` table. All the data in the column will be lost.
  - You are about to drop the column `lecture_id` on the `enrollments` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `enrollments` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `exams` table. All the data in the column will be lost.
  - You are about to drop the column `grading_status` on the `exams` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `exams` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `grades` table. All the data in the column will be lost.
  - You are about to drop the column `enrollment_id` on the `grades` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `instructor_posts` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `instructors` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `lecture_times` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `lecture_times` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `lectures` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `parent_child_links` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `question_statistics` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `question_statistics` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `schedules` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `schedules` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `student_answers` table. All the data in the column will be lost.
  - You are about to drop the column `enrollment_id` on the `student_answers` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `student_answers` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `student_posts` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `verification_codes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[lecture_enrollment_id,date]` on the table `attendances` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[lecture_enrollment_id,exam_id]` on the table `clinics` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[exam_id,lecture_enrollment_id]` on the table `grades` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[lecture_enrollment_id,question_id]` on the table `student_answers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `lecture_enrollment_id` to the `attendances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lecture_enrollment_id` to the `clinics` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lecture_enrollment_id` to the `grades` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lecture_enrollment_id` to the `student_answers` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "attendances" DROP CONSTRAINT "attendances_enrollment_id_fkey";

-- DropForeignKey
ALTER TABLE "clinics" DROP CONSTRAINT "clinics_enrollment_id_fkey";

-- DropForeignKey
ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_lecture_id_fkey";

-- DropForeignKey
ALTER TABLE "grades" DROP CONSTRAINT "grades_lecture_id_enrollment_id_fkey";

-- DropForeignKey
ALTER TABLE "student_answers" DROP CONSTRAINT "student_answers_lecture_id_enrollment_id_fkey";

-- DropIndex
DROP INDEX "attendances_enrollment_id_date_key";

-- DropIndex
DROP INDEX "attendances_enrollment_id_idx";

-- DropIndex
DROP INDEX "clinics_enrollment_id_exam_id_key";

-- DropIndex
DROP INDEX "clinics_enrollment_id_idx";

-- DropIndex
DROP INDEX "enrollments_lecture_id_id_key";

-- DropIndex
DROP INDEX "enrollments_parent_phone_idx";

-- DropIndex
DROP INDEX "grades_enrollment_id_idx";

-- DropIndex
DROP INDEX "grades_exam_id_enrollment_id_key";

-- DropIndex
DROP INDEX "student_answers_enrollment_id_question_id_key";

-- AlterTable
ALTER TABLE "app_parents" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "app_students" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "assistants" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "attendances" DROP COLUMN "enrollment_id",
ADD COLUMN     "lecture_enrollment_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "clinics" DROP COLUMN "created_at",
DROP COLUMN "enrollment_id",
DROP COLUMN "updated_at",
ADD COLUMN     "lecture_enrollment_id" TEXT NOT NULL,
ADD COLUMN     "notification_status" TEXT NOT NULL DEFAULT 'READY';

-- AlterTable
ALTER TABLE "comments" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "enrollments" DROP COLUMN "created_at",
DROP COLUMN "lecture_id",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "exams" DROP COLUMN "created_at",
DROP COLUMN "grading_status",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "grades" DROP COLUMN "created_at",
DROP COLUMN "enrollment_id",
ADD COLUMN     "lecture_enrollment_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "instructor_posts" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "instructors" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "lecture_times" DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "lectures" DROP COLUMN "updated_at",
ADD COLUMN     "schoolYear" TEXT;

-- AlterTable
ALTER TABLE "materials" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "parent_child_links" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "question_statistics" DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "schedules" DROP COLUMN "created_at",
DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "student_answers" DROP COLUMN "created_at",
DROP COLUMN "enrollment_id",
DROP COLUMN "updated_at",
ADD COLUMN     "lecture_enrollment_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "student_posts" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "verification_codes" DROP COLUMN "updated_at";

-- CreateTable
CREATE TABLE "lecture_enrollments" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "lecture_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lecture_enrollments_enrollmentId_idx" ON "lecture_enrollments"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "lecture_enrollments_lecture_id_enrollmentId_id_key" ON "lecture_enrollments"("lecture_id", "enrollmentId", "id");

-- CreateIndex
CREATE INDEX "attendances_lecture_enrollment_id_idx" ON "attendances"("lecture_enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_lecture_enrollment_id_date_key" ON "attendances"("lecture_enrollment_id", "date");

-- CreateIndex
CREATE INDEX "clinics_lecture_enrollment_id_idx" ON "clinics"("lecture_enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_lecture_enrollment_id_exam_id_key" ON "clinics"("lecture_enrollment_id", "exam_id");

-- CreateIndex
CREATE INDEX "enrollments_instructor_id_idx" ON "enrollments"("instructor_id");

-- CreateIndex
CREATE INDEX "grades_lecture_enrollment_id_idx" ON "grades"("lecture_enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_exam_id_lecture_enrollment_id_key" ON "grades"("exam_id", "lecture_enrollment_id");

-- CreateIndex
CREATE INDEX "student_answers_lecture_enrollment_id_idx" ON "student_answers"("lecture_enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_answers_lecture_enrollment_id_question_id_key" ON "student_answers"("lecture_enrollment_id", "question_id");

-- AddForeignKey
ALTER TABLE "lecture_enrollments" ADD CONSTRAINT "lecture_enrollments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecture_enrollments" ADD CONSTRAINT "lecture_enrollments_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_enrollment_id") REFERENCES "lecture_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_lecture_id_lecture_enrollment_id_id_fkey" FOREIGN KEY ("lecture_id", "lecture_enrollment_id", "id") REFERENCES "lecture_enrollments"("lecture_id", "enrollmentId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_lecture_id_lecture_enrollment_id_id_fkey" FOREIGN KEY ("lecture_id", "lecture_enrollment_id", "id") REFERENCES "lecture_enrollments"("lecture_id", "enrollmentId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_enrollment_id") REFERENCES "lecture_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
