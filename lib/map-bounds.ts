// Геометрия карты Сургута: единственный источник правды для компонента карты и
// для scripts/fetch-map-tiles.mjs. Скрипт — обычный .mjs (на сервере Node 20,
// типы он стрипать не умеет), поэтому числа лежат в map-bounds.json, а не здесь.
import config from "./map-bounds.json"

export const MAP_CENTER = config.center

/** Сторона видимого прямоугольника, км. Дальше пользователь не уедет. */
export const MAP_BOX_KM = config.mapBoxKm
/** Тайлы качаем с запасом: у края maxBounds углы экрана заглядывают за границу. */
export const TILE_BOX_KM = config.tileBoxKm

export const MIN_ZOOM = config.minZoom
export const MAX_ZOOM = config.maxZoom
/** Глубже планета OpenFreeMap не нарезана, z15+ MapLibre дорисовывает overzoom'ом. */
export const TILE_MAX_ZOOM = config.tileMaxZoom

/** Квадрат со стороной `km` вокруг центра города: [west, south, east, north]. */
export function boxAround(km: number): [number, number, number, number] {
  const dLat = km / 2 / 111.32
  const dLng = dLat / Math.cos((MAP_CENTER.lat * Math.PI) / 180)
  return [
    MAP_CENTER.lng - dLng,
    MAP_CENTER.lat - dLat,
    MAP_CENTER.lng + dLng,
    MAP_CENTER.lat + dLat,
  ]
}

export const MAP_BBOX = boxAround(MAP_BOX_KM)
export const TILE_BBOX = boxAround(TILE_BOX_KM)

/** Формат maplibre `maxBounds`: [[west, south], [east, north]]. */
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [MAP_BBOX[0], MAP_BBOX[1]],
  [MAP_BBOX[2], MAP_BBOX[3]],
]
