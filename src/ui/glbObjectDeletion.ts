import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  eraseLowPolyShanghaiTriangles,
  type LowPolyShanghaiTriangleErase,
} from '../render/lowPolyShanghai'
import { showToast } from '../utils/error'

const GUI_PARAMS = ['deleteObjectsGui', 'signDeleteGui', 'deleteSignGui']

export function isGlbObjectDeletionGuiEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return GUI_PARAMS.some((param) => params.has(param))
}

interface Options {
  root: THREE.Object3D
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  storageKey: string
  onClose: () => void
}

function readDeletions(storageKey: string): LowPolyShanghaiTriangleErase[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(parsed) ? parsed as LowPolyShanghaiTriangleErase[] : []
  } catch {
    return []
  }
}

function writeDeletions(storageKey: string, deletions: LowPolyShanghaiTriangleErase[]): void {
  localStorage.setItem(storageKey, JSON.stringify(deletions))
}

function button(label: string, primary = false): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  el.style.cssText = `
    border:1px solid ${primary ? '#ff3b30' : '#475569'};background:${primary ? '#d91f18' : '#111827'};
    color:#fff;border-radius:6px;padding:9px 11px;font-weight:700;cursor:pointer;
  `
  return el
}

export function installGlbObjectDeletionGui(options: Options): () => void {
  const controls = new OrbitControls(options.camera, options.renderer.domElement)
  controls.enableDamping = false
  controls.screenSpacePanning = true
  controls.target.copy(options.camera.position).add(
    options.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(20),
  )
  controls.update()

  const marker = new THREE.Group()
  marker.name = 'object-deletion-selection-marker'
  marker.visible = false
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.07, 10, 40),
    new THREE.MeshBasicMaterial({ color: '#ff2b20', depthTest: false }),
  )
  ring.renderOrder = 1000
  marker.add(ring)
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }),
  )
  dot.renderOrder = 1001
  marker.add(dot)
  options.root.parent?.add(marker)

  const host = document.createElement('div')
  host.style.cssText = `
    position:fixed;right:16px;top:16px;z-index:280;width:min(360px,calc(100vw - 32px));
    padding:14px;background:rgba(7,10,16,.94);color:#fff;border:1px solid rgba(255,255,255,.18);
    border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    box-shadow:0 16px 40px rgba(0,0,0,.42);
  `
  host.addEventListener('pointerdown', (event) => event.stopPropagation())

  const title = document.createElement('div')
  title.textContent = '场景物体删除'
  title.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:6px;'
  const hint = document.createElement('div')
  hint.textContent = '拖动旋转视角，右键拖动平移，滚轮缩放。按住 Shift 单击要删除的路牌；红圈位置确认无误后再删除。'
  hint.style.cssText = 'font-size:12px;color:#b8c0cc;line-height:1.55;margin-bottom:10px;'
  const selectedText = document.createElement('div')
  selectedText.textContent = '尚未选择物体'
  selectedText.style.cssText = 'min-height:52px;padding:9px;background:rgba(255,255,255,.07);font:12px/1.5 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;margin-bottom:10px;'
  const viewActions = document.createElement('div')
  viewActions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;'
  const overviewButton = button('俯视整个地图')
  const focusButton = button('靠近选中位置')
  viewActions.append(overviewButton, focusButton)
  const actions = document.createElement('div')
  actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;'
  const removeButton = button('删除选中物体', true)
  const undoButton = button('撤销上次删除')
  const restoreButton = button('恢复全部物体')
  const closeButton = button('完成并返回游戏')
  actions.append(removeButton, undoButton, restoreButton, closeButton)
  host.append(title, hint, selectedText, viewActions, actions)
  document.body.appendChild(host)

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let selected: LowPolyShanghaiTriangleErase | null = null

  const onPointerDown = (event: PointerEvent): void => {
    if (!event.shiftKey || event.button !== 0) return
    const rect = options.renderer.domElement.getBoundingClientRect()
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.setFromCamera(pointer, options.camera)
    const hit = raycaster.intersectObject(options.root, true)
      .find((item) => item.object instanceof THREE.Mesh && item.object.visible)
    if (!hit) {
      showToast('没有选中地图物体，请靠近后重试', 1400)
      return
    }
    const mesh = hit.object as THREE.Mesh
    selected = {
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      radius: 1.5,
      meshName: mesh.name || null,
      verticalOnly: false,
      connectedOnly: true,
    }
    marker.position.copy(hit.point)
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.face?.normal.clone().transformDirection(mesh.matrixWorld) ?? new THREE.Vector3(0, 0, 1))
    marker.visible = true
    selectedText.textContent = [
      `物体: ${mesh.name || '(未命名模型分块)'}`,
      `位置: ${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}, ${hit.point.z.toFixed(2)}`,
    ].join('\n')
    event.preventDefault()
    event.stopPropagation()
  }

  options.renderer.domElement.addEventListener('pointerdown', onPointerDown, true)

  overviewButton.addEventListener('click', () => {
    const box = new THREE.Box3().setFromObject(options.root)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.z, 100)
    options.camera.position.set(center.x, box.max.y + span * 0.72, center.z + 0.01)
    options.camera.up.set(0, 0, -1)
    options.camera.far = Math.max(options.camera.far, span * 4)
    options.camera.updateProjectionMatrix()
    controls.target.copy(center)
    controls.update()
  })
  focusButton.addEventListener('click', () => {
    if (!selected) {
      showToast('请先按住 Shift 单击一个物体', 1400)
      return
    }
    const target = new THREE.Vector3(selected.point.x, selected.point.y, selected.point.z)
    const direction = options.camera.position.clone().sub(controls.target).normalize()
    options.camera.position.copy(target).addScaledVector(direction, 16)
    options.camera.up.set(0, 1, 0)
    controls.target.copy(target)
    controls.update()
  })

  removeButton.addEventListener('click', () => {
    if (!selected) {
      showToast('请先按住 Shift 单击路牌', 1400)
      return
    }
    const removed = eraseLowPolyShanghaiTriangles(options.root, selected)
    if (removed <= 0) {
      showToast('没有找到独立几何分块，请重新点选路牌表面', 1800)
      return
    }
    const deletions = readDeletions(options.storageKey)
    deletions.push(selected)
    writeDeletions(options.storageKey, deletions)
    marker.visible = false
    selected = null
    selectedText.textContent = `已删除 ${removed} 个三角面并保存`
    showToast('选中的物体已删除', 1400)
  })

  const reloadWith = (deletions: LowPolyShanghaiTriangleErase[]): void => {
    writeDeletions(options.storageKey, deletions)
    window.location.reload()
  }
  undoButton.addEventListener('click', () => {
    const deletions = readDeletions(options.storageKey)
    if (deletions.length === 0) {
      showToast('没有可撤销的删除记录', 1200)
      return
    }
    deletions.pop()
    reloadWith(deletions)
  })
  restoreButton.addEventListener('click', () => reloadWith([]))

  const dispose = (): void => {
    options.renderer.domElement.removeEventListener('pointerdown', onPointerDown, true)
    controls.dispose()
    marker.removeFromParent()
    ring.geometry.dispose()
    ;(ring.material as THREE.Material).dispose()
    dot.geometry.dispose()
    ;(dot.material as THREE.Material).dispose()
    host.remove()
  }
  closeButton.addEventListener('click', () => {
    dispose()
    options.onClose()
  })
  return dispose
}
