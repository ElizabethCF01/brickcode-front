/**
 * Local, offline-first record of which levels the student has passed — used to
 * show the ✅ badge in the level-select grid. This mirrors the authoritative
 * signal already sent to the backend (the `challenge_evaluated` event with
 * `success: true`); a future backend RPC can reconcile/replace this client cache.
 */
const STORAGE_KEY = 'brickcode.completedLevels'

export function getCompletedLevels(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const ids = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(ids) ? (ids as string[]) : [])
  } catch {
    return new Set()
  }
}

export function markLevelCompleted(id: string): void {
  try {
    const completed = getCompletedLevels()
    if (completed.has(id)) return
    completed.add(id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]))
  } catch {
    // localStorage unavailable (private mode / disabled) — completion badges are
    // a non-critical enhancement, so silently skip persistence.
  }
}
