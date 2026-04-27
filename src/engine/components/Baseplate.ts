import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

const STUD           = 0.08
const PLATE_H        = 0.032   // 3.2 mm — one LEGO plate height
const STUDS_PER_SIDE = 32
const PLATE_SIZE     = STUDS_PER_SIDE * STUD   // 2.56 world units

// DataTexture constants — no DOM/canvas required, safe in Node (Vitest)
const PPS      = 8                       // pixels per stud
const TEX_SIZE = STUDS_PER_SIDE * PPS   // 256 × 256

function buildStudGridTexture(): THREE.DataTexture {
  const data   = new Uint8Array(TEX_SIZE * TEX_SIZE * 4)
  const center = (PPS - 1) / 2   // 3.5 — centre of each stud cell
  const radius = PPS * 0.33      // ≈ 2.64 px — stud circle

  // #4CAF50 base green → rgb(76, 175, 80)
  // #43A047 stud circles → rgb(67, 160, 71) — slightly darker
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const lx     = (px % PPS) - center
      const ly     = (py % PPS) - center
      const inStud = Math.sqrt(lx * lx + ly * ly) <= radius
      const i      = (py * TEX_SIZE + px) * 4
      data[i]     = inStud ? 67  : 76
      data[i + 1] = inStud ? 160 : 175
      data[i + 2] = inStud ? 71  : 80
      data[i + 3] = 255
    }
  }

  const tex        = new THREE.DataTexture(data, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat)
  tex.colorSpace   = THREE.SRGBColorSpace
  tex.needsUpdate  = true
  return tex
}

export class Baseplate {
  private readonly mesh:     THREE.Mesh
  private readonly geometry: THREE.BoxGeometry
  private readonly material: THREE.MeshStandardMaterial
  private readonly texture:  THREE.DataTexture
  private readonly body:     RAPIER.RigidBody
  private readonly world:    RAPIER.World
  private readonly scene:    THREE.Scene

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.world = world
    this.scene = scene

    // ── Three.js ─────────────────────────────────────────────────────────────
    this.texture  = buildStudGridTexture()
    this.material = new THREE.MeshStandardMaterial({
      map:       this.texture,
      roughness: 0.8,
      metalness: 0.0,
    })
    this.geometry = new THREE.BoxGeometry(PLATE_SIZE, PLATE_H, PLATE_SIZE)
    this.mesh     = new THREE.Mesh(this.geometry, this.material)
    // Centre at y = –PLATE_H/2 so the top surface sits exactly at y = 0
    this.mesh.position.set(0, -PLATE_H / 2, 0)
    this.mesh.receiveShadow = true
    scene.add(this.mesh)

    // ── Rapier (static / fixed) ───────────────────────────────────────────────
    const rbDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -PLATE_H / 2, 0)
    this.body    = world.createRigidBody(rbDesc)
    const collDesc = RAPIER.ColliderDesc.cuboid(PLATE_SIZE / 2, PLATE_H / 2, PLATE_SIZE / 2)
    world.createCollider(collDesc, this.body)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
    this.scene.remove(this.mesh)
    this.world.removeRigidBody(this.body)
  }
}
