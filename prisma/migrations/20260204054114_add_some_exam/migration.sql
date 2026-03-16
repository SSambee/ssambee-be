-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "category" TEXT,
ADD COLUMN     "exam_date" DATE,
ADD COLUMN     "is_auto_clinic" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "category" TEXT;
