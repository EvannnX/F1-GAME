import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'

const SHANGHAI_2018_ROOT = 'src/shanghai-international-circuit-2018-layout'
const lowPolyShanghaiUrl = `${SHANGHAI_2018_ROOT}/source/shanghai_meshopt.glb`
const SHANGHAI_2018_TEXTURE_OVERRIDES: Record<string, string> = {
  Prato: `${SHANGHAI_2018_ROOT}/textures/Meshesgrassxgrass0171_diff_18.png`,
  tarmac: `${SHANGHAI_2018_ROOT}/textures/asphalt-new.png`,
  '14': `${SHANGHAI_2018_ROOT}/textures/PAT_asf_out_123.png`,
  '15': `${SHANGHAI_2018_ROOT}/textures/PAT_asf_out_123.png`,
  Pit_lane: `${SHANGHAI_2018_ROOT}/textures/PAT_asf_out_123.png`,
}
export const LOW_POLY_SHANGHAI_RUNTIME_URLS = [
  lowPolyShanghaiUrl,
  ...new Set(Object.values(SHANGHAI_2018_TEXTURE_OVERRIDES)),
]
const SHANGHAI_2018_ALPHA_CUTOUT_MATERIALS = new Set([
  'lg_pit_exit_light_b_01', 'Recinto', 'sha_barrier_grandstandboundary_a',
  'sha_grandstand_group_d', 'core_start_lights_a', 'lg_marshal_light_b_light',
  'lg_marshal_light_b_screen', 'tree04a', 'tree04b', 'tree06a', 'treeline',
  'sha_distantbuildings_a', 'standard_1!0', 'sha_grandstand_group_d!0',
  'sha_gridlines_a', 'sha_grandstand_underbrolly_b_02',
  'sha_grandstand_underbrolly_b_03', 'aa_4', 'aa_3', 'sha_barrier_pitwall_a!0',
])
const SHANGHAI_2018_ALPHA_BLEND_MATERIALS = new Set([
  'material_sha_building_glasstower_a_01', 'aa_3!0', 'sha_building_commstower_a',
  'sha_hut_pitlanetower_a', 'sha_pole_ranking_a!0', 'sha_pole_ranking_a',
  'sha_building_glasstower_a_03', 'aa_1!0',
])
const SHANGHAI_2018_ROAD_DECAL_MATERIALS = new Set([
  '01_-_default', 'skid', 'raceline', 'Line_asf', 'LInea_PITNew',
  'sha_gridlines_a', '2!0', '18', '33',
])
const SHANGHAI_2018_DECAL_DEPTH_ORDER: Record<string, number> = {
  Line_asf: 1,
  skid: 2,
  raceline: 3,
  '01_-_default': 4,
  LInea_PITNew: 5,
  sha_gridlines_a: 6,
  '2!0': 7,
  '18': 7,
  '33': 7,
}
const SHANGHAI_2018_DRIVE_SURFACE_MATERIALS = new Set([
  'tarmac', '14', '15', 'Pit_lane', 'Out', 'Prato', '28', '35', '32',
  '17', '16', '13', '9!0', '12', 'Pirelli_terra', 'Petronas_out',
  'Out_rolex', '2!0', '24', '22', '23', '20', '21', 'Kerb_giallo',
  'RUG_blu', 'Spec_glill',
])
const SHANGHAI_2018_ROADLIKE_RUNOFF_MATERIALS = new Set(['RUG_blu', 'Spec_glill'])
const ROAD_SURFACE_HINTS = ['road', 'tarmac', 'line_white']
const GROUND_SURFACE_HINTS = [
  ...ROAD_SURFACE_HINTS,
  'sand',
  'grass',
  'gravel',
  'concrete',
  'terrain',
  'carpet',
]
const OBSTACLE_SURFACE_HINTS = [
  'fence',
  'barrier',
  'guardrail',
  'guard_rail',
  'guard-rail',
  'wall',
  'armco',
  'railing',
  'rail',
]

export interface LowPolyShanghaiLoadResult {
  model: THREE.Group
  box: THREE.Box3
  size: THREE.Vector3
  center: THREE.Vector3
}

export interface LowPolyShanghaiPlacement {
  x: number
  z: number
  y: number
  yawDeg: number
  scale: number
}

export interface LowPolyShanghaiBundle {
  group: THREE.Group
  getPlacement: () => LowPolyShanghaiPlacement
  setPlacement: (next: Partial<LowPolyShanghaiPlacement>) => void
  ready: Promise<LowPolyShanghaiLoadResult>
}

export interface Shanghai2018GridSlot {
  position: THREE.Vector3
  heading: number
}

export interface LowPolyShanghaiSurfaceSampler {
  sampleHeightAt: (x: number, z: number, fallbackY?: number) => number | null
}

export interface LowPolyShanghaiGroundHit {
  point: THREE.Vector3
  normal: THREE.Vector3
  isRoad: boolean
  isRunoff?: boolean
}

export interface LowPolyShanghaiGroundSampler {
  sampleGroundAt: (x: number, z: number) => LowPolyShanghaiGroundHit | null
}

export interface LowPolyShanghaiObstacleHit {
  point: THREE.Vector3
  normal: THREE.Vector3
  distance: number
}

export interface LowPolyShanghaiObstacleQuery {
  radius?: number
  side?: THREE.Vector3
}

export interface LowPolyShanghaiObstacleSampler {
  sampleObstacleBetween: (
    from: THREE.Vector3,
    to: THREE.Vector3,
    options?: LowPolyShanghaiObstacleQuery,
  ) => LowPolyShanghaiObstacleHit | null
  sampleObstacleNear: (
    point: THREE.Vector3,
    options?: LowPolyShanghaiObstacleQuery,
  ) => LowPolyShanghaiObstacleHit | null
}

export interface LowPolyShanghaiGroundGridOptions {
  cellSize?: number
  timeBudgetMs?: number
  onProgress?: (progress: number, label: string) => void
}

export interface LowPolyShanghaiRenderOptimization {
  chunkCount: number
  hiddenOriginals: number
}

export interface LowPolyShanghaiVisualOptimizer {
  update: (focus: THREE.Vector3, force?: boolean) => void
}

export const LOW_POLY_SHANGHAI_PLACEMENT: LowPolyShanghaiPlacement = {
  x: 0,
  z: 0,
  y: 0,
  yawDeg: 0,
  scale: 1,
}

let dracoLoader: DRACOLoader | null = null

function materialNamesForMesh(mesh: THREE.Mesh): string[] {
  if (!mesh.material) return []
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.map((mat) => mat.name ?? '')
}

function meshHasRoadSurfaceHint(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  return ROAD_SURFACE_HINTS.some((hint) => name.includes(hint))
}

function meshHasGroundSurfaceHint(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  if (name.includes('fence') || name.includes('barrier') || name.includes('wall')) return false
  if (name.includes('collider') || name.includes('tree') || name.includes('startlight')) return false
  return materialNamesForMesh(mesh).some((materialName) => SHANGHAI_2018_DRIVE_SURFACE_MATERIALS.has(materialName)) ||
    GROUND_SURFACE_HINTS.some((hint) => name.includes(hint))
}

async function prepareShanghai2018Materials(root: THREE.Object3D): Promise<void> {
  const overrideTargets = new Map<string, THREE.MeshStandardMaterial[]>()
  const blueRunoffMaterials: THREE.MeshStandardMaterial[] = []
  const blueRunoffContinuation: Array<{
    material: THREE.MeshStandardMaterial
    object: THREE.Mesh
  }> = []
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && SHANGHAI_2018_TEXTURE_OVERRIDES[material.name]) {
        const targets = overrideTargets.get(material.name) ?? []
        targets.push(material)
        overrideTargets.set(material.name, targets)
      }
      if (material instanceof THREE.MeshStandardMaterial && material.name === 'RUG_blu') {
        blueRunoffMaterials.push(material)
      }
      if (material instanceof THREE.MeshStandardMaterial && material.name === 'Spec_glill') {
        blueRunoffContinuation.push({ material, object: obj })
      }
      if (material.map) {
        material.map.anisotropy = 8
        material.map.needsUpdate = true
      }
      if (SHANGHAI_2018_ALPHA_CUTOUT_MATERIALS.has(material.name)) {
        material.alphaTest = 0.32
        material.alphaToCoverage = true
        material.transparent = false
        material.depthWrite = true
        material.side = THREE.DoubleSide
      }
      if (SHANGHAI_2018_ALPHA_BLEND_MATERIALS.has(material.name)) {
        material.alphaTest = 0.01
        material.transparent = true
        material.depthWrite = false
        material.side = THREE.DoubleSide
      }
      if (material.name === 'RUG_blu') {
        material.transparent = false
        material.alphaTest = 0
        material.depthWrite = true
        material.polygonOffset = true
        material.polygonOffsetFactor = -1
        material.polygonOffsetUnits = -1
        obj.renderOrder = Math.max(obj.renderOrder, 10)
      }
      if (SHANGHAI_2018_ROAD_DECAL_MATERIALS.has(material.name)) {
        const depthOrder = SHANGHAI_2018_DECAL_DEPTH_ORDER[material.name] ?? 1
        material.transparent = true
        material.alphaTest = 0.015
        material.depthWrite = false
        material.polygonOffset = true
        material.polygonOffsetFactor = -depthOrder
        material.polygonOffsetUnits = -depthOrder
        obj.renderOrder = 100 + depthOrder
      }
      material.needsUpdate = true
    }
  })

  const blueRunoffMaterial = blueRunoffMaterials[0]
  if (blueRunoffMaterial) {
    for (const { material, object } of blueRunoffContinuation) {
      material.map = blueRunoffMaterial.map
      material.color.copy(blueRunoffMaterial.color)
      material.roughness = blueRunoffMaterial.roughness
      material.metalness = blueRunoffMaterial.metalness
      material.transparent = false
      material.alphaTest = 0
      material.depthWrite = true
      material.polygonOffset = true
      material.polygonOffsetFactor = -2
      material.polygonOffsetUnits = -2
      material.visible = true
      material.needsUpdate = true
      object.renderOrder = Math.max(object.renderOrder, 11)
    }
  }

  const textureLoader = new THREE.TextureLoader()
  await Promise.all(Array.from(overrideTargets, ([materialName, materials]) => new Promise<void>((resolve) => {
    textureLoader.load(
      SHANGHAI_2018_TEXTURE_OVERRIDES[materialName],
      (texture) => {
        const previous = materials[0]?.map
        texture.colorSpace = THREE.SRGBColorSpace
        texture.flipY = false
        texture.generateMipmaps = true
        texture.magFilter = THREE.LinearFilter
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.anisotropy = 8
        if (materialName === 'Prato') {
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.RepeatWrapping
          texture.repeat.set(72, 66)
        } else if (previous) {
          texture.wrapS = previous.wrapS
          texture.wrapT = previous.wrapT
          texture.offset.copy(previous.offset)
          texture.repeat.copy(previous.repeat)
          texture.center.copy(previous.center)
          texture.rotation = previous.rotation
          texture.channel = previous.channel
        }
        for (const material of materials) {
          material.map = texture
          material.color.set(0xffffff)
          material.needsUpdate = true
        }
        texture.needsUpdate = true
        resolve()
      },
      undefined,
      () => resolve(),
    )
  })))
}

function shanghai2018MaterialGuide(root: THREE.Object3D, materialName: string): {
  center: THREE.Vector3
  forward: THREE.Vector3
  length: number
} | null {
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const geometry = obj.geometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index?.count ?? position.count, materialIndex: 0 }]
    for (const group of groups) {
      if (materials[group.materialIndex ?? 0]?.name !== materialName) continue
      const end = Math.min(group.start + group.count, index?.count ?? position.count)
      for (let offset = group.start; offset < end; offset++) {
        const vertex = index ? index.getX(offset) : offset
        point.fromBufferAttribute(position, vertex).applyMatrix4(obj.matrixWorld)
        box.expandByPoint(point)
      }
    }
  })
  if (box.isEmpty()) return null
  const size = box.getSize(new THREE.Vector3())
  const forward = size.x >= size.z ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
  return {
    center: box.getCenter(new THREE.Vector3()),
    forward,
    length: Math.max(size.x, size.z),
  }
}

interface Shanghai2018AllianzCandidate {
  center: THREE.Vector3
  mesh: THREE.Mesh
  triangleOffsets: number[]
}

function collectShanghai2018AllianzCandidates(root: THREE.Object3D): {
  guide: NonNullable<ReturnType<typeof shanghai2018MaterialGuide>>
  candidates: Shanghai2018AllianzCandidate[]
} | null {
  const guide = shanghai2018MaterialGuide(root, 'sha_gridlines_a')
  if (!guide) return null
  const candidates: Shanghai2018AllianzCandidate[] = []
  root.updateMatrixWorld(true)

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    const geometry = obj.geometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position || !index) return
    const allianzRanges = geometry.groups.length > 0
      ? geometry.groups.filter((group) => materials[group.materialIndex ?? 0]?.name === 'wall8')
      : materials[0]?.name === 'wall8'
        ? [{ start: 0, count: index.count, materialIndex: 0 }]
        : []
    if (allianzRanges.length === 0) return
    const triangles: Array<{ offset: number; center: THREE.Vector3 }> = []
    const point = new THREE.Vector3()
    for (const range of allianzRanges) {
      const end = Math.min(range.start + range.count, index.count)
      for (let offset = range.start; offset + 2 < end; offset += 3) {
        const center = new THREE.Vector3()
        for (let corner = 0; corner < 3; corner++) {
          point.fromBufferAttribute(position, index.getX(offset + corner)).applyMatrix4(obj.matrixWorld)
          center.add(point)
        }
        triangles.push({ offset, center: center.multiplyScalar(1 / 3) })
      }
    }

    const pending = new Set(triangles.map((_, triangleIndex) => triangleIndex))
    while (pending.size > 0) {
      const first = pending.values().next().value as number
      const cluster = [first]
      pending.delete(first)
      for (let cursor = 0; cursor < cluster.length; cursor++) {
        const current = triangles[cluster[cursor]].center
        for (const candidate of Array.from(pending)) {
          if (current.distanceToSquared(triangles[candidate].center) > 16) continue
          pending.delete(candidate)
          cluster.push(candidate)
        }
      }
      const box = new THREE.Box3()
      for (const triangleIndex of cluster) box.expandByPoint(triangles[triangleIndex].center)
      candidates.push({
        center: box.getCenter(new THREE.Vector3()),
        mesh: obj,
        triangleOffsets: cluster.map((triangleIndex) => triangles[triangleIndex].offset),
      })
    }
  })
  return { guide, candidates }
}

export function listShanghai2018AllianzSlots(root: THREE.Object3D): Shanghai2018GridSlot[] {
  const collected = collectShanghai2018AllianzCandidates(root)
  if (!collected) return []
  const heading = Math.atan2(collected.guide.forward.x, collected.guide.forward.z)
  return collected.candidates.map(({ center }) => ({ position: center.clone(), heading }))
}

export function extractShanghai2018GridSlots(
  root: THREE.Object3D,
  slotCount = 5,
  selectedPlayerPosition?: { x: number; z: number } | null,
): Shanghai2018GridSlot[] {
  const collected = collectShanghai2018AllianzCandidates(root)
  if (!collected) return []
  const { guide, candidates } = collected
  const target = selectedPlayerPosition
    ? new THREE.Vector3(selectedPlayerPosition.x, guide.center.y, selectedPlayerPosition.z)
    : guide.center.clone().addScaledVector(
        guide.forward,
        -Math.max(0, guide.length * 0.5 - 10),
      )

  const selected = candidates
    .sort((a, b) => a.center.distanceToSquared(target) - b.center.distanceToSquared(target))
    .slice(0, Math.max(1, slotCount))
  if (selected.length === 0) return []
  // The Allianz boxes share a mesh, so visibility alone does not remove them
  // from the ground and obstacle samplers. Strip every identified box from the
  // geometry while retaining the nearest slots only as grid coordinates.
  const removedByMesh = new Map<THREE.Mesh, Set<number>>()
  for (const candidate of candidates) {
    const offsets = removedByMesh.get(candidate.mesh) ?? new Set<number>()
    for (const offset of candidate.triangleOffsets) offsets.add(offset)
    removedByMesh.set(candidate.mesh, offsets)
  }
  for (const [mesh, removedOffsets] of removedByMesh) {
    const geometry = mesh.geometry
    const index = geometry.getIndex()
    if (!index) continue
    const kept: number[] = []
    const nextGroups: Array<{ start: number; count: number; materialIndex: number }> = []
    const sourceGroups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index.count, materialIndex: 0 }]
    for (const group of sourceGroups) {
      const groupStart = kept.length
      const end = Math.min(group.start + group.count, index.count)
      for (let offset = group.start; offset + 2 < end; offset += 3) {
        if (removedOffsets.has(offset)) continue
        kept.push(index.getX(offset), index.getX(offset + 1), index.getX(offset + 2))
      }
      const groupCount = kept.length - groupStart
      if (groupCount > 0) {
        nextGroups.push({
          start: groupStart,
          count: groupCount,
          materialIndex: group.materialIndex ?? 0,
        })
      }
    }
    geometry.setIndex(kept)
    geometry.clearGroups()
    for (const group of nextGroups) geometry.addGroup(group.start, group.count, group.materialIndex)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }

  const heading = Math.atan2(guide.forward.x, guide.forward.z)
  const playerCandidate = selected[0]
  const remaining = selected
    .slice(1)
    .sort((a, b) => a.center.distanceToSquared(playerCandidate.center) - b.center.distanceToSquared(playerCandidate.center))
  return [playerCandidate, ...remaining].map(({ center }) => ({ position: center, heading }))
}

function meshHasObstacleSurfaceHint(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  if (name.includes('road') || name.includes('tarmac') || name.includes('line_white')) return false
  return OBSTACLE_SURFACE_HINTS.some((hint) => name.includes(hint))
}

function materialHasObstacleSurfaceHint(mesh: THREE.Mesh, materialName: string, materialCount: number): boolean {
  if (materialName === 'wall8') return false
  const materialSearchName = materialName.toLowerCase()
  if (ROAD_SURFACE_HINTS.some((hint) => materialSearchName.includes(hint))) return false
  if (OBSTACLE_SURFACE_HINTS.some((hint) => materialSearchName.includes(hint))) return true
  if (materialCount > 1) return false
  return meshHasObstacleSurfaceHint(mesh)
}

function meshIsColliderOnly(mesh: THREE.Mesh): boolean {
  const name = `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
  return name.includes('collider')
}

function meshSearchName(mesh: THREE.Mesh): string {
  return `${mesh.name} ${materialNamesForMesh(mesh).join(' ')}`.toLowerCase()
}

function meshIsStartAreaEssentialVisual(mesh: THREE.Mesh): boolean {
  const name = meshSearchName(mesh)
  return name.includes('garages_shanghai') ||
    name.includes('tents_garages') ||
    name.includes('startlights_shanghai') ||
    name.includes('start_slots') ||
    name.includes('line_white_shanghai')
}

function visualCullDistanceForMesh(mesh: THREE.Mesh): number {
  const name = meshSearchName(mesh)
  if (meshIsStartAreaEssentialVisual(mesh)) return 10000
  if (name.includes('tree')) return 520
  if (name.includes('barrier') || name.includes('fence') || name.includes('wall')) return 460
  if (name.includes('garage') || name.includes('tent') || name.includes('stand')) return 820
  return 950
}

function shouldChunkShanghaiVisualMesh(mesh: THREE.Mesh): boolean {
  if (mesh.userData.driveVisualChunk) return false
  if (meshSearchName(mesh).includes('collider')) return false
  if (meshIsStartAreaEssentialVisual(mesh)) return false
  const position = mesh.geometry?.getAttribute('position')
  return Boolean(position && position.count > 30000)
}

function attributeValue(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  component: number,
): number {
  if (component === 0) return attr.getX(index)
  if (component === 1) return attr.getY(index)
  if (component === 2) return attr.getZ(index)
  return attr.getW(index)
}

function cloneMeshTransform(source: THREE.Mesh, target: THREE.Mesh): void {
  target.position.copy(source.position)
  target.quaternion.copy(source.quaternion)
  target.scale.copy(source.scale)
  target.castShadow = source.castShadow
  target.receiveShadow = source.receiveShadow
  target.frustumCulled = true
  target.renderOrder = source.renderOrder
}

function chunkShanghaiVisualMesh(mesh: THREE.Mesh, gridSize = 120): THREE.Mesh[] {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
  const position = source.getAttribute('position')
  if (!position || position.count < 3) return []
  const attrNames = Object.keys(source.attributes)
  const buckets = new Map<string, Record<string, number[]>>()
  const metas = new Map<string, { itemSize: number; normalized: boolean }>()
  for (const name of attrNames) {
    const attr = source.getAttribute(name)
    metas.set(name, { itemSize: attr.itemSize, normalized: attr.normalized })
  }

  const bucketForTriangle = (i: number): Record<string, number[]> => {
    const cx = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3
    const cz = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3
    const key = `${Math.floor(cx / gridSize)}:${Math.floor(cz / gridSize)}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {}
      for (const name of attrNames) bucket[name] = []
      buckets.set(key, bucket)
    }
    return bucket
  }

  for (let i = 0; i < position.count; i += 3) {
    const bucket = bucketForTriangle(i)
    for (let vertex = i; vertex < i + 3; vertex++) {
      for (const name of attrNames) {
        const attr = source.getAttribute(name)
        const values = bucket[name]
        for (let component = 0; component < attr.itemSize; component++) {
          values.push(attributeValue(attr, vertex, component))
        }
      }
    }
  }

  const chunks: THREE.Mesh[] = []
  let chunkIndex = 0
  const maxDistance = visualCullDistanceForMesh(mesh)
  for (const bucket of buckets.values()) {
    const chunkGeometry = new THREE.BufferGeometry()
    for (const name of attrNames) {
      const meta = metas.get(name)
      if (!meta) continue
      chunkGeometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(bucket[name]), meta.itemSize, meta.normalized),
      )
    }
    chunkGeometry.computeBoundingBox()
    chunkGeometry.computeBoundingSphere()
    const chunk = new THREE.Mesh(chunkGeometry, mesh.material)
    cloneMeshTransform(mesh, chunk)
    chunk.name = `${mesh.name || 'shanghai-visual'}_chunk_${chunkIndex++}`
    chunk.userData.driveVisualChunk = true
    chunk.userData.driveCullDistanceSq = maxDistance * maxDistance
    chunks.push(chunk)
  }

  if (source !== mesh.geometry) source.dispose()
  return chunks
}

export function optimizeLowPolyShanghaiRendering(
  root: THREE.Object3D,
): LowPolyShanghaiRenderOptimization {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.frustumCulled = true
    if (meshIsColliderOnly(obj)) obj.visible = false
  })
  return { chunkCount: 0, hiddenOriginals: 0 }
}

export function createLowPolyShanghaiVisualOptimizer(
  root: THREE.Object3D,
): LowPolyShanghaiVisualOptimizer {
  const update = (focus: THREE.Vector3, force = false): void => {
    void focus
    void force
  }

  void root
  return { update }
}

export interface LowPolyShanghaiTriangleErase {
  point: { x: number; y: number; z: number }
  radius: number
  meshName?: string | null
  verticalOnly?: boolean
  connectedOnly?: boolean
}

export function eraseLowPolyShanghaiTriangles(
  root: THREE.Object3D,
  deletion: LowPolyShanghaiTriangleErase,
): number {
  const target = new THREE.Vector3(deletion.point.x, deletion.point.y, deletion.point.z)
  const radiusSq = Math.max(0.05, deletion.radius) ** 2
  const verticalOnly = deletion.verticalOnly ?? true
  let removed = 0
  root.updateMatrixWorld(true)

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry || !obj.visible) return
    if (deletion.meshName && obj.name !== deletion.meshName) return

    const source = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()
    const position = source.getAttribute('position')
    if (!position || position.count < 3) return

    const matrixWorld = obj.matrixWorld.clone()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const center = new THREE.Vector3()
    const normal = new THREE.Vector3()
    const keep: number[] = []

    if (deletion.connectedOnly) {
      let seedTriangle = -1
      let seedDistanceSq = Infinity
      for (let i = 0; i < position.count; i += 3) {
        a.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)
        b.fromBufferAttribute(position, i + 1).applyMatrix4(matrixWorld)
        c.fromBufferAttribute(position, i + 2).applyMatrix4(matrixWorld)
        center.copy(a).add(b).add(c).multiplyScalar(1 / 3)
        const distanceSq = center.distanceToSquared(target)
        if (distanceSq < seedDistanceSq) {
          seedDistanceSq = distanceSq
          seedTriangle = i / 3
        }
      }
      if (seedTriangle < 0 || seedDistanceSq > radiusSq) return

      const triangleCount = position.count / 3
      const trianglesByVertex = new Map<string, number[]>()
      const vertexKey = (index: number): string => {
        const precision = 1000
        return `${Math.round(position.getX(index) * precision)}:${Math.round(position.getY(index) * precision)}:${Math.round(position.getZ(index) * precision)}`
      }
      for (let triangle = 0; triangle < triangleCount; triangle++) {
        const offset = triangle * 3
        for (let vertex = 0; vertex < 3; vertex++) {
          const key = vertexKey(offset + vertex)
          const linked = trianglesByVertex.get(key)
          if (linked) linked.push(triangle)
          else trianglesByVertex.set(key, [triangle])
        }
      }

      const selected = new Uint8Array(triangleCount)
      const queue = [seedTriangle]
      selected[seedTriangle] = 1
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const triangle = queue[cursor]
        const offset = triangle * 3
        for (let vertex = 0; vertex < 3; vertex++) {
          for (const linked of trianglesByVertex.get(vertexKey(offset + vertex)) ?? []) {
            if (selected[linked]) continue
            selected[linked] = 1
            queue.push(linked)
          }
        }
      }

      for (let triangle = 0; triangle < triangleCount; triangle++) {
        const offset = triangle * 3
        if (selected[triangle]) removed++
        else keep.push(offset, offset + 1, offset + 2)
      }
    } else {

      for (let i = 0; i < position.count; i += 3) {
        a.fromBufferAttribute(position, i).applyMatrix4(matrixWorld)
        b.fromBufferAttribute(position, i + 1).applyMatrix4(matrixWorld)
        c.fromBufferAttribute(position, i + 2).applyMatrix4(matrixWorld)
        center.copy(a).add(b).add(c).multiplyScalar(1 / 3)
        normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
        const matchesSurface = !verticalOnly || Math.abs(normal.y) < 0.72
        if (matchesSurface && center.distanceToSquared(target) <= radiusSq) {
          removed++
        } else {
          keep.push(i, i + 1, i + 2)
        }
      }
    }

    if (keep.length === position.count) return
    if (keep.length === 0) {
      obj.visible = false
      return
    }

    const next = new THREE.BufferGeometry()
    for (const name of Object.keys(source.attributes)) {
      const attr = source.getAttribute(name)
      const values: number[] = []
      for (const vertexIndex of keep) {
        for (let component = 0; component < attr.itemSize; component++) {
          values.push(attributeValue(attr, vertexIndex, component))
        }
      }
      next.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(values), attr.itemSize, attr.normalized),
      )
    }
    next.computeBoundingBox()
    next.computeBoundingSphere()
    obj.geometry = next
  })

  return removed
}

function getDracoLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderConfig({ type: 'js' })
    dracoLoader.setWorkerLimit(1)
    ;(dracoLoader as unknown as {
      _loadLibrary: (url: string, responseType: string) => Promise<string | ArrayBuffer>
    })._loadLibrary = async (url: string) => {
      if (url.endsWith('draco_decoder.js')) return dracoDecoderJs
      throw new Error(`Unsupported Draco decoder asset: ${url}`)
    }
  }
  return dracoLoader
}

export function addLowPolyShanghai(
  scene: THREE.Scene,
  initialPlacement: Partial<LowPolyShanghaiPlacement> = {},
): LowPolyShanghaiBundle {
  const group = new THREE.Group()
  group.name = 'lowpoly-shanghai-root'
  scene.add(group)

  const placement: LowPolyShanghaiPlacement = {
    ...LOW_POLY_SHANGHAI_PLACEMENT,
    ...initialPlacement,
  }

  const applyPlacement = (): void => {
    group.position.set(placement.x, placement.y, placement.z)
    group.rotation.y = THREE.MathUtils.degToRad(placement.yawDeg)
    group.scale.setScalar(Math.max(0.001, placement.scale))
  }
  applyPlacement()

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  loader.setDRACOLoader(getDracoLoader())
  const ready = new Promise<LowPolyShanghaiLoadResult>((resolve, reject) => {
    loader.load(
      lowPolyShanghaiUrl,
      async (gltf) => {
        const model = gltf.scene
        model.name = 'shanghai-international-circuit-full-model'
        await prepareShanghai2018Materials(model)
        model.updateMatrixWorld(true)

        model.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          obj.castShadow = false
          obj.receiveShadow = meshHasRoadSurfaceHint(obj)
          obj.frustumCulled = true
          obj.visible = !meshIsColliderOnly(obj)
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of materials) {
            mat.needsUpdate = true
          }
        })

        const initialBox = new THREE.Box3().setFromObject(model)
        const initialCenter = initialBox.getCenter(new THREE.Vector3())
        model.position.x -= initialCenter.x
        model.position.z -= initialCenter.z
        model.position.y -= initialBox.min.y
        group.add(model)

        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        resolve({ model, box, size, center })
      },
      undefined,
      reject,
    )
  })

  return {
    group,
    getPlacement: () => ({ ...placement }),
    setPlacement: (next) => {
      Object.assign(placement, next)
      applyPlacement()
    },
    ready,
  }
}

function materialNameForHit(hit: THREE.Intersection): string {
  const mesh = hit.object as THREE.Mesh
  const mat = mesh.material
  if (!mat) return ''
  if (!Array.isArray(mat)) return mat.name ?? ''
  const index = hit.face?.materialIndex ?? 0
  return mat[index]?.name ?? ''
}

function hitHasRoadHint(hit: THREE.Intersection): boolean {
  const name = `${hit.object.name} ${materialNameForHit(hit)}`.toLowerCase()
  return ROAD_SURFACE_HINTS.some((hint) => name.includes(hint))
}

function hitHasDriveSurfaceHint(hit: THREE.Intersection): boolean {
  const materialName = materialNameForHit(hit)
  return SHANGHAI_2018_DRIVE_SURFACE_MATERIALS.has(materialName) || hitHasRoadHint(hit)
}

function hitNormalY(hit: THREE.Intersection): number {
  if (!hit.face) return 0
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize().y
}

function hitWorldNormal(hit: THREE.Intersection): THREE.Vector3 {
  if (!hit.face) return new THREE.Vector3(0, 1, 0)
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()
}

function collectRoadSurfaceTargets(root: THREE.Object3D): THREE.Object3D[] {
  const roadTargets: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.driveVisualChunk && meshHasRoadSurfaceHint(obj)) {
      roadTargets.push(obj)
    }
  })
  return roadTargets
}

function collectGroundSurfaceTargets(root: THREE.Object3D): THREE.Object3D[] {
  const groundTargets: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.driveVisualChunk && meshHasGroundSurfaceHint(obj)) {
      groundTargets.push(obj)
    }
  })
  return groundTargets
}

function collectObstacleSurfaceTargets(root: THREE.Object3D): THREE.Mesh[] {
  const obstacleTargets: THREE.Mesh[] = []
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj.userData.driveVisualChunk) return
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    if (materials.some((material) => materialHasObstacleSurfaceHint(obj, material.name ?? '', materials.length))) {
      obstacleTargets.push(obj)
    }
  })
  return obstacleTargets
}

export function createLowPolyShanghaiObstacleSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
): LowPolyShanghaiObstacleSampler {
  const obstacleTargets = collectObstacleSurfaceTargets(lowPolyShanghai.group)
  const cellSize = 8
  const maxPointsPerMesh = 6000
  const maxPointsPerCell = 36
  const obstaclePadding = 0.2
  const grid = new Map<string, THREE.Vector3[]>()
  const tmp = new THREE.Vector3()
  const triangleA = new THREE.Vector3()
  const triangleB = new THREE.Vector3()
  const triangleC = new THREE.Vector3()
  const triangleCenter = new THREE.Vector3()
  const triangleNormal = new THREE.Vector3()
  const triangleEdgeA = new THREE.Vector3()
  const triangleEdgeB = new THREE.Vector3()

  const cellKey = (x: number, z: number): string => `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`
  const addPoint = (point: THREE.Vector3): void => {
    const key = cellKey(point.x, point.z)
    const bucket = grid.get(key)
    if (bucket) {
      if (bucket.length >= maxPointsPerCell) return
      bucket.push(point.clone())
    } else {
      grid.set(key, [point.clone()])
    }
  }

  lowPolyShanghai.group.updateMatrixWorld(true)
  for (const target of obstacleTargets) {
    const position = target.geometry.getAttribute('position')
    if (!position) continue
    const index = target.geometry.getIndex()
    const materials = Array.isArray(target.material) ? target.material : [target.material]
    const ranges = target.geometry.groups.length > 0
      ? target.geometry.groups.filter((group) => {
          const material = materials[group.materialIndex ?? 0]
          return materialHasObstacleSurfaceHint(target, material?.name ?? '', materials.length)
        })
      : materialHasObstacleSurfaceHint(target, materials[0]?.name ?? '', materials.length)
        ? [{ start: 0, count: index?.count ?? position.count, materialIndex: 0 }]
        : []
    const eligibleTriangleCount = ranges.reduce((sum, range) => sum + Math.floor(range.count / 3), 0)
    const triangleStep = Math.max(1, Math.ceil(eligibleTriangleCount / maxPointsPerMesh))
    for (const range of ranges) {
      const end = Math.min(range.start + range.count, index?.count ?? position.count)
      for (let offset = range.start; offset + 2 < end; offset += triangleStep * 3) {
        const vertexA = index ? index.getX(offset) : offset
        const vertexB = index ? index.getX(offset + 1) : offset + 1
        const vertexC = index ? index.getX(offset + 2) : offset + 2
        triangleA.fromBufferAttribute(position, vertexA).applyMatrix4(target.matrixWorld)
        triangleB.fromBufferAttribute(position, vertexB).applyMatrix4(target.matrixWorld)
        triangleC.fromBufferAttribute(position, vertexC).applyMatrix4(target.matrixWorld)
        triangleEdgeA.subVectors(triangleB, triangleA)
        triangleEdgeB.subVectors(triangleC, triangleA)
        triangleNormal.crossVectors(triangleEdgeA, triangleEdgeB)
        if (triangleNormal.lengthSq() < 1e-8) continue
        triangleNormal.normalize()
        if (Math.abs(triangleNormal.y) > 0.5) continue
        const verticalSpan = Math.max(triangleA.y, triangleB.y, triangleC.y) - Math.min(triangleA.y, triangleB.y, triangleC.y)
        if (verticalSpan < 0.35) continue
        triangleCenter.copy(triangleA).add(triangleB).add(triangleC).multiplyScalar(1 / 3)
        if (Number.isFinite(triangleCenter.x) && Number.isFinite(triangleCenter.y) && Number.isFinite(triangleCenter.z)) {
          addPoint(triangleCenter)
          tmp.copy(triangleA).add(triangleB).multiplyScalar(0.5)
          addPoint(tmp)
          tmp.copy(triangleB).add(triangleC).multiplyScalar(0.5)
          addPoint(tmp)
          tmp.copy(triangleC).add(triangleA).multiplyScalar(0.5)
          addPoint(tmp)
        }
      }
    }
  }

  const sampleObstacleNear = (
    point: THREE.Vector3,
    options: LowPolyShanghaiObstacleQuery = {},
  ): LowPolyShanghaiObstacleHit | null => {
    if (grid.size === 0) return null
    const radius = options.radius ?? 1.1
    const queryRadius = radius + obstaclePadding
    const queryRadiusSq = queryRadius * queryRadius
    const minCellX = Math.floor((point.x - queryRadius) / cellSize)
    const maxCellX = Math.floor((point.x + queryRadius) / cellSize)
    const minCellZ = Math.floor((point.z - queryRadius) / cellSize)
    const maxCellZ = Math.floor((point.z + queryRadius) / cellSize)
    const minY = point.y - 0.8
    const maxY = point.y + 3.2
    let closest: LowPolyShanghaiObstacleHit | null = null

    for (let ix = minCellX; ix <= maxCellX; ix++) {
      for (let iz = minCellZ; iz <= maxCellZ; iz++) {
        const bucket = grid.get(`${ix}:${iz}`)
        if (!bucket) continue
        for (const candidate of bucket) {
          if (candidate.y < minY || candidate.y > maxY) continue
          const dx = point.x - candidate.x
          const dz = point.z - candidate.z
          const dSq = dx * dx + dz * dz
          if (dSq > queryRadiusSq) continue
          if (!closest || dSq < closest.distance * closest.distance) {
            const normal = new THREE.Vector3(dx, 0, dz)
            if (normal.lengthSq() < 1e-5) {
              normal.copy(options.side ?? new THREE.Vector3(1, 0, 0))
            }
            normal.normalize()
            closest = {
              point: candidate.clone(),
              normal,
              distance: Math.sqrt(dSq),
            }
          }
        }
      }
    }

    return closest
  }

  const sampleObstacleBetween = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    options: LowPolyShanghaiObstacleQuery = {},
  ): LowPolyShanghaiObstacleHit | null => {
    tmp.copy(to)
    if (from.distanceToSquared(to) > 0.001) {
      tmp.lerp(from, 0.25)
    }
    return sampleObstacleNear(tmp, options) ?? sampleObstacleNear(to, options)
  }

  return { sampleObstacleBetween, sampleObstacleNear }
}

export function createLowPolyShanghaiGroundSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
): LowPolyShanghaiGroundSampler {
  const raycaster = new THREE.Raycaster()
  const origin = new THREE.Vector3()
  const down = new THREE.Vector3(0, -1, 0)
  const roadTargets = collectRoadSurfaceTargets(lowPolyShanghai.group)
  const groundTargets = collectGroundSurfaceTargets(lowPolyShanghai.group)
  const cache = new Map<string, LowPolyShanghaiGroundHit | null>()
  let lastPlacementKey = ''
  let matrixWorldFresh = false

  const placementKey = (): string => {
    const p = lowPolyShanghai.getPlacement()
    return `${p.x}:${p.y}:${p.z}:${p.yawDeg}:${p.scale}`
  }

  const sampleGroundAt = (x: number, z: number): LowPolyShanghaiGroundHit | null => {
    const keyNow = placementKey()
    if (keyNow !== lastPlacementKey) {
      cache.clear()
      lastPlacementKey = keyNow
      matrixWorldFresh = false
    }
    const key = `${Math.round(x * 20)}:${Math.round(z * 20)}`
    if (cache.has(key)) {
      const cached = cache.get(key)
      return cached
        ? {
            point: cached.point.clone(),
            normal: cached.normal.clone(),
            isRoad: cached.isRoad,
            isRunoff: cached.isRunoff,
          }
        : null
    }

    if (!matrixWorldFresh) {
      lowPolyShanghai.group.updateMatrixWorld(true)
      matrixWorldFresh = true
    }
    origin.set(x, 3000, z)
    raycaster.set(origin, down)
    raycaster.near = 0
    raycaster.far = 6000
    const targets = groundTargets.length ? groundTargets : (roadTargets.length ? roadTargets : [lowPolyShanghai.group])
    const hits = raycaster.intersectObjects(targets, true)
    const runoffHit = hits.find((hit) =>
      SHANGHAI_2018_ROADLIKE_RUNOFF_MATERIALS.has(materialNameForHit(hit)),
    ) ?? null
    const physicalSurfaceHit = hits.find((hit) =>
      !SHANGHAI_2018_ROADLIKE_RUNOFF_MATERIALS.has(materialNameForHit(hit)) &&
      hitHasDriveSurfaceHint(hit) &&
      hitNormalY(hit) > 0.25,
    ) ?? null
    const surfaceHit = physicalSurfaceHit ??
      (runoffHit && hitNormalY(runoffHit) > 0.25 ? runoffHit : null) ??
      hits.find((hit) => hitNormalY(hit) > 0.25) ?? null
    if (!surfaceHit) {
      cache.set(key, null)
      return null
    }

    const surfaceMaterialName = materialNameForHit(surfaceHit)
    const result: LowPolyShanghaiGroundHit = {
      point: surfaceHit.point.clone(),
      normal: hitWorldNormal(surfaceHit),
      isRoad: hitHasRoadHint(surfaceHit) || runoffHit !== null,
      isRunoff: runoffHit !== null || SHANGHAI_2018_ROADLIKE_RUNOFF_MATERIALS.has(surfaceMaterialName),
    }
    if (cache.size > 16000) cache.clear()
    cache.set(key, result)
    return {
      point: result.point.clone(),
      normal: result.normal.clone(),
      isRoad: result.isRoad,
      isRunoff: result.isRunoff,
    }
  }

  return { sampleGroundAt }
}

export async function createLowPolyShanghaiGroundGridSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
  options: LowPolyShanghaiGroundGridOptions = {},
): Promise<LowPolyShanghaiGroundSampler> {
  const cellSize = options.cellSize ?? 8
  const startedAt = performance.now()
  const timeBudgetMs = options.timeBudgetMs ?? Number.POSITIVE_INFINITY
  const rawSampler = createLowPolyShanghaiGroundSampler(lowPolyShanghai)
  const box = new THREE.Box3().setFromObject(lowPolyShanghai.group)
  const minX = Math.floor((box.min.x - 24) / cellSize) * cellSize
  const maxX = Math.ceil((box.max.x + 24) / cellSize) * cellSize
  const minZ = Math.floor((box.min.z - 24) / cellSize) * cellSize
  const maxZ = Math.ceil((box.max.z + 24) / cellSize) * cellSize
  const cols = Math.max(2, Math.ceil((maxX - minX) / cellSize) + 1)
  const rows = Math.max(2, Math.ceil((maxZ - minZ) / cellSize) + 1)
  const total = cols * rows
  const y = new Float32Array(total)
  const nx = new Float32Array(total)
  const ny = new Float32Array(total)
  const nz = new Float32Array(total)
  const hit = new Uint8Array(total)
  const road = new Uint8Array(total)
  const runoff = new Uint8Array(total)

  const idx = (col: number, row: number): number => row * cols + col
  for (let row = 0; row < rows; row++) {
    if (performance.now() - startedAt > timeBudgetMs) {
      throw new Error(`ground grid bake exceeded ${Math.round(timeBudgetMs)}ms`)
    }
    for (let col = 0; col < cols; col++) {
      const sample = rawSampler.sampleGroundAt(minX + col * cellSize, minZ + row * cellSize)
      const i = idx(col, row)
      if (!sample) {
        y[i] = 0
        ny[i] = 1
        continue
      }
      hit[i] = 1
      road[i] = sample.isRoad ? 1 : 0
      runoff[i] = sample.isRunoff ? 1 : 0
      y[i] = sample.point.y
      nx[i] = sample.normal.x
      ny[i] = sample.normal.y
      nz[i] = sample.normal.z
    }
    if (row % 3 === 0) {
      options.onProgress?.((row + 1) / rows, 'baking ground')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  }
  options.onProgress?.(1, 'ground ready')

  const nearestValid = (col: number, row: number): number => {
    const baseCol = Math.max(0, Math.min(cols - 1, col))
    const baseRow = Math.max(0, Math.min(rows - 1, row))
    let best = -1
    let bestD = Infinity
    for (let r = 0; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue
          const c = baseCol + dx
          const rr = baseRow + dz
          if (c < 0 || c >= cols || rr < 0 || rr >= rows) continue
          const i = idx(c, rr)
          if (!hit[i]) continue
          const d = dx * dx + dz * dz
          if (d < bestD) {
            bestD = d
            best = i
          }
        }
      }
      if (best >= 0) return best
    }
    return -1
  }

  const sampleGroundAt = (x: number, z: number): LowPolyShanghaiGroundHit | null => {
    const gx = (x - minX) / cellSize
    const gz = (z - minZ) / cellSize
    const col0 = Math.floor(gx)
    const row0 = Math.floor(gz)
    const tx = gx - col0
    const tz = gz - row0
    if (col0 < 0 || row0 < 0 || col0 >= cols - 1 || row0 >= rows - 1) {
      return rawSampler.sampleGroundAt(x, z)
    }
    const i00 = idx(col0, row0)
    const i10 = idx(col0 + 1, row0)
    const i01 = idx(col0, row0 + 1)
    const i11 = idx(col0 + 1, row0 + 1)
    const allHit = hit[i00] && hit[i10] && hit[i01] && hit[i11]

    if (!allHit) {
      const exact = rawSampler.sampleGroundAt(x, z)
      if (exact) return exact
      const nearest = nearestValid(Math.round(gx), Math.round(gz))
      if (nearest < 0) return null
      return {
        point: new THREE.Vector3(x, y[nearest], z),
        normal: new THREE.Vector3(nx[nearest], ny[nearest], nz[nearest]).normalize(),
        isRoad: road[nearest] === 1,
        isRunoff: runoff[nearest] === 1,
      }
    }

    const w00 = (1 - tx) * (1 - tz)
    const w10 = tx * (1 - tz)
    const w01 = (1 - tx) * tz
    const w11 = tx * tz
    const sy = y[i00] * w00 + y[i10] * w10 + y[i01] * w01 + y[i11] * w11
    const normal = new THREE.Vector3(
      nx[i00] * w00 + nx[i10] * w10 + nx[i01] * w01 + nx[i11] * w11,
      ny[i00] * w00 + ny[i10] * w10 + ny[i01] * w01 + ny[i11] * w11,
      nz[i00] * w00 + nz[i10] * w10 + nz[i01] * w01 + nz[i11] * w11,
    ).normalize()
    const roadWeight = road[i00] * w00 + road[i10] * w10 + road[i01] * w01 + road[i11] * w11
    const runoffWeight = runoff[i00] * w00 + runoff[i10] * w10 + runoff[i01] * w01 + runoff[i11] * w11
    return {
      point: new THREE.Vector3(x, sy, z),
      normal,
      isRoad: roadWeight >= 0.5,
      isRunoff: runoffWeight > 0.05,
    }
  }

  return { sampleGroundAt }
}

export function createLowPolyShanghaiSurfaceSampler(
  lowPolyShanghai: LowPolyShanghaiBundle,
  options: { verticalOffset?: number } = {},
): LowPolyShanghaiSurfaceSampler {
  const groundSampler = createLowPolyShanghaiGroundSampler(lowPolyShanghai)
  const verticalOffset = options.verticalOffset ?? 0.06

  const sampleHeightAt = (x: number, z: number, fallbackY = 0): number | null => {
    const hit = groundSampler.sampleGroundAt(x, z)
    return hit ? hit.point.y + verticalOffset : fallbackY
  }

  return { sampleHeightAt }
}
