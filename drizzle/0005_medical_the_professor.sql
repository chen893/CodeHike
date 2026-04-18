CREATE TABLE "user_tag_follows" (
	"user_id" text NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_tag_follows_user_id_tag_id_pk" PRIMARY KEY("user_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "user_tag_follows" ADD CONSTRAINT "user_tag_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tag_follows" ADD CONSTRAINT "user_tag_follows_tag_id_tutorial_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tutorial_tags"("id") ON DELETE cascade ON UPDATE no action;