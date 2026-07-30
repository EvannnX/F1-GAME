import * as THREE from 'three'
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { AUDI_LIVERY_TEMPLATE } from '../data/audiLiveryTemplate'
import { storage } from '../utils/storage'
import {
  createAccentLiveryTexture,
  createSideLiveryTexture,
  extractLiveryPalette,
  type LiveryPalette,
} from './customLiveryComposer'

const DECAL_GROUP_NAME = 'f1s-itasha-decals'
const MAX_LOGO_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_LOGO_EDGE = 256

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片无法读取'))
    image.src = dataUrl
  })
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

export async function prepareCustomLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > MAX_LOGO_SOURCE_BYTES) throw new Error('图片不能超过 8MB')

  const source = await readFile(file)
  const image = await loadImage(source)
  const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法处理图片')
  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

function materialsForMesh(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

function isLiveryMesh(mesh: THREE.Mesh): boolean {
  return materialsForMesh(mesh).some(
    (material) => AUDI_LIVERY_TEMPLATE.bodyMaterials.includes(material.name.toLowerCase()),
  )
}

function setFactoryDecalsVisible(carModel: THREE.Object3D, visible: boolean): void {
  carModel.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const isFactoryDecal = materialsForMesh(object).some(
      (material) => AUDI_LIVERY_TEMPLATE.factoryDecalMaterials.includes(material.name.toLowerCase()),
    )
    if (!isFactoryDecal) return
    if (object.userData.f1sFactoryDecalVisible === undefined) {
      object.userData.f1sFactoryDecalVisible = object.visible
    }
    object.visible = visible ? Boolean(object.userData.f1sFactoryDecalVisible) : false
  })
}

function setBodyTheme(carModel: THREE.Object3D, palette?: LiveryPalette): void {
  const visited = new Set<THREE.Material>()
  carModel.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isLiveryMesh(object)) return
    for (const material of materialsForMesh(object)) {
      if (visited.has(material)) continue
      visited.add(material)
      const themed = material as THREE.Material & {
        color?: THREE.Color
        roughness?: number
        metalness?: number
      }
      if (!themed.color) continue
      if (!material.userData.f1sOriginalBodyTheme) {
        material.userData.f1sOriginalBodyTheme = {
          color: themed.color.getHex(),
          roughness: themed.roughness,
          metalness: themed.metalness,
        }
      }
      const original = material.userData.f1sOriginalBodyTheme as {
        color: number
        roughness?: number
        metalness?: number
      }
      themed.color.set(palette?.primary ?? original.color)
      if (themed.roughness !== undefined) {
        themed.roughness = palette ? 0.42 : (original.roughness ?? themed.roughness)
      }
      if (themed.metalness !== undefined) {
        themed.metalness = palette ? 0.12 : (original.metalness ?? themed.metalness)
      }
      material.needsUpdate = true
    }
  })
}

function disposeDecalGroup(group: THREE.Object3D): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    for (const material of materialsForMesh(object)) {
      if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose()
      material.dispose()
    }
  })
  group.removeFromParent()
}

function createProjectedGeometries(
  container: THREE.Object3D,
  targets: THREE.Mesh[],
  center: THREE.Vector3,
  orientation: THREE.Euler,
  size: THREE.Vector3,
): THREE.BufferGeometry[] {
  const containerInverse = container.matrixWorld.clone().invert()
  const geometries: THREE.BufferGeometry[] = []
  for (const target of targets) {
    const geometry = new DecalGeometry(target, center, orientation, size)
    if ((geometry.getAttribute('position')?.count ?? 0) === 0) {
      geometry.dispose()
      continue
    }
    geometry.applyMatrix4(containerInverse)
    geometries.push(geometry)
  }
  return geometries
}

export function clearCustomLivery(
  container: THREE.Object3D,
  carModel: THREE.Object3D,
): void {
  for (const child of [...container.children]) {
    if (child.name === DECAL_GROUP_NAME) disposeDecalGroup(child)
  }
  setBodyTheme(carModel)
  setFactoryDecalsVisible(carModel, true)
  delete carModel.userData.f1sCustomLiveryDataUrl
}

export async function applyCustomLivery(
  container: THREE.Object3D,
  carModel: THREE.Object3D,
  dataUrl = storage.getCustomLogo(),
): Promise<boolean> {
  if (
    dataUrl
    && carModel.userData.f1sCustomLiveryDataUrl === dataUrl
    && container.children.some((child) => child.name === DECAL_GROUP_NAME)
  ) {
    return true
  }
  clearCustomLivery(container, carModel)
  if (!dataUrl) return false

  const targets: THREE.Mesh[] = []
  carModel.updateMatrixWorld(true)
  carModel.traverse((object) => {
    if (object instanceof THREE.Mesh && isLiveryMesh(object)) targets.push(object)
  })
  if (targets.length === 0) return false

  const image = await loadImage(dataUrl)
  const palette = extractLiveryPalette(image)
  setBodyTheme(carModel, palette)
  const box = new THREE.Box3()
  for (const target of targets) box.union(new THREE.Box3().setFromObject(target))
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const group = new THREE.Group()
  group.name = DECAL_GROUP_NAME
  let decalCount = 0

  for (const placement of AUDI_LIVERY_TEMPLATE.projectors) {
    const texture = createSideLiveryTexture(image, placement)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    texture.needsUpdate = true
    const position = new THREE.Vector3(
      center.x + placement.side * size.x * 0.48,
      box.min.y + size.y * placement.centerY,
      center.z + size.z * placement.centerZ,
    )
    const geometries = createProjectedGeometries(
      container,
      targets,
      position,
      new THREE.Euler(0, placement.side * Math.PI / 2, 0),
      new THREE.Vector3(
        Math.min(3.25, size.z * placement.width * 1.08),
        Math.min(0.96, size.y * placement.height),
        size.x * placement.rayOriginDistance * 1.35,
      ),
    )
    if (geometries.length === 0) {
      material.map?.dispose()
      material.dispose()
      continue
    }
    const merged = mergeGeometries(geometries, false)
    for (const geometry of geometries) geometry.dispose()
    if (!merged) {
      material.map?.dispose()
      material.dispose()
      continue
    }
    const decal = new THREE.Mesh(merged, material)
    decal.name = `f1s-${placement.name}`
    decal.renderOrder = 30
    group.add(decal)
    decalCount++
  }

  for (const placement of AUDI_LIVERY_TEMPLATE.topProjectors) {
    const texture = createAccentLiveryTexture(image, placement.name)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    texture.needsUpdate = true
    const geometries = createProjectedGeometries(
      container,
      targets,
      new THREE.Vector3(
        center.x,
        box.max.y + size.y * 0.12,
        center.z + size.z * placement.centerZ,
      ),
      new THREE.Euler(-Math.PI / 2, 0, 0),
      new THREE.Vector3(
        Math.min(1.65, size.x * placement.width),
        Math.min(2.3, size.z * placement.length),
        size.y * 1.5,
      ),
    )
    if (geometries.length === 0) {
      material.map?.dispose()
      material.dispose()
      continue
    }
    const merged = mergeGeometries(geometries, false)
    for (const geometry of geometries) geometry.dispose()
    if (!merged) {
      material.map?.dispose()
      material.dispose()
      continue
    }
    const decal = new THREE.Mesh(merged, material)
    decal.name = `f1s-${placement.name}`
    decal.renderOrder = 29
    group.add(decal)
    decalCount++
  }

  if (decalCount === 0) return false
  setFactoryDecalsVisible(carModel, false)
  container.add(group)
  carModel.userData.f1sCustomLiveryDataUrl = dataUrl
  return true
}
