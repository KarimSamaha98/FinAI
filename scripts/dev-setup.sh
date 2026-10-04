#!/usr/bin/env bash
# One-shot local bring-up: install deps, start local Supabase (Docker),
# build shared-types, seed the demo user + dataset. Safe to re-run — every
# step is idempotent, and the seeder no-ops if the demo user already exists.

set -euo pipefail

echo "==> Installing dependencies…"
pnpm install

echo "==> Starting local Supabase (requires Docker)…"
pnpm exec supabase start

if [ ! -f apps/api/.env ]; then
  echo "!! apps/api/.env is missing."
  echo "   Copy apps/api/.env.example to apps/api/.env and fill it from the 'supabase start' output"
  echo "   (DATABASE_URL must use the app_service role — see the comment in the example), then re-run."
  exit 1
fi
if [ ! -f apps/web/.env.local ]; then
  echo "!! apps/web/.env.local is missing."
  echo "   Copy apps/web/.env.local.example to apps/web/.env.local and fill it, then re-run."
  exit 1
fi

echo "==> Building shared-types…"
pnpm --filter shared-types run build

echo "==> Seeding demo user + dataset…"
pnpm seed:demo

echo ""
echo "==> Local dev is ready."
echo "    Start the app with: pnpm dev  (web on http://localhost:5173)"
echo "    Demo login: see the seeder output above (default demo@finai.test / demo-password-123)."
