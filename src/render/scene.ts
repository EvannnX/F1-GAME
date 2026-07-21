import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { WeatherPreset } from './weather'
import skyboxHdrUrl from '../assets/background/Cloudymorning2k.hdr?url'

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

const isMobileGpu = (): boolean => {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const smallScreen = Math.min(window.screen.width, window.screen.height) <= 820
  const limitedCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4
  return coarsePointer || smallScreen || limitedCpu
}

const pixelRatioCap = (performanceMode: boolean, mobileGpu: boolean): number => {
  if (mobileGpu) return performanceMode ? 1 : 1.25
  return performanceMode ? 1.25 : 1.5
}

const shadowMapSize = (performanceMode: boolean, mobileGpu: boolean): number => {
  if (performanceMode && mobileGpu) return 512
  if (performanceMode || mobileGpu) return 1024
  return 2048
}

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

interface RainSystem {
  points: THREE.Points
  setWeather: (preset: WeatherPreset) => void
  setPerformanceMode: (enabled: boolean) => void
  update: (timeSeconds: number, pixelRatio: number) => void
  dispose: () => void
}

function createRainSystem(mobileGpu: boolean): RainSystem {
  const maxDrops = 1400
  const positions = new Float32Array(maxDrops * 3)
  const speeds = new Float32Array(maxDrops)
  for (let i = 0; i < maxDrops; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 82
    positions[i * 3 + 1] = Math.random() * 34
    positions[i * 3 + 2] = (Math.random() - 0.5) * 110
    speeds[i] = 20 + Math.random() * 18
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('dropSpeed', new THREE.BufferAttribute(speeds, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHeight: { value: 34 },
      uIntensity: { value: 1 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: `
      attribute float dropSpeed;
      uniform float uTime;
      uniform float uHeight;
      uniform float uPixelRatio;
      varying float vBrightness;

      void main() {
        float y = mod(position.y - uTime * dropSpeed, uHeight) - uHeight * 0.42;
        vec3 worldPosition = vec3(
          cameraPosition.x + position.x,
          cameraPosition.y + y,
          cameraPosition.z + position.z
        );
        vec4 viewPosition = viewMatrix * vec4(worldPosition, 1.0);
        float depth = max(5.0, -viewPosition.z);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp((7.5 + dropSpeed * 0.08) * uPixelRatio * 16.0 / depth, 2.0, 9.0);
        vBrightness = clamp(1.15 - depth / 120.0, 0.28, 0.92);
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      varying float vBrightness;

      void main() {
        vec2 drop = gl_PointCoord - vec2(0.5);
        float narrow = 1.0 - smoothstep(0.055, 0.18, abs(drop.x));
        float tapered = 1.0 - smoothstep(0.18, 0.52, abs(drop.y));
        float alpha = narrow * tapered * vBrightness * 0.72 * uIntensity;
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(0.78, 0.88, 0.94, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'camera-follow-rain'
  points.visible = false
  points.frustumCulled = false
  points.renderOrder = 50

  const setPerformanceMode = (enabled: boolean): void => {
    geometry.setDrawRange(0, enabled || mobileGpu ? 520 : maxDrops)
  }
  setPerformanceMode(false)

  return {
    points,
    setWeather: (preset) => {
      points.visible = preset.precipitation === 'rain'
      material.uniforms.uIntensity.value = preset.rainIntensity ?? 0
    },
    setPerformanceMode,
    update: (timeSeconds, pixelRatio) => {
      if (!points.visible) return
      material.uniforms.uTime.value = timeSeconds
      material.uniforms.uPixelRatio.value = pixelRatio
    },
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
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
  const mobileGpu = isMobileGpu()
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
  let resolutionScale = 1
  const applyPixelRatio = (): void => {
    const baseRatio = Math.min(window.devicePixelRatio, pixelRatioCap(performanceMode, mobileGpu))
    renderer.setPixelRatio(baseRatio * resolutionScale)
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

  let composer: EffectComposer | null = null
  let bloomPass: UnrealBloomPass | null = null
  const shouldUsePostProcessing = (): boolean => !performanceMode && !mobileGpu
  const ensurePostProcessing = (): void => {
    if (composer || !shouldUsePostProcessing()) return
    composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.22,
      0.24,
      0.88,
    )
    composer.addPass(renderPass)
    composer.addPass(bloomPass)
    composer.addPass(new ShaderPass(CinematicGradeShader))
    composer.addPass(new OutputPass())
  }
  const disposePostProcessing = (): void => {
    composer?.dispose()
    composer = null
    bloomPass = null
  }
  ensurePostProcessing()

  // Direct sunlight — strong & warm. High contrast vs. fill light = crisp 3D.
  const sun = new THREE.DirectionalLight(0xffdfb0, 4.8)
  sun.position.copy(SUN_OFFSET)
  sun.castShadow = true
  const applyShadowQuality = (): void => {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.type = performanceMode ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
    const shadowSize = shadowMapSize(performanceMode, mobileGpu)
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
  const rain = createRainSystem(mobileGpu)
  rain.setPerformanceMode(performanceMode)
  scene.add(rain.points)
  renderer.toneMappingExposure = 1.28

  // --- Procedural sky env map: gives PBR materials proper reflections.
  let environmentRT: THREE.WebGLRenderTarget | null = null
  let hdrBackgroundTexture: THREE.Texture | null = null
  let currentWeather: WeatherPreset | null = null
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
        scene.background = currentWeather?.precipitation === 'rain'
          ? new THREE.Color(currentWeather.sky)
          : texture
        scene.environment = hdrRT.texture
        const rainy = currentWeather?.precipitation === 'rain'
        scene.backgroundIntensity = rainy ? 0.58 : 1
        scene.environmentIntensity = rainy ? 0.68 : 1
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
    currentWeather = preset
    const rainy = preset.precipitation === 'rain'
    if (rainy) {
      scene.background = new THREE.Color(preset.sky)
    } else if (hdrBackgroundTexture) {
      scene.background = hdrBackgroundTexture
    } else if (scene.background instanceof THREE.Color) {
      scene.background.set(preset.sky)
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(preset.fogColor)
      scene.fog.near = preset.fogNear
      scene.fog.far = preset.fogFar
    } else {
      scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar)
    }
    sun.color.set(rainy ? preset.sunColor : preset.nightMode ? '#b6c8ff' : '#ffdfb0')
    sun.intensity = rainy ? preset.sunIntensity : preset.nightMode ? 2.25 : 4.8
    hemi.color.set(preset.hemiSky)
    hemi.groundColor.set(preset.hemiGround)
    hemi.intensity = rainy ? preset.hemiIntensity : Math.max(preset.hemiIntensity, preset.nightMode ? 0.65 : 0.95)
    rim.color.set(rainy ? '#9eb2bd' : preset.nightMode ? '#7aa7ff' : '#9fc7ff')
    rim.intensity = rainy ? 0.62 : preset.nightMode ? 1.55 : 1.15
    renderer.toneMappingExposure = rainy
      ? preset.exposure
      : Math.max(preset.exposure, preset.nightMode ? 1.08 : 1.22)
    scene.backgroundIntensity = rainy ? 0.58 : 1
    scene.environmentIntensity = rainy ? 0.68 : 1
    rain.setWeather(preset)
    if (bloomPass) bloomPass.strength = rainy ? 0.12 : preset.nightMode ? 0.26 : 0.22
  }

  const setPerformanceMode = (enabled: boolean): void => {
    performanceMode = enabled
    resolutionScale = 1
    if (shouldUsePostProcessing()) ensurePostProcessing()
    else disposePostProcessing()
    rain.setPerformanceMode(performanceMode)
    applyShadowQuality()
    applyPixelRatio()
    resize()
  }

  const lastShadowFocus = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
  const updateShadowFollow = (worldPos: THREE.Vector3): void => {
    const updateDistance = performanceMode ? (mobileGpu ? 14 : 10) : 6
    if (lastShadowFocus.distanceToSquared(worldPos) < updateDistance * updateDistance) return
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
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(w, h)
    }
    renderer.shadowMap.needsUpdate = true
  }

  let fpsSampleStartedAt = performance.now()
  let lastRenderedAt = fpsSampleStartedAt
  let fpsSampleFrames = 0
  let lastResolutionChangeAt = fpsSampleStartedAt
  const updateAdaptiveResolution = (now: number): void => {
    const frameGap = now - lastRenderedAt
    lastRenderedAt = now
    if (frameGap > 250) {
      fpsSampleStartedAt = now
      fpsSampleFrames = 0
      return
    }
    fpsSampleFrames++
    const sampleDuration = now - fpsSampleStartedAt
    if (sampleDuration < 1800) return
    const fps = fpsSampleFrames * 1000 / sampleDuration
    let nextScale = resolutionScale
    if (fps < 43 && resolutionScale > 0.72) {
      nextScale = Math.max(0.72, resolutionScale - 0.12)
    } else if (fps > 57 && resolutionScale < 1 && now - lastResolutionChangeAt > 6000) {
      nextScale = Math.min(1, resolutionScale + 0.06)
    }
    fpsSampleStartedAt = now
    fpsSampleFrames = 0
    if (nextScale === resolutionScale) return
    resolutionScale = nextScale
    lastResolutionChangeAt = now
    applyPixelRatio()
    resize()
  }

  const render = (): void => {
    updateAdaptiveResolution(performance.now())
    rain.update(performance.now() * 0.001, renderer.getPixelRatio())
    if (composer) composer.render()
    else renderer.render(scene, camera)
  }

  const dispose = (): void => {
    environmentRT?.dispose()
    hdrBackgroundTexture?.dispose()
    rain.dispose()
    disposePostProcessing()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }

  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)

  return { scene, camera, renderer, sun, setPerformanceMode, applyWeather, updateShadowFollow, resize, render, dispose }
}
