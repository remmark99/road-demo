// Re-export a singleton browser client for backward compatibility.
// New code should use `createClient()` from '@/lib/supabase/client' instead.
import { createClient } from '@/lib/supabase/client'

export const supabase = createClient()
