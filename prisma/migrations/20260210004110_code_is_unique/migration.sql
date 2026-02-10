/*
  Warnings:

  - A unique constraint covering the columns `[code]` on the table `assistant_codes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "assistant_codes_code_key" ON "assistant_codes"("code");
