/**
 * Pack the parts in `LDRAW_CATALOG` into self-contained .mpd files
 * under `public/ldraw/models/packed/`.
 *
 * Usage:
 *   LDRAW_LIB_PATH=~/ldraw-library npm run pack-ldraw
 *
 * The raw LDraw library (~170 MB) lives outside the repo; we only
 * commit the packed outputs.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { packLDrawModel } from './vendor/packLDrawModel.mjs'
import { LDRAW_CATALOG, type LDrawCatalogEntry } from './ldrawCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(PROJECT_ROOT, 'public', 'ldraw', 'models', 'packed')

function resolveLibraryPath(): string {
  const raw = process.env.LDRAW_LIB_PATH
  if (!raw) {
    fail(
      'LDRAW_LIB_PATH is not set.\n' +
        'Download https://library.ldraw.org/library/updates/complete.zip,\n' +
        'unzip it, and point LDRAW_LIB_PATH at the directory that contains\n' +
        'LDConfig.ldr, parts/, and p/.',
    )
  }
  const expanded = raw.startsWith('~')
    ? path.join(process.env.HOME ?? '', raw.slice(1))
    : raw
  const abs = path.resolve(expanded)
  if (!fs.existsSync(path.join(abs, 'LDConfig.ldr'))) {
    fail(`LDRAW_LIB_PATH "${abs}" does not contain LDConfig.ldr.`)
  }
  return abs
}

function packOne(libPath: string, entry: LDrawCatalogEntry): { ok: boolean; bytes: number } {
  const outFile = path.join(OUT_DIR, `${entry.id}.mpd`)
  try {
    const packed = packLDrawModel(libPath, entry.file)
    fs.writeFileSync(outFile, packed)
    const bytes = Buffer.byteLength(packed, 'utf8')
    console.log(`  ✓ ${entry.id.padEnd(20)} ${entry.file.padEnd(20)} → ${formatKB(bytes)}`)
    return { ok: true, bytes }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ ${entry.id.padEnd(20)} ${entry.file.padEnd(20)} — ${msg}`)
    return { ok: false, bytes: 0 }
  }
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function fail(msg: string): never {
  console.error(`\n[pack-ldraw] ${msg}\n`)
  process.exit(1)
}

function main(): void {
  const libPath = resolveLibraryPath()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log(`[pack-ldraw] library: ${libPath}`)
  console.log(`[pack-ldraw] output:  ${OUT_DIR}`)
  console.log(`[pack-ldraw] packing ${LDRAW_CATALOG.length} part(s):\n`)

  let failures = 0
  for (const entry of LDRAW_CATALOG) {
    if (!packOne(libPath, entry).ok) failures++
  }

  console.log()
  if (failures > 0) {
    fail(`${failures} of ${LDRAW_CATALOG.length} parts failed to pack.`)
  }
  console.log(`[pack-ldraw] done — ${LDRAW_CATALOG.length} parts written.`)
}

main()
