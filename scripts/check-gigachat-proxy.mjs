#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { setDefaultResultOrder } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as tlsConnect } from "node:tls";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";

setDefaultResultOrder("ipv4first");

const DEFAULT_AUTH_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth";
const DEFAULT_API_BASE_URL = "https://gigachat.devices.sberbank.ru/api/v1";
const DEFAULT_SCOPE = "GIGACHAT_API_PERS";
const DEFAULT_MODEL = "GigaChat-2-Max";
const DEFAULT_TIMEOUT_MS = 15_000;
let cachedExtraCaCert;

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
    process.env[match[1]] = cleanEnvValue(match[2]);
  }
}

function cleanEnvValue(value) {
  const trimmed = String(value || "").trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
}

function stripInlineComment(value) {
  return value.replace(/\s+#.*$/, "").trim();
}

function normalizeRawProxyUrl(rawProxyUrl) {
  const value = stripInlineComment(cleanEnvValue(rawProxyUrl));
  if (!value) {
    return "";
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }
  return `http://${value}`;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseProxyUrlLenient(proxyUrl) {
  const normalized = normalizeRawProxyUrl(proxyUrl);
  const match = normalized.match(/^(https?):\/\/(.+)$/i);
  if (!match || match[1].toLowerCase() !== "http") {
    throw new Error("invalid proxy url");
  }

  const withoutPath = match[2].split(/[/?]/, 1)[0];
  const atIndex = withoutPath.lastIndexOf("@");
  const rawAuth = atIndex >= 0 ? withoutPath.slice(0, atIndex) : "";
  const rawHostPort = atIndex >= 0 ? withoutPath.slice(atIndex + 1) : withoutPath;
  const colonIndex = rawHostPort.lastIndexOf(":");
  const hostname = colonIndex > 0 ? rawHostPort.slice(0, colonIndex) : rawHostPort;
  const port = colonIndex > 0 ? rawHostPort.slice(colonIndex + 1) : "8080";

  if (!hostname || !/^\d+$/.test(port)) {
    throw new Error("invalid proxy host or port");
  }

  const authColonIndex = rawAuth.indexOf(":");
  return {
    hostname,
    port,
    username: safeDecodeURIComponent(authColonIndex >= 0 ? rawAuth.slice(0, authColonIndex) : rawAuth),
    password: safeDecodeURIComponent(authColonIndex >= 0 ? rawAuth.slice(authColonIndex + 1) : ""),
  };
}

function parseProxyUrl(proxyUrl) {
  const normalized = normalizeRawProxyUrl(proxyUrl);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" || !parsed.hostname) {
      throw new Error("unsupported proxy url");
    }
    return {
      hostname: parsed.hostname,
      port: parsed.port || "8080",
      username: safeDecodeURIComponent(parsed.username),
      password: safeDecodeURIComponent(parsed.password),
    };
  } catch {
    return parseProxyUrlLenient(proxyUrl);
  }
}

function getProxyConfig() {
  const proxyUrl = cleanEnvValue(process.env.GIGACHAT_PROXY_URL);
  if (proxyUrl) {
    return parseProxyUrl(proxyUrl);
  }

  const host = cleanEnvValue(process.env.GIGACHAT_PROXY_HOST);
  if (!host) {
    return null;
  }

  const protocol = cleanEnvValue(process.env.GIGACHAT_PROXY_PROTOCOL) || "http";
  if (protocol !== "http") {
    throw new Error("only HTTP CONNECT proxy is supported");
  }

  const port = cleanEnvValue(process.env.GIGACHAT_PROXY_PORT) || "8080";
  if (!/^\d+$/.test(port)) {
    throw new Error("GIGACHAT_PROXY_PORT must be numeric");
  }

  return {
    hostname: host,
    port,
    username: cleanEnvValue(process.env.GIGACHAT_PROXY_USERNAME),
    password: cleanEnvValue(process.env.GIGACHAT_PROXY_PASSWORD),
  };
}

function isProxyRequired() {
  const value = cleanEnvValue(process.env.GIGACHAT_PROXY_REQUIRED).toLowerCase();
  if (!value) {
    return true;
  }
  return value === "1" || value === "true" || value === "yes";
}

function getExtraCaCert() {
  if (cachedExtraCaCert !== undefined) {
    return cachedExtraCaCert || undefined;
  }

  const caPath = cleanEnvValue(process.env.GIGACHAT_CA_CERT_PATH || process.env.NODE_EXTRA_CA_CERTS);
  if (!caPath) {
    cachedExtraCaCert = null;
    return undefined;
  }

  try {
    cachedExtraCaCert = readFileSync(caPath, "utf8");
  } catch {
    cachedExtraCaCert = null;
  }

  return cachedExtraCaCert || undefined;
}

function getTimeoutMs() {
  const value = Number(process.env.GIGACHAT_REQUEST_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 120_000) : DEFAULT_TIMEOUT_MS;
}

function getAuthHeader() {
  const authKey = cleanEnvValue(process.env.GIGACHAT_AUTH_KEY || process.env.GIGACHAT_CREDENTIALS);
  if (!authKey) {
    throw new Error("GIGACHAT_AUTH_KEY is not configured");
  }
  return authKey.toLowerCase().startsWith("basic ") ? authKey : `Basic ${authKey}`;
}

function createProxyTlsSocket(target, proxy, timeoutMs) {
  const targetPort = target.port || "443";
  const headers = {
    Host: `${target.hostname}:${targetPort}`,
  };

  if (proxy.username || proxy.password) {
    headers["Proxy-Authorization"] = `Basic ${Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64")}`;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let hardTimeout;
    const finish = (error, socket) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(hardTimeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(socket);
    };
    const connectRequest = httpRequest({
      hostname: proxy.hostname,
      port: proxy.port,
      method: "CONNECT",
      path: `${target.hostname}:${targetPort}`,
      headers,
      timeout: timeoutMs,
    });
    hardTimeout = setTimeout(() => {
      const error = new Error("GigaChat proxy CONNECT timed out");
      error.code = "ETIMEDOUT";
      connectRequest.destroy(error);
      finish(error);
    }, timeoutMs);

    connectRequest.once("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        finish(new Error(`GigaChat proxy CONNECT error ${response.statusCode}`));
        return;
      }

      const tlsSocket = tlsConnect({
        socket,
        servername: target.hostname,
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.2",
        ca: getExtraCaCert(),
      });
      tlsSocket.once("secureConnect", () => finish(null, tlsSocket));
      tlsSocket.once("error", finish);
    });

    connectRequest.once("timeout", () => {
      const error = new Error("GigaChat proxy CONNECT timed out");
      error.code = "ETIMEDOUT";
      connectRequest.destroy(error);
      finish(error);
    });
    connectRequest.once("error", finish);
    connectRequest.end();
  });
}

function postText(url, headers, body, proxy, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = Buffer.from(body, "utf8");
    const started = performance.now();
    const request = httpsRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        family: 4,
        minVersion: "TLSv1.2",
        maxVersion: "TLSv1.2",
        ca: getExtraCaCert(),
        agent: false,
        createConnection: proxy
          ? (_options, callback) => {
              createProxyTlsSocket(target, proxy, timeoutMs)
                .then((socket) => callback(null, socket))
                .catch((error) => callback(error, null));
              return null;
            }
          : undefined,
        headers: {
          ...headers,
          "Content-Length": String(payload.byteLength),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            status: response.statusCode || 0,
            text: Buffer.concat(chunks).toString("utf8"),
            ms: Math.round(performance.now() - started),
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      const error = new Error("GigaChat request timed out");
      error.code = "ETIMEDOUT";
      request.destroy(error);
    });
    request.once("error", reject);
    request.write(payload);
    request.end();
  });
}

async function main() {
  loadDotEnvIfPresent();
  const timeoutMs = getTimeoutMs();
  const authUrl = cleanEnvValue(process.env.GIGACHAT_AUTH_URL) || DEFAULT_AUTH_URL;
  const apiBaseUrl = (cleanEnvValue(process.env.GIGACHAT_API_BASE_URL) || DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const scope = cleanEnvValue(process.env.GIGACHAT_SCOPE) || DEFAULT_SCOPE;
  const model = cleanEnvValue(process.env.GIGACHAT_MODEL) || DEFAULT_MODEL;
  const proxyRequired = isProxyRequired();
  let proxy = null;
  let proxyError = "";

  try {
    proxy = getProxyConfig();
  } catch (error) {
    proxyError = error instanceof Error ? error.message : String(error);
  }

  console.log("SUMMARY");
  console.log(`CONFIG hasAuthKey=${Boolean(cleanEnvValue(process.env.GIGACHAT_AUTH_KEY || process.env.GIGACHAT_CREDENTIALS))}`);
  console.log(`CONFIG scope=${scope}`);
  console.log(`CONFIG model=${model}`);
  console.log(`CONFIG proxyRequired=${proxyRequired}`);
  console.log(`CONFIG proxyConfigured=${Boolean(proxy)}`);
  console.log(`CONFIG proxyHost=${proxy?.hostname || ""}`);
  console.log(`CONFIG proxyPort=${proxy?.port || ""}`);
  console.log(`CONFIG nodeExtraCaCerts=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "not-set"}`);
  console.log(`CONFIG extraCaLoaded=${getExtraCaCert() ? "true" : "false"}`);

  if (proxyError) {
    console.log(`FAIL proxy_config error=${proxyError}`);
    console.log("RESULT failed");
    process.exitCode = 1;
    return;
  }

  if (proxyRequired && !proxy) {
    console.log("FAIL proxy_config error=proxy is required but not configured");
    console.log("RESULT failed");
    process.exitCode = 1;
    return;
  }

  try {
    const tokenResponse = await postText(
      authUrl,
      {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        RqUID: crypto.randomUUID(),
        Authorization: getAuthHeader(),
      },
      new URLSearchParams({ scope }).toString(),
      proxy,
      timeoutMs,
    );

    console.log(`${tokenResponse.status >= 200 && tokenResponse.status < 300 ? "OK" : "FAIL"} oauth status=${tokenResponse.status} time_ms=${tokenResponse.ms}`);
    if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
      throw new Error(`OAuth HTTP ${tokenResponse.status}`);
    }

    const tokenPayload = JSON.parse(tokenResponse.text);
    if (!tokenPayload.access_token) {
      throw new Error("OAuth response does not contain access_token");
    }

    const chatResponse = await postText(
      `${apiBaseUrl}/chat/completions`,
      {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
      JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: "system", content: "Ответь коротко." },
          { role: "user", content: "Проверка связи. Ответь: готов." },
        ],
      }),
      proxy,
      timeoutMs,
    );

    console.log(`${chatResponse.status >= 200 && chatResponse.status < 300 ? "OK" : "FAIL"} completion status=${chatResponse.status} time_ms=${chatResponse.ms}`);
    if (chatResponse.status < 200 || chatResponse.status >= 300) {
      throw new Error(`Completion HTTP ${chatResponse.status}`);
    }

    console.log("RESULT ok");
  } catch (error) {
    console.log(`FAIL gigachat error=${error instanceof Error ? error.message : String(error)}`);
    console.log("RESULT failed");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SUMMARY");
  console.error(`FAIL unexpected_error=${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
