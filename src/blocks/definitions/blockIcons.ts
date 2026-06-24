// Inline SVG icons for Blockly blocks, exposed as data-URIs so they bundle with
// no separate asset files or public/ paths. Drawn in-house (simple Lucide-style
// strokes, MIT-spirit) — we deliberately do NOT copy the reference simulator's
// icons, which are unlicensed. White strokes so they read on the coloured blocks.

/** Encode an SVG string as a data-URI usable in a Blockly `field_image` src. */
function svgDataUri(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.trim())
}

const STROKE =
  'fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'

// Clockwise rotation (motor spins one way).
export const ICON_ROTATE_CW = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
  <path d="M21 3.5V8.2H16.3"/>
</svg>`)

// Counter-clockwise rotation (motor spins the other way).
export const ICON_ROTATE_CCW = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
  <path d="M3 3.5V8.2H7.7"/>
</svg>`)

// Straight arrows for turning left / right.
export const ICON_ARROW_LEFT = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <path d="M19 12H5"/>
  <path d="M12 19l-7-7 7-7"/>
</svg>`)

export const ICON_ARROW_RIGHT = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <path d="M5 12h14"/>
  <path d="M12 5l7 7-7 7"/>
</svg>`)

// ---------------------------------------------------------------------------
// Per-block leading icons (a white glyph at the start of each action block)
// ---------------------------------------------------------------------------
// SPIKE places an icon *inside* each block, to the left of its text. We mirror
// that: every action block gets a `field_image` (via `blockIcon`) as its first
// message token. Glyphs are white-stroke 24×24 SVGs that read on the coloured
// blocks; drawn in-house, matching the reference sim's vocabulary (flag / move /
// gear / light grid / speaker / clock) without copying its assets.

// Eventos — a flag ("when the program starts").
export const ICON_EVENT = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <path d="M6 21V4"/>
  <path d="M6 4.5h11l-2.4 3.3L17 11H6z"/>
</svg>`)

// Movimiento — four-way move arrows (the driving base, two motors as a pair).
export const ICON_MOVE = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <path d="M12 3v18M3 12h18"/>
  <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>
</svg>`)

// Motores — gear/cog: a ring with short stubby teeth and a centre hole, so it
// reads as a cog (not a sunburst) at small sizes.
export const ICON_MOTOR = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <circle cx="12" cy="12" r="5.6"/>
  <circle cx="12" cy="12" r="2"/>
  <path stroke-width="3" d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2M6 6l1.5 1.5M16.5 16.5l1.5 1.5M18 6l-1.5 1.5M6 18l1.5-1.5"/>
</svg>`)

// Luz — the 3×3 hub matrix as a grid of filled dots (LED pixels).
export const ICON_LIGHT = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <g fill="#ffffff" stroke="none">
    <circle cx="6.5" cy="6.5" r="1.8"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="17.5" cy="6.5" r="1.8"/>
    <circle cx="6.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="17.5" cy="12" r="1.8"/>
    <circle cx="6.5" cy="17.5" r="1.8"/><circle cx="12" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>
  </g>
</svg>`)

// Sonido — speaker with sound waves.
export const ICON_SOUND = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/>
  <path d="M15.5 9.3a3.4 3.4 0 0 1 0 5.4"/>
  <path d="M17.9 6.8a6.6 6.6 0 0 1 0 10.4"/>
</svg>`)

// Tiempo — a clock.
export const ICON_TIME = svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${STROKE}>
  <circle cx="12" cy="12" r="8.5"/>
  <path d="M12 7v5l3.2 2"/>
</svg>`)

/**
 * Build a Blockly `field_image` arg for a block's leading icon. Use it as the
 * first entry of `args0` with `%1` at the start of `message0`.
 */
export function blockIcon(
  src: string,
  alt: string,
  size = 18,
): { type: 'field_image'; src: string; width: number; height: number; alt: string; flipRtl: boolean } {
  return { type: 'field_image', src, width: size, height: size, alt, flipRtl: false }
}

/** Build a Blockly image-dropdown option: [{ src, width, height, alt }, value]. */
export function imageOption(
  src: string,
  alt: string,
  value: string,
  size = 24,
): [{ src: string; width: number; height: number; alt: string }, string] {
  return [{ src, width: size, height: size, alt }, value]
}
