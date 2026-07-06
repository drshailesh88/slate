CREATE TYPE "public"."sr_extraction_state" AS ENUM('reported', 'not_reported', 'na', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."sr_invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."sr_member_status" AS ENUM('pending', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."sr_phase" AS ENUM('independent', 'reconcile');--> statement-breakpoint
CREATE TYPE "public"."sr_review_mode" AS ENUM('two_reviewer', 'ai_co_reviewer');--> statement-breakpoint
CREATE TYPE "public"."sr_review_role" AS ENUM('owner', 'collaborator', 'reviewer', 'arbitrator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."sr_rob_judgement" AS ENUM('low', 'some', 'high');--> statement-breakpoint
CREATE TYPE "public"."sr_screening_decision" AS ENUM('include', 'exclude', 'maybe');--> statement-breakpoint
CREATE TYPE "public"."sr_screening_stage" AS ENUM('title_abstract', 'full_text');--> statement-breakpoint
CREATE TABLE "ai_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"model" text NOT NULL,
	"version" text NOT NULL,
	"prompt" text NOT NULL,
	"recall_on_includes" real NOT NULL,
	"sample_size" integer NOT NULL,
	"passed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "sr_review_role" NOT NULL,
	"token_hash" text NOT NULL,
	"entropy_bits" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"workos_invitation_id" text,
	"status" "sr_invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "review_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "sr_review_role" NOT NULL,
	"status" "sr_member_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_members_review_user_unique" UNIQUE("review_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"review_type" text NOT NULL,
	"review_mode" "sr_review_mode" NOT NULL,
	"screening_stage" "sr_screening_stage" DEFAULT 'title_abstract' NOT NULL,
	"screening_phase" "sr_phase" DEFAULT 'independent' NOT NULL,
	"extraction_phase" "sr_phase" DEFAULT 'independent' NOT NULL,
	"rob_phase" "sr_phase" DEFAULT 'independent' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"title" text NOT NULL,
	"abstract" text,
	"authors" text,
	"journal" text,
	"year" integer,
	"doi" text,
	"external_id" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workos_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "extraction_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"study_id" uuid NOT NULL,
	"field_id" text NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"value" text,
	"state" "sr_extraction_state" NOT NULL,
	"derived" boolean DEFAULT false NOT NULL,
	"derived_formula" text,
	"provenance" jsonb,
	"is_ai" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rob_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"study_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"judgement" "sr_rob_judgement" NOT NULL,
	"support_quote" text,
	"is_ai" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"study_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"stage" "sr_screening_stage" NOT NULL,
	"decision" "sr_screening_decision" NOT NULL,
	"exclude_reason_code" text,
	"exclude_reason_detail" text,
	"is_ai" boolean DEFAULT false NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_validations" ADD CONSTRAINT "ai_validations_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_members" ADD CONSTRAINT "review_members_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_members" ADD CONSTRAINT "review_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_entries" ADD CONSTRAINT "extraction_entries_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_entries" ADD CONSTRAINT "extraction_entries_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_entries" ADD CONSTRAINT "extraction_entries_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rob_assessments" ADD CONSTRAINT "rob_assessments_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rob_assessments" ADD CONSTRAINT "rob_assessments_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rob_assessments" ADD CONSTRAINT "rob_assessments_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decisions" ADD CONSTRAINT "screening_decisions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decisions" ADD CONSTRAINT "screening_decisions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_decisions" ADD CONSTRAINT "screening_decisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_review_at_idx" ON "audit_log" USING btree ("review_id","at");--> statement-breakpoint
CREATE INDEX "review_invitations_review_email_idx" ON "review_invitations" USING btree ("review_id","email");--> statement-breakpoint
CREATE INDEX "review_members_review_user_idx" ON "review_members" USING btree ("review_id","user_id");--> statement-breakpoint
CREATE INDEX "studies_review_idx" ON "studies" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "extraction_entries_review_study_idx" ON "extraction_entries" USING btree ("review_id","study_id");--> statement-breakpoint
CREATE INDEX "rob_assessments_review_study_idx" ON "rob_assessments" USING btree ("review_id","study_id");--> statement-breakpoint
CREATE INDEX "screening_decisions_review_study_idx" ON "screening_decisions" USING btree ("review_id","study_id");