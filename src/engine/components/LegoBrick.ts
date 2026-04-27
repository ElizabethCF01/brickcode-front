import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

// Scale convention: 1 world unit = 10 cm → 1 stud (8 mm) = 0.08 units.
// Real-world reference: STUD_MM / 100 = world units.
// See docs/architecture.md §Scale Convention.
const STUD      = 0.08   // 8 mm
const BODY_H    = 0.096  // 9.6 mm (standard LEGO brick body, 3 plates × 3.2 mm)
const STUD_R    = 0.024  // 2.4 mm stud radius
const STUD_H    = 0.018  // 1.8 mm stud protrusion above top face

export interface LegoBrickParams {
  /** Width in studs (e.g. 2 for a 2×4 brick) */
  width: number
  /** Depth in studs (e.g. 4 for a 2×4 brick) */
  depth: number
  /** CSS hex color string, e.g. '#FF0000' */
  color: string
  /** Initial world-space position of the brick's geometric centre */
  position: THREE.Vector3
}

export class LegoBrick {
  private readonly group: THREE.Group
  private readonly body: RAPIER.RigidBody
  private readonly bodyGeo: THREE.BoxGeometry
  private readonly studGeo: THREE.CylinderGeometry
  private readonly material: THREE.MeshStandardMaterial
  private readonly world: RAPIER.World
  private readonly scene: THREE.Scene

  constructor(params: LegoBrickParams, world: RAPIER.World, scene: THREE.Scene) {
    this.world = world
    this.scene = scene

    const { width, depth, color, position } = params
    const w = width * STUD
    const d = depth * STUD

    // ── Three.js mesh ────────────────────────────────────────────────────────
    this.material = new THREE.MeshStandardMaterial({ color })
    this.group = new THREE.Group()

    this.bodyGeo = new THREE.BoxGeometry(w, BODY_H, d)
    const bodyMesh = new THREE.Mesh(this.bodyGeo, this.material)
    bodyMesh.castShadow = true
    bodyMesh.receiveShadow = true
    this.group.add(bodyMesh)

    // Studs are purely cosmetic; they are NOT part of the physics collider
    // so stacking feels natural (flat-top collider, cylinder visuals on top).
    this.studGeo = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 12)
    for (let col = 0; col < width; col++) {
      for (let row = 0; row < depth; row++) {
        const stud = new THREE.Mesh(this.studGeo, this.material)
        stud.position.set(
          (col - (width - 1) / 2) * STUD,
          BODY_H / 2 + STUD_H / 2,
          (row - (depth - 1) / 2) * STUD,
        )
        stud.castShadow = true
        this.group.add(stud)
      }
    }

    this.group.position.copy(position)
    scene.add(this.group)

    // ── Rapier rigid body ────────────────────────────────────────────────────
    const rbDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
      position.x,
      position.y,
      position.z,
    )
    this.body = world.createRigidBody(rbDesc)

    // Collider covers only the main body (studs excluded intentionally)
    const collDesc = RAPIER.ColliderDesc.cuboid(w / 2, BODY_H / 2, d / 2)
    world.createCollider(collDesc, this.body)
  }

  /** Copy physics transform into the Three.js group each frame. */
  syncRender(): void {
    const t = this.body.translation()
    const r = this.body.rotation()
    this.group.position.set(t.x, t.y, t.z)
    this.group.quaternion.set(r.x, r.y, r.z, r.w)
  }

  /** Remove from Three.js scene and Rapier world; free GPU memory. */
  dispose(): void {
    this.bodyGeo.dispose()
    this.studGeo.dispose()
    this.material.dispose()
    this.scene.remove(this.group)
    this.world.removeRigidBody(this.body)
  }
}
