#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const DEFAULT_TIMEOUT_MS = 45_000;
const RAW_TIMEOUT_PATTERN = /GigaChat completion timeout|GigaChat request timed out|ETIMEDOUT|Tool '.+' timeout/i;
const PLOT_PATH_PATTERN = /\/plots\/plot_\d+\.png/g;

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    mode: "stops",
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--base-url") {
      args.baseUrl = argv[++i];
    } else if (item === "--mode") {
      args.mode = argv[++i];
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

function loadDotEnvIfPresent() {
  if (!existsSync(".env")) {
    return;
  }

  const lines = readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function normalizeMcpHealthUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }
  return `${rawUrl.replace(/\/$/, "").replace(/\/(?:mcp|sse)$/, "")}/health`;
}

async function timedFetch(name, url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
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

async function chatCheck(baseUrl, mode, question, timeoutMs) {
  return timedFetch(
    `chat: ${question.slice(0, 36)}`,
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        messages: [
          {
            id: `smoke-${Date.now()}`,
            role: "user",
            content: question,
          },
        ],
      }),
    },
    timeoutMs,
  );
}

function resultLine(result) {
  const status = result.ok ? "OK" : "FAIL";
  return `${status} ${result.name} status=${result.status} time_ms=${result.ms}`;
}

function assertNoRawTimeout(result) {
  return !RAW_TIMEOUT_PATTERN.test(result.text);
}

function preview(text) {
  return text.replace(/\s+/g, " ").slice(0, 500);
}

async function main() {
  loadDotEnvIfPresent();
  const args = parseArgs(process.argv.slice(2));
  const results = [];
  const failures = [];

  const health = await timedFetch("site: /ai-assistant", `${args.baseUrl}/ai-assistant`, {}, args.timeoutMs);
  results.push(health);

  const mcpHealthUrl = normalizeMcpHealthUrl(process.env.MCP_SERVER_URL);
  if (mcpHealthUrl) {
    const mcpHealth = await timedFetch("mcp: /health", mcpHealthUrl, {}, Math.min(args.timeoutMs, 10_000));
    results.push(mcpHealth);
  }

  const load = await chatCheck(
    args.baseUrl,
    args.mode,
    "Покажи текущую загруженность остановок и выдели самые напряженные направления.",
    args.timeoutMs,
  );
  results.push(load);

  const safety = await chatCheck(
    args.baseUrl,
    args.mode,
    "Есть ли свежие события безопасности по остановкам?",
    args.timeoutMs,
  );
  results.push(safety);

  const graph = await chatCheck(
    args.baseUrl,
    args.mode,
    "Построй график текущей загруженности остановок.",
    args.timeoutMs,
  );
  results.push(graph);

  const plotPath = [...graph.text.matchAll(PLOT_PATH_PATTERN)].at(-1)?.[0] || null;
  if (plotPath) {
    const plot = await timedFetch("site: plot proxy", `${args.baseUrl}/api${plotPath}`, {}, Math.min(args.timeoutMs, 15_000));
    results.push(plot);
  } else {
    failures.push("No /plots/plot_*.png path found in graph response.");
  }

  for (const result of results) {
    if (!result.ok) {
      failures.push(`${result.name} failed: ${preview(result.text)}`);
    }
    if (!assertNoRawTimeout(result)) {
      failures.push(`${result.name} exposed raw timeout text.`);
    }
  }

  console.log("SUMMARY");
  for (const result of results) {
    console.log(resultLine(result));
  }
  if (plotPath) {
    console.log(`OK graph_path=${plotPath}`);
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
