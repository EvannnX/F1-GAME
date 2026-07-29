import * as THREE from 'three'
import bakedDecals from '../generated/fom/decal-geometries.json'
import rearLogoUrl from '../generated/fom/rear-logo-white.png?url'
import sideLogoUrl from '../assets/FOM赛车涂装贴花可复用包-v54/download-1.svg?url'
import deltaXUrl from '../assets/FOM赛车涂装贴花可复用包-v54/DeltaX.png?url'
import creatorSymbolUrl from '../assets/FOM赛车涂装贴花可复用包-v54/assets/douyin-creator-symbol.svg?url'
import zjuapUrl from '../assets/FOM赛车涂装贴花可复用包-v54/抖音官方赞助商logo/ZJUAP.jpg?url'
import douyinUrl from '../assets/FOM赛车涂装贴花可复用包-v54/抖音官方赞助商logo/download-2.svg?url'
import sponsorTwoUrl from '../assets/FOM赛车涂装贴花可复用包-v54/抖音官方赞助商logo/download-3.svg?url'
import jointUrl from '../assets/FOM赛车涂装贴花可复用包-v54/抖音官方赞助商logo/joint-organizer.30e85169.svg?url'
import blueUrl from '../assets/FOM赛车涂装贴花可复用包-v54/抖音官方赞助商logo/download.png?url'
import traeUrl from '../assets/FOM赛车涂装贴花可复用包-v54/抖音官方赞助商logo/trae.ec67ce78.png?url'
import jinqiuUrl from '../assets/FOM赛车涂装贴花可复用包-v54/抖音官方赞助商logo/jinqiu.2db5dbb8.png?url'

const THEME_MATERIALS = new Set(['livery_audi_01', 'fom_car_dummy_decal', 'boya'])
const REAR_LIGHT_PERIOD_MS = 500
const REAR_LIGHT_RED = new THREE.Color('#ff1808')
const LIVERY_STORAGE_KEY = 'f1ti_fom_livery_scheme_v54'
const THEME_COLOR_STORAGE_KEY = 'f1ti_fom_theme_color_v50'

export interface FomThemeColor {
  name: string
  hex: string
}

export const FOM_THEME_COLORS: readonly FomThemeColor[] = [
  { name: 'NYU 紫', hex: '#57068c' },
  { name: '竞速红', hex: '#e10600' },
  { name: '电光蓝', hex: '#0067ff' },
  { name: '活力橙', hex: '#ff8700' },
  { name: '亮黄', hex: '#ffd400' },
  { name: '翡翠绿', hex: '#00a86b' },
  { name: '青色', hex: '#00b8d9' },
  { name: '品红', hex: '#d000ff' },
  { name: '银白', hex: '#d9d9d6' },
  { name: '哑光黑', hex: '#151515' },
]

export function readFomThemeColor(): string {
  try {
    const stored = localStorage.getItem(THEME_COLOR_STORAGE_KEY)
    if (stored && FOM_THEME_COLORS.some((color) => color.hex === stored)) return stored
  } catch {
    /* Use the original default below. */
  }
  return '#57068c'
}

export function selectFomThemeColor(hex: string): void {
  if (!FOM_THEME_COLORS.some((color) => color.hex === hex)) return
  try {
    localStorage.setItem(THEME_COLOR_STORAGE_KEY, hex)
  } catch {
    /* The active showroom instance still updates without persistence. */
  }
}

export function applyFomThemeColor(root: THREE.Object3D, hex: string): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      if (!THEME_MATERIALS.has(material.name)) continue
      material.color.set(hex)
      material.needsUpdate = true
    }
  })
}

export type FomLiverySchemeId =
  | 'clean'
  | 'classic'
  | 'silver'
  | 'orange'
  | 'blueArrow'
  | 'violetGold'
  | 'greenCut'
  | 'silverSpine'

export interface FomLiveryScheme {
  id: FomLiverySchemeId
  name: string
  primary?: string
  accentA?: string
  accentB?: string
}

export const FOM_LIVERY_SCHEMES: readonly FomLiveryScheme[] = [
  { id: 'clean', name: '纯色' },
  { id: 'classic', name: '红白经典', primary: '#e10600', accentA: '#161719', accentB: '#ffffff' },
  { id: 'silver', name: '银黑青线', primary: '#151515', accentA: '#50565c', accentB: '#00d9d2' },
  { id: 'orange', name: '橙黑切面', primary: '#ff8700', accentA: '#101214', accentB: '#00b8a9' },
  { id: 'blueArrow', name: '蓝白箭锋', primary: '#0067ff', accentA: '#f4f7ff', accentB: '#111820' },
  { id: 'violetGold', name: '紫金翼面', primary: '#57068c', accentA: '#ffcc33', accentB: '#17131d' },
  { id: 'greenCut', name: '绿黑渐切', primary: '#00a86b', accentA: '#111513', accentB: '#dfff32' },
  { id: 'silverSpine', name: '银白红脊', primary: '#d9d9d6', accentA: '#e10600', accentB: '#151515' },
]

export function readFomLiveryScheme(): FomLiverySchemeId {
  try {
    const stored = localStorage.getItem(LIVERY_STORAGE_KEY)
    if (FOM_LIVERY_SCHEMES.some((scheme) => scheme.id === stored)) {
      return stored as FomLiverySchemeId
    }
  } catch {
    /* Use the v54 default below. */
  }
  return 'clean'
}

export function selectFomLiveryScheme(id: FomLiverySchemeId): void {
  try {
    localStorage.setItem(LIVERY_STORAGE_KEY, id)
  } catch {
    /* The active showroom instance still updates without persistence. */
  }
}
interface BakedDecalGeometry {
  positions: number[]
  normals: number[]
  uvs: number[]
  indices: number[]
}
const BAKED_DECALS = bakedDecals.geometries as Record<string, BakedDecalGeometry>

type DecalKind = 'side' | 'top' | 'rear'

interface DecalPreset {
  name: string
  url: string
  kind: DecalKind
  baseWidth: number
  baseHeight: number
  depth: number
  scale: number
  width?: number
  height?: number
  x: number
  y: number
  z: number
  rotationX: number
  rotationY: number
  rotationZ: number
  reverseFacing?: boolean
}

const sidePair = (
  name: string,
  url: string,
  baseWidth: number,
  baseHeight: number,
  scale: number,
  x: number,
  y: number,
  z: number,
  height = 1,
): DecalPreset[] => [
  {
    name: `${name}-right`, url, kind: 'side', baseWidth, baseHeight, depth: 0.24,
    scale, height, x, y, z, rotationX: 0, rotationY: 90, rotationZ: 0,
  },
  {
    name: `${name}-left`, url, kind: 'side', baseWidth, baseHeight, depth: 0.24,
    scale, height, x: -x, y, z, rotationX: 0, rotationY: -90, rotationZ: 0,
  },
]

const DECALS: readonly DecalPreset[] = [
  {
    name: 'creator-front', url: creatorSymbolUrl, kind: 'top',
    baseWidth: 0.22, baseHeight: 0.215, depth: 0.5, scale: 1,
    x: 0, y: 0.3, z: 2.325, rotationX: -90, rotationY: 0, rotationZ: 0,
  },
  {
    name: 'zjuap-front', url: zjuapUrl, kind: 'top',
    baseWidth: 0.28, baseHeight: 0.28, depth: 0.5, scale: 0.79,
    x: 0, y: 0.34, z: 1.415, rotationX: -90, rotationY: 0, rotationZ: 0,
  },
  {
    name: 'rear', url: rearLogoUrl, kind: 'rear',
    baseWidth: 1.22, baseHeight: 0.17, depth: 1.3, scale: 1.49,
    width: 0.64, height: 1.22, x: 0, y: 0.93, z: -2.75,
    rotationX: 0, rotationY: 0, rotationZ: 0, reverseFacing: true,
  },
  ...sidePair('main', sideLogoUrl, 0.82, 0.21, 1.2, 0.405, 0.424, -0.295),
  ...sidePair('deltax', deltaXUrl, 0.42, 0.36, 0.81, 0.55, 0.46, -1.235),
  ...sidePair('douyin', douyinUrl, 0.55, 0.083, 1, 0.405, 0.702, -0.925),
  ...sidePair('sponsor-two', sponsorTwoUrl, 0.42, 0.139, 0.8, 0.405, 0.562, -1.58),
  ...sidePair('joint', jointUrl, 0.48, 0.13, 0.87, 0.405, 0.524, 0.81),
  ...sidePair('blue', blueUrl, 0.18, 0.133, 1.37, 0.405, 0.82, -0.765, 0.61),
  ...sidePair('trae', traeUrl, 0.48, 0.091, 0.74, 0.405, 0.66, -0.15),
  ...sidePair('jinqiu', jinqiuUrl, 0.52, 0.118, 0.53, 0.405, 0.43, 2.195),
]
const CORE_DECAL_NAMES = new Set([
  'creator-front',
  'main-right',
  'main-left',
  'rear',
])

export type FomSpecialLiveryVariant = 'core' | 'partners'

interface RearLightEntry {
  material: THREE.MeshStandardMaterial
  color: THREE.Color
  emissive: THREE.Color
  emissiveIntensity: number
}

export interface FomSpecialLivery {
  update: (elapsedMs: number) => void
  setScheme: (scheme: FomLiverySchemeId) => void
  dispose: () => void
}

interface LiveryPartitionUniforms {
  scheme: { value: number }
  themeColor: { value: THREE.Color }
  accentA: { value: THREE.Color }
  accentB: { value: THREE.Color }
}

function installLiveryPartitionShader(
  material: THREE.MeshStandardMaterial,
): LiveryPartitionUniforms {
  const existing = material.userData.liveryPartitionUniforms as
    | LiveryPartitionUniforms
    | undefined
  if (existing) return existing
  const uniforms: LiveryPartitionUniforms = {
    scheme: { value: 0 },
    themeColor: { value: new THREE.Color('#57068c') },
    accentA: { value: new THREE.Color('#000000') },
    accentB: { value: new THREE.Color('#000000') },
  }
  material.userData.liveryPartitionUniforms = uniforms
  const originalOnBeforeCompile = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, rendererInstance) => {
    originalOnBeforeCompile(shader, rendererInstance)
    shader.uniforms.uLiveryScheme = uniforms.scheme
    shader.uniforms.uLiveryThemeColor = uniforms.themeColor
    shader.uniforms.uLiveryAccentA = uniforms.accentA
    shader.uniforms.uLiveryAccentB = uniforms.accentB
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLiveryLocalPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLiveryLocalPosition = position;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vLiveryLocalPosition;',
          'uniform float uLiveryScheme;',
          'uniform vec3 uLiveryThemeColor;',
          'uniform vec3 uLiveryAccentA;',
          'uniform vec3 uLiveryAccentB;',
        ].join('\n'),
      )
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          'vec3 liveryP = vLiveryLocalPosition;',
          'float liveryAbsX = abs(liveryP.x);',
          'float liverySide = smoothstep(0.20, 0.34, liveryAbsX);',
          'float liveryBody = smoothstep(-1.72, -1.42, liveryP.y) * (1.0 - smoothstep(1.42, 1.72, liveryP.y));',
          'float liveryFront = smoothstep(0.78, 1.08, liveryP.y);',
          'float liveryBaseLum = max(dot(uLiveryThemeColor, vec3(0.299, 0.587, 0.114)), 0.055);',
          'float liveryDetail = clamp(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) / liveryBaseLum, 0.42, 1.28);',
          'vec3 liveryAccentA = uLiveryAccentA * liveryDetail;',
          'vec3 liveryAccentB = uLiveryAccentB * liveryDetail;',
          'float liveryMaskA = 0.0;',
          'float liveryMaskB = 0.0;',
          'if (uLiveryScheme > 0.5 && uLiveryScheme < 1.5) {',
          '  float lowerStructure = 1.0 - smoothstep(0.38, 0.5, liveryP.z);',
          '  liveryMaskA = liverySide * liveryBody * lowerStructure;',
          '  float outerShoulder = smoothstep(0.2, 0.34, liveryAbsX) * (1.0 - smoothstep(0.62, 0.76, liveryAbsX));',
          '  float shoulderHeight = smoothstep(0.42, 0.56, liveryP.z);',
          '  liveryMaskB = liveryFront * outerShoulder * shoulderHeight;',
          '} else if (uLiveryScheme > 1.5 && uLiveryScheme < 2.5) {',
          '  float upperStructure = smoothstep(0.43, 0.57, liveryP.z);',
          '  liveryMaskA = liverySide * liveryBody * upperStructure;',
          '  float cyanGuide = 1.0 - smoothstep(0.012, 0.034, abs(liveryP.z - (0.51 + 0.035 * liveryP.y)));',
          '  liveryMaskB = liverySide * liveryBody * cyanGuide;',
          '} else if (uLiveryScheme > 2.5 && uLiveryScheme < 3.5) {',
          '  float sidePanelLow = smoothstep(0.26, 0.36, liveryP.z);',
          '  float sidePanelHigh = 1.0 - smoothstep(0.7, 0.82, liveryP.z);',
          '  float noseSpine = liveryFront * (1.0 - smoothstep(0.2, 0.31, liveryAbsX));',
          '  liveryMaskA = max(liverySide * liveryBody * sidePanelLow * sidePanelHigh, noseSpine);',
          '  float tealSide = 1.0 - smoothstep(0.012, 0.032, abs(liveryP.z - 0.73));',
          '  float tealNose = 1.0 - smoothstep(0.012, 0.03, abs(liveryAbsX - 0.315));',
          '  liveryMaskB = max(liverySide * liveryBody * tealSide, liveryFront * tealNose);',
          '} else if (uLiveryScheme > 3.5 && uLiveryScheme < 4.5) {',
          '  float blueOuterShoulder = smoothstep(0.24, 0.37, liveryAbsX) * (1.0 - smoothstep(0.64, 0.78, liveryAbsX));',
          '  float blueShoulderHeight = smoothstep(0.46, 0.6, liveryP.z);',
          '  liveryMaskA = liveryFront * blueOuterShoulder * blueShoulderHeight;',
          '  float blueArrowEdge = 0.5 + 0.075 * liveryP.y;',
          '  float blueDarkUpper = smoothstep(blueArrowEdge - 0.05, blueArrowEdge + 0.05, liveryP.z) * (1.0 - smoothstep(0.84, 0.96, liveryP.z));',
          '  liveryMaskB = liverySide * liveryBody * blueDarkUpper;',
          '} else if (uLiveryScheme > 4.5 && uLiveryScheme < 5.5) {',
          '  float goldSweepHeight = 0.57 + 0.055 * liveryP.y;',
          '  float goldSideSweep = 1.0 - smoothstep(0.014, 0.038, abs(liveryP.z - goldSweepHeight));',
          '  float goldNoseRail = 1.0 - smoothstep(0.014, 0.034, abs(liveryAbsX - 0.29));',
          '  liveryMaskA = max(liverySide * liveryBody * goldSideSweep, liveryFront * goldNoseRail);',
          '  float violetDarkLower = 1.0 - smoothstep(0.33, 0.46, liveryP.z);',
          '  liveryMaskB = liverySide * liveryBody * violetDarkLower;',
          '} else if (uLiveryScheme > 5.5 && uLiveryScheme < 6.5) {',
          '  float greenCutHeight = 0.44 + 0.1 * liveryP.y;',
          '  float greenDarkCut = 1.0 - smoothstep(greenCutHeight - 0.05, greenCutHeight + 0.05, liveryP.z);',
          '  liveryMaskA = liverySide * liveryBody * greenDarkCut;',
          '  float greenLimeEdge = 1.0 - smoothstep(0.014, 0.036, abs(liveryP.z - greenCutHeight));',
          '  float greenNoseEdge = 1.0 - smoothstep(0.014, 0.034, abs(liveryAbsX - (0.27 + 0.025 * liveryP.y)));',
          '  liveryMaskB = max(liverySide * liveryBody * greenLimeEdge, liveryFront * greenNoseEdge);',
          '} else if (uLiveryScheme > 6.5) {',
          '  float silverRedMidLow = smoothstep(0.39, 0.5, liveryP.z);',
          '  float silverRedMidHigh = 1.0 - smoothstep(0.78, 0.9, liveryP.z);',
          '  float silverRedSpine = liveryFront * (1.0 - smoothstep(0.18, 0.3, liveryAbsX));',
          '  liveryMaskA = max(liverySide * liveryBody * silverRedMidLow * silverRedMidHigh, silverRedSpine);',
          '  float silverBlackLower = 1.0 - smoothstep(0.34, 0.47, liveryP.z);',
          '  liveryMaskB = liverySide * liveryBody * silverBlackLower;',
          '}',
          'diffuseColor.rgb = mix(diffuseColor.rgb, liveryAccentA, clamp(liveryMaskA, 0.0, 1.0));',
          'diffuseColor.rgb = mix(diffuseColor.rgb, liveryAccentB, clamp(liveryMaskB, 0.0, 1.0));',
        ].join('\n'),
      )
  }
  material.customProgramCacheKey = () => 'fom-livery-partition-v1'
  material.needsUpdate = true
  return uniforms
}

async function loadTexture(url: string, renderer?: THREE.WebGLRenderer): Promise<THREE.Texture> {
  let texture = await new THREE.TextureLoader().loadAsync(url)
  const isSvg = url.includes('image/svg+xml') || /\.svg(?:$|\?)/i.test(url)
  if (isSvg) {
    const image = texture.image as CanvasImageSource & {
      naturalWidth?: number
      naturalHeight?: number
      width?: number
      height?: number
    }
    const sourceWidth = image.naturalWidth ?? image.width ?? 1
    const sourceHeight = image.naturalHeight ?? image.height ?? 1
    const aspect = sourceWidth / Math.max(1, sourceHeight)
    const canvas = document.createElement('canvas')
    canvas.width = aspect >= 2 ? 1024 : 512
    canvas.height = Math.max(1, Math.round(canvas.width / aspect))
    const context = canvas.getContext('2d')
    if (context) {
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      texture.dispose()
      texture = new THREE.CanvasTexture(canvas)
    }
  }
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

let textureSourcesPromise: Promise<Map<string, THREE.Texture>> | null = null

export function preloadFomSpecialLivery(
  renderer?: THREE.WebGLRenderer,
): Promise<Map<string, THREE.Texture>> {
  if (!textureSourcesPromise) {
    textureSourcesPromise = Promise.all(
      [...new Set(DECALS.map((preset) => preset.url))].map(async (url) => {
        return [url, await loadTexture(url, renderer)] as const
      }),
    ).then((entries) => new Map(entries))
  }
  return textureSourcesPromise
}

function createSurfaceDecal(
  root: THREE.Object3D,
  texture: THREE.Texture,
  preset: DecalPreset,
): THREE.Mesh | null {
  const baked = BAKED_DECALS[preset.name]
  if (!baked) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(baked.positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(baked.normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(baked.uvs, 2))
  geometry.setIndex(baked.indices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: '#ffffff',
    transparent: true,
    alphaTest: 0.001,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    side: THREE.FrontSide,
  })
  const decal = new THREE.Mesh(geometry, material)
  decal.name = `fom-special-${preset.name}`
  decal.renderOrder = 10
  decal.castShadow = false
  decal.receiveShadow = false
  root.add(decal)
  return decal
}

export async function applyFomSpecialLivery(
  root: THREE.Object3D,
  renderer?: THREE.WebGLRenderer,
  variant: FomSpecialLiveryVariant = 'core',
): Promise<FomSpecialLivery> {
  const themeMaterials = new Set<THREE.MeshStandardMaterial>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue
      if (!THEME_MATERIALS.has(material.name)) continue
      material.color.set('#57068c')
      installLiveryPartitionShader(material)
      themeMaterials.add(material)
    }
  })

  const setScheme = (id: FomLiverySchemeId): void => {
    const schemeIndex = FOM_LIVERY_SCHEMES.findIndex((entry) => entry.id === id)
    const scheme = FOM_LIVERY_SCHEMES[Math.max(0, schemeIndex)]
    const primary = scheme.primary ?? '#57068c'
    for (const material of themeMaterials) {
      material.color.set(primary)
      const uniforms = installLiveryPartitionShader(material)
      uniforms.scheme.value = Math.max(0, schemeIndex)
      uniforms.themeColor.value.set(primary)
      uniforms.accentA.value.set(scheme.accentA ?? '#000000')
      uniforms.accentB.value.set(scheme.accentB ?? '#000000')
      material.needsUpdate = true
    }
  }
  setScheme(readFomLiveryScheme())

  const decals: THREE.Mesh[] = []
  const textures = new Set<THREE.Texture>()
  const textureByUrl = new Map<string, THREE.Texture>()
  const textureSources = await preloadFomSpecialLivery(renderer)
  for (const [url, source] of textureSources) {
    const texture = source.clone()
    texture.needsUpdate = true
    textureByUrl.set(url, texture)
    textures.add(texture)
  }
  const decalPresets = variant === 'partners'
    ? DECALS
    : DECALS.filter((preset) => CORE_DECAL_NAMES.has(preset.name))
  for (const preset of decalPresets) {
    const texture = textureByUrl.get(preset.url)
    if (!texture) continue
    const decal = createSurfaceDecal(
      root,
      texture,
      preset,
    )
    if (decal) decals.push(decal)
  }

  const rearLights: RearLightEntry[] = []
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    let changed = false
    const materials = source.map((material) => {
      if (material?.name !== 'rear_light' || !(material instanceof THREE.MeshStandardMaterial)) return material
      const cloned = material.clone()
      mesh.userData.fomRearLightOriginal = material
      rearLights.push({
        material: cloned,
        color: cloned.color.clone(),
        emissive: cloned.emissive.clone(),
        emissiveIntensity: cloned.emissiveIntensity,
      })
      changed = true
      return cloned
    })
    if (changed) mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
  })

  return {
    setScheme,
    update(elapsedMs) {
      const red = elapsedMs % REAR_LIGHT_PERIOD_MS < REAR_LIGHT_PERIOD_MS / 2
      for (const entry of rearLights) {
        entry.material.color.copy(red ? REAR_LIGHT_RED : entry.color)
        entry.material.emissive.copy(red ? REAR_LIGHT_RED : entry.emissive)
        entry.material.emissiveIntensity = red ? 4 : entry.emissiveIntensity
      }
    },
    dispose() {
      for (const decal of decals) {
        decal.removeFromParent()
        decal.geometry.dispose()
        ;(decal.material as THREE.Material).dispose()
      }
      for (const texture of textures) texture.dispose()
      for (const entry of rearLights) entry.material.dispose()
    },
  }
}
