import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PlayerCarId } from '../data/playerCars'
import { createCar } from '../render/car'

const STYLE_ID = 'f1ti-mercedes-wheel-test-style'

function installStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #111419;
      color: #f5f7fa;
      font-family: Arial, sans-serif;
    }
    .amg-wheel-test {
      position: fixed;
      inset: 0;
      background: #111419;
    }
    .amg-wheel-test canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
    .amg-wheel-toolbar {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 2;
      width: min(310px, calc(100vw - 32px));
      padding: 14px;
      box-sizing: border-box;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 8px;
      background: rgba(12,15,19,.88);
      backdrop-filter: blur(12px);
    }
    .amg-wheel-toolbar h1 {
      margin: 0 0 4px;
      font-size: 18px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .amg-wheel-toolbar p {
      margin: 0 0 14px;
      color: #98a1ad;
      font-size: 12px;
      line-height: 1.4;
    }
    .amg-wheel-control {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) 48px;
      align-items: center;
      gap: 8px;
      margin: 10px 0;
      font-size: 13px;
    }
    .amg-wheel-control output {
      color: #57e2d1;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .amg-wheel-control input {
      width: 100%;
      accent-color: #00a99d;
    }
    .amg-wheel-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
      margin-top: 13px;
    }
    .amg-wheel-actions button {
      min-height: 36px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 6px;
      background: #242a31;
      color: #fff;
      font: inherit;
      cursor: pointer;
    }
    .amg-wheel-actions button:hover {
      background: #303841;
    }
    .amg-wheel-actions button[data-active="true"] {
      border-color: #00a99d;
      background: #006c65;
    }
    .amg-wheel-hint {
      position: fixed;
      right: 16px;
      bottom: 14px;
      z-index: 2;
      color: rgba(255,255,255,.7);
      font-size: 12px;
      text-shadow: 0 1px 3px #000;
      pointer-events: none;
    }
    @media (max-width: 640px) {
      .amg-wheel-toolbar {
        top: 8px;
        left: 8px;
        width: calc(100vw - 16px);
        padding: 10px;
      }
      .amg-wheel-toolbar p {
        display: none;
      }
      .amg-wheel-control {
        margin: 7px 0;
      }
    }
  `
  document.head.append(style)
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

export function installMercedesWheelTest(carId: PlayerCarId = 'mercedes'): void {
  const redBullTest = carId === 'redbull'
  installStyles()
  document.title = redBullTest ? 'Red Bull Wheel Test' : 'AMG Wheel Test'
  document.body.replaceChildren()

  const root = document.createElement('main')
  root.className = 'amg-wheel-test'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', `${redBullTest ? 'Red Bull' : 'Mercedes AMG'} wheel test viewport`)
  root.append(canvas)

  const toolbar = document.createElement('section')
  toolbar.className = 'amg-wheel-toolbar'
  const title = document.createElement('h1')
  title.textContent = redBullTest ? 'Red Bull 左后轮测试' : 'AMG 轮胎测试'
  const description = document.createElement('p')
  description.textContent = '拖动旋转视角，滚轮缩放。速度控制滚动，转向只影响前轮。'
  toolbar.append(title, description)

  let speed = 0.38
  let steer = 0
  let paused = false
  let axleOffsetY = 0
  let axleOffsetZ = 0

  const addSlider = (
    label: string,
    min: string,
    max: string,
    step: string,
    value: string,
    format: (value: number) => string,
    onInput: (value: number) => void,
  ): void => {
    const row = document.createElement('label')
    row.className = 'amg-wheel-control'
    const name = document.createElement('span')
    name.textContent = label
    const input = document.createElement('input')
    input.type = 'range'
    input.min = min
    input.max = max
    input.step = step
    input.value = value
    const output = document.createElement('output')
    output.textContent = format(Number(value))
    input.addEventListener('input', () => {
      const next = Number(input.value)
      output.textContent = format(next)
      onInput(next)
    })
    row.append(name, input, output)
    toolbar.append(row)
  }

  addSlider('速度', '0', '1', '0.01', String(speed), (value) => `${Math.round(value * 100)}%`, (value) => {
    speed = value
  })
  addSlider('转向', '-1', '1', '0.01', '0', (value) => `${Math.round(value * 100)}`, (value) => {
    steer = value
  })
  if (!redBullTest) {
    addSlider('轴心 Y', '-0.3', '0.3', '0.002', '0', (value) => value.toFixed(3), (value) => {
      axleOffsetY = value
      car.setFrontAxleDebugOffset(axleOffsetY, axleOffsetZ)
    })
    addSlider('轴心 Z', '-0.3', '0.3', '0.002', '0', (value) => value.toFixed(3), (value) => {
      axleOffsetZ = value
      car.setFrontAxleDebugOffset(axleOffsetY, axleOffsetZ)
    })
  }

  const actions = document.createElement('div')
  actions.className = 'amg-wheel-actions'
  const pauseButton = makeButton('暂停', () => {
    paused = !paused
    pauseButton.textContent = paused ? '继续' : '暂停'
    pauseButton.dataset.active = String(paused)
  })
  actions.append(
    pauseButton,
    makeButton(redBullTest ? '左后轮近景' : '前轮近景', () => setWheelView()),
    makeButton('全车视角', () => setOverview()),
    makeButton('轴心归零', () => {
      axleOffsetY = 0
      axleOffsetZ = 0
      car.setFrontAxleDebugOffset(0, 0)
      window.location.reload()
    }),
  )
  toolbar.append(actions)
  root.append(toolbar)

  const hint = document.createElement('div')
  hint.className = 'amg-wheel-hint'
  hint.textContent = redBullTest
    ? 'Red Bull RB19 · geometry-fitted rear camber axes'
    : 'AMG W15 compressed model · game wheel logic'
  root.append(hint)
  document.body.append(root)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#cbd2da')
  scene.fog = new THREE.Fog('#cbd2da', 18, 38)

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 80)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 2
  controls.maxDistance = 14
  controls.maxPolarAngle = Math.PI * 0.49

  const hemi = new THREE.HemisphereLight('#eef6ff', '#2d3034', 2.2)
  scene.add(hemi)
  const key = new THREE.DirectionalLight('#ffffff', 4)
  key.position.set(-5, 8, -4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#8fd9ff', 1.4)
  fill.position.set(5, 3, 5)
  scene.add(fill)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: '#30343a', roughness: 0.9, metalness: 0.05 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const grid = new THREE.GridHelper(40, 80, '#76808b', '#444a52')
  grid.position.y = 0.003
  scene.add(grid)

  const car = createCar({ carId })
  car.group.position.y = 0.02
  scene.add(car.group, car.particles)

  const axleMaterial = new THREE.MeshBasicMaterial({
    color: '#36ff67',
    depthTest: false,
    depthWrite: false,
  })
  const guideCount = redBullTest ? 4 : 2
  const axleLines = Array.from(
    { length: guideCount },
    () => new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 12), axleMaterial),
  )
  for (const line of axleLines) {
    line.renderOrder = 100
    line.visible = false
    scene.add(line)
  }
  const axleMarkers = Array.from(
    { length: guideCount },
    () => new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), axleMaterial),
  )
  for (const marker of axleMarkers) {
    marker.renderOrder = 101
    marker.visible = false
    scene.add(marker)
  }
  const cylinderUp = new THREE.Vector3(0, 1, 0)

  const updateAxleGuide = (): void => {
    const axle = redBullTest ? car.getWheelAxleDebug() : car.getFrontAxleDebug()
    if (axle.length < guideCount) {
      axleLines.forEach((line) => { line.visible = false })
      axleMarkers.forEach((marker) => { marker.visible = false })
      return
    }
    const slots = redBullTest
      ? ['left-front', 'right-front', 'left-rear', 'right-rear']
      : ['left-front', 'right-front']
    const ordered = slots.map(
      (slot, index) => axle.find((item) => item.name === slot) ?? axle[index],
    )
    ordered.forEach((item, index) => {
      axleLines[index].position.copy(item.center)
      axleLines[index].quaternion.setFromUnitVectors(cylinderUp, item.axis)
      axleLines[index].scale.set(1, 0.9, 1)
      axleLines[index].visible = true
      axleMarkers[index].position.copy(item.center)
      axleMarkers[index].visible = true
    })
  }

  function setWheelView(): void {
    if (redBullTest) {
      camera.position.set(-3.8, 2.15, -4.5)
      controls.target.set(-0.72, 0.55, -1.55)
    } else {
      camera.position.set(3.5, 2.35, 4.2)
      controls.target.set(0, 0.62, 1.35)
    }
    controls.update()
  }

  function setOverview(): void {
    camera.position.set(4.6, 3.2, -6.2)
    controls.target.set(0, 0.55, 0)
    controls.update()
  }

  setWheelView()

  const resize = (): void => {
    const width = Math.max(1, root.clientWidth)
    const height = Math.max(1, root.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()

  let frame = 0
  let previous = performance.now()
  const render = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - previous) / 1000))
    previous = now
    if (!paused) car.update(dt, speed, steer)
    updateAxleGuide()
    controls.update()
    renderer.render(scene, camera)
    frame = requestAnimationFrame(render)
  }
  frame = requestAnimationFrame(render)

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    controls.dispose()
    car.dispose()
    renderer.dispose()
    axleLines.forEach((line) => line.geometry.dispose())
    axleMarkers.forEach((marker) => marker.geometry.dispose())
    axleMaterial.dispose()
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
  }, { once: true })
}
