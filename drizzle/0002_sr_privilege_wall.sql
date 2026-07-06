-- ============================================================================
-- SR BLINDING PRIVILEGE WALL (Systematic-Review Task T1)
--
-- Establishes the two-role Postgres wall from FOUNDATION-auth-tenancy.md §6:
--   * slate_migrator — the DDL / definer role. Owns migrations and the audited
--     SECURITY DEFINER reader functions. Retains SELECT on the blinded tables.
--   * slate_runtime  — the application's runtime role. May WRITE its own rows to
--     the three blinded base tables but has NO SELECT on them. Every read flows
--     through the SECURITY DEFINER functions the blinding chokepoint (T2) calls.
--
-- A stray Drizzle `SELECT` against a blinded table from the runtime role fails
-- at the database with `permission denied` — the correct posture for an
-- agent-built app (defense in depth: app-layer policy + DB wall).
--
-- NEON NOTE (founder's step): role provisioning on Neon (CREATE ROLE + LOGIN
-- credentials) is done via the Neon console/API, and the app's runtime
-- DATABASE_URL must connect AS `slate_runtime` for this wall to bind. The
-- DO-block guards below no-op if the roles already exist, so this migration is
-- safe to (re)apply after the founder provisions the roles.
--
-- REVERSIBLE — rollback (run as a superuser / the owner):
--   DROP FUNCTION IF EXISTS public.sr_read_screening_decisions(uuid);
--   DROP FUNCTION IF EXISTS public.sr_read_extraction_entries(uuid);
--   DROP FUNCTION IF EXISTS public.sr_read_rob_assessments(uuid);
--   GRANT SELECT ON public.screening_decisions, public.extraction_entries,
--     public.rob_assessments TO slate_runtime;   -- if you want reads restored
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM slate_runtime;
--   DROP ROLE IF EXISTS slate_runtime;
--   DROP ROLE IF EXISTS slate_migrator;
-- ============================================================================

-- 1. Roles (idempotent). NOLOGIN by default; the founder attaches LOGIN
--    credentials on Neon. slate_migrator owns DDL; slate_runtime is the app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slate_migrator') THEN
    CREATE ROLE slate_migrator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'slate_runtime') THEN
    CREATE ROLE slate_runtime NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

-- 2. Runtime baseline: connect to and use the schema.
GRANT USAGE ON SCHEMA public TO slate_runtime;
--> statement-breakpoint

-- 3. Non-blinded tables: runtime gets full DML. audit_log stays append-only
--    (SELECT + INSERT only) so history can never be rewritten from the app.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.organizations,
  public.reviews,
  public.review_members,
  public.review_invitations,
  public.studies,
  public.ai_validations,
  public.workos_events,
  public.users
TO slate_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.audit_log TO slate_runtime;
--> statement-breakpoint

-- 4. THE WALL. REVOKE ALL first so no prior broad grant survives, then hand back
--    only WRITE. Runtime can insert/update its OWN rows but can NEVER read the
--    three blinded base tables (no SELECT -> no aggregates, no side channels).
REVOKE ALL ON
  public.screening_decisions,
  public.extraction_entries,
  public.rob_assessments
FROM slate_runtime;
--> statement-breakpoint
REVOKE ALL ON
  public.screening_decisions,
  public.extraction_entries,
  public.rob_assessments
FROM PUBLIC;
--> statement-breakpoint
GRANT INSERT, UPDATE ON
  public.screening_decisions,
  public.extraction_entries,
  public.rob_assessments
TO slate_runtime;
--> statement-breakpoint

-- 5. The DDL/definer role keeps SELECT on the blinded tables — it is the owner
--    of the reader functions below, so SECURITY DEFINER executes with its rights.
GRANT SELECT ON
  public.screening_decisions,
  public.extraction_entries,
  public.rob_assessments
TO slate_migrator;
--> statement-breakpoint

-- 6. THE ONLY READ PATH: audited SECURITY DEFINER readers. search_path is pinned
--    to pg_catalog to defeat search_path hijacking (CVE-2018-1058); every table
--    reference is schema-qualified. The blinding chokepoint (T2) is the only
--    intended caller; policy (role x phase x table) lives there, not here.
CREATE OR REPLACE FUNCTION public.sr_read_screening_decisions(p_review_id uuid)
RETURNS SETOF public.screening_decisions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM public.screening_decisions WHERE review_id = p_review_id;
$$;
--> statement-breakpoint
ALTER FUNCTION public.sr_read_screening_decisions(uuid) OWNER TO slate_migrator;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sr_read_extraction_entries(p_review_id uuid)
RETURNS SETOF public.extraction_entries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM public.extraction_entries WHERE review_id = p_review_id;
$$;
--> statement-breakpoint
ALTER FUNCTION public.sr_read_extraction_entries(uuid) OWNER TO slate_migrator;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sr_read_rob_assessments(p_review_id uuid)
RETURNS SETOF public.rob_assessments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM public.rob_assessments WHERE review_id = p_review_id;
$$;
--> statement-breakpoint
ALTER FUNCTION public.sr_read_rob_assessments(uuid) OWNER TO slate_migrator;
--> statement-breakpoint

-- 7. Runtime may only reach the blinded data by EXECUTEing the audited readers.
REVOKE ALL ON FUNCTION public.sr_read_screening_decisions(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.sr_read_extraction_entries(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.sr_read_rob_assessments(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.sr_read_screening_decisions(uuid) TO slate_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.sr_read_extraction_entries(uuid) TO slate_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.sr_read_rob_assessments(uuid) TO slate_runtime;
