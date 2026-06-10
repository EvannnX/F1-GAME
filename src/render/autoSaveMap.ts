import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import autoSaveShanghaiMapUrl from '../assets/AutoSave_Shangai_International_Circuit_GP_Track_no_google_earth.glb?url'

export interface AutoSaveMapLoadResult {
  model: THREE.Group
  box: THREE.Box3
  size: THREE.Vector3
  center: THREE.Vector3
}

export interface AutoSaveMapPlacement {
  x: number
  z: number
  y: number
  yawDeg: number
  scale: number
}

export interface AutoSaveMapBundle {
  group: THREE.Group
  getPlacement: () => AutoSaveMapPlacement
  setPlacement: (next: Partial<AutoSaveMapPlacement>) => void
  ready: Promise<AutoSaveMapLoadResult>
}

export const AUTOSAVE_MAP_PLACEMENT: AutoSaveMapPlacement = {
  x: 0,
  z: 0,
  y: 0,
  yawDeg: 0,
  scale: 1,
}

export function isAutoSaveGameModeEnabled(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('autoSaveGame') === '1'
}

export function addAutoSaveShanghaiMap(
  scene: THREE.Scene,
  initialPlacement: Partial<AutoSaveMapPlacement> = {},
): AutoSaveMapBundle {
  const group = new THREE.Group()
  group.name = 'autosave-shanghai-map-root'
  scene.add(group)

  const placement: AutoSaveMapPlacement = {
    ...AUTOSAVE_MAP_PLACEMENT,
    ...initialPlacement,
  }

  const applyPlacement = (): void => {
    group.position.set(placement.x, placement.y, placement.z)
    group.rotation.y = THREE.MathUtils.degToRad(placement.yawDeg)
    group.scale.setScalar(Math.max(0.001, placement.scale))
  }
  applyPlacement()

  const loader = new GLTFLoader()
  const ready = new Promise<AutoSaveMapLoadResult>((resolve, reject) => {
    loader.load(
      autoSaveShanghaiMapUrl,
      (gltf) => {
        const model = gltf.scene
        model.name = 'autosave-shanghai-international-circuit-map'

        model.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return
          obj.castShadow = true
          obj.receiveShadow = true
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of materials) {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.roughness = Math.max(mat.roughness, 0.62)
              mat.needsUpdate = true
            }
          }
        })

        const initialBox = new THREE.Box3().setFromObject(model)
        const initialCenter = initialBox.getCenter(new THREE.Vector3())
        model.position.x -= initialCenter.x
        model.position.z -= initialCenter.z
        model.position.y -= initialBox.min.y
        group.add(model)

        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        resolve({ model, box, size, center })
      },
      undefined,
      reject,
    )
  })

  return {
    group,
    getPlacement: () => ({ ...placement }),
    setPlacement: (next) => {
      Object.assign(placement, next)
      applyPlacement()
    },
    ready,
  }
}
