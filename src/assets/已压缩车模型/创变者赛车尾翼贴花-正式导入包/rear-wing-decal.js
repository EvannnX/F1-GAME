import * as THREE from "three";

export const REAR_WING_DECAL_PRESET = Object.freeze({
  baseWidth: 0.235,
  baseHeight: 0.043,
  scale: 0.58,
  widthMultiplier: 1.24,
  heightMultiplier: 0.8,
  position: Object.freeze({ x: 0, y: 0.195, z: -0.4935 }),
  rotationDegrees: Object.freeze({ x: -21, y: 180, z: 0 }),
});

/**
 * Adds the saved white rear-wing decal to the root of the creator-livery car.
 *
 * @param {object} options
 * @param {THREE.Object3D} options.parent Root object of 创变者配色车-optimized.glb.
 * @param {THREE.WebGLRenderer} [options.renderer] Used only for max anisotropy.
 * @param {string|URL} [options.textureUrl] Optional relocated texture URL.
 * @returns {Promise<THREE.Mesh>}
 */
export async function addRearWingDecal({
  parent,
  renderer,
  textureUrl = new URL("./rear-wing-logo-white.png", import.meta.url).href,
}) {
  if (!parent?.isObject3D) {
    throw new TypeError("addRearWingDecal: parent must be a THREE.Object3D");
  }

  const texture = await new THREE.TextureLoader().loadAsync(String(textureUrl));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    side: THREE.DoubleSide,
  });

  const preset = REAR_WING_DECAL_PRESET;
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(preset.baseWidth, preset.baseHeight),
    material,
  );

  decal.name = "creator-rear-wing-white-decal";
  decal.position.set(
    preset.position.x,
    preset.position.y,
    preset.position.z,
  );
  decal.scale.set(
    preset.scale * preset.widthMultiplier,
    preset.scale * preset.heightMultiplier,
    1,
  );
  decal.rotation.set(
    THREE.MathUtils.degToRad(preset.rotationDegrees.x),
    THREE.MathUtils.degToRad(preset.rotationDegrees.y),
    THREE.MathUtils.degToRad(preset.rotationDegrees.z),
    "XYZ",
  );
  decal.renderOrder = 4;

  parent.add(decal);
  return decal;
}

export function disposeRearWingDecal(decal) {
  if (!decal) return;
  decal.removeFromParent();
  decal.geometry?.dispose();
  decal.material?.map?.dispose();
  decal.material?.dispose();
}
