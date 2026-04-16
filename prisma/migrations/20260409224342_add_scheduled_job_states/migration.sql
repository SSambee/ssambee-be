-- CreateTable
CREATE TABLE "scheduled_job_states" (
    "job_name" TEXT NOT NULL,
    "schedule_fingerprint" TEXT NOT NULL,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "locked_by" TEXT,
    "locked_until" TIMESTAMP(3),
    "last_started_at" TIMESTAMP(3),
    "last_finished_at" TIMESTAMP(3),
    "last_succeeded_at" TIMESTAMP(3),
    "last_failed_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "scheduled_job_states_pkey" PRIMARY KEY ("job_name")
);

-- CreateIndex
CREATE INDEX "scheduled_job_states_next_run_at_idx" ON "scheduled_job_states"("next_run_at");
CREATE INDEX "scheduled_job_states_locked_until_idx" ON "scheduled_job_states"("locked_until");
