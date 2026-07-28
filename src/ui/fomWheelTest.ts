import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { playerCarById } from '../data/playerCars'
import {
  createFom2026WheelRigs,
  PLAYER_WHEEL_SPIN_RATE,
  updatePlayerWheelRigs,
  type PlayerWheelRig,
} from '../render/car'
import {
  applyFomThemeColor,
  readFomThemeColor,
} from '../render/fomSpecialLivery'
import { loadLocalAsset } from '../utils/localAsset'

function installStyles(): void {
  const style = document.createElement('style')
  style.textContent = `
    html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#d8dadd; }
    .fom-wheel-test { position:fixed; inset:0; color:#fff; font-family:Arial,sans-serif; }
    .fom-wheel-test canvas { display:block; width:100%; height:100%; touch-action:none; }
    .fom-wheel-test__panel {
      position:fixed; z-index:4; top:16px; left:16px; width:min(330px,calc(100vw - 32px));
      padding:14px; box-sizing:border-box; border:1px solid rgba(255,255,255,.2);
      border-radius:7px; background:rgba(12,14,18,.9); backdrop-filter:blur(12px);
      box-shadow:0 12px 34px rgba(0,0,0,.25);
    }
    .fom-wheel-test__panel h1 { margin:0 0 5px; font-size:19px; }
    .fom-wheel-test__panel p { margin:0 0 12px; color:#b8bec8; font-size:12px; line-height:1.45; }
    .fom-wheel-test__row {
      display:grid; grid-template-columns:54px minmax(0,1fr) 48px;
      align-items:center; gap:8px; margin:10px 0; font-size:12px;
    }
    .fom-wheel-test__row input { width:100%; accent-color:#cf1225; }
    .fom-wheel-test__row output { color:#82ff9d; text-align:right; font-variant-numeric:tabular-nums; }
    .fom-wheel-test__actions {
      display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-top:12px;
    }
    .fom-wheel-test__actions button {
      min-height:38px; border:1px solid rgba(255,255,255,.18); border-radius:5px;
      background:#292d34; color:#fff; font:700 12px/1 Arial,sans-serif; cursor:pointer;
    }
    .fom-wheel-test__actions button:hover,
    .fom-wheel-test__actions button:focus-visible { background:#3a404a; outline:none; }
    .fom-wheel-test__actions button[data-active="true"] { background:#bd1022; }
    .fom-wheel-test__status {
      margin-top:10px; color:#82ff9d; font-size:11px; line-height:1.45;
      white-space:pre-line; font-variant-numeric:tabular-nums;
    }
    .fom-wheel-test__hint {
      position:fixed; right:16px; bottom:14px; color:rgba(25,27,31,.72);
      font:12px/1.4 Arial,sans-serif; pointer-events:none;
    }
    @media (max-height:600px) {
      .fom-wheel-test__panel { top:8px; left:8px; padding:10px; }
      .fom-wheel-test__panel p { display:none; }
      .fom-wheel-test__row { margin:6px 0; }
    }
  `
  document.head.appendChild(style)
}

function fitModel(model: THREE.Object3D): void {
  let box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const planarLength = Math.max(size.x, size.z)
  if (planarLength > 0) model.scale.setScalar(5.2 / planarLength)
  box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  model.position.set(-center.x, -box.min.y + 0.025, -center.z)
  model.updateMatrixWorld(true)
}

function addAxleGuide(rig: PlayerWheelRig): THREE.Group {
  const guide = new THREE.Group()
  guide.name = `${rig.name}-axis-guide`
  guide.renderOrder = 20
  const axis = rig.spinAxis.clone().normalize()
  const geometry = new THREE.BufferGeometry().setFromPoints([
    axis.clone().multiplyScalar(-0.72),
    axis.clone().multiplyScalar(0.72),
  ])
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: '#68ff72',
      depthTest: false,
      depthWrite: false,
    }),
  )
  line.renderOrder = 20
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 20, 12),
    new THREE.MeshBasicMaterial({
      color: '#aaff9c',
      depthTest: false,
      depthWrite: false,
    }),
  )
  marker.renderOrder = 21
  guide.add(line, marker)
  rig.spinPivots[0].pivot.add(guide)
  return guide
}

export function installFomWheelTest(): void {
  installStyles()
  document.title = 'FOM 2026 Wheel Test'
  document.body.replaceChildren()

  const root = document.createElement('main')
  root.className = 'fom-wheel-test'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', 'FOM 2026 创变者赛车轮胎测试')
  root.appendChild(canvas)

  const panel = document.createElement('section')
  panel.className = 'fom-wheel-test__panel'
  const title = document.createElement('h1')
  title.textContent = '创变者轮胎滚动测试'
  const description = document.createElement('p')
  description.textContent = '测试页与正式比赛共用轮组识别、滚动轴和转向四元数。绿色线为实际局部滚动轴。'
  panel.append(title, description)

  let speed = 0.38
  let steer = 0
  let spinDirection = 1
  let paused = false
  let guidesVisible = true
  const slider = (
    label: string,
    min: number,
    max: number,
    value: number,
    format: (next: number) => string,
    update: (next: number) => void,
  ): void => {
    const row = document.createElement('label')
    row.className = 'fom-wheel-test__row'
    const caption = document.createElement('span')
    caption.textContent = label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = '0.01'
    input.value = String(value)
    const output = document.createElement('output')
    output.textContent = format(value)
    input.addEventListener('input', () => {
      const next = Number(input.value)
      output.textContent = format(next)
      update(next)
    })
    row.append(caption, input, output)
    panel.appendChild(row)
  }
  slider('速度', 0, 1, speed, (value) => `${Math.round(value * 100)}%`, (value) => {
    speed = value
  })
  slider('转向', -1, 1, steer, (value) => `${Math.round(value * 100)}`, (value) => {
    steer = value
  })

  const actions = document.createElement('div')
  actions.className = 'fom-wheel-test__actions'
  panel.appendChild(actions)
  const makeButton = (label: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', action)
    actions.appendChild(button)
    return button
  }

  const status = document.createElement('div')
  status.className = 'fom-wheel-test__status'
  status.textContent = '正在加载正式 FOM 模型与轮组...'
  panel.appendChild(status)
  root.appendChild(panel)
  const hint = document.createElement('div')
  hint.className = 'fom-wheel-test__hint'
  hint.textContent = 'fom-2026-material-v1 · shared production wheel update'
  root.appendChild(hint)
  document.body.appendChild(root)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#d8dadd')
  scene.fog = new THREE.Fog('#d8dadd', 18, 38)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = 1
  room.dispose()
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.075
  controls.enablePan = false
  controls.minDistance = 1.8
  controls.maxDistance = 14
  controls.maxPolarAngle = Math.PI * 0.49

  scene.add(new THREE.HemisphereLight('#ffffff', '#484b50', 0.84))
  const key = new THREE.DirectionalLight('#fff5e8', 3.5)
  key.position.set(-5, 8, -4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#e7f0ff', 0.72)
  fill.position.set(5, 4, 5)
  scene.add(fill)
  const rim = new THREE.DirectionalLight('#ffffff', 1.4)
  rim.position.set(1, 5, -7)
  scene.add(rim)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: '#b9bcc1', roughness: 0.88 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const grid = new THREE.GridHelper(40, 80, '#8d9299', '#a8acb2')
  grid.position.y = 0.003
  scene.add(grid)

  let rigs: PlayerWheelRig[] = []
  let guides: THREE.Group[] = []
  const setOverview = (): void => {
    camera.position.set(4.7, 2.8, 6)
    controls.target.set(0, 0.62, 0)
    controls.update()
  }
  const setFrontView = (): void => {
    camera.position.set(3.5, 1.35, 3.2)
    controls.target.set(0, 0.55, 1.45)
    controls.update()
  }
  const setRearView = (): void => {
    camera.position.set(-3.5, 1.35, -3.2)
    controls.target.set(0, 0.58, -1.45)
    controls.update()
  }
  setOverview()
  const pauseButton = makeButton('暂停滚动', () => {
    paused = !paused
    pauseButton.textContent = paused ? '继续滚动' : '暂停滚动'
    pauseButton.dataset.active = String(paused)
  })
  makeButton('反转滚动', () => { spinDirection *= -1 })
  const guideButton = makeButton('隐藏轴线', () => {
    guidesVisible = !guidesVisible
    for (const guide of guides) guide.visible = guidesVisible
    guideButton.textContent = guidesVisible ? '隐藏轴线' : '显示轴线'
    guideButton.dataset.active = String(!guidesVisible)
  })
  makeButton('全车视角', setOverview)
  makeButton('前轮近景', setFrontView)
  makeButton('后轮近景', setRearView)

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

  const definition = playerCarById('creator')
  void loadLocalAsset(definition.url)
    .then((bytes) => new Promise<THREE.Group>((resolve, reject) => {
      loader.parse(bytes, '', (gltf) => resolve(gltf.scene), reject)
    }))
    .then((model) => {
      fitModel(model)
      applyFomThemeColor(model, readFomThemeColor())
      model.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = false
      })
      scene.add(model)
      rigs = createFom2026WheelRigs(model)
      guides = rigs.map(addAxleGuide)
      const axleSummary = rigs.map((rig) => {
        const axis = rig.spinAxis.clone().normalize()
        const tiltDeg = THREE.MathUtils.radToDeg(
          Math.acos(THREE.MathUtils.clamp(Math.abs(axis.x), 0, 1)),
        )
        return `${rig.name}: (${axis.x.toFixed(3)}, ${axis.y.toFixed(3)}, ${axis.z.toFixed(3)})  ${tiltDeg.toFixed(2)}°`
      }).join('\n')
      status.textContent = rigs.length === 4
        ? `轮组 4/4 已就绪\n${axleSummary}`
        : `轮组识别异常：${rigs.length}/4`
    })
    .catch((error) => {
      status.textContent = `加载失败：${error instanceof Error ? error.message : String(error)}`
      console.error('[FOM wheel test] load failed:', error)
    })

  let previousTime = performance.now()
  const render = (now: number): void => {
    requestAnimationFrame(render)
    const dt = Math.min(0.05, Math.max(0, (now - previousTime) / 1000))
    previousTime = now
    updatePlayerWheelRigs(
      rigs,
      paused ? 0 : speed * spinDirection * PLAYER_WHEEL_SPIN_RATE * dt,
      steer,
    )
    controls.update()
    renderer.render(scene, camera)
  }
  requestAnimationFrame(render)

  const resize = (): void => {
    const width = Math.max(1, innerWidth)
    const height = Math.max(1, innerHeight)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  addEventListener('resize', resize)
  resize()
}
