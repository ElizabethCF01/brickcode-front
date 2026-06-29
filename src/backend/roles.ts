import { getSupabase } from './supabaseClient'

/**
 * Authoritative role check: a user is a TEACHER iff they have a `teachers` row
 * (the handle_new_user trigger creates it only for role=teacher). RLS scopes the
 * query to the caller's own row, so a student gets an empty result. This works
 * regardless of user_metadata (handles legacy accounts created without a role).
 */
export async function currentUserIsTeacher(): Promise<boolean> {
  const supabase = getSupabase()
  if (!supabase) return false
  const { data } = await supabase.from('teachers').select('id').limit(1)
  return Boolean(data && data.length > 0)
}
