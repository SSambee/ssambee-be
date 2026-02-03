/*
  Warnings:

  - You are about to drop the `grade_logs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "grade_logs" DROP CONSTRAINT "grade_logs_grade_id_fkey";

-- DropForeignKey
ALTER TABLE "grade_logs" DROP CONSTRAINT "grade_logs_updated_by_assistant_id_fkey";

-- DropForeignKey
ALTER TABLE "grade_logs" DROP CONSTRAINT "grade_logs_updated_by_instructor_id_fkey";

-- DropTable
DROP TABLE "grade_logs";
