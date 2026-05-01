-- CreateTable
CREATE TABLE "payment_item_revocation_histories" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "payment_item_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT,
    "delta_amount" INTEGER NOT NULL DEFAULT 0,
    "actor_user_id" TEXT,
    "actor_role" TEXT,
    "reason" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_item_revocation_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_item_revocation_histories_payment_id_created_at_idx"
  ON "payment_item_revocation_histories"("payment_id", "created_at");

CREATE INDEX "payment_item_revocation_histories_payment_item_id_created_at_idx"
  ON "payment_item_revocation_histories"("payment_item_id", "created_at");

CREATE INDEX "payment_item_revocation_histories_target_type_target_id_created_at_idx"
  ON "payment_item_revocation_histories"("target_type", "target_id", "created_at");

CREATE INDEX "payment_item_revocation_histories_batch_id_created_at_idx"
  ON "payment_item_revocation_histories"("batch_id", "created_at");

-- AddForeignKey
ALTER TABLE "payment_item_revocation_histories"
  ADD CONSTRAINT "payment_item_revocation_histories_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_item_revocation_histories"
  ADD CONSTRAINT "payment_item_revocation_histories_payment_item_id_fkey"
  FOREIGN KEY ("payment_item_id") REFERENCES "payment_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
