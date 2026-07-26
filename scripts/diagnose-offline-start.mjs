import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const npxRoot = join(homedir(), '.npm/_npx')
const cacheRoot = existsSync(npxRoot)
  ? readdirSync(npxRoot)
      .map((entry) => join(npxRoot, entry, 'node_modules'))
      .find((directory) => existsSync(join(directory, '@gltf-transform/core/dist/index.js')))
  : null

if (!cacheRoot) throw new Error('Cached glTF Transform packages were not found')

const core = await import(pathToFileURL(join(cacheRoot, '@gltf-transform/core/dist/index.js')).href)
const extensions = await import(pathToFileURL(join(cacheRoot, '@gltf-transform/extensions/dist/index.js')).href)
const meshoptimizer = await import(pathToFileURL(join(cacheRoot, 'meshoptimizer/index.js')).href)
const draco3d = await import(pathToFileURL(join(cacheRoot, 'draco3dgltf/draco3dgltf.js')).href)
await meshoptimizer.MeshoptDecoder.ready
const dracoDecoder = await draco3d.default.createDecoderModule()

const io = new core.NodeIO()
  .registerExtensions(extensions.ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': meshoptimizer.MeshoptDecoder,
    'draco3d.decoder': dracoDecoder,
  })

const DRIVE_MATERIALS = new Set([
  'tarmac', '14', '15', 'Pit_lane', 'Out', 'Prato', '28', '35', '32',
  '17', '16', '13', '9!0', '12', '10', 'Pirelli_terra', 'Petronas_out',
  'Out_rolex', '2!0', '24', '22', '23', '20', '21', 'Kerb_giallo',
  'RUG_blu', 'Spec_glill',
])

const PLAYER_X = -264.27
const PLAYER_Z = 520.03

function transformPoint(matrix, accessor, index) {
  const point = accessor.getElement(index, [])
  const x = point[0]
  const y = point[1]
  const z = point[2]
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ]
}

function heightInsideTriangle(x, z, a, b, c) {
  const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
  if (Math.abs(denominator) < 1e-10) return null
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator
  const w = 1 - u - v
  const epsilon = -1e-5
  if (u < epsilon || v < epsilon || w < epsilon) return null
  return u * a[1] + v * b[1] + w * c[1]
}

async function inspect(label, relativePath, alignmentCenter, alignmentMinY) {
  const document = await io.read(join(root, relativePath))
  const scene = document.getRoot().listScenes()[0]
  const rawX = PLAYER_X + alignmentCenter[0]
  const rawZ = PLAYER_Z + alignmentCenter[2]
  const hits = []

  scene.traverse((node) => {
    const mesh = node.getMesh()
    if (!mesh) return
    const matrix = node.getWorldMatrix()
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial()?.getName() ?? ''
      if (!DRIVE_MATERIALS.has(material)) continue
      const position = primitive.getAttribute('POSITION')
      if (!position) continue
      const indices = primitive.getIndices()?.getArray()
      const count = indices ? indices.length : position.getCount()
      for (let offset = 0; offset + 2 < count; offset += 3) {
        const ia = indices ? indices[offset] : offset
        const ib = indices ? indices[offset + 1] : offset + 1
        const ic = indices ? indices[offset + 2] : offset + 2
        const a = transformPoint(matrix, position, ia)
        const b = transformPoint(matrix, position, ib)
        const c = transformPoint(matrix, position, ic)
        const y = heightInsideTriangle(rawX, rawZ, a, b, c)
        if (y !== null) hits.push({ material, rawY: y, worldY: y - alignmentMinY })
      }
    }
  })

  hits.sort((a, b) => b.worldY - a.worldY)
  console.log(JSON.stringify({
    label,
    path: relativePath,
    worldQuery: [PLAYER_X, PLAYER_Z],
    rawQuery: [rawX, rawZ],
    hits: hits.slice(0, 12),
  }, null, 2))
  return hits
}

const desktopHits = await inspect(
  'desktop-source',
  'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb',
  [195.47552490234375, 40.55998707532034, -147.96149939140832],
  -64.77343086012478,
)
const offlineHits = await inspect(
  'offline-mobile-canonical-alignment',
  '.offline8m-assets/shanghai-mobile.glb',
  [195.47552490234375, 40.55998707532034, -147.96149939140832],
  -64.77343086012478,
)
await inspect(
  'offline-mobile-own-bounds-alignment',
  '.offline8m-assets/shanghai-mobile.glb',
  [195.44983, 40.576335, -147.96144],
  -64.76037,
)

const desktopRoad = desktopHits.find((hit) => hit.material === 'tarmac')
const offlineRoad = offlineHits.find((hit) => hit.material === 'tarmac')
if (!desktopRoad || !offlineRoad) throw new Error('Default player grid does not land on tarmac')
if (Math.abs(desktopRoad.worldY - offlineRoad.worldY) > 0.1) {
  throw new Error(`Offline start height drifted by ${Math.abs(desktopRoad.worldY - offlineRoad.worldY).toFixed(3)}m`)
}
console.log('[offline-start] PASS: desktop and packaged maps share the fixed grid surface')
