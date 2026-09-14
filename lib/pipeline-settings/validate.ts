// Shared by the admin form and the API route. The backend validates again with
// the same constraints (pydantic), so this only has to be at least as strict.

import type { PipelineSettingField, SettingValue } from "./types"

export type ParseResult = { value: SettingValue } | { error: string }

export function validateSettingValue(field: PipelineSettingField, value: unknown): string | null {
  const schema = field.schema

  switch (schema.type) {
    case "boolean":
      return typeof value === "boolean" ? null : "Нужно значение «да» или «нет»"

    case "string":
      if (typeof value !== "string") return "Нужен текст"
      if (schema.minLength !== undefined && value.trim().length < schema.minLength) {
        return "Не может быть пустым"
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return `Не длиннее ${schema.maxLength} символов`
      }
      return null

    case "integer":
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return "Нужно число"
      if (schema.type === "integer" && !Number.isInteger(value)) return "Нужно целое число"
      if (schema.minimum !== undefined && value < schema.minimum) {
        return `Не меньше ${schema.minimum}`
      }
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
        return `Больше ${schema.exclusiveMinimum}`
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return `Не больше ${schema.maximum}`
      }
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
        return `Меньше ${schema.exclusiveMaximum}`
      }
      return null

    default:
      return "Тип параметра не поддерживается"
  }
}

// Text typed into a form control → a typed value, or why it is not one.
export function parseSettingInput(field: PipelineSettingField, raw: string): ParseResult {
  if (field.schema.type === "string") {
    const error = validateSettingValue(field, raw)
    return error ? { error } : { value: raw }
  }

  const text = raw.trim().replace(",", ".")
  if (!text) return { error: "Введите значение" }
  const value = Number(text)
  const error = validateSettingValue(field, value)
  return error ? { error } : { value }
}

export function sameSettingValue(a: unknown, b: unknown): boolean {
  return a === b
}

// "от 0 до 1", "больше 0" — the allowed range in words, or "" when unbounded.
export function describeRange(field: PipelineSettingField): string {
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = field.schema
  const parts: string[] = []
  if (minimum !== undefined && maximum !== undefined) return `от ${minimum} до ${maximum}`
  if (minimum !== undefined) parts.push(`не меньше ${minimum}`)
  if (exclusiveMinimum !== undefined) parts.push(`больше ${exclusiveMinimum}`)
  if (maximum !== undefined) parts.push(`не больше ${maximum}`)
  if (exclusiveMaximum !== undefined) parts.push(`меньше ${exclusiveMaximum}`)
  return parts.join(", ")
}

// 90 → "1 мин 30 с", 3600 → "1 ч"; "" below a minute, where seconds read fine.
export function humanizeSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return ""
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return [hours && `${hours} ч`, minutes && `${minutes} мин`, rest && `${rest} с`]
    .filter(Boolean)
    .join(" ")
}
