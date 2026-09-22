#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/tmp"
LINT_LOG="$LOG_DIR/check-map-offline-lint.log"
BUILD_LOG="$LOG_DIR/check-map-offline-build.log"
MAP_DIR="$ROOT_DIR/public/map"

mkdir -p "$LOG_DIR"

cd "$ROOT_DIR"

echo "SUMMARY: starting offline basemap checks"

if [ ! -f "$MAP_DIR/manifest.json" ]; then
  echo "SUMMARY: public/map is empty - run 'npm run map:fetch' first"
  exit 1
fi

node -e '
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("public/map/manifest.json", "utf8"));
console.log(`SUMMARY: planet ${manifest.planetVersion}, fetched ${manifest.fetchedAt}`);
console.log(`SUMMARY: tiles saved=${manifest.tiles.saved} empty=${manifest.tiles.empty}`);
if (manifest.tiles.saved === 0) {
  console.log("SUMMARY: no tiles saved");
  process.exit(1);
}
'

# Стили не должны ходить наружу: ни один URL апстрима не переживает локализацию.
for style in positron dark; do
  if [ ! -f "$MAP_DIR/styles/$style.json.gz" ]; then
    echo "SUMMARY: missing style $style"
    exit 1
  fi
  if gzip -dc "$MAP_DIR/styles/$style.json.gz" | grep -q "tiles.openfreemap.org"; then
    echo "SUMMARY: style $style still points at tiles.openfreemap.org"
    exit 1
  fi
  echo "SUMMARY: style $style is self-hosted"
done

for asset in "fonts/Noto Sans Regular/1024-1279.pbf.gz" "sprites/ofm.json.gz" "sprites/ofm@2x.png"; do
  if [ ! -f "$MAP_DIR/$asset" ]; then
    echo "SUMMARY: missing asset $asset"
    exit 1
  fi
done
echo "SUMMARY: glyphs and sprites present"

# surgut-map.tsx сюда не входит: в нём 55 давних no-explicit-any, они не про
# эту задачу. Линтим только то, что задача принесла.
if npm run lint -- lib/map-bounds.ts lib/map-style.ts "app/api/map/[...path]/route.ts" >"$LINT_LOG" 2>&1; then
  echo "SUMMARY: lint passed"
else
  echo "SUMMARY: lint failed"
  tail -n 50 "$LINT_LOG" || true
  echo "LOG: $LINT_LOG"
  exit 1
fi

if npm run build >"$BUILD_LOG" 2>&1; then
  echo "SUMMARY: build passed"
else
  echo "SUMMARY: build failed"
  tail -n 50 "$BUILD_LOG" || true
  echo "LOG: $BUILD_LOG"
  exit 1
fi

echo "LOG: $LINT_LOG"
echo "LOG: $BUILD_LOG"
echo "SUMMARY: offline basemap checks completed successfully"
