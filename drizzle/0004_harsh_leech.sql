CREATE TABLE "tag_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_tag_id" uuid NOT NULL,
	"to_tag_id" uuid NOT NULL,
	"relation_type" varchar(32) DEFAULT 'co_occurrence',
	"strength" integer DEFAULT 0,
	"computed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "tag_relations" ADD CONSTRAINT "tag_relations_from_tag_id_tutorial_tags_id_fk" FOREIGN KEY ("from_tag_id") REFERENCES "public"."tutorial_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_relations" ADD CONSTRAINT "tag_relations_to_tag_id_tutorial_tags_id_fk" FOREIGN KEY ("to_tag_id") REFERENCES "public"."tutorial_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_relations_unique_pair" ON "tag_relations" USING btree ("from_tag_id","to_tag_id");