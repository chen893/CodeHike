CREATE TYPE "public"."tag_type_type" AS ENUM('technology', 'category', 'level');--> statement-breakpoint
ALTER TABLE "tutorial_tags" ADD COLUMN "tag_type" "tag_type_type";