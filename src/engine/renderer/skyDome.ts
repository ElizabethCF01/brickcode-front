import * as THREE from 'three'

/**
 * A procedural daytime "skybox": an inward-facing gradient dome (horizon → zenith)
 * with an optional sun glow and puffy clouds. Self-contained — no cubemap textures,
 * so it works under the app's no-external-asset constraint.
 *
 * Mirrors the flags the cave's sunset dome uses (`buildSky` in challenge-cave.ts):
 * `side: BackSide` + `depthWrite: false` + `renderOrder: -1` is the skybox trick —
 * the dome paints first and everything else in the scene renders over it. `fog: false`
 * keeps the backdrop at full colour while distant props still fade into `scene.fog`.
 *
 * Meant for levels whose camera only orbits the origin (OrbitControls, target ≈ 0):
 * a dome of `radius` ≥ the camera's max orbit distance always contains the camera,
 * so it needs no per-frame camera-follow (unlike the cave car, which drives away).
 */
export interface SkyDomeOptions {
  /** Dome radius (world units). Keep < camera far plane, > max orbit distance. */
  radius?: number
  /** Colour at the horizon (y = 0). Match `scene.fog`'s colour so props blend in. */
  horizon?: THREE.ColorRepresentation
  /** Colour at the zenith (straight up). */
  zenith?: THREE.ColorRepresentation
  /** Sun glow direction + look. `null` for an overcast dome with no sun. */
  sun?: { direction: THREE.Vector3Tuple; color?: THREE.ColorRepresentation; size?: number } | null
  /** How many puffy clouds to scatter across the upper dome (0 = clear sky). */
  clouds?: number
}

export interface SkyDomeHandle {
  /** Add this to the scene; remove it in the level's dispose(). */
  group: THREE.Group
  /** Frees every geometry/material the dome allocated. */
  dispose(): void
}

const _c = new THREE.Color()

/**
 * Builds the sky dome group and returns it alongside a `dispose()` that frees all
 * GPU resources. The caller owns adding/removing the group from the scene.
 */
export function buildSkyDome(opts: SkyDomeOptions = {}): SkyDomeHandle {
  const {
    radius = 80,
    horizon = '#9fd8f2',
    zenith = '#3f83d4',
    sun = { direction: [10, 20, 10], color: '#fff4d6', size: 7 },
    clouds = 6,
  } = opts

  const group = new THREE.Group()
  group.name = 'sky-dome'
  const disposables: { dispose(): void }[] = []

  const horizonColor = new THREE.Color(horizon)
  const zenithColor = new THREE.Color(zenith)

  // ── Gradient dome ──────────────────────────────────────────────────────────
  // Per-vertex colour from horizon (y = 0) to zenith (y = radius). pow(t, 0.7)
  // biases the transition toward the horizon so most of the view reads as sky.
  const domeGeo = new THREE.SphereGeometry(radius, 32, 16)
  const domePos = domeGeo.attributes.position
  const domeCol = new Float32Array(domePos.count * 3)
  for (let i = 0; i < domePos.count; i++) {
    const t = THREE.MathUtils.clamp(domePos.getY(i) / radius, 0, 1)
    _c.lerpColors(horizonColor, zenithColor, Math.pow(t, 0.7))
    domeCol[i * 3] = _c.r
    domeCol[i * 3 + 1] = _c.g
    domeCol[i * 3 + 2] = _c.b
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(domeCol, 3))
  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  })
  const dome = new THREE.Mesh(domeGeo, domeMat)
  dome.renderOrder = -1
  group.add(dome)
  disposables.push(domeGeo, domeMat)

  // ── Sun glow ─────────────────────────────────────────────────────────────--
  // A soft additive disk parked on the dome in the sun's direction (matches the
  // scene's directional light so the glow and the shadows agree).
  if (sun) {
    const size = sun.size ?? 7
    const glowGeo = new THREE.CircleGeometry(size, 24)
    const glowMat = new THREE.MeshBasicMaterial({
      color: sun.color ?? '#fff4d6', transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
    const glow = new THREE.Mesh(glowGeo, glowMat)
    glow.position.fromArray(sun.direction).normalize().multiplyScalar(radius * 0.95)
    glow.lookAt(0, 0, 0)
    glow.renderOrder = -1
    group.add(glow)
    disposables.push(glowGeo, glowMat)
  }

  // ── Clouds ─────────────────────────────────────────────────────────────────
  // Each cloud is a cluster of flattened white puffs. Geometry + material are
  // shared across every puff (disposed once). Positions are deterministic (a
  // golden-angle spiral over the upper dome) so the sky looks the same each run.
  if (clouds > 0) {
    const puffGeo = new THREE.SphereGeometry(1, 10, 8)
    const puffMat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.9, fog: false, depthWrite: false,
    })
    disposables.push(puffGeo, puffMat)
    const GOLDEN = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < clouds; i++) {
      const cloud = new THREE.Group()
      // Elevation band 0.25–0.6 (above the horizon, below the zenith); azimuth
      // walks the golden angle so clouds never bunch up.
      const y = 0.25 + 0.35 * ((i + 0.5) / clouds)
      const ringR = Math.sqrt(1 - y * y)
      const az = i * GOLDEN
      const dir = new THREE.Vector3(Math.cos(az) * ringR, y, Math.sin(az) * ringR)
      cloud.position.copy(dir).multiplyScalar(radius * 0.78)
      // A cloud is 3–4 overlapping flattened spheres. Scale by distance so they
      // read at a consistent apparent size from the centre.
      const scale = radius * 0.03
      const puffs = 3 + (i % 2)
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(puffGeo, puffMat)
        puff.position.set((p - (puffs - 1) / 2) * scale * 1.3, (p % 2) * scale * 0.4, 0)
        puff.scale.set(scale * (1.1 - 0.12 * p), scale * 0.55, scale)
        cloud.add(puff)
      }
      cloud.lookAt(0, 0, 0)
      cloud.renderOrder = -1
      group.add(cloud)
    }
  }

  return {
    group,
    dispose() {
      disposables.forEach((d) => d.dispose())
    },
  }
}
