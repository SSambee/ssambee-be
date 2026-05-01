-- CreateTable
CREATE TABLE "billing_products" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "product_type" TEXT NOT NULL,
    "billing_mode" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "payment_method_type" TEXT NOT NULL,
    "duration_months" INTEGER,
    "included_credit_amount" INTEGER NOT NULL DEFAULT 0,
    "recharge_credit_amount" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "billing_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "method_type" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "provider_reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_DEPOSIT',
    "depositor_name" TEXT,
    "total_amount" INTEGER NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_account_number" TEXT NOT NULL,
    "bank_account_holder" TEXT NOT NULL,
    "deposited_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_items" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "billing_product_id" TEXT NOT NULL,
    "product_code_snapshot" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "product_type_snapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "duration_months_snapshot" INTEGER,
    "included_credit_amount_snapshot" INTEGER NOT NULL DEFAULT 0,
    "recharge_credit_amount_snapshot" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_status_histories" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipt_requests" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "cash_receipt_phone_number" TEXT,
    "business_registration_number" TEXT,
    "business_name" TEXT,
    "representative_name" TEXT,
    "tax_invoice_email" TEXT,
    "business_type" TEXT,
    "business_category" TEXT,
    "business_address" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "review_memo" TEXT,

    CONSTRAINT "payment_receipt_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "payment_item_id" TEXT NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "included_credit_amount" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallets" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "total_available" INTEGER NOT NULL DEFAULT 0,
    "included_available" INTEGER NOT NULL DEFAULT 0,
    "recharge_available" INTEGER NOT NULL DEFAULT 0,
    "last_reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_buckets" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "payment_item_id" TEXT,
    "entitlement_id" TEXT,
    "source_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "original_amount" INTEGER NOT NULL,
    "remaining_amount" INTEGER NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledgers" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "credit_bucket_id" TEXT,
    "type" TEXT NOT NULL,
    "delta_amount" INTEGER NOT NULL,
    "balance_after_total" INTEGER NOT NULL,
    "balance_after_included" INTEGER NOT NULL,
    "balance_after_recharge" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_products_code_key" ON "billing_products"("code");
CREATE INDEX "billing_products_product_type_is_active_idx" ON "billing_products"("product_type", "is_active");

-- CreateIndex
CREATE INDEX "payments_instructor_id_created_at_idx" ON "payments"("instructor_id", "created_at");
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_items_payment_id_idx" ON "payment_items"("payment_id");
CREATE INDEX "payment_items_billing_product_id_idx" ON "payment_items"("billing_product_id");

-- CreateIndex
CREATE INDEX "payment_status_histories_payment_id_created_at_idx" ON "payment_status_histories"("payment_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipt_requests_payment_id_key" ON "payment_receipt_requests"("payment_id");
CREATE INDEX "payment_receipt_requests_type_status_idx" ON "payment_receipt_requests"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_payment_item_id_sequence_no_key" ON "entitlements"("payment_item_id", "sequence_no");
CREATE INDEX "entitlements_instructor_id_status_ends_at_idx" ON "entitlements"("instructor_id", "status", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_wallets_instructor_id_key" ON "credit_wallets"("instructor_id");

-- CreateIndex
CREATE INDEX "credit_buckets_instructor_id_status_expires_at_idx" ON "credit_buckets"("instructor_id", "status", "expires_at");
CREATE UNIQUE INDEX "credit_buckets_payment_item_id_source_type_key" ON "credit_buckets"("payment_item_id", "source_type");
CREATE UNIQUE INDEX "credit_buckets_entitlement_id_source_type_key" ON "credit_buckets"("entitlement_id", "source_type");

-- CreateIndex
CREATE INDEX "credit_ledgers_instructor_id_created_at_idx" ON "credit_ledgers"("instructor_id", "created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_billing_product_id_fkey" FOREIGN KEY ("billing_product_id") REFERENCES "billing_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_status_histories" ADD CONSTRAINT "payment_status_histories_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_receipt_requests" ADD CONSTRAINT "payment_receipt_requests_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_payment_item_id_fkey" FOREIGN KEY ("payment_item_id") REFERENCES "payment_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_buckets" ADD CONSTRAINT "credit_buckets_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_buckets" ADD CONSTRAINT "credit_buckets_payment_item_id_fkey" FOREIGN KEY ("payment_item_id") REFERENCES "payment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_buckets" ADD CONSTRAINT "credit_buckets_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "instructors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_ledgers" ADD CONSTRAINT "credit_ledgers_credit_bucket_id_fkey" FOREIGN KEY ("credit_bucket_id") REFERENCES "credit_buckets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
