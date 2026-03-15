/*
  Warnings:

  - You are about to drop the `clinic_targets` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[enrollment_id,exam_id]` on the table `clinics` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `enrollment_id` to the `clinics` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "clinic_targets" DROP CONSTRAINT "clinic_targets_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "clinic_targets" DROP CONSTRAINT "clinic_targets_enrollment_id_fkey";

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "enrollment_id" TEXT NOT NULL,
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "notification_status" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- DropTable
DROP TABLE "clinic_targets";

-- CreateTable
CREATE TABLE "question_statistics" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "total_submissions" INTEGER NOT NULL DEFAULT 0,
    "correct_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "choice_rates" JSONB,

    CONSTRAINT "question_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_statistics_question_id_key" ON "question_statistics"("question_id");

-- CreateIndex
CREATE INDEX "question_statistics_exam_id_idx" ON "question_statistics"("exam_id");

-- CreateIndex
CREATE INDEX "clinics_enrollment_id_idx" ON "clinics"("enrollment_id");

-- CreateIndex
CREATE INDEX "clinics_status_idx" ON "clinics"("status");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_enrollment_id_exam_id_key" ON "clinics"("enrollment_id", "exam_id");

-- CreateIndex
CREATE INDEX "questions_lecture_id_idx" ON "questions"("lecture_id");

-- AddForeignKey
ALTER TABLE "question_statistics" ADD CONSTRAINT "question_statistics_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
