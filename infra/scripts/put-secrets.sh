#!/bin/bash
# Put the JustCooking API secrets into SSM Parameter Store as SecureString
# (AWS-managed key — free, no CMK). Reads values from a LOCAL, gitignored
# secrets.env file (never commit it). Idempotent (Overwrite).
#
# Usage:
#   cp secrets.env.example secrets.env   # then fill in real values
#   AWS_PROFILE=justcooking.AdministratorAccess ./scripts/put-secrets.sh
#
# secrets.env format (KEY=value, one per line):
#   MONGO_URI=...
#   SESSION_SECRET=...
#   S3_ACCESS_KEY_ID=...
#   S3_SECRET_ACCESS_KEY=...
#   GOOGLE_CLIENT_ID=...
#   GOOGLE_CLIENT_SECRET=...
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${1:-$HERE/../secrets.env}"
REGION="${AWS_REGION:-us-east-1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ $ENV_FILE not found. Copy secrets.env.example → secrets.env and fill it in." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

put() { # $1 = ssm name, $2 = value
  if [[ -z "${2:-}" ]]; then
    echo "⚠️  skipping $1 (empty)"; return
  fi
  aws ssm put-parameter --region "$REGION" \
    --name "$1" --type SecureString --value "$2" --overwrite >/dev/null
  echo "✅ $1"
}

put /justcooking/mongo-uri              "${MONGO_URI:-}"
put /justcooking/session-secret         "${SESSION_SECRET:-}"
put /justcooking/s3-access-key-id       "${S3_ACCESS_KEY_ID:-}"
put /justcooking/s3-secret-access-key   "${S3_SECRET_ACCESS_KEY:-}"
put /justcooking/google-client-id       "${GOOGLE_CLIENT_ID:-}"
put /justcooking/google-client-secret   "${GOOGLE_CLIENT_SECRET:-}"

echo "Done. Now: npm run build:lambda && npx cdk deploy JustCookingApi -c account=276663280738"
