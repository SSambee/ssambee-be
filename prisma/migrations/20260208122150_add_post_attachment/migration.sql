/*
  Warnings:

  - The primary key for the `comment_attachments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `instructor_post_attachments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `filename` to the `comment_attachments` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `comment_attachments` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `filename` to the `instructor_post_attachments` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `instructor_post_attachments` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "comment_attachments" DROP CONSTRAINT "comment_attachments_pkey",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "file_url" TEXT,
ADD COLUMN     "filename" TEXT NOT NULL,
ADD COLUMN     "id" TEXT NOT NULL,
ALTER COLUMN "material_id" DROP NOT NULL,
ADD CONSTRAINT "comment_attachments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "instructor_post_attachments" DROP CONSTRAINT "instructor_post_attachments_pkey",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "file_url" TEXT,
ADD COLUMN     "filename" TEXT NOT NULL,
ADD COLUMN     "id" TEXT NOT NULL,
ALTER COLUMN "material_id" DROP NOT NULL,
ADD CONSTRAINT "instructor_post_attachments_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "student_post_attachments" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_url" TEXT,
    "student_post_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_post_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_post_attachments_student_post_id_idx" ON "student_post_attachments"("student_post_id");

-- CreateIndex
CREATE INDEX "comment_attachments_comment_id_idx" ON "comment_attachments"("comment_id");

-- CreateIndex
CREATE INDEX "instructor_post_attachments_instructor_post_id_idx" ON "instructor_post_attachments"("instructor_post_id");

-- AddForeignKey
ALTER TABLE "student_post_attachments" ADD CONSTRAINT "student_post_attachments_student_post_id_fkey" FOREIGN KEY ("student_post_id") REFERENCES "student_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
