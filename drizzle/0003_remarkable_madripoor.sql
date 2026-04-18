CREATE TYPE "public"."tag_type_type" AS ENUM('technology', 'category', 'level');--> statement-breakpoint
CREATE TABLE "tag_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"suggested_by" varchar(32) DEFAULT 'ai',
	"tutorial_id" uuid,
	"status" varchar(16) DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutorial_tags" ADD COLUMN "tag_type" "tag_type_type";