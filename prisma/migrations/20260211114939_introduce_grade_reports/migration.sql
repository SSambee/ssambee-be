-- CreateTable
CREATE TABLE "grade_reports" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "grade_id" TEXT NOT NULL,
    "lecture_enrollment_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "report_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "grade_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_reports_grade_id_key" ON "grade_reports"("grade_id");

-- CreateIndex
CREATE INDEX "grade_reports_exam_id_idx" ON "grade_reports"("exam_id");

-- CreateIndex
CREATE INDEX "grade_reports_grade_id_idx" ON "grade_reports"("grade_id");

-- CreateIndex
CREATE INDEX "grade_reports_lecture_enrollment_id_idx" ON "grade_reports"("lecture_enrollment_id");

-- AddForeignKey
ALTER TABLE "grade_reports" ADD CONSTRAINT "grade_reports_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_reports" ADD CONSTRAINT "grade_reports_grade_id_fkey" FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_reports" ADD CONSTRAINT "grade_reports_lecture_enrollment_id_fkey" FOREIGN KEY ("lecture_enrollment_id") REFERENCES "lecture_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
