#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/tmp"
LINT_LOG="$LOG_DIR/check-stop-current-load-analytics-lint.log"
BUILD_LOG="$LOG_DIR/check-stop-current-load-analytics-build.log"

mkdir -p "$LOG_DIR"

cd "$ROOT_DIR"

echo "SUMMARY: starting stop analytics redesign checks"

if npm run lint -- \
  app/dashboard/page.tsx \
  components/dashboard/stop-current-load-analytics.tsx \
  components/dashboard/stop-kpi-current-analytics.tsx \
  components/dashboard/stop-kpi-plan-analytics.tsx \
  components/dashboard/stop-district-current-analytics.tsx \
  components/dashboard/stop-district-plan-analytics.tsx \
  components/dashboard/stop-condition-current-analytics.tsx \
  components/dashboard/stop-lying-person-analytics.tsx \
  components/dashboard/condition-analytics.tsx \
  components/dashboard/security-analytics.tsx \
  components/dashboard/passenger-analytics.tsx \
  components/dashboard/vandalism-analytics.tsx \
  components/dashboard/warmstop-analytics.tsx \
  lib/api/busyness-windows.ts \
  lib/api/stop-condition-windows.ts \
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

if rg -q "stopModes|Режим аналитики остановок|Текущее состояние|План" app/dashboard/page.tsx \
  && rg -q "StopKpiPlanAnalytics|StopDistrictPlanAnalytics|StopConditionCurrentAnalytics" app/dashboard/page.tsx \
  && rg -q "Загруженность остановок|Показатели остановок|Районы|Состояние остановок|Вандализм" app/dashboard/page.tsx; then
  echo "SUMMARY: stop mode toggle and unified sidebar labels found"
else
  echo "SUMMARY: stop mode toggle or labels missing"
  exit 1
fi

if rg -q "dashboard/(8|9)|kpi_bus_stops|STOPS_CURRENT_DASHBOARDS|STOPS_PLAN_DASHBOARDS|groups:" app/dashboard/page.tsx; then
  echo "SUMMARY: old stop Superset or duplicated stop sidebar structure is still present"
  rg -n "dashboard/(8|9)|kpi_bus_stops|STOPS_CURRENT_DASHBOARDS|STOPS_PLAN_DASHBOARDS|groups:" app/dashboard/page.tsx || true
  exit 1
else
  echo "SUMMARY: stop Superset iframes removed and sidebar is unified"
fi

if rg -q "STOP_DISTRICT_COVERAGE_ESTIMATES|coverageLabel|estimatedTotalMin|estimatedTotalMax" lib/stop-analytics-config.ts \
  && rg -q "coverageLabel|estimatedTotalLabel" components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx; then
  echo "SUMMARY: district coverage estimates are wired into current analytics"
else
  echo "SUMMARY: district coverage estimates are missing"
  exit 1
fi

if rg -q "fetchStopTrashOverflowAlerts|STOP_TRASH_OVERFLOW_ALERT_TYPES|bin_full" lib/api/stop-condition-windows.ts \
  && rg -q "buildTrashOverflowEpisodes|OVERFLOW_EPISODE_GAP_MS|getStopCameraIndexCandidates|Эпизоды переполнения|Суммарная длительность" components/dashboard/stop-condition-current-analytics.tsx; then
  echo "SUMMARY: event-based trash overflow duration analytics found"
else
  echo "SUMMARY: event-based trash overflow duration analytics missing"
  exit 1
fi

if rg -q "TRASH_ATTENTION_THRESHOLD|TRASH_CRITICAL_THRESHOLD|avgFill|maxFill|trash_fill_avg|trash_fill_max|fill_percent|overflow_percent|Пиковое заполнение|Среднее заполнение|порог включения" components/dashboard/stop-condition-current-analytics.tsx; then
  echo "SUMMARY: current stop condition page still contains percent-based trash overflow logic"
  rg -n "TRASH_ATTENTION_THRESHOLD|TRASH_CRITICAL_THRESHOLD|avgFill|maxFill|trash_fill_avg|trash_fill_max|fill_percent|overflow_percent|Пиковое заполнение|Среднее заполнение|порог включения" components/dashboard/stop-condition-current-analytics.tsx || true
  exit 1
else
  echo "SUMMARY: current stop condition page uses event duration logic without trash percentage thresholds"
fi

if rg -q "lib/mock/condition|conditionReadingsData|conditionAlertsData|fogging|Стекло|Запотевание" components/dashboard/stop-condition-current-analytics.tsx; then
  echo "SUMMARY: current stop condition page still imports or mentions plan/mock condition data"
  rg -n "lib/mock/condition|conditionReadingsData|conditionAlertsData|fogging|Стекло|Запотевание" components/dashboard/stop-condition-current-analytics.tsx || true
  exit 1
else
  echo "SUMMARY: current stop condition page stays trash-only and live-data only"
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

if rg -q "100 из 436|live-данные|Live-данные|busyness_windows:|справочник bus_stops|module_name = stops|по metadata\\.location_id|уникальные camera_index|В таблице alerts|Реальные записи alerts|Heatmap:" components/dashboard/stop-current-load-analytics.tsx components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx components/dashboard/stop-lying-person-analytics.tsx; then
  echo "SUMMARY: technical English labels are still visible in stop analytics"
  rg -n "100 из 436|live-данные|Live-данные|busyness_windows:|справочник bus_stops|module_name = stops|по metadata\\.location_id|уникальные camera_index|В таблице alerts|Реальные записи alerts|Heatmap:" components/dashboard/stop-current-load-analytics.tsx components/dashboard/stop-kpi-current-analytics.tsx components/dashboard/stop-district-current-analytics.tsx components/dashboard/stop-lying-person-analytics.tsx || true
  exit 1
else
  echo "SUMMARY: visible stop analytics labels are localized"
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
echo "SUMMARY: stop analytics redesign checks completed successfully"
