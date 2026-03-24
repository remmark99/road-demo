#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/tmp"
LINT_LOG="$LOG_DIR/check-dashboard-modules-lint.log"
BUILD_LOG="$LOG_DIR/check-dashboard-modules-build.log"

mkdir -p "$LOG_DIR"

cd "$ROOT_DIR"

echo "SUMMARY: starting dashboard modules checks"

if npm run lint -- \
  app/dashboard/page.tsx \
  components/dashboard/park-security-analytics.tsx \
  components/dashboard/park-operations-analytics.tsx \
  components/dashboard/transport-route-analytics.tsx \
  components/dashboard/transport-service-analytics.tsx \
  lib/mock/park-mock-data.ts \
  lib/mock/transport-mock-data.ts >"$LINT_LOG" 2>&1; then
  echo "SUMMARY: lint passed"
else
  echo "SUMMARY: lint failed"
  tail -n 50 "$LINT_LOG" || true
  echo "LOG: $LINT_LOG"
  exit 1
fi

tail -n 50 "$LINT_LOG" || true
echo "LOG: $LINT_LOG"

if npm run build >"$BUILD_LOG" 2>&1; then
  echo "SUMMARY: build passed"
else
  echo "SUMMARY: build failed"
  tail -n 50 "$BUILD_LOG" || true
  echo "LOG: $BUILD_LOG"
  exit 1
fi

tail -n 50 "$BUILD_LOG" || true
echo "LOG: $BUILD_LOG"
echo "SUMMARY: dashboard modules checks completed successfully"
