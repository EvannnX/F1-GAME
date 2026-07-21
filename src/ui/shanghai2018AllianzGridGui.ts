import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Shanghai2018GridSlot } from '../render/lowPolyShanghai'
import { showToast } from '../utils/error'

export interface Shanghai2018AllianzGridGuiOptions {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  slots: Shanghai2018GridSlot[]
  onConfirm: (slot: Shanghai2018GridSlot, index: number) => void
}

function makeNumberLabel(number: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')!
  context.fillStyle = 'rgba(8,12,20,.9)'
  context.beginPath()
  context.arc(64, 64, 52, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#ffd43b'
  context.lineWidth = 8
  context.stroke()
  context.fillStyle = '#fff'
  context.font = '800 46px system-ui,sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(String(number), 64, 66)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
  }))
  sprite.scale.set(8, 8, 1)
  sprite.renderOrder = 510
  return sprite
}

export function installShanghai2018AllianzGridGui(
  options: Shanghai2018AllianzGridGuiOptions,
): () => void {
  let selectedIndex = -1
  let pointerStartX = 0
  let pointerStartY = 0
  const root = new THREE.Group()
  root.name = 'shanghai-2018-allianz-grid-selector'
  options.scene.add(root)

  const controls = new OrbitControls(options.camera, options.renderer.domElement)
  controls.enableDamping = false
  controls.enablePan = true
  controls.enableRotate = true
  controls.enableZoom = true
  controls.screenSpacePanning = true
  controls.minDistance = 8
  controls.maxDistance = 4000
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  }

  const markerGeometry = new THREE.CylinderGeometry(3.4, 3.4, 0.35, 28)
  const hitGeometry = new THREE.SphereGeometry(6, 12, 8)
  const markerMaterials: THREE.MeshBasicMaterial[] = []
  const hitTargets: THREE.Mesh[] = []

  for (let index = 0; index < options.slots.length; index++) {
    const slot = options.slots[index]
    const group = new THREE.Group()
    group.position.copy(slot.position)
    group.position.y += 3.2

    const markerMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd43b',
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
    })
    markerMaterials.push(markerMaterial)
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.renderOrder = 505
    group.add(marker)

    const hit = new THREE.Mesh(hitGeometry, new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }))
    hit.userData.allianzSlotIndex = index
    hitTargets.push(hit)
    group.add(hit)

    const label = makeNumberLabel(index + 1)
    label.position.y = 7
    group.add(label)
    root.add(group)
  }

  const host = document.createElement('div')
  host.style.cssText = `
    position:fixed;right:16px;top:16px;z-index:280;
    width:min(360px,calc(100vw - 32px));padding:14px;
    border:1px solid rgba(255,255,255,.2);border-radius:8px;
    background:rgba(8,12,20,.94);color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    box-shadow:0 16px 40px rgba(0,0,0,.42);
  `
  host.addEventListener('pointerdown', (event) => event.stopPropagation())

  const title = document.createElement('div')
  title.textContent = '选择 Allianz 发车格'
  title.style.cssText = 'font-size:17px;font-weight:800;margin-bottom:6px;'
  const hint = document.createElement('div')
  hint.textContent = '黄色编号代表模型中的 Allianz 盒子。拖动平移、滚轮缩放、右键旋转，点击正确的玩家发车格。'
  hint.style.cssText = 'font-size:12px;line-height:1.55;color:#bbc3d0;margin-bottom:12px;'
  const selection = document.createElement('div')
  selection.textContent = '尚未选择'
  selection.style.cssText = 'min-height:36px;padding:8px 10px;border:1px solid #354052;border-radius:6px;background:#111827;font-size:13px;'
  const actions = document.createElement('div')
  actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;'

  const focusButton = document.createElement('button')
  focusButton.textContent = '近看选中'
  const confirmButton = document.createElement('button')
  confirmButton.textContent = '确认这个格子'
  confirmButton.disabled = true
  for (const button of [focusButton, confirmButton]) {
    button.style.cssText = 'height:40px;border:1px solid #536174;border-radius:6px;background:#172033;color:#fff;font-weight:800;cursor:pointer;'
  }
  confirmButton.style.background = '#b5121b'
  actions.append(focusButton, confirmButton)
  host.append(title, hint, selection, actions)
  document.body.appendChild(host)

  const focusSlot = (index: number, close: boolean): void => {
    const slot = options.slots[index]
    if (!slot) return
    const heading = slot.heading
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
    options.camera.near = 0.1
    options.camera.far = 30000
    options.camera.fov = 48
    options.camera.up.set(0, 1, 0)
    options.camera.position
      .copy(slot.position)
      .addScaledVector(forward, close ? -28 : -70)
      .add(new THREE.Vector3(18, close ? 20 : 55, 0))
    controls.target.copy(slot.position)
    controls.target.y += 1
    options.camera.lookAt(controls.target)
    options.camera.updateProjectionMatrix()
    controls.update()
  }

  const selectSlot = (index: number): void => {
    if (!options.slots[index]) return
    selectedIndex = index
    markerMaterials.forEach((material, markerIndex) => {
      material.color.set(markerIndex === index ? '#ff2d2d' : '#ffd43b')
      material.opacity = markerIndex === index ? 1 : 0.72
    })
    const slot = options.slots[index]
    selection.textContent = `已选择 #${index + 1}  X ${slot.position.x.toFixed(2)}  Z ${slot.position.z.toFixed(2)}`
    confirmButton.disabled = false
    focusSlot(index, true)
  }

  const allBounds = new THREE.Box3()
  for (const slot of options.slots) allBounds.expandByPoint(slot.position)
  const center = allBounds.getCenter(new THREE.Vector3())
  const size = allBounds.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.z, 100)
  options.camera.near = 0.1
  options.camera.far = 30000
  options.camera.fov = 48
  options.camera.up.set(0, 0, -1)
  options.camera.position.set(center.x, center.y + span * 1.15, center.z + 0.01)
  options.camera.lookAt(center)
  options.camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const onPointerDown = (event: PointerEvent): void => {
    pointerStartX = event.clientX
    pointerStartY = event.clientY
  }
  const onPointerUp = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY) > 7) return
    const rect = options.renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, options.camera)
    const hit = raycaster.intersectObjects(hitTargets, false)[0]
    const index = hit?.object.userData.allianzSlotIndex
    if (typeof index === 'number') selectSlot(index)
  }
  options.renderer.domElement.addEventListener('pointerdown', onPointerDown)
  options.renderer.domElement.addEventListener('pointerup', onPointerUp)
  focusButton.addEventListener('click', () => {
    if (selectedIndex < 0) showToast('先点击一个黄色 Allianz 标记', 1200)
    else focusSlot(selectedIndex, true)
  })
  confirmButton.addEventListener('click', () => {
    const slot = options.slots[selectedIndex]
    if (slot) options.onConfirm(slot, selectedIndex)
  })

  return () => {
    controls.dispose()
    options.renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    options.renderer.domElement.removeEventListener('pointerup', onPointerUp)
    host.remove()
    root.removeFromParent()
    markerGeometry.dispose()
    hitGeometry.dispose()
    root.traverse((object) => {
      if (object instanceof THREE.Sprite) {
        object.material.map?.dispose()
        object.material.dispose()
      } else if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
  }
}
