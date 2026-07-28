import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import dracoDecoderJs from 'three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw'
import creatorCarUrl from '../assets/已压缩车模型/创变者赛车尾翼贴花-正式导入包/创变者配色车-optimized.glb?url'
import { loadLocalAsset } from '../utils/localAsset'
import { addCreatorRearWingDecal } from '../render/creatorCarDecal'

const WHEEL_NODES = [
  { name: 'right-front', node: 'tripo_part_2' },
  { name: 'left-front', node: 'tripo_part_22' },
  { name: 'right-rear', node: 'tripo_part_23' },
  { name: 'left-rear', node: 'tripo_part_4' },
] as const
const WHEEL_AXIS = new THREE.Vector3(1, 0, 0)

interface WheelPreviewRig {
  name: string
  pivot: THREE.Group
  baseQuaternion: THREE.Quaternion
  line: THREE.Mesh
  marker: THREE.Mesh
}

function installStyles(): void {
  const style = document.createElement('style')
  style.textContent = `
    html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#d8d9dc; }
    .creator-preview { position:fixed; inset:0; color:#fff; font-family:Arial,sans-serif; }
    .creator-preview canvas { display:block; width:100%; height:100%; touch-action:none; }
    .creator-preview__panel {
      position:fixed; z-index:3; top:18px; left:18px; width:min(340px,calc(100vw - 36px));
      padding:15px; box-sizing:border-box; border:1px solid rgba(255,255,255,.18);
      border-radius:8px; background:rgba(13,15,19,.9); backdrop-filter:blur(12px);
      box-shadow:0 12px 34px rgba(0,0,0,.22);
    }
    .creator-preview__panel h1 { margin:0 0 6px; font-size:20px; }
    .creator-preview__panel p {
      margin:0; color:#b8bec8; font-size:12px; line-height:1.5;
    }
    .creator-preview__status { margin-top:11px; color:#74ff98; font-size:11px; line-height:1.45; }
    .creator-preview__control {
      display:grid; grid-template-columns:48px minmax(0,1fr) 44px;
      align-items:center; gap:8px; margin-top:12px; color:#e6e9ee; font-size:12px;
    }
    .creator-preview__control input { width:100%; accent-color:#d6152a; }
    .creator-preview__control output {
      color:#74ff98; text-align:right; font-variant-numeric:tabular-nums;
    }
    .creator-preview__actions {
      display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-top:13px;
    }
    .creator-preview__actions button {
      min-height:39px; border:1px solid rgba(255,255,255,.18); border-radius:6px;
      background:#292d34; color:#fff; font:700 12px/1 Arial,sans-serif; cursor:pointer;
    }
    .creator-preview__actions button:hover,
    .creator-preview__actions button:focus-visible { background:#3a404a; outline:none; }
    .creator-preview__actions button[data-active="true"] { background:#bd1022; }
    .creator-preview__hint {
      position:fixed; right:16px; bottom:14px; color:rgba(25,27,31,.72);
      font:12px/1.4 Arial,sans-serif; pointer-events:none;
    }
    @media (max-height:560px) {
      .creator-preview__panel { top:8px; left:8px; padding:11px; }
      .creator-preview__panel p { display:none; }
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

export function installCreatorCarPreview(): void {
  installStyles()
  document.title = 'Creator Racing Car Preview'
  document.body.replaceChildren()

  const root = document.createElement('main')
  root.className = 'creator-preview'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', '创变者赛车三维预览')
  root.appendChild(canvas)

  const panel = document.createElement('section')
  panel.className = 'creator-preview__panel'
  const title = document.createElement('h1')
  title.textContent = '创变者赛车预览'
  const description = document.createElement('p')
  description.textContent = '拖动旋转赛车，滚轮或双指缩放。预览包含正式导入包中的白色尾翼贴花。'
  const status = document.createElement('div')
  status.className = 'creator-preview__status'
  status.textContent = '正在加载模型、轮组与尾翼贴花...'
  const speedControl = document.createElement('label')
  speedControl.className = 'creator-preview__control'
  const speedLabel = document.createElement('span')
  speedLabel.textContent = '轮速'
  const speedInput = document.createElement('input')
  speedInput.type = 'range'
  speedInput.min = '0'
  speedInput.max = '1'
  speedInput.step = '0.01'
  speedInput.value = '0.38'
  const speedOutput = document.createElement('output')
  speedOutput.textContent = '38%'
  speedControl.append(speedLabel, speedInput, speedOutput)
  const actions = document.createElement('div')
  actions.className = 'creator-preview__actions'
  panel.append(title, description, status, speedControl, actions)
  root.appendChild(panel)

  const hint = document.createElement('div')
  hint.className = 'creator-preview__hint'
  hint.textContent = 'Creator livery optimized GLB · original embedded textures'
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

  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.enablePan = false
  controls.minDistance = 2.1
  controls.maxDistance = 14
  controls.maxPolarAngle = Math.PI * 0.49
  controls.autoRotate = false
  controls.autoRotateSpeed = 1.25

  scene.add(new THREE.HemisphereLight('#ffffff', '#4a4b4e', 0.82))
  const key = new THREE.DirectionalLight('#fff5e8', 3.6)
  key.position.set(-5, 8, -4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#e8f1ff', 0.68)
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

  const axleMaterial = new THREE.MeshBasicMaterial({
    color: '#65ff70',
    depthTest: false,
    depthWrite: false,
  })
  const wheels: WheelPreviewRig[] = []
  let wheelSpeed = 0.38
  let spinDirection = 1
  let wheelPaused = false
  let wheelSpin = 0
  speedInput.addEventListener('input', () => {
    wheelSpeed = Number(speedInput.value)
    speedOutput.textContent = `${Math.round(wheelSpeed * 100)}%`
  })

  const setOverview = (): void => {
    camera.position.set(4.8, 3, 6.2)
    controls.target.set(0, 0.58, 0)
    controls.update()
  }
  const setRearView = (): void => {
    camera.position.set(-3.4, 2, -4.6)
    controls.target.set(0, 0.72, -1.5)
    controls.update()
  }
  const makeButton = (label: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', action)
    actions.appendChild(button)
    return button
  }
  const rotateButton = makeButton('自动旋转：关', () => {
    controls.autoRotate = !controls.autoRotate
    rotateButton.textContent = controls.autoRotate ? '自动旋转：开' : '自动旋转：关'
    rotateButton.dataset.active = String(controls.autoRotate)
  })
  const pauseButton = makeButton('轮胎暂停', () => {
    wheelPaused = !wheelPaused
    pauseButton.textContent = wheelPaused ? '轮胎继续' : '轮胎暂停'
    pauseButton.dataset.active = String(wheelPaused)
  })
  makeButton('轮胎反转', () => { spinDirection *= -1 })
  makeButton('全车视角', setOverview)
  makeButton('尾翼近景', setRearView)
  setOverview()

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

  let model: THREE.Group | null = null
  void loadLocalAsset(creatorCarUrl)
    .then((bytes) => new Promise<THREE.Group>((resolve, reject) => {
      loader.parse(bytes, '', (gltf) => resolve(gltf.scene), reject)
    }))
    .then(async (loaded) => {
      model = loaded
      fitModel(model)
      model.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
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
      model.updateMatrixWorld(true)
      for (const definition of WHEEL_NODES) {
        const wheel = model.getObjectByName(definition.node)
        if (!wheel) continue
        const box = new THREE.Box3().setFromObject(wheel)
        if (box.isEmpty()) continue
        const centerWorld = box.getCenter(new THREE.Vector3())
        const pivot = new THREE.Group()
        pivot.name = `creator-wheel-${definition.name}-pivot`
        pivot.position.copy(model.worldToLocal(centerWorld.clone()))
        model.add(pivot)
        model.updateMatrixWorld(true)
        pivot.attach(wheel)

        const line = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.9, 12),
          axleMaterial,
        )
        line.renderOrder = 100
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), axleMaterial)
        marker.renderOrder = 101
        scene.add(line, marker)
        wheels.push({
          name: definition.name,
          pivot,
          baseQuaternion: pivot.quaternion.clone(),
          line,
          marker,
        })
      }
      await addCreatorRearWingDecal(model, renderer)
      scene.add(model)
      status.textContent = wheels.length === 4
        ? '加载完成：4/4 轮组单轴旋转，原始贴图与尾翼贴花已启用'
        : `轮组识别不完整：${wheels.length}/4`
    })
    .catch((error) => {
      console.error('[Creator car preview] load failed:', error)
      status.textContent = `加载失败：${error instanceof Error ? error.message : String(error)}`
      status.style.color = '#ff7d86'
    })

  let frame = 0
  let previous = performance.now()
  const spinQuaternion = new THREE.Quaternion()
  const worldCenter = new THREE.Vector3()
  const worldAxis = new THREE.Vector3()
  const cylinderUp = new THREE.Vector3(0, 1, 0)
  const render = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000))
    previous = now
    if (!wheelPaused) wheelSpin += dt * wheelSpeed * spinDirection * 18
    spinQuaternion.setFromAxisAngle(WHEEL_AXIS, wheelSpin)
    for (const wheel of wheels) {
      wheel.pivot.quaternion.copy(wheel.baseQuaternion).multiply(spinQuaternion)
    }
    model?.updateMatrixWorld(true)
    for (const wheel of wheels) {
      wheel.pivot.getWorldPosition(worldCenter)
      worldAxis.copy(WHEEL_AXIS).transformDirection(wheel.pivot.matrixWorld)
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
    for (const wheel of wheels) {
      wheel.line.geometry.dispose()
      wheel.marker.geometry.dispose()
      wheel.line.removeFromParent()
      wheel.marker.removeFromParent()
    }
    axleMaterial.dispose()
    model?.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const map = (material as THREE.MeshStandardMaterial).map
        map?.dispose()
        material.dispose()
      }
    })
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
    renderer.dispose()
  }, { once: true })
}
