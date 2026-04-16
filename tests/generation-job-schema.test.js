import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getTableColumns } from 'drizzle-orm';
import { drafts, draftGenerationJobs } from '../lib/db/schema.ts';
import { generationJobSchema } from '../lib/schemas/generation-job.ts';
import {
  ACTIVE_DRAFT_GENERATION_JOB_STATUSES,
  isActiveDraftGenerationJobStatus,
  isTerminalDraftGenerationJobStatus,
  TERMINAL_DRAFT_GENERATION_JOB_STATUSES,
} from '../lib/types/generation-job.ts';

test('generation job schema parses a persisted job shape', () => {
  const parsed = generationJobSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    draftId: '22222222-2222-4222-8222-222222222222',
    userId: 'user-1',
    status: 'queued',
    phase: 'outline',
    startedAt: null,
    finishedAt: null,
    heartbeatAt: null,
    leaseUntil: null,
    currentStepIndex: null,
    totalSteps: null,
    retryCount: 0,
    modelId: 'deepseek-chat',
    cancelRequested: false,
    errorCode: null,
    errorMessage: null,
    failureDetail: null,
    outlineSnapshot: {
      meta: {
        title: 'Outline title',
        description: 'Outline description',
      },
      intro: {
        paragraphs: ['Intro'],
      },
      baseCode: 'export const value = 1;',
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          teachingGoal: 'Explain the first step',
          conceptIntroduced: 'State',
          estimatedLocChange: 3,
        },
      ],
    },
    stepTitlesSnapshot: ['Step 1'],
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.equal(parsed.status, 'queued');
  assert.equal(parsed.phase, 'outline');
  assert.equal(parsed.modelId, 'deepseek-chat');
});

test('drizzle schema exposes active generation job columns', () => {
  const draftColumns = getTableColumns(drafts);
  const jobColumns = getTableColumns(draftGenerationJobs);

  assert.ok('activeGenerationJobId' in draftColumns);
  assert.ok('draftId' in jobColumns);
  assert.ok('status' in jobColumns);
  assert.ok('errorCode' in jobColumns);
});

test('active generation job helper only accepts queued and running', () => {
  assert.deepEqual(ACTIVE_DRAFT_GENERATION_JOB_STATUSES, ['queued', 'running']);
  assert.equal(isActiveDraftGenerationJobStatus('queued'), true);
  assert.equal(isActiveDraftGenerationJobStatus('running'), true);
  assert.equal(isActiveDraftGenerationJobStatus('failed'), false);
  assert.equal(isActiveDraftGenerationJobStatus('cancelled'), false);
  assert.deepEqual(TERMINAL_DRAFT_GENERATION_JOB_STATUSES, [
    'succeeded',
    'failed',
    'cancelled',
    'abandoned',
  ]);
  assert.equal(isTerminalDraftGenerationJobStatus('queued'), false);
  assert.equal(isTerminalDraftGenerationJobStatus('succeeded'), true);
});

test('migration encodes same-draft and single-active-job invariants', () => {
  const migration = fs.readFileSync(
    new URL('../drizzle/0003_cynical_daredevil.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /drafts_active_generation_job_same_draft_fk/);
  assert.match(migration, /draft_generation_jobs_single_active_per_draft/);
  assert.match(migration, /CREATE UNIQUE INDEX "draft_generation_jobs_draft_id_id_unique"/);
  assert.match(migration, /clock_timestamp\(\)/);
});

test('snapshot matches generation job indexes and same-draft foreign key', () => {
  const snapshot = JSON.parse(
    fs.readFileSync(
      new URL('../drizzle/meta/0003_snapshot.json', import.meta.url),
      'utf8'
    )
  );

  const jobTable = snapshot.tables['public.draft_generation_jobs'];
  const draftTable = snapshot.tables['public.drafts'];

  assert.ok(jobTable.indexes.draft_generation_jobs_draft_id_id_unique);
  assert.ok(jobTable.indexes.draft_generation_jobs_single_active_per_draft);
  assert.equal(
    jobTable.indexes.draft_generation_jobs_single_active_per_draft.where,
    `"draft_generation_jobs"."status" in ('queued', 'running')`
  );
  assert.deepEqual(
    draftTable.foreignKeys.drafts_active_generation_job_same_draft_fk.columnsFrom,
    ['id', 'active_generation_job_id']
  );
  assert.deepEqual(
    draftTable.foreignKeys.drafts_active_generation_job_same_draft_fk.columnsTo,
    ['draft_id', 'id']
  );
});

test('generation job repository module exports the expected entry points', async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@127.0.0.1:5432/postgres';

  const repository = await import('../lib/repositories/draft-generation-job-repository.ts');

  assert.equal(typeof repository.createDraftGenerationJob, 'function');
  assert.equal(typeof repository.getDraftGenerationJobById, 'function');
  assert.equal(typeof repository.getLatestDraftGenerationJobByDraftId, 'function');
  assert.equal(typeof repository.listDraftGenerationJobsByDraftId, 'function');
  assert.equal(typeof repository.updateDraftGenerationJob, 'function');
});
