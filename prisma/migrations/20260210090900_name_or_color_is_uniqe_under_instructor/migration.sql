/*
  Warnings:

  - A unique constraint covering the columns `[instructor_id,name]` on the table `schedule_categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[instructor_id,color]` on the table `schedule_categories` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "schedule_categories_instructor_id_name_key" ON "schedule_categories"("instructor_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_categories_instructor_id_color_key" ON "schedule_categories"("instructor_id", "color");
