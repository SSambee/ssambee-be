CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "is_primary_admin" BOOLEAN NOT NULL DEFAULT false,
    "invited_by_user_id" TEXT,
    "invited_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admins_user_id_key" ON "admins"("user_id");
CREATE INDEX "admins_status_idx" ON "admins"("status");
CREATE INDEX "admins_invited_by_user_id_idx" ON "admins"("invited_by_user_id");

ALTER TABLE "admins"
ADD CONSTRAINT "admins_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "admins" (
    "id",
    "user_id",
    "status",
    "is_primary_admin",
    "invited_by_user_id",
    "invited_at",
    "activated_at",
    "created_at",
    "updated_at"
)
SELECT
    'admin-profile-' || ranked."id" AS "id",
    ranked."id" AS "user_id",
    'ACTIVE' AS "status",
    ranked."row_num" = 1 AS "is_primary_admin",
    NULL AS "invited_by_user_id",
    ranked."created_at" AS "invited_at",
    ranked."created_at" AS "activated_at",
    ranked."created_at" AS "created_at",
    ranked."updated_at" AS "updated_at"
FROM (
    SELECT
        u."id",
        u."created_at",
        u."updated_at",
        ROW_NUMBER() OVER (ORDER BY u."created_at" ASC, u."id" ASC) AS "row_num"
    FROM "user" u
    WHERE u."user_type" = 'ADMIN'
) ranked
ON CONFLICT ("user_id") DO NOTHING;

CREATE UNIQUE INDEX "admins_single_primary_admin_idx"
ON "admins" ("is_primary_admin")
WHERE "is_primary_admin" = true;
