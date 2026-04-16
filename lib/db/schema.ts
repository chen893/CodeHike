import {
  AnyPgColumn,
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  primaryKey,
  foreignKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AdapterAccountType } from '@auth/core/adapters';

export const draftStatusEnum = pgEnum('draft_status', ['draft', 'published']);
export const syncStateEnum = pgEnum('sync_state', ['empty', 'fresh', 'stale']);
export const generationStateEnum = pgEnum('generation_state', [
  'idle',
  'running',
  'succeeded',
  'failed',
]);
export const draftGenerationJobStatusEnum = pgEnum('draft_generation_job_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'abandoned',
]);
export const draftGenerationJobPhaseEnum = pgEnum('draft_generation_job_phase', [
  'outline',
  'step_fill',
  'validate',
  'persist',
]);
export const generationJobErrorCodeEnum = pgEnum('generation_job_error_code', [
  'OUTLINE_GENERATION_FAILED',
  'STEP_GENERATION_FAILED',
  'PATCH_VALIDATION_FAILED',
  'DRAFT_VALIDATION_FAILED',
  'PERSIST_FAILED',
  'JOB_CANCELLED',
  'JOB_STALE',
  'MODEL_CAPABILITY_MISMATCH',
  'SOURCE_IMPORT_RATE_LIMITED',
  'PREVIEW_BUILD_FAILED',
  'PUBLISH_SLUG_CONFLICT',
]);

// NextAuth tables

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // v3.7: Creator profile fields
  username: varchar('username', { length: 64 }).unique(),
  bio: text('bio'),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    {
      compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    },
  ],
);

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [
    {
      compoundKey: primaryKey({
        columns: [vt.identifier, vt.token],
      }),
    },
  ],
);

export const draftGenerationJobs = pgTable('draft_generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  draftId: uuid('draft_id')
    .notNull()
    .references((): AnyPgColumn => drafts.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: draftGenerationJobStatusEnum('status').default('queued').notNull(),
  phase: draftGenerationJobPhaseEnum('phase'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  currentStepIndex: integer('current_step_index'),
  totalSteps: integer('total_steps'),
  retryCount: integer('retry_count').default(0).notNull(),
  modelId: varchar('model_id', { length: 64 }),
  cancelRequested: boolean('cancel_requested').default(false).notNull(),
  errorCode: generationJobErrorCodeEnum('error_code'),
  errorMessage: text('error_message'),
  failureDetail: jsonb('failure_detail').$type<Record<string, unknown> | null>(),
  outlineSnapshot: jsonb('outline_snapshot').$type<unknown | null>(),
  stepTitlesSnapshot: jsonb('step_titles_snapshot').$type<string[] | null>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .default(sql`clock_timestamp()`)
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .default(sql`clock_timestamp()`)
    .notNull(),
}, (table) => [
  uniqueIndex('draft_generation_jobs_draft_id_id_unique').on(table.draftId, table.id),
  uniqueIndex('draft_generation_jobs_single_active_per_draft').on(table.draftId)
    .where(sql`${table.status} in ('queued', 'running')`),
  index('draft_generation_jobs_draft_id_created_at_idx').on(table.draftId, table.createdAt),
  index('draft_generation_jobs_active_lease_until_idx').on(table.leaseUntil)
    .where(sql`${table.status} in ('queued', 'running')`),
]);

// Application tables

export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('userId').references(() => users.id),
  status: draftStatusEnum('status').default('draft').notNull(),

  // Content inputs
  sourceItems: jsonb('source_items').$type<unknown[]>().notNull(),
  teachingBrief: jsonb('teaching_brief').$type<unknown>().notNull(),

  // AI-generated content
  tutorialDraft: jsonb('tutorial_draft').$type<unknown | null>(),

  // Sync tracking
  syncState: syncStateEnum('sync_state').default('empty').notNull(),
  inputHash: varchar('input_hash', { length: 64 }),
  tutorialDraftInputHash: varchar('tutorial_draft_input_hash', { length: 64 }),

  // Generation state machine
  generationState: generationStateEnum('generation_state')
    .default('idle')
    .notNull(),
  generationErrorMessage: text('generation_error_message'),
  generationModel: varchar('generation_model', { length: 64 }),
  generationLastAt: timestamp('generation_last_at', { withTimezone: true }),

  // v3.1: Multi-phase generation metadata
  generationOutline: jsonb('generation_outline').$type<unknown | null>(),
  generationQuality: jsonb('generation_quality').$type<unknown | null>(),
  activeGenerationJobId: uuid('active_generation_job_id'),

  // Validation
  validationValid: boolean('validation_valid').default(false).notNull(),
  validationErrors: jsonb('validation_errors')
    .$type<string[]>()
    .default([])
    .notNull(),
  validationCheckedAt: timestamp('validation_checked_at', {
    withTimezone: true,
  }),

  // Published info (denormalized)
  publishedSlug: varchar('published_slug', { length: 256 }),
  publishedTutorialId: uuid('published_tutorial_id'),
  publishedAt: timestamp('published_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => [
  foreignKey({
    name: 'drafts_active_generation_job_same_draft_fk',
    columns: [table.id, table.activeGenerationJobId],
    foreignColumns: [
      draftGenerationJobs.draftId as AnyPgColumn,
      draftGenerationJobs.id as AnyPgColumn,
    ],
  }),
]);

export const publishedTutorials = pgTable('published_tutorials', {
  id: uuid('id').primaryKey().defaultRandom(),
  draftRecordId: uuid('draft_record_id')
    .notNull()
    .references(() => drafts.id),
  slug: varchar('slug', { length: 256 }).notNull().unique(),
  tutorialDraftSnapshot: jsonb('tutorial_draft_snapshot')
    .$type<unknown>()
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// v3.6: Analytics events
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  userId: text('userId'),
  sessionId: varchar('session_id', { length: 128 }),
  slug: varchar('slug', { length: 256 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// v3.7: Tutorial tags
export const tutorialTags = pgTable('tutorial_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const tutorialTagRelations = pgTable(
  'tutorial_tag_relations',
  {
    tutorialId: uuid('tutorial_id')
      .notNull()
      .references(() => publishedTutorials.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tutorialTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    {
      pk: primaryKey({ columns: [table.tutorialId, table.tagId] }),
    },
  ],
);

export const draftSnapshots = pgTable('draft_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  draftId: uuid('draft_id')
    .notNull()
    .references(() => drafts.id, { onDelete: 'cascade' }),
  label: varchar('label', { length: 256 }),
  tutorialDraftSnapshot: jsonb('tutorial_draft_snapshot')
    .$type<unknown>()
    .notNull(),
  stepCount: integer('step_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
