ALTER TABLE "draft_generation_jobs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL;

CREATE UNIQUE INDEX "draft_generation_jobs_draft_id_id_unique"
  ON "draft_generation_jobs" ("draft_id", "id");

CREATE UNIQUE INDEX "draft_generation_jobs_single_active_per_draft"
  ON "draft_generation_jobs" ("draft_id")
  WHERE "draft_generation_jobs"."status" in ('queued', 'running');

CREATE INDEX IF NOT EXISTS "draft_generation_jobs_active_lease_until_idx"
  ON "draft_generation_jobs" ("lease_until")
  WHERE "draft_generation_jobs"."status" in ('queued', 'running');

ALTER TABLE "drafts"
  ADD CONSTRAINT "drafts_active_generation_job_same_draft_fk"
  FOREIGN KEY ("id", "active_generation_job_id")
  REFERENCES "draft_generation_jobs" ("draft_id", "id")
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
