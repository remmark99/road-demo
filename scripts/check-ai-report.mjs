#!/usr/bin/env node

import { performance } from "node:perf_hooks";

const DEFAULT_TIMEOUT_MS = 45_000;

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--base-url") {
      args.baseUrl = argv[++i];
    } else if (item === "--timeout-ms") {
      args.timeoutMs = Number(argv[++i]);
    }
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    args.timeoutMs = DEFAULT_TIMEOUT_MS;
  }

  args.baseUrl = args.baseUrl.replace(/\/$/, "");
  return args;
}

async function timedFetch(name, url, options, timeoutMs) {
  const started = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      name,
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      text,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      text: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function preview(text) {
  return text.replace(/\s+/g, " ").slice(0, 500);
}

function validateReport(payload) {
  const failures = [];

  if (!payload || typeof payload !== "object") {
    return ["Response is not an object."];
  }

  if (payload.ok !== true) {
    failures.push("Payload ok is not true.");
  }

  if (payload.source !== "gigachat" && payload.source !== "template-fallback") {
    failures.push("Payload source is not gigachat/template-fallback.");
  }

  if (typeof payload.title !== "string" || payload.title.length < 5) {
    failures.push("Payload title is missing.");
  }

  if (!Array.isArray(payload.sections) || payload.sections.length === 0) {
    failures.push("Payload sections are missing.");
  }

  if (!Array.isArray(payload.recommendations) || payload.recommendations.length === 0) {
    failures.push("Payload recommendations are missing.");
  }

  return failures;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await timedFetch(
    "report: /api/reports/ai",
    `${args.baseUrl}/api/reports/ai`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Сформируй короткий отчет по остановкам: загруженность, безопасность, рекомендации диспетчеру.",
        period: {
          from: "2025-01-01",
          to: "2026-06-14",
        },
      }),
    },
    args.timeoutMs,
  );

  const failures = [];
  let payload = null;

  if (!result.ok) {
    failures.push(`${result.name} failed: ${preview(result.text)}`);
  } else {
    try {
      payload = JSON.parse(result.text);
      failures.push(...validateReport(payload));
    } catch {
      failures.push(`Response is not valid JSON: ${preview(result.text)}`);
    }
  }

  console.log("SUMMARY");
  console.log(`${result.ok ? "OK" : "FAIL"} ${result.name} status=${result.status} time_ms=${result.ms}`);
  if (payload?.source) {
    console.log(`OK report_source=${payload.source}`);
  }
  if (payload?.title) {
    console.log(`OK report_title=${payload.title}`);
  }

  if (failures.length > 0) {
    console.log("FAILURES");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("RESULT ok");
}

main().catch((error) => {
  console.error("SUMMARY");
  console.error(`FAIL unexpected_error=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
