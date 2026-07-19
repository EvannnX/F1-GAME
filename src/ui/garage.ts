import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'
import {
  PLAYER_CARS,
  playerCarById,
  readSelectedPlayerCar,
  selectPlayerCar,
  type PlayerCarDefinition,
  type PlayerCarId,
} from '../data/playerCars'

export interface GarageController {
  destroy: () => void
}

const STYLE_ID = 'f1s-garage-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-garage {
      position: fixed;
      inset: 0;
      z-index: 460;
      overflow: hidden;
      background: #d7d9de;
      color: #15171c;
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      isolation: isolate;
    }
    .f1s-garage__canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      cursor: grab;
    }
    .f1s-garage__canvas:active { cursor: grabbing; }
    .f1s-garage__topline {
      position: absolute;
      z-index: 2;
      top: 0;
      left: 0;
      width: 100%;
      height: 7px;
      background: #d41222;
      box-shadow: 0 2px 16px rgba(0, 0, 0, .34);
    }
    .f1s-garage__heading {
      position: absolute;
      z-index: 2;
      top: 24px;
      left: clamp(20px, 5vw, 74px);
      display: flex;
      align-items: center;
      min-width: min(360px, 52vw);
      height: 58px;
      padding: 0 42px 0 64px;
      background: rgba(250, 250, 251, .95);
      box-shadow: 0 8px 22px rgba(27, 30, 37, .16);
      clip-path: polygon(0 0, 100% 0, calc(100% - 32px) 100%, 0 100%);
      font-size: 22px;
      font-weight: 950;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .f1s-garage__heading::before {
      content: '';
      position: absolute;
      left: 24px;
      width: 20px;
      height: 20px;
      border: 6px solid #d41222;
      transform: rotate(45deg);
    }
    .f1s-garage__identity {
      position: absolute;
      z-index: 2;
      top: 112px;
      left: 0;
      display: flex;
      width: min(610px, 62vw);
      min-height: 96px;
      align-items: center;
      padding: 14px 76px clamp(14px, 2vh, 22px) clamp(30px, 6vw, 92px);
      background: #b80f1d;
      color: #fff;
      clip-path: polygon(0 0, calc(100% - 64px) 0, 100% 50%, calc(100% - 64px) 100%, 0 100%);
      box-shadow: 0 12px 28px rgba(92, 3, 12, .25);
    }
    .f1s-garage__team {
      color: rgba(255, 255, 255, .68);
      font-size: 11px;
      font-weight: 850;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .f1s-garage__name {
      margin-top: 3px;
      font-size: clamp(24px, 3vw, 38px);
      font-weight: 950;
      line-height: 1;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    .f1s-garage__model {
      margin-top: 7px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0;
    }
    .f1s-garage__arrow {
      position: absolute;
      z-index: 3;
      top: 53%;
      display: grid;
      width: 72px;
      height: 72px;
      place-items: center;
      border: 2px solid rgba(255, 255, 255, .82);
      border-radius: 50%;
      background: #b80f1d;
      color: #fff;
      font: 500 58px/1 Arial, sans-serif;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(24, 26, 32, .24);
      transform: translateY(-50%);
      transition: transform .16s ease, background .16s ease;
    }
    .f1s-garage__arrow:hover,
    .f1s-garage__arrow:focus-visible {
      background: #e01a2b;
      outline: none;
      transform: translateY(-50%) scale(1.06);
    }
    .f1s-garage__arrow--prev { left: clamp(18px, 6vw, 104px); }
    .f1s-garage__arrow--next { right: clamp(18px, 6vw, 104px); }
    .f1s-garage__arrow span { transform: translateY(-4px); }
    .f1s-garage__footer {
      position: absolute;
      z-index: 3;
      right: clamp(20px, 5vw, 76px);
      bottom: max(26px, calc(env(safe-area-inset-bottom) + 18px));
      display: flex;
      align-items: center;
      gap: 22px;
    }
    .f1s-garage__count {
      color: #5d616b;
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0;
    }
    .f1s-garage__continue {
      position: relative;
      min-width: 310px;
      min-height: 72px;
      padding: 0 68px 0 48px;
      border: 2px solid #fff;
      border-radius: 6px;
      background: #b80f1d;
      color: #fff;
      font: 950 21px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 12px 26px rgba(42, 10, 14, .3);
      transition: background .16s ease, transform .16s ease;
    }
    .f1s-garage__continue::after {
      content: '›';
      position: absolute;
      top: 50%;
      right: 28px;
      font: 500 38px/1 Arial, sans-serif;
      transform: translateY(-55%);
    }
    .f1s-garage__continue:hover,
    .f1s-garage__continue:focus-visible {
      background: #e01a2b;
      outline: none;
      transform: translateY(-2px);
    }
    .f1s-garage--leaving {
      opacity: 0;
      pointer-events: none;
      transition: opacity .28s ease;
    }
    @media (max-height: 620px) {
      .f1s-garage__heading {
        top: 14px;
        height: 46px;
        min-width: 290px;
        padding-left: 54px;
        font-size: 17px;
      }
      .f1s-garage__heading::before { left: 20px; width: 15px; height: 15px; border-width: 4px; }
      .f1s-garage__identity {
        top: 72px;
        width: min(430px, 55vw);
        min-height: 70px;
        padding: 10px 58px 11px 34px;
      }
      .f1s-garage__name { font-size: 23px; }
      .f1s-garage__team { display: none; }
      .f1s-garage__model { margin-top: 4px; font-size: 11px; }
      .f1s-garage__arrow { width: 56px; height: 56px; font-size: 46px; }
      .f1s-garage__footer { right: 18px; bottom: 14px; }
      .f1s-garage__continue { min-width: 240px; min-height: 56px; font-size: 18px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-garage__arrow,
      .f1s-garage__continue,
      .f1s-garage--leaving { transition: none; }
    }
  `
  document.head.appendChild(style)
}

function fitForGarage(model: THREE.Object3D, definition: PlayerCarDefinition): void {
  let bbox = new THREE.Box3().setFromObject(model)
  let size = bbox.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.z)
  if (longest > 0) model.scale.setScalar(7.0 / longest)

  bbox = new THREE.Box3().setFromObject(model)
  size = bbox.getSize(new THREE.Vector3())
  if (size.x > size.z * 1.1) model.rotation.y = -Math.PI / 2
  if (definition.reverse) model.rotation.y += Math.PI

  bbox = new THREE.Box3().setFromObject(model)
  const center = bbox.getCenter(new THREE.Vector3())
  model.position.set(-center.x, -bbox.min.y + 0.02, -center.z)
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = true
  })
}

function disposeModel(model: THREE.Object3D): void {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) material?.dispose()
  })
}

export function showGarageSelection(onConfirm: (id: PlayerCarId) => void): GarageController {
  installStyles()
  const mobileGpu = window.matchMedia('(pointer: coarse)').matches

  let selectedIndex = Math.max(0, PLAYER_CARS.findIndex((car) => car.id === readSelectedPlayerCar()))
  const host = document.createElement('section')
  host.className = 'f1s-garage'
  host.setAttribute('aria-label', '赛车车库')
  host.innerHTML = `
    <div class="f1s-garage__topline"></div>
    <div class="f1s-garage__heading">赛车选择</div>
    <div class="f1s-garage__identity" aria-live="polite">
      <div>
        <div class="f1s-garage__team"></div>
        <div class="f1s-garage__name"></div>
        <div class="f1s-garage__model"></div>
      </div>
    </div>
    <button class="f1s-garage__arrow f1s-garage__arrow--prev" type="button" aria-label="上一辆赛车" title="上一辆赛车"><span>‹</span></button>
    <button class="f1s-garage__arrow f1s-garage__arrow--next" type="button" aria-label="下一辆赛车" title="下一辆赛车"><span>›</span></button>
    <div class="f1s-garage__footer">
      <div class="f1s-garage__count"></div>
      <button class="f1s-garage__continue" type="button">确认赛车</button>
    </div>
  `
  document.body.appendChild(host)
  document.body.classList.add('f1s-garage-active')

  const canvasHost = document.createElement('div')
  canvasHost.className = 'f1s-garage__canvas'
  host.prepend(canvasHost)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#d7d9de')
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80)
  camera.position.set(6.5, 2.9, 8.2)

  const renderer = new THREE.WebGLRenderer({ antialias: !mobileGpu, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  canvasHost.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.72, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.065
  controls.enablePan = false
  controls.minDistance = 6.8
  controls.maxDistance = 14
  controls.minPolarAngle = Math.PI * 0.2
  controls.maxPolarAngle = Math.PI * 0.47
  controls.autoRotate = false

  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: '#eef0f3',
    roughness: 0.22,
    metalness: 0.08,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.03
  floor.receiveShadow = true
  scene.add(floor)

  const platformMaterial = new THREE.MeshStandardMaterial({ color: '#f8f9fa', roughness: 0.34, metalness: 0.1 })
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.5, 0.08, 96), platformMaterial)
  platform.position.y = -0.02
  platform.receiveShadow = true
  scene.add(platform)

  const key = new THREE.DirectionalLight('#ffffff', 4.5)
  key.position.set(-5, 10, 8)
  key.castShadow = true
  key.shadow.mapSize.set(mobileGpu ? 512 : 1024, mobileGpu ? 512 : 1024)
  key.shadow.camera.left = -8
  key.shadow.camera.right = 8
  key.shadow.camera.top = 7
  key.shadow.camera.bottom = -6
  scene.add(key)
  const rim = new THREE.DirectionalLight('#9fc7ff', 2.4)
  rim.position.set(8, 5, -6)
  scene.add(rim)
  scene.add(new THREE.HemisphereLight('#ffffff', '#7d828c', 2.25))

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderConfig({ type: 'js' })
  dracoLoader.setWorkerLimit(1)
  ;(dracoLoader as unknown as {
    _loadLibrary: (url: string, responseType: string) => Promise<string | ArrayBuffer>
  })._loadLibrary = async (url: string) => {
    if (url.endsWith('draco_decoder.js')) return dracoDecoderJs
    throw new Error(`Unsupported Draco decoder asset: ${url}`)
  }
  loader.setDRACOLoader(dracoLoader)
  loader.setMeshoptDecoder(MeshoptDecoder)

  const loaded = new Map<PlayerCarId, THREE.Group>()
  const loading = new Map<PlayerCarId, Promise<THREE.Group>>()
  let currentModel: THREE.Group | null = null
  let destroyed = false

  const frameModel = (model: THREE.Object3D): void => {
    const box = new THREE.Box3().setFromObject(model)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const size = box.getSize(new THREE.Vector3())
    const target = new THREE.Vector3(0, box.min.y + size.y * 0.46, 0)
    const halfVerticalFov = THREE.MathUtils.degToRad(camera.fov * 0.5)
    const fitDistance = sphere.radius / Math.max(0.1, Math.sin(halfVerticalFov)) * 1.12
    const viewDirection = new THREE.Vector3(0.58, 0.24, 0.78).normalize()

    controls.target.copy(target)
    camera.position.copy(target).addScaledVector(viewDirection, fitDistance)
    camera.near = Math.max(0.05, fitDistance * 0.02)
    camera.far = Math.max(80, fitDistance * 8)
    camera.updateProjectionMatrix()
    controls.minDistance = fitDistance * 0.68
    controls.maxDistance = fitDistance * 1.55
    controls.update()
  }

  const loadCar = (definition: PlayerCarDefinition): Promise<THREE.Group> => {
    const cached = loaded.get(definition.id)
    if (cached) return Promise.resolve(cached)
    const pending = loading.get(definition.id)
    if (pending) return pending
    const promise = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(definition.url, (gltf) => {
        fitForGarage(gltf.scene, definition)
        if (destroyed) {
          disposeModel(gltf.scene)
          reject(new Error('Garage closed before the car finished loading'))
          return
        }
        loaded.set(definition.id, gltf.scene)
        loading.delete(definition.id)
        resolve(gltf.scene)
      }, undefined, (error) => {
        loading.delete(definition.id)
        reject(error)
      })
    })
    loading.set(definition.id, promise)
    return promise
  }

  const teamEl = host.querySelector<HTMLDivElement>('.f1s-garage__team')!
  const nameEl = host.querySelector<HTMLDivElement>('.f1s-garage__name')!
  const modelEl = host.querySelector<HTMLDivElement>('.f1s-garage__model')!
  const countEl = host.querySelector<HTMLDivElement>('.f1s-garage__count')!
  let selectionVersion = 0
  const showSelection = (index: number): void => {
    selectedIndex = (index + PLAYER_CARS.length) % PLAYER_CARS.length
    const definition = PLAYER_CARS[selectedIndex]
    const version = ++selectionVersion
    host.dataset.selectedCar = definition.id
    host.style.setProperty('--garage-accent', definition.accent)
    teamEl.textContent = definition.team
    nameEl.textContent = definition.name
    modelEl.textContent = definition.model
    countEl.textContent = `${selectedIndex + 1} / ${PLAYER_CARS.length}`
    controls.autoRotate = false
    void loadCar(definition).then((model) => {
      if (destroyed || version !== selectionVersion) return
      if (currentModel) currentModel.visible = false
      currentModel = model
      currentModel.visible = true
      if (!currentModel.parent) scene.add(currentModel)
      frameModel(currentModel)
      renderer.shadowMap.needsUpdate = true
    }).catch((error) => {
      console.warn('[F1S] garage car load failed:', definition.id, error)
    })
  }

  const previous = (): void => showSelection(selectedIndex - 1)
  const next = (): void => showSelection(selectedIndex + 1)
  host.querySelector<HTMLButtonElement>('.f1s-garage__arrow--prev')!.addEventListener('click', previous)
  host.querySelector<HTMLButtonElement>('.f1s-garage__arrow--next')!.addEventListener('click', next)

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowLeft') previous()
    else if (event.key === 'ArrowRight') next()
  }
  window.addEventListener('keydown', onKeyDown)

  let frame = 0
  let lastRenderAt = 0
  const render = (now = 0): void => {
    if (destroyed) return
    frame = window.requestAnimationFrame(render)
    if (mobileGpu && now - lastRenderAt < 1000 / 30) return
    lastRenderAt = now
    controls.update()
    renderer.render(scene, camera)
  }
  const resize = (): void => {
    const width = Math.max(1, canvasHost.clientWidth)
    const height = Math.max(1, canvasHost.clientHeight)
    camera.fov = 34
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileGpu ? 1 : 1.35))
    renderer.setSize(width, height, false)
  }
  window.addEventListener('resize', resize)
  resize()
  render()
  showSelection(selectedIndex)

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }
  const preloadRemaining = (): void => {
    for (const definition of PLAYER_CARS) {
      if (definition.id === PLAYER_CARS[selectedIndex].id) continue
      void loadCar(definition).catch(() => { /* Loaded on demand if idle preload fails. */ })
    }
  }
  if (idleWindow.requestIdleCallback) idleWindow.requestIdleCallback(preloadRemaining, { timeout: 1400 })
  else window.setTimeout(preloadRemaining, 700)

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    selectionVersion++
    window.cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKeyDown)
    controls.dispose()
    for (const model of loaded.values()) disposeModel(model)
    loaded.clear()
    floor.geometry.dispose()
    floorMaterial.dispose()
    platform.geometry.dispose()
    platformMaterial.dispose()
    dracoLoader.dispose()
    renderer.dispose()
    document.body.classList.remove('f1s-garage-active')
    host.remove()
  }

  host.querySelector<HTMLButtonElement>('.f1s-garage__continue')!.addEventListener('click', () => {
    const selected = playerCarById(PLAYER_CARS[selectedIndex].id)
    selectPlayerCar(selected.id)
    host.classList.add('f1s-garage--leaving')
    window.setTimeout(() => {
      destroy()
      onConfirm(selected.id)
    }, 280)
  }, { once: true })

  return { destroy }
}
