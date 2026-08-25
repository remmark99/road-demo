import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function getAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export function secretsEqual(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false
  const actualHash = createHash("sha256").update(actual).digest()
  const expectedHash = createHash("sha256").update(expected).digest()
  return timingSafeEqual(actualHash, expectedHash)
}
