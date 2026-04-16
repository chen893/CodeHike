CREATE TYPE "public"."draft_generation_job_phase" AS ENUM('outline', 'step_fill', 'validate', 'persist');--> statement-breakpoint
CREATE TYPE "public"."draft_generation_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."generation_job_error_code" AS ENUM('OUTLINE_GENERATION_FAILED', 'STEP_GENERATION_FAILED', 'PATCH_VALIDATION_FAILED', 'DRAFT_VALIDATION_FAILED', 'PERSIST_FAILED', 'JOB_CANCELLED', 'JOB_STALE', 'MODEL_CAPABILITY_MISMATCH', 'SOURCE_IMPORT_RATE_LIMITED', 'PREVIEW_BUILD_FAILED', 'PUBLISH_SLUG_CONFLICT');--> statement-breakpoint
CREATE TYPE "public"."generation_state" AS ENUM('idle', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_state" AS ENUM('empty', 'fresh', 'stale');--> statement-breakpoint
CREATE TABLE "accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
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
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"error_code" "generation_job_error_code",
	"error_message" text,
	"failure_detail" jsonb,
	"outline_snapshot" jsonb,
	"step_titles_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"label" varchar(256),
	"tutorial_draft_snapshot" jsonb NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text,
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
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"userId" text,
	"session_id" varchar(128),
	"slug" varchar(256),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_tutorials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_record_id" uuid NOT NULL,
	"slug" varchar(256) NOT NULL,
	"tutorial_draft_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "published_tutorials_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutorial_tag_relations" (
	"tutorial_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutorial_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutorial_tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tutorial_tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"username" varchar(64),
	"bio" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "draft_generation_jobs_draft_id_id_unique" ON "draft_generation_jobs" USING btree ("draft_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_generation_jobs_single_active_per_draft" ON "draft_generation_jobs" USING btree ("draft_id") WHERE "draft_generation_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "draft_generation_jobs_draft_id_created_at_idx" ON "draft_generation_jobs" USING btree ("draft_id","created_at");--> statement-breakpoint
CREATE INDEX "draft_generation_jobs_active_lease_until_idx" ON "draft_generation_jobs" USING btree ("lease_until") WHERE "draft_generation_jobs"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_generation_jobs" ADD CONSTRAINT "draft_generation_jobs_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_generation_jobs" ADD CONSTRAINT "draft_generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_snapshots" ADD CONSTRAINT "draft_snapshots_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_active_generation_job_same_draft_fk" FOREIGN KEY ("id","active_generation_job_id") REFERENCES "public"."draft_generation_jobs"("draft_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_tutorials" ADD CONSTRAINT "published_tutorials_draft_record_id_drafts_id_fk" FOREIGN KEY ("draft_record_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_tag_relations" ADD CONSTRAINT "tutorial_tag_relations_tutorial_id_published_tutorials_id_fk" FOREIGN KEY ("tutorial_id") REFERENCES "public"."published_tutorials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_tag_relations" ADD CONSTRAINT "tutorial_tag_relations_tag_id_tutorial_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tutorial_tags"("id") ON DELETE cascade ON UPDATE no action;
