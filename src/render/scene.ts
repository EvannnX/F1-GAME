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
  recommendedMaxFps: number
  setPerformanceMode: (enabled: boolean) => void
  /** Radial motion treatment used by the lion's arcade boost in quality mode. */
  setArcadeBoost: (strength: number) => void
  /** Compile shaders and allocate render targets before gameplay starts. */
  prewarm: () => Promise<void>
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
  if (COMPACT_30_BUILD && mobileGpu) return performanceMode ? 1.15 : 1.35
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

const ArcadeBoostShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
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
    uniform float strength;
    varying vec2 vUv;

    void main() {
      vec2 radial = vUv - vec2(0.5);
      vec2 stepUv = radial * (0.011 * strength);
      vec3 color = texture2D(tDiffuse, vUv).rgb * 0.34;
      color += texture2D(tDiffuse, vUv - stepUv).rgb * 0.24;
      color += texture2D(tDiffuse, vUv - stepUv * 2.0).rgb * 0.18;
      color += texture2D(tDiffuse, vUv - stepUv * 3.5).rgb * 0.14;
      color += texture2D(tDiffuse, vUv - stepUv * 5.0).rgb * 0.10;
      float edge = smoothstep(0.12, 0.72, length(radial));
      color += vec3(0.02, 0.07, 0.11) * edge * strength;
      gl_FragColor = vec4(color, 1.0);
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
  const gl = renderer.getContext()
  const rendererDebugInfo = gl.getExtension('WEBGL_debug_renderer_info')
  const rendererName = String(
    rendererDebugInfo
      ? gl.getParameter(rendererDebugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
  )
  const integratedDesktopGpu = /\bintel\b|uhd graphics|iris/i.test(rendererName)
  // The Intel UHD has to render the WebGL surface and then hand it to DWM for
  // a second full-screen composition. At 30 fps those two workloads still
  // saturate the shared 3D engine. A stable 24 fps leaves real compositor and
  // thermal headroom on this development-class iGPU; phones and discrete
  // desktop GPUs retain their existing frame targets.
  const recommendedMaxFps = integratedDesktopGpu ? 24 : mobileGpu ? 45 : 60
  const maximumResolutionScale = integratedDesktopGpu ? 0.78 : 1
  if (resolutionScale > maximumResolutionScale) {
    resolutionScale = maximumResolutionScale
    applyPixelRatio()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }

  type GpuProbeScope = typeof globalThis & {
    __F1TI_GPU_PROBE__?: () => Record<string, unknown>
  }
  const probeScope = globalThis as GpuProbeScope
  const gpuProbeEnabled = new URLSearchParams(window.location.search).has('gpuProbe')
  if (gpuProbeEnabled) {
    probeScope.__F1TI_GPU_PROBE__ = () => {
      const gl = renderer.getContext()
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      const drawingBuffer = new THREE.Vector2()
      renderer.getDrawingBufferSize(drawingBuffer)
      camera.updateMatrixWorld()
      const cameraFrustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      )
      const sceneRoots: Array<{
        name: string
        meshes: number
        calls: number
        triangles: number
        shadowCalls: number
        shadowTriangles: number
      }> = []
      for (const child of scene.children) {
        const stats = {
          name: child.name || child.type,
          meshes: 0,
          calls: 0,
          triangles: 0,
          shadowCalls: 0,
          shadowTriangles: 0,
        }
        child.traverseVisible((object) => {
          if (!(object instanceof THREE.Mesh)) return
          if (object.frustumCulled && !cameraFrustum.intersectsObject(object)) return
          const indexCount = object.geometry.getIndex()?.count
            ?? object.geometry.getAttribute('position')?.count
            ?? 0
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          const calls = object.geometry.groups.length > 0 && materials.length > 1
            ? object.geometry.groups.filter((group) => materials[group.materialIndex]?.visible !== false).length
            : (materials.some((material) => material?.visible !== false) ? 1 : 0)
          const triangles = Math.floor(indexCount / 3)
          stats.meshes++
          stats.calls += calls
          stats.triangles += triangles
          if (object.castShadow) {
            stats.shadowCalls += calls
            stats.shadowTriangles += triangles
          }
        })
        if (stats.meshes > 0) sceneRoots.push(stats)
      }
      const trackRoot = scene.getObjectByName('lowpoly-shanghai-root')
      let visualChunks = 0
      let visibleVisualChunks = 0
      let hiddenVisualOriginals = 0
      const visibleChunkGroups = new Map<string, { chunks: number; triangles: number }>()
      trackRoot?.traverse((object) => {
        if (object.userData.driveVisualChunk) {
          visualChunks++
          if (object.visible) {
            visibleVisualChunks++
            const mesh = object as THREE.Mesh
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const key = materials.map((material) => material?.name || '(unnamed)').join('+')
            const current = visibleChunkGroups.get(key) ?? { chunks: 0, triangles: 0 }
            current.chunks++
            current.triangles += Math.floor(
              (mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3,
            )
            visibleChunkGroups.set(key, current)
          }
        }
        if (object.userData.driveHiddenVisualOriginal) hiddenVisualOriginals++
      })
      const trackSize = trackRoot
        ? new THREE.Box3().setFromObject(trackRoot).getSize(new THREE.Vector3())
        : null
      return {
        now: performance.now(),
        frame: renderer.info.render.frame,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        lines: renderer.info.render.lines,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        pixelRatio: renderer.getPixelRatio(),
        drawingBufferWidth: drawingBuffer.x,
        drawingBufferHeight: drawingBuffer.y,
        maxTextureSize: renderer.capabilities.maxTextureSize,
        gpuVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        gpuRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        performanceMode,
        recommendedMaxFps,
        resolutionScale,
        postProcessing: composer !== null,
        postProcessingPasses: composer?.passes.length ?? 0,
        bloomEnabled: bloomPass !== null,
        sceneRoots: sceneRoots.sort((a, b) =>
          (b.calls + b.shadowCalls) - (a.calls + a.shadowCalls),
        ),
        visualChunks,
        visibleVisualChunks,
        hiddenVisualOriginals,
        visibleChunkGroups: [...visibleChunkGroups.entries()]
          .map(([material, value]) => ({ material, ...value }))
          .sort((a, b) => b.triangles - a.triangles),
        trackSize: trackSize ? { x: trackSize.x, y: trackSize.y, z: trackSize.z } : null,
      }
    }
  }

  let composer: EffectComposer | null = null
  let bloomPass: UnrealBloomPass | null = null
  let qualityBoostPass: ShaderPass | null = null
  let lightweightBoostComposer: EffectComposer | null = null
  let lightweightBoostPass: ShaderPass | null = null
  let arcadeBoostStrength = 0
  // Integrated Intel GPUs are fill-rate limited at the laptop's native
  // resolution. Even without bloom, routing the frame through the composer
  // repeatedly reads and writes a full-screen render target and can pin the
  // 3D engine near 100%. Keep native geometry, PBR, textures and HQ shadows,
  // but render them directly on this hardware. Discrete desktop GPUs retain
  // the complete cinematic post-processing chain.
  const shouldUsePostProcessing = (): boolean =>
    !performanceMode && !mobileGpu && !integratedDesktopGpu
  const ensurePostProcessing = (): void => {
    if (composer || !shouldUsePostProcessing()) return
    composer = new EffectComposer(renderer)
    const renderPass = new RenderPass(scene, camera)
    composer.addPass(renderPass)
    // UnrealBloomPass performs a bright-pass plus a multi-level separable
    // blur pyramid every frame. On the integrated Intel GPU used by the
    // development laptop this one subtle effect costs several complete
    // scene renders' worth of GPU time. Keep the inexpensive colour grade
    // and Lion boost treatment, but reserve the blur pyramid for discrete
    // desktop GPUs.
    if (!integratedDesktopGpu) {
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.22,
        0.24,
        0.88,
      )
      composer.addPass(bloomPass)
    }
    composer.addPass(new ShaderPass(CinematicGradeShader))
    qualityBoostPass = new ShaderPass(ArcadeBoostShader)
    qualityBoostPass.uniforms.strength.value = arcadeBoostStrength
    qualityBoostPass.enabled = arcadeBoostStrength > 0.001
    composer.addPass(qualityBoostPass)
    composer.addPass(new OutputPass())
  }
  // The always-on composer is too expensive on integrated/mobile GPUs, but
  // completely dropping the radial pull made Lion's boost feel noticeably
  // flatter. This small chain exists only as a fallback and is rendered only
  // during the short boost window. Its deliberately softer render target also
  // reinforces the motion blur while cutting fragment work roughly in half.
  const ensureLightweightBoostProcessing = (): void => {
    if (composer || lightweightBoostComposer) return
    lightweightBoostComposer = new EffectComposer(renderer)
    lightweightBoostComposer.addPass(new RenderPass(scene, camera))
    lightweightBoostPass = new ShaderPass(ArcadeBoostShader)
    lightweightBoostPass.uniforms.strength.value = arcadeBoostStrength
    lightweightBoostComposer.addPass(lightweightBoostPass)
    lightweightBoostComposer.addPass(new OutputPass())
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    lightweightBoostComposer.setPixelRatio(renderer.getPixelRatio() * 0.72)
    lightweightBoostComposer.setSize(width, height)
  }
  const disposePostProcessing = (): void => {
    composer?.dispose()
    composer = null
    bloomPass = null
    qualityBoostPass = null
  }
  const disposeLightweightBoostProcessing = (): void => {
    lightweightBoostComposer?.dispose()
    lightweightBoostComposer = null
    lightweightBoostPass = null
  }
  const setArcadeBoost = (strength: number): void => {
    arcadeBoostStrength = THREE.MathUtils.clamp(strength, 0, 1)
    if (qualityBoostPass) qualityBoostPass.uniforms.strength.value = arcadeBoostStrength
    if (qualityBoostPass) qualityBoostPass.enabled = arcadeBoostStrength > 0.001
    if (!composer && arcadeBoostStrength > 0.001) ensureLightweightBoostProcessing()
    if (lightweightBoostPass) {
      lightweightBoostPass.uniforms.strength.value = arcadeBoostStrength
    }
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
  let resolveEnvironmentReady: () => void = () => {}
  const environmentReady = new Promise<void>((resolve) => {
    resolveEnvironmentReady = resolve
  })
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
        try {
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
        } finally {
          resolveEnvironmentReady()
        }
      },
      undefined,
      (err) => {
        console.warn('[F1S] HDR skybox failed to load:', err)
        resolveEnvironmentReady()
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

  let renderPrewarmPromise: Promise<void> | null = null
  const setPerformanceMode = (enabled: boolean): void => {
    if (performanceMode === enabled) return
    performanceMode = enabled
    renderPrewarmPromise = null
    resolutionScale = maximumResolutionScale
    if (shouldUsePostProcessing()) ensurePostProcessing()
    else disposePostProcessing()
    rain.setPerformanceMode(performanceMode)
    applyShadowQuality()
    applyPixelRatio()
    resize()
  }

  const lastShadowFocus = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
  const updateShadowFollow = (worldPos: THREE.Vector3): void => {
    const updateDistance = mobileGpu ? 52 : performanceMode ? 44 : 36
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
    if (lightweightBoostComposer) {
      lightweightBoostComposer.setPixelRatio(renderer.getPixelRatio() * 0.72)
      lightweightBoostComposer.setSize(w, h)
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
    const minimumResolutionScale = COMPACT_30_BUILD ? 0.84 : 0.72
    const effectiveMinimumScale = Math.min(minimumResolutionScale, maximumResolutionScale)
    let nextScale = resolutionScale
    // Judge against this renderer's actual frame cap. The old fixed 43/57
    // thresholds treated the intentional 36 fps Intel cap as a permanent
    // performance failure and always forced resolution down to 72%.
    const degradeBelowFps = recommendedMaxFps * 0.88
    const restoreAboveFps = recommendedMaxFps * 0.97
    if (fps < degradeBelowFps && resolutionScale > effectiveMinimumScale) {
      nextScale = Math.max(effectiveMinimumScale, resolutionScale - 0.12)
    } else if (
      fps > restoreAboveFps
      && resolutionScale < maximumResolutionScale
      && now - lastResolutionChangeAt > 6000
    ) {
      nextScale = Math.min(maximumResolutionScale, resolutionScale + 0.06)
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
    else if (lightweightBoostComposer && arcadeBoostStrength > 0.001) {
      lightweightBoostComposer.render()
    }
    else renderer.render(scene, camera)
  }

  const prewarm = (): Promise<void> => {
    if (renderPrewarmPromise) return renderPrewarmPromise
    renderPrewarmPromise = (async () => {
      await environmentReady
      resize()
      renderer.shadowMap.needsUpdate = true
      const textures = new Set<THREE.Texture>()
      const temporarilyUnculled: THREE.Object3D[] = []
      scene.traverse((object) => {
        // For discrete GPUs, compile every visible scene object up front.
        // Intel's D3D11 parallel-shader path can stall for minutes when all
        // Shanghai chunks are forcibly unculled, so keep its normal camera
        // culling and compile only the start-area working set.
        if (!integratedDesktopGpu && object.frustumCulled) {
          temporarilyUnculled.push(object)
          object.frustumCulled = false
        }
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value)
          }
        }
      })
      try {
        for (const texture of textures) renderer.initTexture(texture)
        if (integratedDesktopGpu) renderer.compile(scene, camera)
        else await renderer.compileAsync(scene, camera)
      } catch (err) {
        console.warn('[F1S] async renderer prewarm failed, using synchronous compile:', err)
        renderer.compile(scene, camera)
      } finally {
        for (const object of temporarilyUnculled) object.frustumCulled = true
      }
      if (composer) composer.render()
      else renderer.render(scene, camera)
      renderer.shadowMap.needsUpdate = false
    })()
    return renderPrewarmPromise
  }

  const dispose = (): void => {
    environmentRT?.dispose()
    hdrBackgroundTexture?.dispose()
    rain.dispose()
    disposePostProcessing()
    disposeLightweightBoostProcessing()
    renderer.dispose()
    if (gpuProbeEnabled) delete probeScope.__F1TI_GPU_PROBE__
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }

  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)

  return {
    scene,
    camera,
    renderer,
    sun,
    recommendedMaxFps,
    setPerformanceMode,
    setArcadeBoost,
    prewarm,
    applyWeather,
    updateShadowFollow,
    resize,
    render,
    dispose,
  }
}
const COMPACT_30_BUILD = import.meta.env.VITE_F1TI_COMPACT30 === '1'
