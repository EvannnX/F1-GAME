import * as THREE from 'three'
import { SHANGHAI_OPTIMAL_RACING_LINE } from '../data/shanghaiOptimalRacingLine'

const DASH_LENGTH = 3.6
const DASH_WIDTH = 1.05

export interface RacingGuideLineBundle {
  group: THREE.Group
  update: (_playerSpeed: number, elapsedSeconds: number) => void
}

/**
 * Renders the optimal path baked from shanghai_meshopt.glb's own raceline mesh.
 * No road raycasts or lateral scans happen at runtime.
 */
export function createRacingGuideLine(scene: THREE.Scene): RacingGuideLineBundle {
  const group = new THREE.Group()
  group.name = 'racing-guide-line'
  scene.add(group)

  const geometry = new THREE.BoxGeometry(DASH_WIDTH, 0.018, DASH_LENGTH)
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
    toneMapped: false,
    vertexColors: true,
  })
  const pulseTime = { value: 0 }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.guidePulseTime = pulseTime
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float guidePulseTime;
        varying float vGuidePulse;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float guidePhase = dot(instanceMatrix[3].xz, vec2(0.032, 0.027));
        vGuidePulse = 0.68 + 0.32 * sin(guidePulseTime * 5.4 + guidePhase);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vGuidePulse;`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse * (0.82 + vGuidePulse * 0.34), opacity * vGuidePulse );',
      )
  }
  material.customProgramCacheKey = () => 'f1s-racing-guide-flow-v1'
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    SHANGHAI_OPTIMAL_RACING_LINE.length,
  )
  mesh.name = 'dynamic-racing-guide-dashes'
  mesh.renderOrder = 4
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false

  const position = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const basis = new THREE.Matrix4()
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const unitScale = new THREE.Vector3(1, 1, 1)
  SHANGHAI_OPTIMAL_RACING_LINE.forEach((sample, index) => {
    position.set(sample[0], sample[1], sample[2])
    normal.set(sample[3], sample[4], sample[5]).normalize()
    forward.set(sample[6], sample[7], sample[8]).normalize()
    right.crossVectors(normal, forward).normalize()
    basis.makeBasis(right, normal, forward)
    quaternion.setFromRotationMatrix(basis)
    matrix.compose(position, quaternion, unitScale)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  group.add(mesh)

  const green = new THREE.Color(0x7dff70)
  const yellow = new THREE.Color(0xffc928)
  const red = new THREE.Color(0xff2f24)
  SHANGHAI_OPTIMAL_RACING_LINE.forEach((sample, index) => {
    // The array is stored opposite to driving direction, so the next physical
    // dash is index - 1. Colour describes the road ahead, not current speed:
    // green = accelerate, yellow = lift/prepare, red = brake.
    const next = SHANGHAI_OPTIMAL_RACING_LINE[
      (index - 1 + SHANGHAI_OPTIMAL_RACING_LINE.length) %
      SHANGHAI_OPTIMAL_RACING_LINE.length
    ]
    const speedDrop = sample[9] - next[9]
    const color = next[9] < 28 || speedDrop > 2.4
      ? red
      : next[9] < 43 || speedDrop > 0.7
        ? yellow
        : green
    mesh.setColorAt(index, color)
  })
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

  const update = (_playerSpeed: number, elapsedSeconds: number): void => {
    pulseTime.value = elapsedSeconds
  }
  update(0, 0)

  return { group, update }
}
