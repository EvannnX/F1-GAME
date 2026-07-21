import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { readSelectedPlayerCar } from '../data/playerCars'
import { createCar } from '../render/car'

const MAP_URL = 'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb'
const CAR_VISUAL_SCALE = 0.8
const CAR_GROUND_SINK_M = 0.13
const PLACEHOLDER_CLUSTER_DISTANCE_M = 4
const ASPHALT_TEXTURE_URL = '/src/shanghai-international-circuit-2018-layout/textures/asphalt-new.png'
const PADDOCK_ASPHALT_TEXTURE_URL =
  '/src/shanghai-international-circuit-2018-layout/textures/PAT_asf_out_123.png'
const MATERIAL_TEXTURE_OVERRIDES: Record<string, string> = {
  Prato: '/src/shanghai-international-circuit-2018-layout/textures/Meshesgrassxgrass0171_diff_18.png',
  tarmac: ASPHALT_TEXTURE_URL,
  '14': PADDOCK_ASPHALT_TEXTURE_URL,
  '15': PADDOCK_ASPHALT_TEXTURE_URL,
  Pit_lane: PADDOCK_ASPHALT_TEXTURE_URL,
}
const CAMERA_BOUNDS_EXCLUDED_MATERIALS = new Set(['sha_distantbuildings_a'])
const ALPHA_CUTOUT_MATERIALS = new Set([
  'lg_pit_exit_light_b_01',
  'Recinto',
  'sha_barrier_grandstandboundary_a',
  'sha_grandstand_group_d',
  'core_start_lights_a',
  'lg_marshal_light_b_light',
  'lg_marshal_light_b_screen',
  'tree04a',
  'tree04b',
  'tree06a',
  'treeline',
  'sha_distantbuildings_a',
  'standard_1!0',
  'sha_grandstand_group_d!0',
  'sha_gridlines_a',
  'sha_grandstand_underbrolly_b_02',
  'sha_grandstand_underbrolly_b_03',
  'aa_4',
  'aa_3',
  'sha_barrier_pitwall_a!0',
])
const ALPHA_BLEND_MATERIALS = new Set([
  'material_sha_building_glasstower_a_01',
  'aa_3!0',
  'sha_building_commstower_a',
  'sha_hut_pitlanetower_a',
  'sha_pole_ranking_a!0',
  'sha_pole_ranking_a',
  'sha_building_glasstower_a_03',
  'aa_1!0',
])
const ROAD_DECAL_MATERIALS = new Set([
  '01_-_default',
  'skid',
  'raceline',
  'Line_asf',
  'LInea_PITNew',
])
const DRIVE_SURFACE_MATERIALS = new Set([
  'tarmac', '14', '15', 'Pit_lane', 'Out', 'Prato', '28', '35', '32',
  '17', '16', '13', '9!0', '12',
  'Pirelli_terra', 'Petronas_out', 'Out_rolex', '2!0', '24', '22', '23',
  '20', '21', 'Kerb_giallo',
])
const SURFACE_CELL_SIZE_M = 20

function cameraGeometryBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return
    const geometry = object.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    if (!position) return
    const index = geometry.getIndex()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index?.count ?? position.count, materialIndex: 0 }]

    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0]
      if (!material || CAMERA_BOUNDS_EXCLUDED_MATERIALS.has(material.name)) continue
      const end = Math.min(group.start + group.count, index?.count ?? position.count)
      for (let offset = group.start; offset < end; offset += 1) {
        const vertex = index ? index.getX(offset) : offset
        point.fromBufferAttribute(position, vertex).applyMatrix4(object.matrixWorld)
        box.expandByPoint(point)
      }
    }
  })
  return box
}

interface TrackPlacement {
  position: THREE.Vector3
  forward: THREE.Vector3
  normal: THREE.Vector3
}

interface SurfaceTriangle {
  a: THREE.Vector3
  b: THREE.Vector3
  c: THREE.Vector3
  normal: THREE.Vector3
}

interface SurfaceSample {
  position: THREE.Vector3
  normal: THREE.Vector3
}

type GroundSampler = (x: number, z: number, referenceY: number) => SurfaceSample | null

function createGroundSampler(root: THREE.Object3D): GroundSampler {
  const cells = new Map<string, SurfaceTriangle[]>()
  const key = (x: number, z: number): string => `${x},${z}`
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  root.updateMatrixWorld(true)

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position || !index) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index.count, materialIndex: 0 }]

    for (const group of groups) {
      if (!DRIVE_SURFACE_MATERIALS.has(materials[group.materialIndex ?? 0]?.name)) continue
      const end = Math.min(group.start + group.count, index.count)
      for (let offset = group.start; offset + 2 < end; offset += 3) {
        a.fromBufferAttribute(position, index.getX(offset)).applyMatrix4(object.matrixWorld)
        b.fromBufferAttribute(position, index.getX(offset + 1)).applyMatrix4(object.matrixWorld)
        c.fromBufferAttribute(position, index.getX(offset + 2)).applyMatrix4(object.matrixWorld)
        const normal = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a),
        ).normalize()
        if (normal.y < 0) normal.negate()
        if (normal.y < 0.65) continue
        const triangle = { a: a.clone(), b: b.clone(), c: c.clone(), normal }
        const minCellX = Math.floor(Math.min(a.x, b.x, c.x) / SURFACE_CELL_SIZE_M)
        const maxCellX = Math.floor(Math.max(a.x, b.x, c.x) / SURFACE_CELL_SIZE_M)
        const minCellZ = Math.floor(Math.min(a.z, b.z, c.z) / SURFACE_CELL_SIZE_M)
        const maxCellZ = Math.floor(Math.max(a.z, b.z, c.z) / SURFACE_CELL_SIZE_M)
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
            const cellKey = key(cellX, cellZ)
            const bucket = cells.get(cellKey) ?? []
            bucket.push(triangle)
            cells.set(cellKey, bucket)
          }
        }
      }
    }
  })

  return (x, z, referenceY) => {
    const cellX = Math.floor(x / SURFACE_CELL_SIZE_M)
    const cellZ = Math.floor(z / SURFACE_CELL_SIZE_M)
    const candidates = cells.get(key(cellX, cellZ)) ?? []
    let best: SurfaceSample | null = null
    let bestDistance = Infinity
    for (const triangle of candidates) {
      const { a: ta, b: tb, c: tc } = triangle
      const denominator = (tb.z - tc.z) * (ta.x - tc.x) + (tc.x - tb.x) * (ta.z - tc.z)
      if (Math.abs(denominator) < 1e-7) continue
      const u = ((tb.z - tc.z) * (x - tc.x) + (tc.x - tb.x) * (z - tc.z)) / denominator
      const v = ((tc.z - ta.z) * (x - tc.x) + (ta.x - tc.x) * (z - tc.z)) / denominator
      const w = 1 - u - v
      if (u < -0.002 || v < -0.002 || w < -0.002) continue
      const y = u * ta.y + v * tb.y + w * tc.y
      const distance = Math.abs(y - referenceY)
      if (distance >= bestDistance) continue
      bestDistance = distance
      best = {
        position: new THREE.Vector3(x, y, z),
        normal: triangle.normal,
      }
    }
    return best
  }
}

interface MaterialGuide {
  center: THREE.Vector3
  forward: THREE.Vector3
  length: number
}

function materialGeometryGuide(root: THREE.Object3D, materialName: string): MaterialGuide | null {
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position || !index) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index.count, materialIndex: 0 }]
    for (const group of groups) {
      if (materials[group.materialIndex ?? 0]?.name !== materialName) continue
      const end = Math.min(group.start + group.count, index.count)
      for (let offset = group.start; offset < end; offset += 1) {
        point.fromBufferAttribute(position, index.getX(offset)).applyMatrix4(object.matrixWorld)
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

function findTrackPlacement(
  root: THREE.Object3D,
  materialName: string,
  target: THREE.Vector3 | null,
): TrackPlacement | null {
  let best: TrackPlacement | null = null
  let bestScore = -Infinity
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const edge = new THREE.Vector3()

  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position || !index) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const groups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index.count, materialIndex: 0 }]

    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0]
      if (material?.name !== materialName) continue
      const end = Math.min(group.start + group.count, index.count)
      for (let offset = group.start; offset + 2 < end; offset += 3) {
        a.fromBufferAttribute(position, index.getX(offset)).applyMatrix4(object.matrixWorld)
        b.fromBufferAttribute(position, index.getX(offset + 1)).applyMatrix4(object.matrixWorld)
        c.fromBufferAttribute(position, index.getX(offset + 2)).applyMatrix4(object.matrixWorld)
        ab.subVectors(b, a)
        ac.subVectors(c, a)
        const normal = new THREE.Vector3().crossVectors(ab, ac)
        const area = normal.length() * 0.5
        if (area < 2) continue
        normal.normalize()
        if (normal.y < 0) normal.negate()
        if (normal.y < 0.92) continue

        const center = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3)
        const score = target ? -center.distanceToSquared(target) : area
        if (score <= bestScore) continue

        const edges = [
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, b),
          new THREE.Vector3().subVectors(a, c),
        ]
        edge.copy(edges.reduce((longest, candidate) => (
          candidate.lengthSq() > longest.lengthSq() ? candidate : longest
        )))
        edge.addScaledVector(normal, -edge.dot(normal)).normalize()
        bestScore = score
        best = {
          position: center,
          forward: edge.clone(),
          normal: normal.clone(),
        }
      }
    }
  })
  return best
}

function removeNearestPlaceholder(
  root: THREE.Object3D,
  materialName: string,
  target: THREE.Vector3,
): THREE.Vector3 | null {
  let removedCenter: THREE.Vector3 | null = null
  let nearestDistanceSq = Infinity
  root.updateMatrixWorld(true)

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((material) => material.name === materialName)) return
    const geometry = object.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    if (!position || !index) return

    const triangles: Array<{ offset: number; center: THREE.Vector3 }> = []
    const point = new THREE.Vector3()
    for (let offset = 0; offset + 2 < index.count; offset += 3) {
      const center = new THREE.Vector3()
      for (let corner = 0; corner < 3; corner += 1) {
        point.fromBufferAttribute(position, index.getX(offset + corner)).applyMatrix4(object.matrixWorld)
        center.add(point)
      }
      triangles.push({ offset, center: center.multiplyScalar(1 / 3) })
    }

    const pending = new Set(triangles.map((_, triangleIndex) => triangleIndex))
    let selectedCluster: number[] | null = null
    while (pending.size > 0) {
      const first = pending.values().next().value as number
      const cluster = [first]
      pending.delete(first)
      for (let cursor = 0; cursor < cluster.length; cursor += 1) {
        const current = triangles[cluster[cursor]].center
        for (const candidate of [...pending]) {
          if (current.distanceTo(triangles[candidate].center) > PLACEHOLDER_CLUSTER_DISTANCE_M) continue
          pending.delete(candidate)
          cluster.push(candidate)
        }
      }

      const box = new THREE.Box3()
      for (const triangleIndex of cluster) box.expandByPoint(triangles[triangleIndex].center)
      const center = box.getCenter(new THREE.Vector3())
      const distanceSq = center.distanceToSquared(target)
      if (distanceSq >= nearestDistanceSq) continue
      nearestDistanceSq = distanceSq
      removedCenter = center
      selectedCluster = cluster
    }

    if (selectedCluster) {
      const removedOffsets = new Set(selectedCluster.map((triangleIndex) => triangles[triangleIndex].offset))
      const kept: number[] = []
      for (let offset = 0; offset + 2 < index.count; offset += 3) {
        if (removedOffsets.has(offset)) continue
        kept.push(index.getX(offset), index.getX(offset + 1), index.getX(offset + 2))
      }
      geometry.setIndex(kept)
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
    }
  })
  return removedCenter
}

export function isShanghai2018MapTestEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('map2018Test') === '1' || params.get('testMap') === 'shanghai2018'
}

export function installShanghai2018MapTest(container: HTMLElement): void {
  container.replaceChildren()
  container.style.position = 'fixed'
  container.style.inset = '0'
  document.body.style.background = '#b9cedb'
  const rotateMask = document.getElementById('rotate-mask')
  if (rotateMask) rotateMask.style.setProperty('display', 'none', 'important')

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#b9cedb')

  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 30000)
  camera.position.set(1200, 900, 1400)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.screenSpacePanning = true
  controls.maxPolarAngle = Math.PI * 0.5
  controls.target.set(0, 0, 0)

  scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x5f6854, 1.25))
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.15)
  sun.position.set(-900, 1800, 1100)
  scene.add(sun)

  const status = document.createElement('div')
  status.style.cssText = `
    position:absolute;left:14px;top:14px;z-index:4;
    min-width:190px;padding:10px 12px;border:1px solid rgba(255,255,255,.34);
    border-radius:6px;background:rgba(10,16,24,.82);color:#fff;
    font:600 12px/1.45 system-ui,-apple-system,"PingFang SC",sans-serif;
    letter-spacing:0;pointer-events:none;backdrop-filter:blur(8px);
  `
  status.textContent = '正在加载 Shanghai 2018 地图…'
  container.appendChild(status)

  const toolbar = document.createElement('div')
  toolbar.style.cssText = `
    position:absolute;right:14px;top:14px;z-index:4;
    display:flex;gap:6px;padding:6px;border:1px solid rgba(255,255,255,.3);
    border-radius:6px;background:rgba(10,16,24,.78);backdrop-filter:blur(8px);
  `
  container.appendChild(toolbar)

  let model: THREE.Object3D | null = null
  const textureOverrideMaterials = new Map<string, THREE.MeshStandardMaterial[]>()
  const blueRunoffMaterials: THREE.MeshStandardMaterial[] = []
  const blueRunoffContinuation: Array<{
    material: THREE.MeshStandardMaterial
    object: THREE.Mesh
  }> = []
  let mapCenter = new THREE.Vector3()
  let mapSize = new THREE.Vector3(3500, 200, 3500)
  const car = createCar({ carId: readSelectedPlayerCar(), visualScale: CAR_VISUAL_SCALE })
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32),
    new THREE.MeshBasicMaterial({
      color: '#05070a',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  )
  contactShadow.name = 'shanghai-test-car-contact-shadow'
  contactShadow.rotation.x = -Math.PI / 2
  contactShadow.position.y = CAR_GROUND_SINK_M / CAR_VISUAL_SCALE + 0.006
  contactShadow.scale.set(1.15, 2.35, 1)
  contactShadow.renderOrder = 3
  car.group.add(contactShadow)
  car.group.visible = false
  car.particles.visible = false
  scene.add(car.group, car.particles)
  let carPlacement: TrackPlacement | null = null
  const pressedKeys = new Set<string>()
  let carSpeed = 0
  const drivePosition = new THREE.Vector3()
  const driveForward = new THREE.Vector3(0, 0, 1)
  const driveNormal = new THREE.Vector3(0, 1, 0)
  let groundSampler: GroundSampler | null = null

  const onKeyChange = (event: KeyboardEvent, pressed: boolean): void => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) return
    event.preventDefault()
    if (pressed) pressedKeys.add(event.code)
    else pressedKeys.delete(event.code)
  }
  window.addEventListener('keydown', (event) => onKeyChange(event, true))
  window.addEventListener('keyup', (event) => onKeyChange(event, false))
  window.addEventListener('blur', () => {
    pressedKeys.clear()
    carSpeed = 0
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') return
    pressedKeys.clear()
    carSpeed = 0
  })

  const fitView = (view: 'perspective' | 'top'): void => {
    const maxHorizontal = Math.max(mapSize.x, mapSize.z)
    const fov = THREE.MathUtils.degToRad(camera.fov)
    const distance = Math.max(100, (maxHorizontal * 0.42) / Math.tan(fov * 0.5))
    camera.near = Math.max(0.1, maxHorizontal / 12000)
    camera.far = Math.max(10000, maxHorizontal * 7)
    camera.up.set(0, 1, 0)
    if (view === 'top') {
      camera.position.set(mapCenter.x, mapCenter.y + distance, mapCenter.z + 0.001)
      camera.up.set(0, 0, -1)
    } else {
      camera.position.set(
        mapCenter.x + distance * 0.68,
        mapCenter.y + distance * 0.42,
        mapCenter.z - distance * 0.58,
      )
    }
    camera.lookAt(mapCenter)
    camera.updateProjectionMatrix()
    controls.target.copy(mapCenter)
    controls.minDistance = Math.max(2, maxHorizontal * 0.008)
    controls.maxDistance = maxHorizontal * 5
    controls.update()
  }

  const fitCarView = (): void => {
    if (!carPlacement) return
    const { position, forward, normal } = carPlacement
    controls.target
      .copy(position)
      .addScaledVector(forward, 3.2)
      .addScaledVector(normal, 0.8)
    camera.position
      .copy(position)
      .addScaledVector(forward, -7.2)
      .addScaledVector(normal, 2.7)
    camera.up.copy(normal)
    camera.near = 0.08
    camera.far = Math.max(10000, mapSize.length() * 4)
    camera.fov = 44
    camera.updateProjectionMatrix()
    controls.minDistance = 3.5
    controls.maxDistance = Math.max(120, mapSize.length())
    controls.update()
  }

  const addButton = (label: string, action: () => void): void => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.style.cssText = `
      height:34px;padding:0 12px;border:1px solid rgba(255,255,255,.28);
      border-radius:4px;background:#1b2530;color:#fff;cursor:pointer;
      font:700 12px/1 system-ui,-apple-system,"PingFang SC",sans-serif;
      letter-spacing:0;white-space:nowrap;
    `
    button.addEventListener('click', action)
    toolbar.appendChild(button)
  }

  addButton('斜视', () => fitView('perspective'))
  addButton('俯视', () => fitView('top'))
  addButton('赛车', fitCarView)
  addButton('线框', () => {
    if (!model) return
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!('wireframe' in material)) continue
        material.wireframe = !material.wireframe
        material.needsUpdate = true
      }
    })
  })

  const loader = new GLTFLoader()
  loader.load(
    MAP_URL,
    (gltf) => {
      model = gltf.scene
      model.name = 'shanghai-international-circuit-2018-layout-test'
      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.frustumCulled = true
        object.castShadow = false
        object.receiveShadow = false
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (material instanceof THREE.MeshStandardMaterial && material.map) {
            material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
            material.map.needsUpdate = true
            if (MATERIAL_TEXTURE_OVERRIDES[material.name]) {
              const bucket = textureOverrideMaterials.get(material.name) ?? []
              bucket.push(material)
              textureOverrideMaterials.set(material.name, bucket)
            }
          }
          if (material instanceof THREE.MeshStandardMaterial && material.name === 'RUG_blu') {
            blueRunoffMaterials.push(material)
          }
          if (material instanceof THREE.MeshStandardMaterial && material.name === 'Spec_glill') {
            blueRunoffContinuation.push({ material, object })
          }
          if (ALPHA_CUTOUT_MATERIALS.has(material.name)) {
            material.alphaTest = 0.32
            material.alphaToCoverage = true
            material.transparent = false
            material.depthWrite = true
            material.side = THREE.DoubleSide
            material.needsUpdate = true
          }
          if (ALPHA_BLEND_MATERIALS.has(material.name)) {
            material.alphaTest = 0.01
            material.transparent = true
            material.depthWrite = false
            material.side = THREE.DoubleSide
            material.needsUpdate = true
          }
          if (ROAD_DECAL_MATERIALS.has(material.name)) {
            material.transparent = true
            material.alphaTest = 0.015
            material.depthWrite = false
            material.polygonOffset = true
            material.polygonOffsetFactor = -1
            material.polygonOffsetUnits = -1
            material.needsUpdate = true
          }
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

      for (const [materialName, materials] of textureOverrideMaterials) {
        new THREE.TextureLoader().load(
          MATERIAL_TEXTURE_OVERRIDES[materialName],
          (texture) => {
            const previous = materials[0]?.map
            texture.name = `shanghai-2018-source-${materialName}`
            texture.colorSpace = THREE.SRGBColorSpace
            texture.flipY = false
            texture.generateMipmaps = true
            texture.magFilter = THREE.LinearFilter
            texture.minFilter = THREE.LinearMipmapLinearFilter
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
            if (materialName === 'Prato') {
              // The compressed model maps one grass image over the full circuit.
              // Tile the source grass at roughly 20 m per repeat to retain detail.
              texture.wrapS = THREE.RepeatWrapping
              texture.wrapT = THREE.RepeatWrapping
              texture.offset.set(0, 0)
              texture.repeat.set(72, 66)
              texture.center.set(0, 0)
              texture.rotation = 0
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
          },
          undefined,
          (error) => console.error(`[shanghai-2018-map-test] ${materialName} source texture failed:`, error),
        )
      }

      const initialBox = cameraGeometryBounds(model)
      const initialCenter = initialBox.getCenter(new THREE.Vector3())
      model.position.set(-initialCenter.x, -initialBox.min.y, -initialCenter.z)
      model.updateMatrixWorld(true)
      scene.add(model)

      const mapBox = cameraGeometryBounds(model)
      mapCenter = mapBox.getCenter(new THREE.Vector3())
      mapSize = mapBox.getSize(new THREE.Vector3())
      const startingGrid = materialGeometryGuide(model, 'sha_gridlines_a')
      const placeholderSelectionTarget = startingGrid
        ? startingGrid.center.clone().addScaledVector(
            startingGrid.forward,
            -Math.max(0, startingGrid.length * 0.5 - 10),
          )
        : null
      const placeholderCenter = startingGrid
        ? removeNearestPlaceholder(model, 'wall8', placeholderSelectionTarget ?? startingGrid.center)
        : null
      const placementTarget = placeholderCenter ?? startingGrid?.center ?? null
      groundSampler = createGroundSampler(model)
      const sampledStart = placeholderCenter
        ? groundSampler(placeholderCenter.x, placeholderCenter.z, placeholderCenter.y)
        : null
      carPlacement = sampledStart
        ? {
            position: sampledStart.position,
            forward: startingGrid?.forward.clone() ?? new THREE.Vector3(1, 0, 0),
            normal: sampledStart.normal,
          }
        : findTrackPlacement(model, 'tarmac', placementTarget)
      if (carPlacement) {
        if (startingGrid) carPlacement.forward.copy(startingGrid.forward)
        const { position, forward, normal } = carPlacement
        const right = new THREE.Vector3().crossVectors(normal, forward).normalize()
        const basis = new THREE.Matrix4().makeBasis(right, normal, forward)
        drivePosition.copy(position)
        car.group.position.copy(drivePosition).addScaledVector(normal, -CAR_GROUND_SINK_M)
        car.group.quaternion.setFromRotationMatrix(basis)
        driveForward.copy(forward)
        driveNormal.copy(normal)
        car.group.visible = true
        fitCarView()
      } else {
        fitView('perspective')
      }

      status.textContent = `Shanghai 2018 · ${Math.round(mapSize.x)} × ${Math.round(mapSize.z)} m`
      window.setTimeout(() => status.remove(), 2800)
    },
    (event) => {
      if (!event.total) return
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100))
      status.textContent = `正在加载 Shanghai 2018 地图… ${percent}%`
    },
    (error) => {
      console.error('[shanghai-2018-map-test] failed to load map:', error)
      status.textContent = '地图加载失败，请查看控制台'
      status.style.background = 'rgba(126,18,18,.88)'
    },
  )

  const resize = (): void => {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  resize()
  window.addEventListener('resize', resize)

  const clock = new THREE.Clock()
  const animate = (): void => {
    const delta = clock.getDelta()
    controls.update(delta)
    const throttle = Number(pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp'))
      - Number(pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown'))
    const steer = Number(pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight'))
      - Number(pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft'))
    if (carPlacement) {
      if (throttle !== 0) carSpeed += throttle * (throttle * carSpeed < 0 ? 34 : 22) * delta
      else {
        carSpeed *= Math.max(0, 1 - delta * 3.8)
        if (Math.abs(carSpeed) < 0.15) carSpeed = 0
      }
      carSpeed = THREE.MathUtils.clamp(carSpeed, -12, 58)
      if (Math.abs(carSpeed) > 0.08 && steer !== 0) {
        const turn = -steer * Math.sign(carSpeed) * Math.min(1, Math.abs(carSpeed) / 8) * 1.35 * delta
        driveForward.applyAxisAngle(driveNormal, turn).normalize()
      }
      const movement = driveForward.clone().multiplyScalar(carSpeed * delta)
      if (movement.lengthSq() > 1e-10) {
        const previousPosition = car.group.position.clone()
        drivePosition.add(movement)
        const surface = groundSampler?.(drivePosition.x, drivePosition.z, drivePosition.y)
        if (surface) {
          drivePosition.copy(surface.position)
          driveNormal.lerp(surface.normal, Math.min(1, delta * 14)).normalize()
          driveForward.addScaledVector(driveNormal, -driveForward.dot(driveNormal)).normalize()
        }
        car.group.position.copy(drivePosition).addScaledVector(driveNormal, -CAR_GROUND_SINK_M)
        const actualMovement = car.group.position.clone().sub(previousPosition)
        camera.position.add(actualMovement)
        controls.target.add(actualMovement)
      }
      const right = new THREE.Vector3().crossVectors(driveNormal, driveForward).normalize()
      car.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, driveNormal, driveForward))
    }
    car.update(delta, Math.abs(carSpeed) / 58, steer)
    renderer.render(scene, camera)
    window.requestAnimationFrame(animate)
  }
  animate()
}
