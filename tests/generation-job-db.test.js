import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const shouldRunIntegration = process.env.RUN_DB_INTEGRATION === '1';
const baseDatabaseUrl = process.env.DATABASE_URL ?? null;
const repoRoot = new URL('..', import.meta.url).pathname;

const schemaSql = `
CREATE TYPE "draft_status" AS ENUM('draft', 'published');
CREATE TYPE "sync_state" AS ENUM('empty', 'fresh', 'stale');
CREATE TYPE "generation_state" AS ENUM('idle', 'running', 'succeeded', 'failed');
CREATE TYPE "draft_generation_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'abandoned');
CREATE TYPE "draft_generation_job_phase" AS ENUM('outline', 'step_fill', 'validate', 'persist');
CREATE TYPE "generation_job_error_code" AS ENUM('OUTLINE_GENERATION_FAILED', 'STEP_GENERATION_FAILED', 'PATCH_VALIDATION_FAILED', 'DRAFT_VALIDATION_FAILED', 'PERSIST_FAILED', 'JOB_CANCELLED', 'JOB_STALE', 'MODEL_CAPABILITY_MISMATCH', 'SOURCE_IMPORT_RATE_LIMITED', 'PREVIEW_BUILD_FAILED', 'PUBLISH_SLUG_CONFLICT');

CREATE TABLE "users" (
  "id" text PRIMARY KEY
);

CREATE TABLE "drafts" (
  "id" uuid PRIMARY KEY,
  "userId" text REFERENCES "users"("id"),
  "status" "draft_status" DEFAULT 'draft' NOT NULL,
  "source_items" jsonb NOT NULL,
  "teaching_brief" jsonb NOT NULL,
  "tutorial_draft" jsonb,
  "sync_state" "sync_state" DEFAULT 'empty' NOT NULL,
  "input_hash" varchar(64),
  "tutorial_draft_input_hash" varchar(64),
  "generation_state" "generation_state" DEFAULT 'idle' NOT NULL,
  "generation_error_message" text,
  "generation_model" varchar(64),
  "generation_last_at" timestamp with time zone,
  "generation_outline" jsonb,
  "generation_quality" jsonb,
  "active_generation_job_id" uuid,
  "validation_valid" boolean DEFAULT false NOT NULL,
  "validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "validation_checked_at" timestamp with time zone,
  "published_slug" varchar(256),
  "published_tutorial_id" uuid,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "draft_generation_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "draft_id" uuid NOT NULL,
  "user_id" text,
  "status" "draft_generation_job_status" DEFAULT 'queued' NOT NULL,
  "phase" "draft_generation_job_phase",
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "lease_until" timestamp with time zone,
  "current_step_index" integer,
  "total_steps" integer,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "model_id" varchar(64),
  "error_code" "generation_job_error_code",
  "error_message" text,
  "failure_detail" jsonb,
  "outline_snapshot" jsonb,
  "step_titles_snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT "draft_generation_jobs_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "drafts"("id") ON DELETE cascade,
  CONSTRAINT "draft_generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null
);

CREATE UNIQUE INDEX "draft_generation_jobs_draft_id_id_unique"
  ON "draft_generation_jobs" ("draft_id", "id");

ALTER TABLE "drafts"
  ADD CONSTRAINT "drafts_active_generation_job_same_draft_fk"
  FOREIGN KEY ("id", "active_generation_job_id")
  REFERENCES "draft_generation_jobs" ("draft_id", "id");

CREATE UNIQUE INDEX "draft_generation_jobs_single_active_per_draft"
  ON "draft_generation_jobs" ("draft_id")
  WHERE "status" in ('queued', 'running');

CREATE INDEX "draft_generation_jobs_draft_id_created_at_idx"
  ON "draft_generation_jobs" ("draft_id", "created_at");

CREATE INDEX "draft_generation_jobs_active_lease_until_idx"
  ON "draft_generation_jobs" ("lease_until")
  WHERE "status" in ('queued', 'running');
`;

const repositoryVerificationScript = `
  (async () => {
  const drizzleOrm = await import('drizzle-orm');
  const { sql } = drizzleOrm.default ?? drizzleOrm;
  const dbModule = await import('./lib/db/index.ts');
  const { db } = dbModule.default ?? dbModule;
  const generationJobRepositoryModule =
    await import('./lib/repositories/draft-generation-job-repository.ts');
  const generationJobRepository =
    generationJobRepositoryModule.default ?? generationJobRepositoryModule;
  const {
    createDraftGenerationJob,
    getLatestDraftGenerationJobByDraftId,
    updateDraftGenerationJob,
  } = generationJobRepository;
  const draftRepositoryModule =
    await import('./lib/repositories/draft-repository.ts');
  const draftRepository = draftRepositoryModule.default ?? draftRepositoryModule;
  const {
    getDraftById,
    updateDraftActiveGenerationJobId,
  } = draftRepository;

  const draftId = process.env.TEST_DRAFT_ID;
  const userId = process.env.TEST_USER_ID;

  const failedJob = await createDraftGenerationJob({
    draftId,
    userId,
    status: 'failed',
  });

  let terminalPointerRejected = false;
  try {
    await updateDraftActiveGenerationJobId(draftId, failedJob.id);
  } catch (error) {
    terminalPointerRejected = String(error?.message).includes('queued or running');
  }

  const queuedJob = await createDraftGenerationJob({
    draftId,
    userId,
    status: 'queued',
  });
  await updateDraftActiveGenerationJobId(draftId, queuedJob.id);
  const draft = await getDraftById(draftId);
  await updateDraftGenerationJob(queuedJob.id, { status: 'succeeded' });
  const draftAfterTerminalJob = await getDraftById(draftId);

  let firstJob = null;
  let secondJob = null;
  await db.transaction(async (tx) => {
    firstJob = await createDraftGenerationJob({
      draftId,
      userId,
      status: 'failed',
    }, tx);
    await tx.execute(sql\`select pg_sleep(0.01)\`);
    secondJob = await createDraftGenerationJob({
      draftId,
      userId,
      status: 'abandoned',
    }, tx);
  });

  const latest = await getLatestDraftGenerationJobByDraftId(draftId);

  console.log(JSON.stringify({
    terminalPointerRejected,
    activePointerAssigned: draft?.activeGenerationJobId === queuedJob.id,
    activePointerCleared: draftAfterTerminalJob?.activeGenerationJobId === null,
    firstCreatedAt: firstJob.createdAt.toISOString(),
    secondCreatedAt: secondJob.createdAt.toISOString(),
    secondJobId: secondJob.id,
    latestJobId: latest?.id ?? null,
  }));
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
`;

async function withTemporaryDatabase(fn) {
  if (!baseDatabaseUrl) {
    throw new Error('DATABASE_URL is required for generation-job DB integration tests');
  }

  const adminUrl = new URL(baseDatabaseUrl);
  const tempDatabaseName = `vibedocs_t001_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
  const tempDatabaseUrl = new URL(baseDatabaseUrl);
  tempDatabaseUrl.pathname = `/${tempDatabaseName}`;

  const adminPool = new Pool({ connectionString: adminUrl.toString() });

  try {
    await adminPool.query(`CREATE DATABASE "${tempDatabaseName}"`);

    const tempPool = new Pool({ connectionString: tempDatabaseUrl.toString() });
    try {
      await tempPool.query(schemaSql);
      await fn({ tempPool, tempDatabaseUrl: tempDatabaseUrl.toString() });
    } finally {
      await tempPool.end();
    }
  } finally {
    await adminPool.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [tempDatabaseName]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${tempDatabaseName}"`);
    await adminPool.end();
  }
}

test(
  'generation job DB invariants and repository guard hold on a scratch database',
  { skip: !shouldRunIntegration },
  async () => {
    await withTemporaryDatabase(async ({ tempPool, tempDatabaseUrl }) => {
      const userId = 'user-1';
      const draftA = randomUUID();
      const draftB = randomUUID();

      await tempPool.query(`insert into "users" ("id") values ($1)`, [userId]);
      await tempPool.query(
        `
          insert into "drafts" ("id", "userId", "source_items", "teaching_brief")
          values ($1, $2, '[]'::jsonb, '{}'::jsonb), ($3, $2, '[]'::jsonb, '{}'::jsonb)
        `,
        [draftA, userId, draftB]
      );

      const { rows: otherDraftJobs } = await tempPool.query(
        `
          insert into "draft_generation_jobs" ("draft_id", "user_id", "status")
          values ($1, $2, 'queued')
          returning "id"
        `,
        [draftB, userId]
      );

      await assert.rejects(
        tempPool.query(
          `update "drafts" set "active_generation_job_id" = $1 where "id" = $2`,
          [otherDraftJobs[0].id, draftA]
        ),
        (error) => error?.code === '23503'
      );

      await tempPool.query(
        `
          insert into "draft_generation_jobs" ("draft_id", "user_id", "status")
          values ($1, $2, 'failed')
        `,
        [draftA, userId]
      );
      await tempPool.query(
        `
          insert into "draft_generation_jobs" ("draft_id", "user_id", "status")
          values ($1, $2, 'queued')
        `,
        [draftA, userId]
      );

      await assert.rejects(
        tempPool.query(
          `
            insert into "draft_generation_jobs" ("draft_id", "user_id", "status")
            values ($1, $2, 'running')
          `,
          [draftA, userId]
        ),
        (error) => error?.code === '23505'
      );

      await tempPool.query(
        `
          update "draft_generation_jobs"
          set "status" = 'failed'
          where "draft_id" = $1 and "status" = 'queued'
        `,
        [draftA]
      );

      const output = execFileSync(
        'npx',
        ['tsx', '--eval', repositoryVerificationScript],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            DATABASE_URL: tempDatabaseUrl,
            TEST_DRAFT_ID: draftA,
            TEST_USER_ID: userId,
          },
          encoding: 'utf8',
        }
      );
      const result = JSON.parse(output.trim());

      assert.equal(result.terminalPointerRejected, true);
      assert.equal(result.activePointerAssigned, true);
      assert.equal(result.activePointerCleared, true);
      assert.ok(result.firstCreatedAt < result.secondCreatedAt);
      assert.equal(result.latestJobId, result.secondJobId);
    });
  }
);
