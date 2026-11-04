import { getSupabaseUrl } from '@/lib/supabase/endpoint'
import "server-only"

import { createClient } from "@supabase/supabase-js"

export function createNotificationAdminClient() {
  const url = getSupabaseUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role is not configured")
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
