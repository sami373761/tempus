#!/usr/bin/env bash
# Build TEMPUS on the Mac and ship it to the Oracle VM (runbook: docs/SERVER.md).
#
# The build runs in a separate copy because `next build` next to a running
# `next dev` breaks dev, and the 1 GB server cannot build at all. Runtime
# dependencies are installed on the server so native modules (sharp) match it.
#
#   npm run deploy
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
B=/tmp/tempus-build/app
HOST=ubuntu@92.5.227.153
KEY="$HOME/.ssh/tempus_oracle"
# A dropped connection must fail the deploy, not hang it forever.
SSH="ssh -i $KEY -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4"
SITE=https://tempusplay.com
IMAGE_ORIGIN=https://img.tempusplay.com

echo "→ copying $SRC to $B"
mkdir -p "$B"
rsync -a --delete --exclude node_modules --exclude .next --exclude .git \
  --exclude 'Icon*' --exclude data "$SRC/" "$B/"

# NEXT_PUBLIC_* values are baked in at build time, so production values go in
# before the build: the real image origin (/api/r2 is a dev-only proxy).
cd "$B"
sed -i '' -e "s#^NEXT_PUBLIC_R2_PUBLIC_BASE_URL=.*#NEXT_PUBLIC_R2_PUBLIC_BASE_URL=$IMAGE_ORIGIN#" .env.local
grep -q "^NEXT_PUBLIC_R2_PUBLIC_BASE_URL=$IMAGE_ORIGIN$" .env.local \
  || { echo "✗ .env.local has no NEXT_PUBLIC_R2_PUBLIC_BASE_URL line"; exit 1; }

echo "→ building"
npm ci --silent
NEXT_TELEMETRY_DISABLED=1 npm run build

echo "→ shipping to $HOST"
rsync -az --delete --exclude node_modules --exclude .next/cache --exclude docs \
  --exclude supabase --exclude CLAUDE.md --exclude prompt_unutma.txt \
  -e "$SSH" "$B/" "$HOST:/srv/tempus/"

# Stopped before `npm ci` so the running app never loads a module from a
# half-rewritten node_modules. `next start` needs `typescript` (for
# next.config.ts), which is why it is a runtime dependency.
$SSH -n "$HOST" 'set -e; cd /srv/tempus && chmod 600 .env.local \
  && sudo systemctl stop tempus && npm ci --omit=dev --silent \
  && sudo systemctl start tempus'

echo "→ smoke test"
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$SITE/" || true)
  [ "$code" = "200" ] && { echo "✓ $SITE/ answers 200"; exit 0; }
  sleep 3
done
echo "✗ $SITE/ answered $code; check: ssh -i $KEY $HOST 'journalctl -u tempus -n 50'"
exit 1
