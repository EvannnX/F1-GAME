import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import ferrariUrl from '../assets/models/Ferrari_26.glb?url'
import mclarenUrl from '../assets/models/McLaren_MCL35M.glb?url'
import mercedesUrl from '../assets/models/Mercedes_W13.glb?url'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'

export interface HomeScreenController {
  destroy: () => void
}

type StartHandler = () => void | Promise<void>

interface CarDisplay {
  url: string
  position: [number, number, number]
  rotationY: number
  length: number
  reverse: boolean
}

const CARS: CarDisplay[] = [
  {
    url: mclarenUrl,
    position: [-4.15, 0.03, -1.15],
    rotationY: 0.28,
    length: 4.75,
    reverse: false,
  },
  {
    url: ferrariUrl,
    position: [0, 0.08, 0.75],
    rotationY: -0.1,
    length: 6.35,
    reverse: true,
  },
  {
    url: mercedesUrl,
    position: [4.1, 0.03, -1.2],
    rotationY: -0.28,
    length: 4.7,
    reverse: true,
  },
]

const STYLE_ID = 'f1s-home-screen-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .f1s-home {
      position: fixed;
      inset: 0;
      z-index: 500;
      overflow: hidden;
      background: #07090d;
      color: #fff;
      font-family: Inter, "Helvetica Neue", Arial, sans-serif;
      isolation: isolate;
    }
    .f1s-home__canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .f1s-home__header {
      position: absolute;
      z-index: 2;
      top: clamp(20px, 4vh, 50px);
      left: 50%;
      width: min(900px, 92vw);
      transform: translateX(-50%);
      text-align: center;
      pointer-events: none;
    }
    .f1s-home__title {
      margin: 0;
      color: #fff;
      font-size: clamp(96px, 15vw, 188px);
      font-style: italic;
      font-weight: 950;
      line-height: .78;
      letter-spacing: 0;
      text-transform: uppercase;
      text-shadow: 7px 8px 0 #151a22, 14px 16px 0 rgba(255, 255, 255, .12), 0 18px 34px rgba(0, 0, 0, .82);
    }
    .f1s-home__title .f1s-home__ti {
      color: #ff2838;
      text-shadow: 7px 8px 0 #f2f3f5, 14px 16px 0 rgba(8, 10, 14, .64), 0 18px 34px rgba(0, 0, 0, .82);
    }
    .f1s-home__footer {
      position: absolute;
      z-index: 3;
      left: 50%;
      bottom: max(28px, calc(env(safe-area-inset-bottom) + 18px));
      display: flex;
      width: min(520px, calc(100vw - 40px));
      transform: translateX(-50%);
      flex-direction: column;
      align-items: center;
      gap: 11px;
    }
    .f1s-home__start {
      position: relative;
      width: 100%;
      min-height: 70px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, .82);
      border-radius: 3px;
      background: rgba(246, 247, 249, .96);
      color: #11141a;
      font: 950 22px/1 Inter, "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0;
      cursor: pointer;
      box-shadow: 0 12px 40px rgba(0, 0, 0, .36);
      transition: transform .16s ease, background .16s ease, color .16s ease;
    }
    .f1s-home__start::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 12px;
      height: 100%;
      background: #ed1b2f;
    }
    .f1s-home__start::after {
      content: '›';
      position: absolute;
      top: 50%;
      right: 24px;
      color: #ed1b2f;
      font-size: 38px;
      font-weight: 500;
      transform: translateY(-54%);
    }
    .f1s-home__start:hover,
    .f1s-home__start:focus-visible {
      background: #ed1b2f;
      color: #fff;
      outline: none;
      transform: translateY(-2px);
    }
    .f1s-home__start:hover::before,
    .f1s-home__start:focus-visible::before {
      background: #fff;
    }
    .f1s-home__start:hover::after,
    .f1s-home__start:focus-visible::after {
      color: #fff;
    }
    .f1s-home__start:disabled {
      cursor: wait;
      opacity: .72;
      transform: none;
    }
    .f1s-home__track {
      color: rgba(255, 255, 255, .72);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0;
    }
    .f1s-home--leaving {
      opacity: 0;
      transition: opacity .32s ease;
      pointer-events: none;
    }
    .f1s-home--launching .f1s-home__header {
      opacity: .72;
      transform: translate(-50%, -8px);
      transition: opacity .45s ease, transform .45s ease;
    }
    .f1s-home--launching .f1s-home__start {
      background: #ed1b2f;
      color: #fff;
    }
    .f1s-home--launching .f1s-home__start::before { background: #fff; }
    .f1s-home--launching .f1s-home__start::after { color: #fff; }
    @media (max-height: 620px) {
      .f1s-home__header { top: 18px; }
      .f1s-home__title { font-size: clamp(72px, 18vw, 132px); }
      .f1s-home__footer { bottom: 18px; width: min(440px, calc(100vw - 36px)); }
      .f1s-home__start { min-height: 58px; font-size: 19px; }
      .f1s-home__track { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .f1s-home__start, .f1s-home--leaving { transition: none; }
    }
  `
  document.head.appendChild(style)
}

function fitCar(model: THREE.Object3D, targetLength: number, reverse: boolean): void {
  let box = new THREE.Box3().setFromObject(model)
  let size = box.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.z)
  if (longest > 0) model.scale.setScalar(targetLength / longest)

  box = new THREE.Box3().setFromObject(model)
  size = box.getSize(new THREE.Vector3())
  if (size.x > size.z * 1.1) model.rotation.y = -Math.PI / 2
  if (reverse) model.rotation.y += Math.PI

  box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  model.position.set(-center.x, -box.min.y, -center.z)
  model.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = true
  })
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) material?.dispose()
  })
}

export function showHomeScreen(onStart: StartHandler): HomeScreenController {
  installStyles()
  const mobileGpu = window.matchMedia('(pointer: coarse)').matches

  const host = document.createElement('section')
  host.className = 'f1s-home'
  host.setAttribute('aria-label', 'F1TI 主菜单')
  host.innerHTML = `
    <div class="f1s-home__header">
      <h1 class="f1s-home__title">F1<span class="f1s-home__ti">TI</span></h1>
    </div>
    <div class="f1s-home__footer">
      <button class="f1s-home__start" type="button">开始比赛</button>
      <div class="f1s-home__track">SHANGHAI · GRAND PRIX</div>
    </div>
  `
  document.body.appendChild(host)
  document.body.classList.add('f1s-home-active')

  const canvasHost = document.createElement('div')
  canvasHost.className = 'f1s-home__canvas'
  host.prepend(canvasHost)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#07090d')
  scene.fog = new THREE.Fog('#07090d', 14, 29)

  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80)
  camera.position.set(0, 4.2, 14.2)
  camera.lookAt(0, 0.72, -0.2)

  const renderer = new THREE.WebGLRenderer({ antialias: !mobileGpu, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.22
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  canvasHost.appendChild(renderer.domElement)

  const stage = new THREE.Group()
  scene.add(stage)

  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: '#111318',
    metalness: 0.78,
    roughness: 0.2,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
  })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.03
  floor.receiveShadow = true
  stage.add(floor)

  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#0c0f15', roughness: 0.74, metalness: 0.08 })
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(32, 13), wallMaterial)
  wall.position.set(0, 5.7, -6.2)
  stage.add(wall)

  const gridMaterial = new THREE.LineBasicMaterial({ color: '#48616e', transparent: true, opacity: 0.28 })
  const gridPoints: THREE.Vector3[] = []
  for (let x = -15; x <= 15; x += 2) {
    gridPoints.push(new THREE.Vector3(x, 0.002, -6), new THREE.Vector3(x, 0.002, 10))
  }
  for (let z = -6; z <= 10; z += 2) {
    gridPoints.push(new THREE.Vector3(-15, 0.002, z), new THREE.Vector3(15, 0.002, z))
  }
  const gridGeometry = new THREE.BufferGeometry().setFromPoints(gridPoints)
  stage.add(new THREE.LineSegments(gridGeometry, gridMaterial))

  const neonColors = ['#ff3b1f', '#f7d326', '#47d46f', '#20c9e8', '#795cff', '#e32ed1', '#ff2442']
  const neonGeometry = new THREE.BoxGeometry(0.07, 5.4, 0.07)
  const neonMaterials: THREE.MeshStandardMaterial[] = []
  neonColors.forEach((color, index) => {
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4.2 })
    neonMaterials.push(material)
    const x = -9.3 + index * 3.1
    const bar = new THREE.Mesh(neonGeometry, material)
    bar.position.set(x, 4.8 + (index % 2) * 0.35, -5.95)
    bar.rotation.z = index % 2 === 0 ? -0.08 : 0.08
    stage.add(bar)
    const glow = new THREE.PointLight(color, 19, 9, 2)
    glow.position.set(x, 2.7, -3.8)
    stage.add(glow)
  })

  const key = new THREE.DirectionalLight('#ffffff', 4.3)
  key.position.set(-2, 9, 8)
  key.castShadow = true
  key.shadow.mapSize.set(mobileGpu ? 512 : 1024, mobileGpu ? 512 : 1024)
  key.shadow.camera.left = -10
  key.shadow.camera.right = 10
  key.shadow.camera.top = 8
  key.shadow.camera.bottom = -5
  scene.add(key)
  scene.add(new THREE.HemisphereLight('#cbe7ff', '#501818', 1.7))
  const front = new THREE.PointLight('#ffffff', 32, 18, 1.8)
  front.position.set(0, 4.5, 8)
  scene.add(front)

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
  const loadedCars: THREE.Group[] = []
  host.dataset.carsLoaded = '0'
  host.dataset.carLoadErrors = '0'
  CARS.forEach((display, index) => {
    const anchor = new THREE.Group()
    anchor.position.set(...display.position)
    anchor.rotation.y = display.rotationY
    anchor.renderOrder = index === 1 ? 2 : 1
    stage.add(anchor)
    loader.load(display.url, (gltf) => {
      fitCar(gltf.scene, display.length, display.reverse)
      anchor.add(gltf.scene)
      loadedCars.push(gltf.scene)
      host.dataset.carsLoaded = String(loadedCars.length)
    }, undefined, (error) => {
      host.dataset.carLoadErrors = String(Number(host.dataset.carLoadErrors ?? 0) + 1)
      console.warn('[F1S] home car load failed:', error)
    })
  })

  let frame = 0
  let destroyed = false
  let launching = false
  let lastRenderAt = 0
  const clock = new THREE.Clock()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const render = (now = 0): void => {
    if (destroyed) return
    frame = window.requestAnimationFrame(render)
    if (mobileGpu && now - lastRenderAt < 1000 / 30) return
    lastRenderAt = now
    const t = clock.getElapsedTime()
    if (!reduceMotion) {
      camera.position.x = Math.sin(t * 0.19) * 0.28
      camera.position.z += ((launching ? 11.8 : 14.2) - camera.position.z) * 0.035
      camera.lookAt(0, launching ? 0.5 : 0.72, -0.2)
      stage.position.y = Math.sin(t * 0.72) * 0.015
    }
    renderer.render(scene, camera)
  }

  const resize = (): void => {
    const width = Math.max(1, canvasHost.clientWidth)
    const height = Math.max(1, canvasHost.clientHeight)
    const compact = height < 620
    camera.fov = compact ? 39 : 33
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileGpu ? 1 : 1.35))
    renderer.setSize(width, height, false)
  }
  window.addEventListener('resize', resize)
  resize()
  render()

  const destroy = (): void => {
    if (destroyed) return
    destroyed = true
    window.cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    for (const car of loadedCars) disposeObject(car)
    floor.geometry.dispose()
    floorMaterial.dispose()
    wall.geometry.dispose()
    wallMaterial.dispose()
    gridGeometry.dispose()
    gridMaterial.dispose()
    neonGeometry.dispose()
    for (const material of neonMaterials) material.dispose()
    dracoLoader.dispose()
    renderer.dispose()
    document.body.classList.remove('f1s-home-active')
    host.remove()
  }

  const startButton = host.querySelector<HTMLButtonElement>('.f1s-home__start')!
  startButton.addEventListener('click', () => {
    startButton.disabled = true
    startButton.textContent = '进入赛场'
    launching = true
    host.classList.add('f1s-home--launching')
    void Promise.resolve(onStart()).catch((error) => {
      console.warn('[F1S] background game preparation failed:', error)
    }).then(() => {
      host.classList.add('f1s-home--leaving')
      window.setTimeout(destroy, reduceMotion ? 0 : 320)
    })
  }, { once: true })

  return { destroy }
}
