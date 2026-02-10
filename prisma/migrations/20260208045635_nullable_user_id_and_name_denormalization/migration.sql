/*
  Warnings:

  - Added the required column `name` to the `assistants` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "assistants" DROP CONSTRAINT "assistants_user_id_fkey";

-- AlterTable
ALTER TABLE "assistants" ADD COLUMN     "name" TEXT NOT NULL,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "assistants" ADD CONSTRAINT "assistants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
