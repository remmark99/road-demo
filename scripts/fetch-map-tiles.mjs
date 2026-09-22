#!/usr/bin/env node
/**
 * Зеркалит подложку OpenFreeMap для прямоугольника вокруг Сургута в public/map/.
 *
 * Зачем: у части клиентов браузер не вытягивает tiles.openfreemap.org, и карта
 * загружается рывками или не загружается вовсе. После выкачки приложение отдаёт
 * подложку со своего origin через app/api/map/[...path]/route.ts.
 *
 *   node scripts/fetch-map-tiles.mjs [--force]
 *
 * Обычный .mjs без зависимостей: на сервере Node 20, типы он стрипать не умеет.
 * Геометрия берётся из lib/map-bounds.json — того же файла, что читает карта.
 */

import { mkdir, writeFile, stat } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import path from "node:path"
import { fileURLToPath } from "node:url"

const UPSTREAM = "https://tiles.openfreemap.org"
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = path.join(ROOT, "public", "map")
const CONCURRENCY = 6
const RETRIES = 3

const FORCE = process.argv.includes("--force")
const cfg = JSON.parse(readFileSync(path.join(ROOT, "lib", "map-bounds.json"), "utf8"))

const STYLES = ["positron", "dark"]
/** Стеки из layout.text-font обоих стилей. */
const FONTSTACKS = ["Noto Sans Regular", "Noto Sans Italic", "Noto Sans Bold"]
/** Латиница, латиница-расширенная, кириллица, типографская пунктуация. */
const GLYPH_RANGES = ["0-255", "256-511", "1024-1279", "8192-8447"]
const SPRITE_DIR = "ofm_f384"

// Формула продублирована из lib/map-bounds.ts — там её же читает компонент карты.
function boxAround(km) {
  const dLat = km / 2 / 111.32
  const dLng = dLat / Math.cos((cfg.center.lat * Math.PI) / 180)
  return [
    cfg.center.lng - dLng,
    cfg.center.lat - dLat,
    cfg.center.lng + dLng,
    cfg.center.lat + dLat,
  ]
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/**
 * Апстрим отдаёт gzip только при Accept-Encoding: gzip, а undici в этом случае
 * распакует ответ за нас — забираем identity и жмём сами, чтобы положить на диск
 * уже сжатое и не тратить CPU на каждый запрос клиента.
 */
async function fetchBuf(url) {
  let lastErr
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "accept-encoding": "identity" } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      lastErr = err
      if (attempt < RETRIES) await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }
  throw new Error(`${url}: ${lastErr?.message ?? "unknown error"}`)
}

/** Сжимаемое кладём как <имя>.gz — роут по наличию суффикса ставит Content-Encoding. */
async function save(relPath, buf, compress) {
  const dest = path.join(OUT, compress ? `${relPath}.gz` : relPath)
  await mkdir(path.dirname(dest), { recursive: true })
  await writeFile(dest, compress ? gzipSync(buf, { level: 9 }) : buf)
  return dest
}

async function exists(relPath, compress) {
  try {
    await stat(path.join(OUT, compress ? `${relPath}.gz` : relPath))
    return true
  } catch {
    return false
  }
}

async function runPool(jobs, onDone) {
  let next = 0
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++]
      onDone(await job())
    }
  })
  await Promise.all(workers)
}

function localizeStyle(style, attribution, bbox) {
  // ne2_shaded — рельеф Natural Earth, он виден только до z6. Карта ограничена
  // minZoom, до этих зумов пользователь не доедет, поэтому источник выкидываем.
  delete style.sources.ne2_shaded
  style.layers = style.layers.filter(layer => layer.source !== "ne2_shaded")

  style.sources.openmaptiles = {
    type: "vector",
    tiles: ["/api/map/tiles/{z}/{x}/{y}.pbf"],
    minzoom: 0,
    maxzoom: cfg.tileMaxZoom,
    bounds: bbox,
    attribution,
  }
  style.glyphs = "/api/map/fonts/{fontstack}/{range}.pbf"
  style.sprite = "/api/map/sprites/ofm"
  return style
}

async function main() {
  const bbox = boxAround(cfg.tileBoxKm)
  console.log(
    `SUMMARY: bbox ${cfg.tileBoxKm} км ${bbox.map(v => v.toFixed(5)).join(", ")}, z0-${cfg.tileMaxZoom}`
  )

  const tilejson = await fetchBuf(`${UPSTREAM}/planet`).then(b => JSON.parse(b.toString("utf8")))
  const tileTemplate = tilejson.tiles[0]
  const planetVersion = tileTemplate.match(/\/planet\/([^/]+)\//)?.[1] ?? "unknown"
  console.log(`SUMMARY: планета ${planetVersion}`)

  const jobs = []
  const stats = { saved: 0, skipped: 0, empty: 0, bytes: 0 }
  const record = r => {
    if (!r) return
    stats[r.kind]++
    stats.bytes += r.bytes ?? 0
  }

  const addAsset = (url, relPath, compress) => {
    jobs.push(async () => {
      if (!FORCE && (await exists(relPath, compress))) return { kind: "skipped" }
      const buf = await fetchBuf(url)
      if (!buf) return { kind: "empty" }
      await save(relPath, buf, compress)
      return { kind: "saved", bytes: buf.length }
    })
  }

  for (let z = 0; z <= cfg.tileMaxZoom; z++) {
    const x0 = lon2x(bbox[0], z)
    const x1 = lon2x(bbox[2], z)
    const y0 = lat2y(bbox[3], z)
    const y1 = lat2y(bbox[1], z)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const url = tileTemplate.replace("{z}", z).replace("{x}", x).replace("{y}", y)
        addAsset(url, path.join("tiles", String(z), String(x), `${y}.pbf`), true)
      }
    }
  }
  console.log(`SUMMARY: тайлов в боксе ${jobs.length}`)

  for (const stack of FONTSTACKS) {
    for (const range of GLYPH_RANGES) {
      addAsset(
        `${UPSTREAM}/fonts/${encodeURIComponent(stack)}/${range}.pbf`,
        path.join("fonts", stack, `${range}.pbf`),
        true
      )
    }
  }

  for (const name of ["ofm.json", "ofm.png", "ofm@2x.json", "ofm@2x.png"]) {
    const isPng = name.endsWith(".png")
    addAsset(
      `${UPSTREAM}/sprites/${SPRITE_DIR}/${name}`,
      path.join("sprites", name),
      !isPng
    )
  }

  await runPool(jobs, record)

  for (const name of STYLES) {
    const style = JSON.parse((await fetchBuf(`${UPSTREAM}/styles/${name}`)).toString("utf8"))
    const localized = localizeStyle(style, tilejson.attribution, bbox)
    await save(path.join("styles", `${name}.json`), Buffer.from(JSON.stringify(localized)), true)
  }

  await save(
    "manifest.json",
    Buffer.from(
      JSON.stringify(
        {
          planetVersion,
          fetchedAt: new Date().toISOString(),
          bbox,
          boxKm: cfg.tileBoxKm,
          maxzoom: cfg.tileMaxZoom,
          attribution: tilejson.attribution,
          tiles: stats,
        },
        null,
        2
      )
    ),
    false
  )

  const mb = (stats.bytes / 1024 / 1024).toFixed(1)
  console.log(
    `SUMMARY: скачано ${stats.saved}, пропущено ${stats.skipped}, пусто ${stats.empty}, ${mb} МБ до сжатия`
  )
  console.log(`SUMMARY: готово, public/map/`)
}

main().catch(err => {
  console.error(`SUMMARY: ошибка — ${err.message}`)
  process.exit(1)
})
