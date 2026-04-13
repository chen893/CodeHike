import {
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
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from '@auth/core/adapters';

export const draftStatusEnum = pgEnum('draft_status', ['draft', 'published']);
export const syncStateEnum = pgEnum('sync_state', ['empty', 'fresh', 'stale']);
export const generationStateEnum = pgEnum('generation_state', [
  'idle',
  'running',
  'succeeded',
  'failed',
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
