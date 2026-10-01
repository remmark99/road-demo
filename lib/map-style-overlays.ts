import type { StyleSpecification } from 'maplibre-gl'

// All application layers use GeoJSON sources. Carry their current data,
// filters and visibility into the replacement base style, including FOV/coverage.
export function preserveMapOverlays(previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!previous) return next
  const overlays = Object.fromEntries(Object.entries(previous.sources).filter(([id, source]) => source.type === 'geojson' && !(id in next.sources)))
  const nextIds = new Set(next.layers.map(layer => layer.id))
  const layers = previous.layers.filter(layer => 'source' in layer && typeof layer.source === 'string' && layer.source in overlays && !nextIds.has(layer.id))
  return { ...next, sources: { ...next.sources, ...overlays }, layers: [...next.layers, ...layers] }
}
