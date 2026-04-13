CREATE TABLE "tutorial_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tutorial_tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tutorial_tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tutorial_tag_relations" (
	"tutorial_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "tutorial_tag_relations_pk" PRIMARY KEY("tutorial_id", "tag_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "tutorial_tag_relations" ADD CONSTRAINT "tutorial_tag_relations_tutorial_id_published_tutorials_id_fk" FOREIGN KEY ("tutorial_id") REFERENCES "public"."published_tutorials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_tag_relations" ADD CONSTRAINT "tutorial_tag_relations_tag_id_tutorial_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tutorial_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
