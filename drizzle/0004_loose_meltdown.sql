CREATE TYPE "public"."sr_dupe_status" AS ENUM('unique', 'auto_merged', 'needs_review', 'merged', 'kept');--> statement-breakpoint
CREATE TYPE "public"."sr_import_target" AS ENUM('screen', 'full_text');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"source" text NOT NULL,
	"target" "sr_import_target" DEFAULT 'screen' NOT NULL,
	"ai" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "studies" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "studies" ADD COLUMN "dupe_status" "sr_dupe_status" DEFAULT 'unique' NOT NULL;--> statement-breakpoint
ALTER TABLE "studies" ADD COLUMN "dupe_of_study_id" uuid;--> statement-breakpoint
ALTER TABLE "studies" ADD COLUMN "dupe_matched_on" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_review_idx" ON "import_batches" USING btree ("review_id");--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_dupe_of_study_id_studies_id_fk" FOREIGN KEY ("dupe_of_study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studies_batch_idx" ON "studies" USING btree ("batch_id");