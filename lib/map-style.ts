import type { StyleSpecification } from "maplibre-gl"

// Подложка по умолчанию — локальное зеркало OpenFreeMap в public/map, которое
// кладёт scripts/fetch-map-tiles.mjs: у части клиентов браузер не вытягивает
// tiles.openfreemap.org, и карта грузится рывками или не грузится вовсе.
// NEXT_PUBLIC_MAP_TILES=remote возвращает исходные стили — на случай, если с
// зеркалом что-то не так и чинить надо прямо сейчас.
const USE_REMOTE_TILES = process.env.NEXT_PUBLIC_MAP_TILES === "remote"

const REMOTE_STYLE = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
}

const LOCAL_STYLE = {
  dark: "/api/map/styles/dark.json",
  light: "/api/map/styles/positron.json",
}

/**
 * Зеркало генерится с относительными URL, чтобы не зависеть от домена, а
 * MapLibre внутри стиля принимает только абсолютные. Подставляем origin
 * конкатенацией: new URL() закодировал бы {z}/{x}/{y} в %7Bz%7D.
 */
function absolutize(style: StyleSpecification): StyleSpecification {
  const origin = window.location.origin
  const abs = (url: string) => (url.startsWith("/") ? origin + url : url)

  if (typeof style.sprite === "string") style.sprite = abs(style.sprite)
  if (style.glyphs) style.glyphs = abs(style.glyphs)
  for (const source of Object.values(style.sources)) {
    if ("tiles" in source && source.tiles) source.tiles = source.tiles.map(abs)
  }
  return style
}

/** Стиль для MapLibre: URL — для апстрима, готовый объект — для зеркала. */
export async function loadMapStyle(isDark: boolean): Promise<string | StyleSpecification> {
  const theme = isDark ? "dark" : "light"
  if (USE_REMOTE_TILES) return REMOTE_STYLE[theme]

  const response = await fetch(LOCAL_STYLE[theme])
  if (!response.ok) {
    throw new Error(
      `Локальный стиль карты недоступен (HTTP ${response.status}). ` +
      `Выполните 'npm run map:fetch' или поставьте NEXT_PUBLIC_MAP_TILES=remote.`
    )
  }
  return absolutize(await response.json())
}
