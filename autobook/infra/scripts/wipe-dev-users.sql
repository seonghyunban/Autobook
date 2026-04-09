-- wipe-dev-users.sql — truncate the users table and everything that
-- depends on it. Run after `bootstrap-admin.sh` to clear out any
-- orphaned Postgres rows left behind by the old demo-mode user flow.
--
-- Usage:
--   psql "$DATABASE_URL" -f infra/scripts/wipe-dev-users.sql
--
-- The Transaction, JournalEntry etc. tables all FK to users with
-- ON DELETE CASCADE, so TRUNCATE ... CASCADE
-- wipes them atomically. After this runs, the dev database has no user
-- rows; the first real login via Cognito will create a fresh one via
-- UserDAO.get_or_create_from_cognito_claims.

BEGIN;

TRUNCATE TABLE users CASCADE;

COMMIT;
