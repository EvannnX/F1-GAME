import * as THREE from 'three'
import rearWingLogoUrl from '../assets/已压缩车模型/创变者赛车尾翼贴花-正式导入包/rear-wing-logo-white.png?url'

const CREATOR_REAR_WING_DECAL = {
  baseWidth: 0.235,
  baseHeight: 0.043,
  scale: 0.58,
  widthMultiplier: 1.24,
  heightMultiplier: 0.8,
  position: new THREE.Vector3(0, 0.195, -0.4935),
  rotation: new THREE.Euler(
    THREE.MathUtils.degToRad(-21),
    THREE.MathUtils.degToRad(180),
    0,
    'XYZ',
  ),
} as const

export async function addCreatorRearWingDecal(
  parent: THREE.Object3D,
  renderer?: THREE.WebGLRenderer,
): Promise<THREE.Mesh> {
  const existing = parent.getObjectByName('creator-rear-wing-white-decal')
  if (existing instanceof THREE.Mesh) return existing

  const texture = await new THREE.TextureLoader().loadAsync(rearWingLogoUrl)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: '#ffffff',
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    side: THREE.DoubleSide,
  })
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(
      CREATOR_REAR_WING_DECAL.baseWidth,
      CREATOR_REAR_WING_DECAL.baseHeight,
    ),
    material,
  )
  decal.name = 'creator-rear-wing-white-decal'
  decal.position.copy(CREATOR_REAR_WING_DECAL.position)
  decal.rotation.copy(CREATOR_REAR_WING_DECAL.rotation)
  decal.scale.set(
    CREATOR_REAR_WING_DECAL.scale * CREATOR_REAR_WING_DECAL.widthMultiplier,
    CREATOR_REAR_WING_DECAL.scale * CREATOR_REAR_WING_DECAL.heightMultiplier,
    1,
  )
  decal.renderOrder = 4
  parent.add(decal)
  return decal
}
