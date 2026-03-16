/*
  Warnings:

  - You are about to drop the column `uploader_assistant_id` on the `materials` table. All the data in the column will be lost.
  - You are about to drop the column `uploader_instructor_id` on the `materials` table. All the data in the column will be lost.
  - Added the required column `author_name` to the `materials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `author_role` to the `materials` table without a default value. This is not possible if the table is not empty.
  - Added the required column `instructor_id` to the `materials` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "materials" DROP CONSTRAINT "materials_uploader_assistant_id_fkey";

-- DropForeignKey
ALTER TABLE "materials" DROP CONSTRAINT "materials_uploader_instructor_id_fkey";

-- AlterTable
ALTER TABLE "instructor_posts" ADD COLUMN     "author_role" TEXT NOT NULL DEFAULT 'INSTRUCTOR';

-- AlterTable
ALTER TABLE "materials" DROP COLUMN "uploader_assistant_id",
DROP COLUMN "uploader_instructor_id",
ADD COLUMN     "author_name" TEXT NOT NULL,
ADD COLUMN     "author_role" TEXT NOT NULL,
ADD COLUMN     "instructor_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "materials_instructor_id_idx" ON "materials"("instructor_id");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
