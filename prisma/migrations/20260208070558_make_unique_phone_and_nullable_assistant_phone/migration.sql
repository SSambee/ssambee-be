/*
  Warnings:

  - A unique constraint covering the columns `[phone_number]` on the table `assistants` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phone_number]` on the table `instructors` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "assistants" ALTER COLUMN "phone_number" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "assistants_phone_number_key" ON "assistants"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "instructors_phone_number_key" ON "instructors"("phone_number");
