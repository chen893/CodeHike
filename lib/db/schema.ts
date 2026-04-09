import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const draftStatusEnum = pgEnum('draft_status', ['draft', 'published']);
export const syncStateEnum = pgEnum('sync_state', ['empty', 'fresh', 'stale']);
export const generationStateEnum = pgEnum('generation_state', [
  'idle',
  'running',
  'succeeded',
  'failed',
]);

export const drafts = pgTable('drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
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
});

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
