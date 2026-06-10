import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { WeatherPreset } from './weather'
import skyboxHdrUrl from '../assets/background/Cloudymorning4k.hdr?url'

export interface SceneBundle {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sun: THREE.DirectionalLight
  setPerformanceMode: (enabled: boolean) => void
  /** Call each frame with the player car's world position so the shadow
   *  camera frustum stays centred on it for crisp local shadows. */
  updateShadowFollow: (worldPos: THREE.Vector3) => void
  /** Re-tint sky / fog / sun / hemi from a weather preset. */
  applyWeather: (preset: WeatherPreset) => void
  resize: () => void
  render: () => void
  dispose: () => void
}

export interface SceneOptions {
  performanceMode?: boolean
}

const pixelRatioCap = (performanceMode: boolean): number =>
  performanceMode ? 1.5 : 2

const shadowMapSize = (performanceMode: boolean): number =>
  performanceMode ? 1024 : 2048

const SUN_OFFSET = new THREE.Vector3(-95, 78, -135)
const RIM_OFFSET = new THREE.Vector3(130, 58, 95)

const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.08 },
    saturation: { value: 1.09 },
    warmth: { value: 0.035 },
    vignetteStrength: { value: 0.26 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float contrast;
    uniform float saturation;
    uniform float warmth;
    uniform float vignetteStrength;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;
      color += vec3(warmth, warmth * 0.45, -warmth * 0.25);
      float d = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.82, 0.24, d);
      color *= mix(1.0 - vignetteStrength, 1.0, vignette);
      gl_FragColor = vec4(color, texel.a);
    }
  `,
}

/** Procedurally builds a sky/ground equirect texture (256×128) we can run
 *  through PMREMGenerator. Cheap, ~3 ms at boot, no asset bytes. */
function buildSkyEquirect(): THREE.CanvasTexture {
  const w = 256
  const h = 128
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  // Vertical gradient: zenith → horizon sky → horizon haze → ground.
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0.0, '#3470b8') // zenith (deeper blue)
  g.addColorStop(0.45, '#a8d2ec') // horizon sky
  g.addColorStop(0.5, '#dcdab0') // sun-haze band
  g.addColorStop(0.55, '#7c8a55') // ground horizon
  g.addColorStop(1.0, '#3a4b22') // far ground
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // Add a soft sun spot so reflections show a highlight.
  const sunX = w * 0.65
  const sunY = h * 0.3
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, 18)
  sunGrad.addColorStop(0, '#fff8d8')
  sunGrad.addColorStop(0.5, 'rgba(255,240,180,0.4)')
  sunGrad.addColorStop(1, 'rgba(255,240,180,0)')
  ctx.fillStyle = sunGrad
  ctx.fillRect(0, 0, w, h)

  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createScene(container: HTMLElement, options: SceneOptions = {}): SceneBundle {
  let performanceMode = options.performanceMode === true
  const scene = new THREE.Scene()
  // Bright daytime sky.
  scene.background = new THREE.Color('#87ceeb')
  scene.fog = new THREE.Fog('#cfe6f5', 400, 2500)

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    1.0, // bumped from 0.1 → 1.0 to give the depth buffer more precision in the far range
    5000,
  )
  camera.position.set(0, 5, 10)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
    // Vastly higher depth precision — eliminates z-fighting between
    // overlapping coplanar road segments (the T13 "shimmer").
    logarithmicDepthBuffer: !performanceMode,
  })
  const applyPixelRatio = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap(performanceMode)))
  }
  applyPixelRatio()
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.28
  renderer.shadowMap.enabled = true
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.type = performanceMode ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    performanceMode ? 0.12 : 0.22,
    0.24,
    0.88,
  )
  const gradePass = new ShaderPass(CinematicGradeShader)
  const outputPass = new OutputPass()
  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  composer.addPass(gradePass)
  composer.addPass(outputPass)

  // Direct sunlight — strong & warm. High contrast vs. fill light = crisp 3D.
  const sun = new THREE.DirectionalLight(0xffdfb0, 4.8)
  sun.position.copy(SUN_OFFSET)
  sun.castShadow = true
  const applyShadowQuality = (): void => {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.type = performanceMode ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    const shadowSize = shadowMapSize(performanceMode)
    sun.shadow.mapSize.set(shadowSize, shadowSize)
    if (sun.shadow.map) {
      sun.shadow.map.dispose()
      sun.shadow.map = null
    }
    renderer.shadowMap.needsUpdate = true
  }
  applyShadowQuality()
  // Tight frustum that follows the car (see updateShadowFollow). Default
  // covers ±50 m; higher resolution per texel = sharper car shadow.
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 520
  sun.shadow.camera.left = -72
  sun.shadow.camera.right = 72
  sun.shadow.camera.top = 72
  sun.shadow.camera.bottom = -72
  sun.shadow.bias = -0.00012
  sun.shadow.normalBias = 0.012
  scene.add(sun)
  scene.add(sun.target)

  const rim = new THREE.DirectionalLight(0x9fc7ff, 1.15)
  rim.position.copy(RIM_OFFSET)
  scene.add(rim)

  // Sky/ground hemisphere fill — softer than before so direct sun owns the
  // contrast. Bluish from above, warm-green from below.
  const hemi = new THREE.HemisphereLight(0xc8e5ff, 0x485938, 1.05)
  scene.add(hemi)

  const ambient = new THREE.AmbientLight(0xffffff, 0.07)
  scene.add(ambient)
  renderer.toneMappingExposure = 1.28

  // --- Procedural sky env map: gives PBR materials proper reflections.
  let environmentRT: THREE.WebGLRenderTarget | null = null
  let hdrBackgroundTexture: THREE.Texture | null = null
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const skyTex = buildSkyEquirect()
  environmentRT = pmrem.fromEquirectangular(skyTex)
  scene.environment = environmentRT.texture
  skyTex.dispose()
  pmrem.dispose()

  const loadHdrSkybox = (): void => {
    const loader = new RGBELoader()
    loader.load(
      skyboxHdrUrl,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        const hdrPmrem = new THREE.PMREMGenerator(renderer)
        const hdrRT = hdrPmrem.fromEquirectangular(texture)
        environmentRT?.dispose()
        hdrBackgroundTexture?.dispose()
        environmentRT = hdrRT
        hdrBackgroundTexture = texture
        scene.background = texture
        scene.environment = hdrRT.texture
        hdrPmrem.dispose()
      },
      undefined,
      (err) => {
        console.warn('[F1S] HDR skybox failed to load:', err)
      },
    )
  }
  loadHdrSkybox()

  const applyWeather = (preset: WeatherPreset): void => {
    if (scene.background instanceof THREE.Color) {
      scene.background.set(preset.sky)
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(preset.fogColor)
      scene.fog.near = preset.fogNear
      scene.fog.far = preset.fogFar
    } else {
      scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar)
    }
    sun.color.set(preset.nightMode ? '#b6c8ff' : '#ffdfb0')
    sun.intensity = preset.nightMode ? 2.25 : 4.8
    hemi.color.set(preset.hemiSky)
    hemi.groundColor.set(preset.hemiGround)
    hemi.intensity = Math.max(preset.hemiIntensity, preset.nightMode ? 0.65 : 0.95)
    rim.color.set(preset.nightMode ? '#7aa7ff' : '#9fc7ff')
    rim.intensity = preset.nightMode ? 1.55 : 1.15
    renderer.toneMappingExposure = Math.max(preset.exposure, preset.nightMode ? 1.08 : 1.22)
    bloomPass.strength = preset.nightMode ? 0.26 : (performanceMode ? 0.12 : 0.22)
  }

  const setPerformanceMode = (enabled: boolean): void => {
    performanceMode = enabled
    bloomPass.strength = performanceMode ? 0.12 : 0.22
    bloomPass.radius = performanceMode ? 0.16 : 0.24
    applyShadowQuality()
    applyPixelRatio()
    resize()
  }

  const lastShadowFocus = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
  const updateShadowFollow = (worldPos: THREE.Vector3): void => {
    if (lastShadowFocus.distanceToSquared(worldPos) < 16) return
    lastShadowFocus.copy(worldPos)
    // Re-centre the shadow camera frustum on the player so its 100×100 m
    // window of high-res shadow always contains the car + nearby road.
    sun.target.position.copy(worldPos)
    sun.position.copy(worldPos).add(SUN_OFFSET)
    rim.position.copy(worldPos).add(RIM_OFFSET)
    sun.target.updateMatrixWorld()
    sun.shadow.camera.updateProjectionMatrix()
    renderer.shadowMap.needsUpdate = true
  }

  const resize = (): void => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    composer.setSize(w, h)
    bloomPass.resolution.set(w, h)
    renderer.shadowMap.needsUpdate = true
  }

  const render = (): void => {
    composer.render()
  }

  const dispose = (): void => {
    environmentRT?.dispose()
    hdrBackgroundTexture?.dispose()
    composer.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }

  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)

  return { scene, camera, renderer, sun, setPerformanceMode, applyWeather, updateShadowFollow, resize, render, dispose }
}
