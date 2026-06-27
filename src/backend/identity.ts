// Student-side identity for the simulator: which class to submit under, and the
// pseudonym to submit as. Both are pseudonymous — NEVER real names / PII.
//
// Precedence: localStorage (set via the join-a-class UI) overrides the
// VITE_CLASS_CODE env fallback (dev convenience). Framework-agnostic.

const CLASS_CODE_KEY = 'brickcode:classCode'
const PSEUDONYM_KEY = 'brickcode:pseudonym'

function ls(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

/** Class code to submit under, or null if the student hasn't joined a class. */
export function getClassCode(): string | null {
  const stored = ls()?.getItem(CLASS_CODE_KEY)
  if (stored && stored.trim()) return stored.trim()
  const envCode = import.meta.env.VITE_CLASS_CODE
  return envCode && envCode.trim() ? envCode.trim() : null
}

/** Persist the class code the student joined (from the join-a-class UI). */
export function setClassCode(code: string): void {
  ls()?.setItem(CLASS_CODE_KEY, code.trim())
}

/**
 * Stable per-browser pseudonym. Returns the stored nickname/pseudonym, or
 * generates and persists a `pupil-xxxx` if none is set. No PII.
 */
export function getPseudonym(): string {
  const store = ls()
  if (!store) return 'pupil-anon'
  let p = store.getItem(PSEUDONYM_KEY)
  if (!p) {
    p = generatePseudonym()
    store.setItem(PSEUDONYM_KEY, p)
  }
  return p
}

/**
 * Set the student's nickname (still pseudonymous). Empty input falls back to a
 * generated `pupil-xxxx` so there's always a stable identity.
 */
export function setNickname(name: string): void {
  const store = ls()
  if (!store) return
  const clean = name.trim()
  store.setItem(PSEUDONYM_KEY, clean || generatePseudonym())
}

/** Whether the student has joined a class (a code is configured). */
export function hasJoinedClass(): boolean {
  return getClassCode() !== null
}

function generatePseudonym(): string {
  return `pupil-${Math.random().toString(36).slice(2, 8)}`
}
