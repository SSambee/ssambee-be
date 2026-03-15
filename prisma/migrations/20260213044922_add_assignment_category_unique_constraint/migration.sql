/*
  Warnings:

  - A unique constraint covering the columns `[instructor_id,name]` on the table `assignment_categories` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "assignment_categories_instructor_id_name_key" ON "assignment_categories"("instructor_id", "name");
