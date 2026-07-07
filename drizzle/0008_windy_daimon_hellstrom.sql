CREATE TYPE "public"."sr_extraction_consensus_source" AS ENUM('reviewer1', 'reviewer2', 'ai', 'typed');--> statement-breakpoint
CREATE TYPE "public"."sr_extraction_resolution_method" AS ENUM('discuss', 'arbitrator', 'author_contact', 'unresolved');--> statement-breakpoint
CREATE TABLE "extraction_consensus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"study_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"value" text,
	"state" "sr_extraction_state" NOT NULL,
	"source" "sr_extraction_consensus_source" NOT NULL,
	"derived" boolean DEFAULT false NOT NULL,
	"derived_formula" text,
	"provenance" jsonb,
	"resolution_method" "sr_extraction_resolution_method" DEFAULT 'discuss' NOT NULL,
	"arbitrator_id" uuid,
	"author_contacted" boolean DEFAULT false NOT NULL,
	"author_contact_note" text,
	"resolved_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_consensus_review_study_field_unique" UNIQUE("review_id","study_id","field_id")
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "extraction_qc_sample_rate" real DEFAULT 0.2 NOT NULL;--> statement-breakpoint
ALTER TABLE "extraction_consensus" ADD CONSTRAINT "extraction_consensus_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_consensus" ADD CONSTRAINT "extraction_consensus_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_consensus" ADD CONSTRAINT "extraction_consensus_arbitrator_id_users_id_fk" FOREIGN KEY ("arbitrator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_consensus" ADD CONSTRAINT "extraction_consensus_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_consensus_review_idx" ON "extraction_consensus" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "extraction_entries_reviewer_study_field_idx" ON "extraction_entries" USING btree ("review_id","study_id","reviewer_id","field_id");--> statement-breakpoint
-- Privilege wall (see 0002): the runtime role gets per-table grants — new tables
-- are NOT covered by any default privilege. extraction_consensus is NON-blinded
-- (it only ever holds post-unblind human-reconciled values, never a raw
-- co-reviewer extraction — those stay in the blinded extraction_entries, which
-- the runtime role still cannot SELECT). Runtime may read + write consensus.
-- UPDATE is for upserting a re-resolution of the same (review, study, field);
-- there is no DELETE — the audit_log preserves the full change history, and the
-- reviewers' as-extracted entries are never overwritten. Guarded so a DB without
-- the wall roles (0002 creates them) still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slate_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public.extraction_consensus TO slate_runtime;
  END IF;
END
$$;