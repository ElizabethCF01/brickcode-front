// Supabase client, initialised from env vars (anon key only — RLS + the
// submit_session RPC are the real guardrails; see docs/architecture.md §Backend).
//
// For local dev, `supabase start` prints VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY;
// put them in .env.local (gitignored). NEVER use the service_role key here.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Read env lazily (not at module load) so the value is captured on first use.
// In the built app Vite static-replaces import.meta.env either way; reading
// lazily also keeps the module testable (env can be set before the first call).
function readEnv(): { url?: string; anonKey?: string } {
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

let _client: SupabaseClient | null = null

/**
 * Returns the shared Supabase client, or null if env vars are absent. Returning
 * null (rather than throwing) lets the simulator run fully offline — sessions
 * still buffer in the outbox and flush once the backend is configured.
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client
  const { url, anonKey } = readEnv()
  if (!url || !anonKey) return null
  _client = createClient(url, anonKey)
  return _client
}

/** Whether the backend is configured (env vars present). */
export function isBackendConfigured(): boolean {
  const { url, anonKey } = readEnv()
  return Boolean(url && anonKey)
}
