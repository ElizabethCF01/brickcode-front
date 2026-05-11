/**
 * Minimal parser for LDraw / Studio 2.0 `.ldr` text. We only care about
 * type-1 lines (sub-file references), which carry one part instance with a
 * full 3×3 rotation + 3-vector translation in LDU.
 *
 * Spec reference: https://www.ldraw.org/article/218.html (line types).
 *
 * What we ignore: type 0 (comments / metadata), type 2-5 (raw geometry —
 * primitives, only present in `.dat` part files, not in models). Also skips
 * the `0 FILE` / `0 NOFILE` headers that delimit sub-models inside a single
 * `.mpd`; for a typical Studio export we just have one top-level model so
 * those don't appear.
 */

export interface LDrawInstance {
  /** Lower-cased part filename, e.g. `3483.dat`. */
  partFile: string
  /**
   * LDraw colour code. Direct hex colours (`0x2RRGGBB`) come through as
   * negative numbers via `parseInt('0x...', 16)` reinterpreted; we keep the
   * raw string form for those because the loader handles them itself.
   */
  colour: string
  /** Position in LDU, raw from file (Y-down, untransformed). */
  position: { x: number; y: number; z: number }
  /**
   * 3×3 rotation matrix in row-major order, raw from file:
   * `[a b c; d e f; g h i]` corresponding to the 9 numbers `a..i` after
   * the translation. Combined with `position` this is the placement of the
   * part instance in the parent file's frame.
   */
  rotation: [number, number, number, number, number, number, number, number, number]
}

/**
 * Parse a `.ldr` / `.mpd` source string and return every type-1 instance.
 * Lines that aren't type 1 are silently skipped.
 */
export function parseLDraw(source: string): LDrawInstance[] {
  const out: LDrawInstance[] = []
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    const tokens = line.split(/\s+/)
    if (tokens[0] !== '1') continue
    if (tokens.length < 15) continue // malformed
    const colour = tokens[1]
    const position = {
      x: Number(tokens[2]),
      y: Number(tokens[3]),
      z: Number(tokens[4]),
    }
    const r = tokens.slice(5, 14).map(Number) as LDrawInstance['rotation']
    const partFile = tokens.slice(14).join(' ').toLowerCase()
    out.push({ partFile, colour, position, rotation: r })
  }
  return out
}
