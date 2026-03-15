-- AlterTable
ALTER TABLE "grade_reports" ADD COLUMN     "sent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "assignment_categories" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resultPresets" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_results" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "lecture_enrollment_id" TEXT NOT NULL,
    "result_index" INTEGER NOT NULL,

    CONSTRAINT "assignment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_on_exam_reports" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "result_index" INTEGER NOT NULL,

    CONSTRAINT "assignment_on_exam_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assignment_categories_instructorId_idx" ON "assignment_categories"("instructorId");

-- CreateIndex
CREATE INDEX "assignments_lectureId_idx" ON "assignments"("lectureId");

-- CreateIndex
CREATE INDEX "assignments_categoryId_idx" ON "assignments"("categoryId");

-- CreateIndex
CREATE INDEX "assignment_results_assignment_id_idx" ON "assignment_results"("assignment_id");

-- CreateIndex
CREATE INDEX "assignment_results_lecture_enrollment_id_idx" ON "assignment_results"("lecture_enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_results_assignment_id_lecture_enrollment_id_key" ON "assignment_results"("assignment_id", "lecture_enrollment_id");

-- CreateIndex
CREATE INDEX "assignment_on_exam_reports_assignment_id_idx" ON "assignment_on_exam_reports"("assignment_id");

-- CreateIndex
CREATE INDEX "assignment_on_exam_reports_exam_id_idx" ON "assignment_on_exam_reports"("exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_on_exam_reports_assignment_id_exam_id_key" ON "assignment_on_exam_reports"("assignment_id", "exam_id");

-- AddForeignKey
ALTER TABLE "assignment_categories" ADD CONSTRAINT "assignment_categories_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "assignment_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_results" ADD CONSTRAINT "assignment_results_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_results" ADD CONSTRAINT "assignment_results_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_enrollment_id") REFERENCES "lecture_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_on_exam_reports" ADD CONSTRAINT "assignment_on_exam_reports_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_on_exam_reports" ADD CONSTRAINT "assignment_on_exam_reports_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
