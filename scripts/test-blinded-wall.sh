#!/usr/bin/env bash
# ============================================================================
# SR blinding privilege-wall acceptance test (Task T1).
#
# Stands up a THROWAWAY local Postgres cluster (no Docker, no Neon), applies the
# real Drizzle migrations (0000..0002) exactly as `db:migrate` would, then proves
# the wall from FOUNDATION-auth-tenancy.md §6:
#
#   * slate_runtime gets `permission denied` on SELECT from each of the three
#     blinded base tables (screening_decisions, extraction_entries, rob_assessments).
#   * slate_runtime CAN still INSERT its own rows into those tables.
#   * The SECURITY DEFINER reader functions DO return the rows (the only read path).
#   * slate_runtime CAN read a non-blinded table (reviews) — the wall is targeted.
#
# Applying these same migrations to live Neon is the founder's step (Neon manages
# roles via its console/API, and DATABASE_URL must connect as slate_runtime).
#
# Usage:  bash scripts/test-blinded-wall.sh
# Exit 0 = wall holds; non-zero = a breach or setup failure.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- locate Postgres binaries (PATH, then Homebrew keg) ---------------------
PGBIN=""
if command -v initdb >/dev/null 2>&1; then
  PGBIN="$(dirname "$(command -v initdb)")"
else
  for c in /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin \
           /opt/homebrew/Cellar/postgresql@*/*/bin /usr/lib/postgresql/*/bin; do
    if [ -x "$c/initdb" ]; then PGBIN="$c"; break; fi
  done
fi
if [ -z "$PGBIN" ]; then
  echo "FAIL: could not find a Postgres 'initdb' binary (install postgresql@16)." >&2
  exit 3
fi
echo "Using Postgres binaries at: $PGBIN"

# --- throwaway cluster in a temp dir ---------------------------------------
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/sr-wall-test.XXXXXX")"
PGDATA="$WORKDIR/pgdata"
SOCKDIR="$WORKDIR/sock"
DBNAME="slate_wall_test"
mkdir -p "$SOCKDIR"

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "Initializing throwaway cluster..."
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null 2>&1

# Unix-socket only (no TCP) so we never collide with a real Postgres port.
"$PGBIN/pg_ctl" -D "$PGDATA" \
  -o "-k $SOCKDIR -c listen_addresses='' -c logging_collector=off" \
  -w start >/dev/null 2>&1

PSQL() { "$PGBIN/psql" -v ON_ERROR_STOP=1 -h "$SOCKDIR" -U postgres -d "$1" -qtA "${@:2}"; }

"$PGBIN/createdb" -h "$SOCKDIR" -U postgres "$DBNAME"

echo "Applying migrations 0000..0002 ..."
for f in 0000_jazzy_purple_man 0001_late_viper 0002_sr_privilege_wall; do
  PSQL "$DBNAME" -f "$ROOT/drizzle/$f.sql" >/dev/null
  echo "  applied drizzle/$f.sql"
done

# --- seed a minimal, FK-valid chain as the superuser (the "migrator" side) --
echo "Seeding one blinded row via the owner..."
REVIEW_ID="$(PSQL "$DBNAME" <<'SQL'
INSERT INTO users (workos_user_id, email, name) VALUES ('wos_test', 'r@example.com', 'R') RETURNING id AS user_id \gset
INSERT INTO organizations (id, name) VALUES ('org_test', 'Test Org');
INSERT INTO reviews (org_id, title, review_type, review_mode, created_by)
  VALUES ('org_test', 'T', 'intervention', 'two_reviewer', :'user_id') RETURNING id AS review_id \gset
INSERT INTO studies (review_id, title) VALUES (:'review_id', 'Study A') RETURNING id AS study_id \gset
INSERT INTO screening_decisions (review_id, study_id, reviewer_id, stage, decision)
  VALUES (:'review_id', :'study_id', :'user_id', 'title_abstract', 'include');
SELECT :'review_id';
SQL
)"
echo "  seeded review $REVIEW_ID with 1 screening_decision"

PASS=0
FAIL=0
check_denied() { # <label> <sql>
  local label="$1" sql="$2" out
  if out="$("$PGBIN/psql" -h "$SOCKDIR" -U postgres -d "$DBNAME" -qtA \
        -c "SET ROLE slate_runtime;" -c "$sql" 2>&1)"; then
    echo "  ✗ $label — expected permission denied, but query SUCCEEDED"; FAIL=$((FAIL+1))
  elif echo "$out" | grep -qi "permission denied"; then
    echo "  ✓ $label — permission denied (wall holds)"; PASS=$((PASS+1))
  else
    echo "  ✗ $label — failed for the WRONG reason: $out"; FAIL=$((FAIL+1))
  fi
}
check_ok() { # <label> <sql>  (expects success)
  local label="$1" sql="$2" out
  if out="$("$PGBIN/psql" -v ON_ERROR_STOP=1 -h "$SOCKDIR" -U postgres -d "$DBNAME" -qtA \
        -c "SET ROLE slate_runtime;" -c "$sql" 2>&1)"; then
    echo "  ✓ $label — allowed"; PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected success, got: $out"; FAIL=$((FAIL+1))
  fi
}
check_reads_rows() { # <label> <sql> — expects success AND at least one row
  local label="$1" sql="$2" out
  out="$("$PGBIN/psql" -h "$SOCKDIR" -U postgres -d "$DBNAME" -qtA \
        -c "SET ROLE slate_runtime;" -c "$sql" 2>&1)" || true
  if echo "$out" | grep -qiE '^(include|reported|low|[0-9])'; then
    echo "  ✓ $label — definer path returned data"; PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected rows via definer path, got: $out"; FAIL=$((FAIL+1))
  fi
}

echo
echo "=== THE WALL: runtime role must NOT SELECT the three blinded tables ==="
check_denied "SELECT screening_decisions" "SELECT * FROM screening_decisions;"
check_denied "SELECT extraction_entries"  "SELECT * FROM extraction_entries;"
check_denied "SELECT rob_assessments"     "SELECT * FROM rob_assessments;"
echo "--- aggregates are blinded data too: COUNT(*) must also be denied ---"
check_denied "COUNT screening_decisions"  "SELECT count(*) FROM screening_decisions;"

echo
echo "=== Runtime CAN still write its own rows to the blinded tables ==="
check_ok "INSERT screening_decisions" \
  "INSERT INTO screening_decisions (review_id, study_id, reviewer_id, stage, decision) SELECT review_id, study_id, reviewer_id, stage, 'maybe' FROM sr_read_screening_decisions('$REVIEW_ID') LIMIT 1;"

echo
echo "=== The SECURITY DEFINER reader IS the read path (returns rows) ==="
check_reads_rows "sr_read_screening_decisions" "SELECT decision FROM sr_read_screening_decisions('$REVIEW_ID') LIMIT 1;"

echo
echo "=== The wall is targeted: runtime CAN read a non-blinded table ==="
check_ok "SELECT reviews" "SELECT count(*) FROM reviews;"

echo
echo "----------------------------------------------------------------------"
echo "PASS=$PASS  FAIL=$FAIL"
if [ "$FAIL" -ne 0 ]; then
  echo "RESULT: WALL BREACHED ❌"
  exit 1
fi
echo "RESULT: WALL HOLDS ✅"
