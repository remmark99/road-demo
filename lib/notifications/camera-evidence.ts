import type { Alert } from '@/lib/types'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function probability(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null
}

// Severity is a configured priority, not a model score. Never convert it to accuracy.
export function cameraConfidence(alert: Pick<Alert, 'metadata' | 'alert_type'>): number | null {
  const metadata = record(alert.metadata)
  const pose = record(record(metadata.spatial_evidence).pose_evidence)
  for (const value of [metadata.confidence, metadata.stage1_confidence, metadata.detection_confidence, pose.detection_confidence]) {
    const score = probability(value)
    if (score !== null) return score
  }
  // Existing bin alerts predate structured scores; this is the classifier's
  // actual recorded probability, not the alert's fixed severity.
  if (alert.alert_type === 'bin_full' && typeof metadata.model_response === 'string') {
    const match = /^YOLO Classifier: label=overfilled, confidence=(\d+(?:\.\d+)?)$/.exec(metadata.model_response.trim())
    if (match) return probability(Number(match[1]))
  }
  const detections = Array.isArray(metadata.detections) ? metadata.detections : []
  const scores = detections.map(item => {
    const detection = record(item)
    const label = detection.class ?? detection.cls
    return label === alert.alert_type ? probability(detection.confidence) : null
  }).filter((value): value is number => value !== null)
  return scores.length ? Math.max(...scores) : null
}

export function formatCameraConfidence(alert: Pick<Alert, 'metadata' | 'alert_type'>): string {
  const score = cameraConfidence(alert)
  return score === null ? 'Нет данных' : `${Number((score * 100).toFixed(1)).toLocaleString('ru-RU')} %`
}

// The last positive observation is not proof that the incident has ended.
export function closedEpisodeImage(metadata: unknown): string | null {
  const value = record(metadata).closed_image_url
  return typeof value === 'string' && value.trim() ? value : null
}
