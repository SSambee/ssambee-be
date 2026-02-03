/*
  Warnings:

  - A unique constraint covering the columns `[lecture_id,enrollment_id,date]` on the table `attendances` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `enrollment_id` to the `attendances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lecture_id` to the `attendances` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "enrollment_id" TEXT NOT NULL,
ADD COLUMN     "lecture_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "attendances_enrollment_id_idx" ON "attendances"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_lecture_id_enrollment_id_date_key" ON "attendances"("lecture_id", "enrollment_id", "date");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_lecture_id_fkey" FOREIGN KEY ("lecture_id") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
