#!/usr/bin/env bash
#
# create-user.sh — create a single Cognito user and add to a group.
#
# Usage:
#   POOL_ID=$(terraform -chdir=../environments/dev output -raw cognito_user_pool_id) \
#     ./create-user.sh
#
# The script prompts interactively for email and password so credentials
# never live in shell history or env files. The group defaults to
# `superuser`; override with `GROUP=regular ./create-user.sh`.
#
# What it does (idempotent on group-add, but fails if the user already exists):
#   1. admin-create-user  — creates the Cognito user with email_verified=true
#   2. admin-set-user-password  — sets a permanent password (no password reset required)
#   3. admin-add-user-to-group  — adds the user to the specified group
#
# If the user already exists, step 1 errors out (UsernameExistsException) and
# the script exits. Run wipe-cognito-users.sh first if you want a clean slate.

set -euo pipefail

if [[ -z "${POOL_ID:-}" ]]; then
  echo "error: POOL_ID is required. Get it from 'terraform output -raw cognito_user_pool_id'." >&2
  exit 1
fi

GROUP="${GROUP:-superuser}"

echo "Target pool: $POOL_ID"
echo "Group:       $GROUP"
echo ""

# Prompt for email
read -r -p "Email: " EMAIL
if [[ -z "$EMAIL" ]]; then
  echo "error: email cannot be empty." >&2
  exit 1
fi

# Prompt for password (silent), confirm twice
read -r -s -p "Password: " PASSWORD
echo ""
if [[ -z "$PASSWORD" ]]; then
  echo "error: password cannot be empty." >&2
  exit 1
fi
read -r -s -p "Confirm password: " PASSWORD_CONFIRM
echo ""
if [[ "$PASSWORD" != "$PASSWORD_CONFIRM" ]]; then
  echo "error: passwords do not match." >&2
  exit 1
fi

echo ""
echo "Creating: $EMAIL"

# ── 1. Create the user ─────────────────────────────────────
echo ""
echo "[1/3] Creating user ..."
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --user-attributes \
      Name=email,Value="$EMAIL" \
      Name=email_verified,Value=true \
  --message-action SUPPRESS \
  >/dev/null

# ── 2. Set the permanent password ──────────────────────────
echo "[2/3] Setting permanent password ..."
aws cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --permanent

# ── 3. Add to group ────────────────────────────────────────
echo "[3/3] Adding to group: $GROUP"
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username "$EMAIL" \
  --group-name "$GROUP"

echo ""
echo "Done. User '$EMAIL' is ready."
