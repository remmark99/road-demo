export const MAX_FULL_NAME_LENGTH = 200
export const MAX_PHONE_LENGTH = 32

/** Collapses whitespace and trims; empty input becomes null. */
export function normalizeFullName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().replace(/\s+/g, " ")
  return normalized ? normalized : null
}

/** Keeps the user's own formatting, only trimming; empty input becomes null. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().replace(/\s+/g, " ")
  return normalized ? normalized : null
}

export function isValidFullName(value: string) {
  return value.length <= MAX_FULL_NAME_LENGTH
}

export function isValidPhone(value: string) {
  if (value.length > MAX_PHONE_LENGTH) return false
  if (!/^[+()\-\s\d]+$/.test(value)) return false
  const digits = value.replace(/\D/g, "")
  return digits.length >= 5 && digits.length <= 15
}

/** What to show as the user's name: ФИО when set, otherwise the email. */
export function getDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
) {
  return normalizeFullName(fullName) ?? email ?? ""
}

/** Compact variant for the navbar trigger: ФИО when set, otherwise the email local part. */
export function getShortDisplayName(
  fullName: string | null | undefined,
  email: string | null | undefined,
) {
  return normalizeFullName(fullName) ?? email?.split("@")[0] ?? ""
}
