ALTER TABLE "payment_items"
ADD COLUMN "recharge_expires_in_days_snapshot" INTEGER;

INSERT INTO "billing_products" (
  "id",
  "code",
  "name",
  "description",
  "product_type",
  "billing_mode",
  "payment_method_type",
  "duration_months",
  "included_credit_amount",
  "recharge_credit_amount",
  "price",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
VALUES (
  'admin-credit-grant-zero',
  'ADMIN_CREDIT_GRANT_ZERO',
  '관리자 지급 전용 충전권',
  '관리자가 강사에게 직접 지급하는 0원 충전권',
  'CREDIT_PACK',
  'ONE_TIME',
  'BANK_TRANSFER',
  NULL,
  0,
  0,
  0,
  false,
  9999,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
