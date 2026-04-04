ALTER TABLE "payments"
ADD COLUMN "refund_status" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "refund_memo" TEXT,
ADD COLUMN "refund_completed_at" TIMESTAMP(3);
