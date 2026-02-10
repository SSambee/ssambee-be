-- AlterTable
ALTER TABLE "assistants" ADD COLUMN     "attendance_status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "sign_status" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "AssistantOrder" (
    "id" TEXT NOT NULL,
    "assistant_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "lecture_id" TEXT NOT NULL,
    "material_id" TEXT,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "deadlined_at" TIMESTAMP(3),

    CONSTRAINT "AssistantOrder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssistantOrder" ADD CONSTRAINT "AssistantOrder_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantOrder" ADD CONSTRAINT "AssistantOrder_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
