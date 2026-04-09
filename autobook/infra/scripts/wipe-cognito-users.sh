#!/usr/bin/env bash
#
# wipe-cognito-users.sh — delete every user in a Cognito user pool.
#
# Usage:
#   POOL_ID=$(terraform -chdir=../environments/dev output -raw cognito_user_pool_id) \
#     ./wipe-cognito-users.sh
#
#   # Or pass explicitly:
#   POOL_ID=ca-central-1_xxxxxxxxx ./wipe-cognito-users.sh
#
# Destructive. Use in dev only. Prints each username as it deletes, exits
# cleanly if the pool is already empty.
#
# Note: this wipes Cognito identities only. Orphaned rows in the Postgres
# `users` table (+ cascaded children) are left alone — wipe those separately
# via `TRUNCATE users CASCADE` against the target database.

set -euo pipefail

if [[ -z "${POOL_ID:-}" ]]; then
  echo "error: POOL_ID is required. Get it from 'terraform output -raw cognito_user_pool_id'." >&2
  exit 1
fi

echo "Target pool: $POOL_ID"
echo ""
echo "Wiping existing Cognito users ..."

usernames=$(aws cognito-idp list-users \
  --user-pool-id "$POOL_ID" \
  --query 'Users[].Username' \
  --output text || true)

if [[ -z "$usernames" ]]; then
  echo "  (pool is already empty)"
  exit 0
fi

for u in $usernames; do
  echo "  - deleting $u"
  aws cognito-idp admin-delete-user \
    --user-pool-id "$POOL_ID" \
    --username "$u"
done

echo ""
echo "Done. All users deleted from $POOL_ID."
echo "Don't forget to TRUNCATE the Postgres users table to clear orphans."
