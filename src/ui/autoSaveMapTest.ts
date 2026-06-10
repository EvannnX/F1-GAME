import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createScene } from '../render/scene'
import { addAutoSaveShanghaiMap } from '../render/autoSaveMap'

export function isAutoSaveMapTestEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('autoSaveMap') === '1' || params.get('testMap') === 'autosave'
}

export function installAutoSaveMapTest(container: HTMLElement): void {
  container.innerHTML = ''
  container.style.position = 'relative'

  const status = document.createElement('div')
  status.textContent = 'AutoSave Shanghai map loading...'
  status.style.cssText = [
    'position:absolute',
    'left:16px',
    'top:16px',
    'z-index:5',
    'padding:8px 10px',
    'border-radius:6px',
    'background:rgba(7,12,20,0.78)',
    'color:#eaf6ff',
    'font:12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'pointer-events:none',
  ].join(';')
  container.appendChild(status)

  const bundle = createScene(container, { performanceMode: false })
  bundle.scene.name = 'autosave-shanghai-map-test-scene'
  bundle.scene.fog = new THREE.Fog('#cfe6f5', 1500, 7000)
  bundle.camera.fov = 48
  bundle.camera.updateProjectionMatrix()

  const controls = new OrbitControls(bundle.camera, bundle.renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = false
  controls.maxPolarAngle = Math.PI * 0.49

  const grid = new THREE.GridHelper(2200, 44, '#7c8791', '#d8dee4')
  grid.position.y = -0.02
  grid.material.transparent = true
  grid.material.opacity = 0.22
  bundle.scene.add(grid)

  const autoSaveMap = addAutoSaveShanghaiMap(bundle.scene)
  autoSaveMap.ready.then(
    ({ size, center }) => {
      const maxDim = Math.max(size.x, size.y, size.z)
      const cameraDistance = Math.max(300, maxDim * 0.72)

      bundle.camera.near = Math.max(0.1, maxDim / 8000)
      bundle.camera.far = Math.max(5000, maxDim * 5)
      bundle.camera.position.set(
        center.x + cameraDistance * 0.6,
        center.y + cameraDistance * 0.42,
        center.z + cameraDistance * 0.72,
      )
      bundle.camera.lookAt(center)
      bundle.camera.updateProjectionMatrix()

      controls.target.copy(center)
      controls.maxDistance = Math.max(1200, maxDim * 2.5)
      controls.update()

      bundle.sun.position.set(center.x + 500, center.y + 900, center.z + 450)
      bundle.sun.target.position.copy(center)
      bundle.sun.target.updateMatrixWorld()

      status.textContent = `AutoSave map loaded · ${Math.round(size.x)} x ${Math.round(size.z)}`
      window.setTimeout(() => status.remove(), 1800)
    },
    (err) => {
      console.warn('[autosave-map-test] GLB failed to load:', err)
      status.textContent = 'AutoSave Shanghai map failed to load'
      status.style.background = 'rgba(120,12,12,0.82)'
    },
  )

  const animate = (): void => {
    controls.update()
    bundle.render()
    window.requestAnimationFrame(animate)
  }
  animate()
}
