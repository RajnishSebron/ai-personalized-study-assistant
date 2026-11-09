import { createClient } from "@supabase/supabase-js";
import { requiredEnv } from "@/lib/env";
/** Server-only client. Never import this module from a Client Component. */
export function createAdminClient() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
