export type RatingTone = "healthy" | "attention" | "critical"

export const RATING_MAX = 10
export const RATING_TARGET = 7.5
export const RATING_ATTENTION = 5.5
export const RATING_CURVE_DIVISOR = 9

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

export function roundRating(value: number) {
    return Math.round(clamp(value, 0, RATING_MAX) * 10) / 10
}

export function formatRating(value: number | null | undefined) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "0.0"
    }

    return roundRating(value).toFixed(1)
}

export function getRating(scoreLoad: number, divisor = RATING_CURVE_DIVISOR) {
    const safeLoad = Math.max(scoreLoad, 0)
    return roundRating(RATING_MAX * Math.exp(-safeLoad / divisor))
}

export function getRatingBandLabel(score: number) {
    if (score >= RATING_TARGET) return "Нормальный режим"
    if (score >= RATING_ATTENTION) return "Нужно внимание"
    return "Нужен выезд"
}

export function getRatingTone(score: number): RatingTone {
    if (score >= RATING_TARGET) return "healthy"
    if (score >= RATING_ATTENTION) return "attention"
    return "critical"
}
