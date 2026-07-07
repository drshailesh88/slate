CREATE TYPE "public"."sr_rob_instrument" AS ENUM('rob2', 'robins_i');--> statement-breakpoint
ALTER TABLE "studies" ADD COLUMN "rob_instrument" "sr_rob_instrument" DEFAULT 'rob2' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "rob_assessments_reviewer_study_domain_idx" ON "rob_assessments" USING btree ("review_id","study_id","reviewer_id","domain");