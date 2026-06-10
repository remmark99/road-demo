#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/tmp"
LINT_LOG="$LOG_DIR/check-stop-current-load-analytics-lint.log"
BUILD_LOG="$LOG_DIR/check-stop-current-load-analytics-build.log"

mkdir -p "$LOG_DIR"

cd "$ROOT_DIR"

echo "SUMMARY: starting stop current load analytics checks"

if npm run lint -- \
  app/dashboard/page.tsx \
  components/dashboard/stop-current-load-analytics.tsx \
  components/dashboard/stop-kpi-current-analytics.tsx \
  components/dashboard/stop-district-current-analytics.tsx \
  components/dashboard/stop-lying-person-analytics.tsx \
  components/dashboard/ai-chatbot.tsx \
  app/ai-assistant/page.tsx \
  lib/api/busyness-windows.ts \
  lib/api/stop-current-analytics.ts \
  lib/api/alerts.ts \
  lib/stop-analytics-config.ts >"$LINT_LOG" 2>&1; then
  echo "SUMMARY: lint passed"
else
  echo "SUMMARY: lint failed"
  tail -n 50 "$LINT_LOG" || true
  echo "LOG: $LINT_LOG"
  exit 1
fi

tail -n 50 "$LINT_LOG" || true
echo "LOG: $LINT_LOG"

if rg -q "Текущее состояние" app/dashboard/page.tsx \
  && rg -q "План" app/dashboard/page.tsx \
  && rg -q "Загруженность остановок" app/dashboard/page.tsx components/dashboard/stop-current-load-analytics.tsx \
  && rg -q "Показатели остановок" app/dashboard/page.tsx components/dashboard/stop-kpi-current-analytics.tsx \
  && rg -q "Районы" app/dashboard/page.tsx components/dashboard/stop-district-current-analytics.tsx \
  && rg -q "События безопасности" app/dashboard/page.tsx components/dashboard/stop-lying-person-analytics.tsx \
  && rg -q "Почасовая загрузка" components/dashboard/stop-current-load-analytics.tsx \
  && rg -q "Тепловая карта: час и остановка" components/dashboard/stop-current-load-analytics.tsx \
  && rg -q "Пик на остановке" components/dashboard/stop-current-load-analytics.tsx \
  && rg -q "fetchBusStopsForLocations" components/dashboard/stop-current-load-analytics.tsx lib/api/busyness-windows.ts \
  && rg -q "lying_person" components/dashboard/stop-lying-person-analytics.tsx lib/api/alerts.ts \
  && rg -q "smoking" components/dashboard/stop-lying-person-analytics.tsx lib/api/alerts.ts \
  && rg -q "dogs_without_people" components/dashboard/stop-lying-person-analytics.tsx lib/api/alerts.ts \
  && rg -q "fetchStopSafetyAlerts" components/dashboard/stop-lying-person-analytics.tsx lib/api/alerts.ts \
  && rg -q "20А микрорайон|31 микрорайон|Старый Сургут" lib/stop-analytics-config.ts components/dashboard/stop-district-current-analytics.tsx \
  && rg -q "STOP_MONITORED_COMPLEXES|getStopComplexByCameraIndex|getStopComplexByLocationId" lib/stop-analytics-config.ts lib/api/stop-current-analytics.ts \
  && rg -q "События по районам|Бездомные собаки|Курение|Лежачий человек" components/dashboard/stop-district-current-analytics.tsx \
  && rg -q "Распределение по периоду|Профиль по часам суток|PERIOD_BUCKET_LABELS" components/dashboard/stop-lying-person-analytics.tsx \
  && rg -q "Живые камеры|STOP_LIVE_CAMERA_COUNT" components/dashboard/stop-kpi-current-analytics.tsx lib/stop-analytics-config.ts \
  && rg -q "orderDashboards|STOPS_CURRENT_DASHBOARDS" app/dashboard/page.tsx \
  && rg -q "fullHeight|initialQuestionsCollapsed|h-\\[calc\\(100dvh-3\\.5rem\\)\\]" app/ai-assistant/page.tsx \
  && rg -q "/api/bus-stops|bus_stops" lib/api/stop-current-analytics.ts \
  && rg -q "busyness_windows|fetchBusynessWindows" lib/api/busyness-windows.ts lib/api/stop-current-analytics.ts components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx \
  && rg -q "alerts|fetchStopSafetyAlerts" lib/api/alerts.ts lib/api/stop-current-analytics.ts components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx \
  && rg -q "cameras" lib/api/stop-current-analytics.ts components/dashboard/stop-kpi-current-analytics.tsx; then
  echo "SUMMARY: required analytics labels found"
else
  echo "SUMMARY: required analytics labels missing"
  exit 1
fi

if rg -q "Лежачий человек" app/dashboard/page.tsx; then
  echo "SUMMARY: old lying-person sidebar label is still present"
  rg -n "Лежачий человек" app/dashboard/page.tsx || true
  exit 1
else
  echo "SUMMARY: sidebar uses generalized safety label"
fi

if rg -q "Лежачий человек|lying_person|fetchStopSafetyAlerts|fetchLyingPersonAlerts" components/dashboard/stop-current-load-analytics.tsx; then
  echo "SUMMARY: lying-person data leaked into stop load analytics"
  rg -n "Лежачий человек|lying_person|fetchStopSafetyAlerts|fetchLyingPersonAlerts" components/dashboard/stop-current-load-analytics.tsx || true
  exit 1
else
  echo "SUMMARY: stop load analytics stays busyness-only"
fi

if rg -q "Собаки без людей" app components lib; then
  echo "SUMMARY: old dogs-without-people label is still present"
  rg -n "Собаки без людей" app components lib || true
  exit 1
else
  echo "SUMMARY: homeless dogs label is normalized"
fi

node <<'NODE'
const fs = require("node:fs")
const source = fs.readFileSync("app/dashboard/page.tsx", "utf8")
const expected = 'const STOPS_CURRENT_DASHBOARDS = ["stop_current_kpi", "stop_current_districts", "stop_current_load", "stop_current_security"]'

if (!source.includes(expected)) {
  console.error("SUMMARY: stop current dashboard order is incorrect")
  process.exit(1)
}
NODE
echo "SUMMARY: stop current dashboard order is correct"

if ! rg -q "layout=\"vertical\"" components/dashboard/stop-district-current-analytics.tsx; then
  echo "SUMMARY: district charts are not using readable vertical layout"
  exit 1
else
  echo "SUMMARY: district charts use readable vertical layout"
fi

if rg -q "Записей справочника|title=\"Средняя загруженность\"" components/dashboard/stop-district-current-analytics.tsx; then
  echo "SUMMARY: old district KPI cards are still present"
  rg -n "Записей справочника|title=\"Средняя загруженность\"" components/dashboard/stop-district-current-analytics.tsx || true
  exit 1
else
echo "SUMMARY: district screen no longer shows removed KPI cards"
fi

if rg -q "100 из 436|live-данные|Live-данные|busyness_windows:|справочник bus_stops|module_name = stops|по metadata\\.location_id|уникальные camera_index|В таблице alerts|Реальные записи alerts|Heatmap:" components/dashboard/stop-current-load-analytics.tsx components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx components/dashboard/stop-lying-person-analytics.tsx; then
  echo "SUMMARY: technical English labels are still visible in stop analytics"
  rg -n "100 из 436|live-данные|Live-данные|busyness_windows:|справочник bus_stops|module_name = stops|по metadata\\.location_id|уникальные camera_index|В таблице alerts|Реальные записи alerts|Heatmap:" components/dashboard/stop-current-load-analytics.tsx components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx components/dashboard/stop-lying-person-analytics.tsx || true
  exit 1
else
  echo "SUMMARY: visible stop analytics labels are localized"
fi

if ! rg -q "slice\\(0, 5\\)" components/dashboard/stop-lying-person-analytics.tsx; then
  echo "SUMMARY: latest stop safety events are not limited to 5 rows"
  exit 1
else
  echo "SUMMARY: latest stop safety events limited to 5 rows"
fi

if rg -q "<img|clip_path|image_url|Открыть кадр" components/dashboard/stop-lying-person-analytics.tsx; then
  echo "SUMMARY: safety analytics still renders image-related UI"
  rg -n "<img|clip_path|image_url|Открыть кадр" components/dashboard/stop-lying-person-analytics.tsx || true
  exit 1
else
  echo "SUMMARY: safety analytics has no image UI"
fi

if rg -q "Локац|локац" components/dashboard/stop-current-load-analytics.tsx components/dashboard/stop-lying-person-analytics.tsx components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx; then
  echo "SUMMARY: technical location labels still present"
  rg -n "Локац|локац" components/dashboard/stop-current-load-analytics.tsx components/dashboard/stop-lying-person-analytics.tsx components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx || true
  exit 1
else
  echo "SUMMARY: technical location labels removed"
fi

if rg -q "mock|Mock|lib/mock" components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx lib/api/stop-current-analytics.ts; then
  echo "SUMMARY: new current stop screens reference mock data"
  rg -n "mock|Mock|lib/mock" components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx lib/api/stop-current-analytics.ts || true
  exit 1
else
  echo "SUMMARY: new current stop screens use real adapters"
fi

if node <<'NODE'
const { execSync } = require("node:child_process")
const { readFileSync } = require("node:fs")

function readHeadPackage() {
  return JSON.parse(execSync("git show HEAD:package.json", { encoding: "utf8" }))
}

function readWorktreePackage() {
  return JSON.parse(readFileSync("package.json", "utf8"))
}

const head = readHeadPackage()
const worktree = readWorktreePackage()
const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]

for (const field of fields) {
  const before = JSON.stringify(head[field] || {}, null, 2)
  const after = JSON.stringify(worktree[field] || {}, null, 2)

  if (before !== after) {
    console.error(`SUMMARY: ${field} changed unexpectedly`)
    process.exit(1)
  }
}
NODE
then
  echo "SUMMARY: dependency sections unchanged"
else
  git diff -- package.json package-lock.json pnpm-lock.yaml || true
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

tail -n 50 "$BUILD_LOG" || true
echo "LOG: $BUILD_LOG"
echo "SUMMARY: stop current load analytics checks completed successfully"
