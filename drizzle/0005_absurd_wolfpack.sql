CREATE TABLE "protocol_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"version" integer,
	"research_question" text DEFAULT '' NOT NULL,
	"pico" jsonb NOT NULL,
	"criteria" jsonb NOT NULL,
	"reason" text,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocol_versions_review_version_unique" UNIQUE("review_id","version")
);
--> statement-breakpoint
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_versions" ADD CONSTRAINT "protocol_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "protocol_versions_one_draft_idx" ON "protocol_versions" USING btree ("review_id") WHERE "protocol_versions"."version" is null;--> statement-breakpoint
CREATE INDEX "protocol_versions_review_idx" ON "protocol_versions" USING btree ("review_id","version");--> statement-breakpoint
-- Privilege wall (see 0002): the runtime role gets per-table grants — new tables
-- are NOT covered by any default privilege. protocol_versions is non-blinded, so
-- runtime may read + write it. UPDATE is for the single mutable draft row; locked
-- versions are only ever INSERTed (never updated/deleted) — the append-only audit
-- trail. Guarded so a DB without the wall roles (0002 creates them) still applies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slate_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON public.protocol_versions TO slate_runtime;
  END IF;
END
$$;