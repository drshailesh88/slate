CREATE TYPE "public"."sr_conflict_resolution_method" AS ENUM('align_on_one', 'send_to_arbitrator');--> statement-breakpoint
CREATE TABLE "screening_conflict_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"study_id" uuid NOT NULL,
	"stage" "sr_screening_stage" NOT NULL,
	"method" "sr_conflict_resolution_method" NOT NULL,
	"decision" "sr_screening_decision",
	"arbitrator_id" uuid,
	"note" text,
	"resolved_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_conflict_resolutions_review_study_stage_unique" UNIQUE("review_id","study_id","stage")
);
--> statement-breakpoint
ALTER TABLE "screening_conflict_resolutions" ADD CONSTRAINT "screening_conflict_resolutions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_conflict_resolutions" ADD CONSTRAINT "screening_conflict_resolutions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_conflict_resolutions" ADD CONSTRAINT "screening_conflict_resolutions_arbitrator_id_users_id_fk" FOREIGN KEY ("arbitrator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_conflict_resolutions" ADD CONSTRAINT "screening_conflict_resolutions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screening_conflict_resolutions_review_idx" ON "screening_conflict_resolutions" USING btree ("review_id");--> statement-breakpoint
-- Privilege wall (see 0002): the runtime role gets per-table grants — new tables
-- are NOT covered by any default privilege. screening_conflict_resolutions is
-- NON-blinded (it only ever holds post-unblind human adjudications, never a raw
-- co-reviewer decision), so runtime may read + write it. UPDATE is for upserting
-- a re-resolution of the same (review, study, stage); there is no DELETE — the
-- audit_log preserves the full change history. Guarded so a DB without the wall
-- roles (0002 creates them) still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slate_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public.screening_conflict_resolutions TO slate_runtime;
  END IF;
END
$$;