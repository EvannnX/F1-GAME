import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'
import ferrariF175Url from '../assets/已压缩车模型/2022_ferrari_f1-75 (1)-optimized 2.glb?url'
import { loadLocalAsset } from '../utils/localAsset'

const WHEEL_NAMES = ['WHEEL_RF_19', 'WHEEL_LF_40', 'WHEEL_LR_54', 'WHEEL_RR_69'] as const
const FRONT_HUB_NAMES = ['HUB_RF_20', 'HUB_LF_41'] as const
const LOCAL_AXLE = new THREE.Vector3(1, 0, 0)

interface WheelState {
  node: THREE.Object3D
  baseQuaternion: THREE.Quaternion
  line: THREE.Mesh
  marker: THREE.Mesh
}

function installStyles(): void {
  const style = document.createElement('style')
  style.textContent = `
    html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#17191d; }
    .f175-test { position:fixed; inset:0; font-family:Arial,sans-serif; color:#fff; }
    .f175-test canvas { display:block; width:100%; height:100%; touch-action:none; }
    .f175-panel {
      position:fixed; z-index:3; top:16px; left:16px;
      width:min(320px,calc(100vw - 32px)); padding:14px; box-sizing:border-box;
      border:1px solid rgba(255,255,255,.2); border-radius:8px;
      background:rgba(12,14,18,.9); backdrop-filter:blur(12px);
    }
    .f175-panel h1 { margin:0 0 5px; font-size:18px; }
    .f175-panel p { margin:0 0 12px; color:#aeb5bf; font-size:12px; line-height:1.45; }
    .f175-row {
      display:grid; grid-template-columns:58px minmax(0,1fr) 48px;
      align-items:center; gap:8px; margin:10px 0; font-size:13px;
    }
    .f175-row input { width:100%; accent-color:#e3192d; }
    .f175-row output { color:#7dff9a; text-align:right; font-variant-numeric:tabular-nums; }
    .f175-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-top:12px; }
    .f175-actions button {
      min-height:38px; border:1px solid rgba(255,255,255,.18); border-radius:6px;
      background:#292d34; color:#fff; font:700 12px/1 Arial,sans-serif; cursor:pointer;
    }
    .f175-actions button:hover, .f175-actions button:focus-visible { background:#3a404a; outline:none; }
    .f175-status { margin-top:10px; color:#7dff9a; font-size:11px; line-height:1.45; }
    .f175-hint {
      position:fixed; right:16px; bottom:14px; color:rgba(255,255,255,.72);
      font:12px/1.4 Arial,sans-serif; text-shadow:0 2px 4px #000; pointer-events:none;
    }
    @media (max-height:620px) {
      .f175-panel { top:8px; left:8px; width:290px; padding:10px; }
      .f175-panel p { display:none; }
      .f175-row { margin:6px 0; }
    }
  `
  document.head.appendChild(style)
}

function fitModel(model: THREE.Object3D): void {
  let box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const planarLength = Math.max(size.x, size.z)
  if (planarLength > 0) model.scale.setScalar(5 / planarLength)
  box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  model.position.set(-center.x, -box.min.y + 0.02, -center.z)
  model.updateMatrixWorld(true)
}

export function installFerrariF175WheelTest(): void {
  installStyles()
  document.title = 'Ferrari F1-75 Wheel Test'
  document.body.replaceChildren()

  const root = document.createElement('main')
  root.className = 'f175-test'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', 'Ferrari F1-75 wheel test preview')
  root.appendChild(canvas)

  const panel = document.createElement('section')
  panel.className = 'f175-panel'
  const title = document.createElement('h1')
  title.textContent = 'Ferrari F1-75 轮胎测试'
  const description = document.createElement('p')
  description.textContent = '拖动查看模型，滚轮缩放。绿色线为各轮组的局部 X 滚动轴。'
  panel.append(title, description)

  let speed = 0.38
  let steer = 0
  let spinDirection = 1
  let paused = false

  const slider = (
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    format: (next: number) => string,
    set: (next: number) => void,
  ): void => {
    const row = document.createElement('label')
    row.className = 'f175-row'
    const caption = document.createElement('span')
    caption.textContent = label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)
    const output = document.createElement('output')
    output.textContent = format(value)
    input.addEventListener('input', () => {
      const next = Number(input.value)
      output.textContent = format(next)
      set(next)
    })
    row.append(caption, input, output)
    panel.appendChild(row)
  }

  slider('速度', 0, 1, 0.01, speed, (value) => `${Math.round(value * 100)}%`, (value) => {
    speed = value
  })
  slider('转向', -1, 1, 0.01, steer, (value) => `${Math.round(value * 100)}`, (value) => {
    steer = value
  })

  const actions = document.createElement('div')
  actions.className = 'f175-actions'
  const makeButton = (label: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', action)
    return button
  }
  const pauseButton = makeButton('暂停', () => {
    paused = !paused
    pauseButton.textContent = paused ? '继续' : '暂停'
  })
  actions.append(
    pauseButton,
    makeButton('反转滚动', () => { spinDirection *= -1 }),
    makeButton('前轮近景', () => setFrontView()),
    makeButton('全车视角', () => setOverview()),
  )
  panel.appendChild(actions)
  const status = document.createElement('div')
  status.className = 'f175-status'
  status.textContent = '正在加载 Ferrari F1-75 GLB...'
  panel.appendChild(status)
  root.appendChild(panel)

  const hint = document.createElement('div')
  hint.className = 'f175-hint'
  hint.textContent = '2022 Ferrari F1-75 optimized 2 · named wheel groups'
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#d8d9dc')
  scene.fog = new THREE.Fog('#d8d9dc', 18, 38)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const roomEnvironment = new RoomEnvironment()
  const environmentTarget = pmrem.fromScene(roomEnvironment, 0.04)
  scene.environment = environmentTarget.texture
  scene.environmentIntensity = 1.05
  roomEnvironment.dispose()
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 1.8
  controls.maxDistance = 14
  controls.maxPolarAngle = Math.PI * 0.49

  scene.add(new THREE.HemisphereLight('#ffffff', '#4b4c4f', 0.85))
  const key = new THREE.DirectionalLight('#fff5e8', 3.6)
  key.position.set(-5, 8, -4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#e8f1ff', 0.7)
  fill.position.set(5, 4, 5)
  scene.add(fill)
  const rim = new THREE.DirectionalLight('#ffffff', 1.45)
  rim.position.set(1, 5, -7)
  scene.add(rim)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: '#b9bcc1', roughness: 0.88, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const grid = new THREE.GridHelper(40, 80, '#8d9299', '#a8acb2')
  grid.position.y = 0.003
  scene.add(grid)

  const axleMaterial = new THREE.MeshBasicMaterial({
    color: '#65ff70',
    depthTest: false,
    depthWrite: false,
  })
  const wheels: WheelState[] = []
  const frontHubs: Array<{ node: THREE.Object3D; baseQuaternion: THREE.Quaternion }> = []
  let spin = 0
  let model: THREE.Object3D | null = null

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

  void loadLocalAsset(ferrariF175Url)
    .then((bytes) => new Promise<THREE.Group>((resolve, reject) => {
      loader.parse(bytes, '', (gltf) => resolve(gltf.scene), reject)
    }))
    .then((loaded) => {
      model = loaded
      fitModel(model)
      model.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = false
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) {
          if (
            material instanceof THREE.MeshStandardMaterial
            || material instanceof THREE.MeshPhysicalMaterial
          ) {
            material.envMapIntensity = 1.3
            material.needsUpdate = true
          }
        }
      })
      scene.add(model)
      model.updateMatrixWorld(true)

      for (const name of WHEEL_NAMES) {
        const node = model.getObjectByName(name)
        if (!node) continue
        const line = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 1.05, 12),
          axleMaterial,
        )
        line.renderOrder = 100
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), axleMaterial)
        marker.renderOrder = 101
        scene.add(line, marker)
        wheels.push({ node, baseQuaternion: node.quaternion.clone(), line, marker })
      }
      for (const name of FRONT_HUB_NAMES) {
        const node = model.getObjectByName(name)
        if (node) frontHubs.push({ node, baseQuaternion: node.quaternion.clone() })
      }
      status.textContent = wheels.length === 4
        ? '模型已加载：4/4 个命名轮组，局部 X 轴滚动'
        : `轮组识别不完整：${wheels.length}/4`
      setFrontView()
    })
    .catch((error) => {
      console.error('[Ferrari F1-75 wheel test] load failed:', error)
      status.textContent = `模型加载失败：${error instanceof Error ? error.message : String(error)}`
      status.style.color = '#ff7d86'
    })

  function setFrontView(): void {
    camera.position.set(3.4, 2.2, 4.4)
    controls.target.set(0, 0.58, 1.25)
    controls.update()
  }

  function setOverview(): void {
    camera.position.set(4.8, 3.1, -6.4)
    controls.target.set(0, 0.55, 0)
    controls.update()
  }

  setOverview()
  const steeringAxis = new THREE.Vector3(0, 1, 0)
  const spinQuaternion = new THREE.Quaternion()
  const steerQuaternion = new THREE.Quaternion()
  const worldCenter = new THREE.Vector3()
  const worldAxis = new THREE.Vector3()
  const cylinderUp = new THREE.Vector3(0, 1, 0)
  let previous = performance.now()
  let frame = 0
  const render = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000))
    previous = now
    if (!paused) spin += dt * speed * spinDirection * 18
    steerQuaternion.setFromAxisAngle(steeringAxis, steer * THREE.MathUtils.degToRad(18))
    for (const hub of frontHubs) {
      hub.node.quaternion.copy(hub.baseQuaternion).premultiply(steerQuaternion)
    }
    spinQuaternion.setFromAxisAngle(LOCAL_AXLE, spin)
    for (const wheel of wheels) {
      wheel.node.quaternion.copy(wheel.baseQuaternion).multiply(spinQuaternion)
    }
    model?.updateMatrixWorld(true)
    for (const wheel of wheels) {
      wheel.node.getWorldPosition(worldCenter)
      worldAxis.copy(LOCAL_AXLE).transformDirection(wheel.node.matrixWorld)
      wheel.line.position.copy(worldCenter)
      wheel.line.quaternion.setFromUnitVectors(cylinderUp, worldAxis)
      wheel.marker.position.copy(worldCenter)
    }
    controls.update()
    renderer.render(scene, camera)
    frame = requestAnimationFrame(render)
  }

  const resize = (): void => {
    const width = Math.max(1, root.clientWidth)
    const height = Math.max(1, root.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()
  frame = requestAnimationFrame(render)

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    controls.dispose()
    dracoLoader.dispose()
    environmentTarget.dispose()
    renderer.dispose()
    axleMaterial.dispose()
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
  }, { once: true })
}
