import * as THREE from 'three'
import type { GameInput } from '../input'
import type {
  LowPolyShanghaiGroundHit,
  LowPolyShanghaiGroundSampler,
  LowPolyShanghaiObstacleSampler,
} from '../render/lowPolyShanghai'
import { clamp } from '../utils/math'
import {
  resetWallContact,
  resolveWallMovement,
  type WallContactState,
} from './wallCollision'

const MAX_SPEED = 82
const ACCEL = 48
const BRAKE = 72
const DRAG = 0.42
const AUTO_CRUISE_SPEED = 120 / 3.6
const AUTO_CRUISE_ACCEL = 24
const AUTO_CRUISE_DECEL = 18
const TURN_RATE = 2.9
const DRIFT_TURN_BOOST = 1.85
const DRIFT_MIN_SPEED = 12
const DRIFT_DRAG = 0.75
const RIDE_HEIGHT = 0.09
const SLOPE_GRAVITY_FACTOR = 0.42
const CAR_COLLISION_RADIUS = 0.82
const CAR_COLLISION_FRONT_OFFSET = 1
const CHASSIS_SAMPLE_OFFSET = 1.35
const CHASSIS_HALF_WIDTH = 0.68
const MAX_GROUND_SAMPLE_DELTA = 0.28
const GROUND_OUTLIER_TOLERANCE = 0.34
const HEIGHT_RISE_RESPONSE = 10
const HEIGHT_FALL_RESPONSE = 9
const HEIGHT_SPEED_RESPONSE = 0.05
const NORMAL_RESPONSE = 7
const NORMAL_SPEED_RESPONSE = 0.04
const MAX_VISUAL_PENETRATION = 0.02
const MAX_VISUAL_CLEARANCE = 0.05
const MAX_NORMAL_LAG_RAD = THREE.MathUtils.degToRad(3)

export interface GlbDriveState {
  pos: THREE.Vector3
  heading: number
  speed: number
  topSpeed: number
  normal: THREE.Vector3
  onRoad: boolean
}

export interface GlbDrivePhysics {
  state: GlbDriveState
  reset: (pose: { pos: THREE.Vector3; heading: number; normal?: THREE.Vector3 }) => void
  update: (dt: number, input: GameInput) => void
  coast: (dt: number, drag?: number) => void
}

export function createGlbDrivePhysics(
  ground: LowPolyShanghaiGroundSampler,
  initialPose: { pos: THREE.Vector3; heading: number; normal?: THREE.Vector3 },
  obstacles?: LowPolyShanghaiObstacleSampler | null,
): GlbDrivePhysics {
  const state: GlbDriveState = {
    pos: initialPose.pos.clone(),
    heading: initialPose.heading,
    speed: 0,
    topSpeed: 0,
    normal: initialPose.normal?.clone().normalize() ?? new THREE.Vector3(0, 1, 0),
    onRoad: true,
  }
  let lastGood = state.pos.clone()
  const sampleOffset = new THREE.Vector3()
  const chassisSide = new THREE.Vector3()
  const wallContact: WallContactState = {
    locked: false,
    normal: new THREE.Vector3(),
  }

  const applyHit = (hit: LowPolyShanghaiGroundHit, dt = 0, immediate = false): void => {
    const targetY = hit.point.y + RIDE_HEIGHT
    if (immediate || dt <= 0) {
      state.pos.y = targetY
      state.normal.copy(hit.normal).normalize()
    } else {
      const boundedTargetY = state.pos.y + clamp(targetY - state.pos.y, -MAX_GROUND_SAMPLE_DELTA, MAX_GROUND_SAMPLE_DELTA)
      const baseHeightResponse = boundedTargetY > state.pos.y
        ? HEIGHT_RISE_RESPONSE
        : HEIGHT_FALL_RESPONSE
      const heightResponse = baseHeightResponse + state.speed * HEIGHT_SPEED_RESPONSE
      const heightAlpha = 1 - Math.exp(-heightResponse * dt)
      const normalAlpha = 1 - Math.exp(
        -(NORMAL_RESPONSE + state.speed * NORMAL_SPEED_RESPONSE) * dt,
      )
      state.pos.y += (boundedTargetY - state.pos.y) * heightAlpha
      state.pos.y = clamp(
        state.pos.y,
        targetY - MAX_VISUAL_PENETRATION,
        targetY + MAX_VISUAL_CLEARANCE,
      )

      const normalError = state.normal.angleTo(hit.normal)
      const minimumNormalAlpha = normalError > MAX_NORMAL_LAG_RAD
        ? 1 - MAX_NORMAL_LAG_RAD / normalError
        : 0
      state.normal
        .lerp(hit.normal, Math.max(normalAlpha, minimumNormalAlpha))
        .normalize()
    }
    state.onRoad = hit.isRoad
  }

  const sampleChassisGround = (forward: THREE.Vector3): LowPolyShanghaiGroundHit | null => {
    const center = ground.sampleGroundAt(state.pos.x, state.pos.z)
    if (!center) return null
    const candidates = [center]
    const chassisForward = new THREE.Vector3(forward.x, 0, forward.z).normalize()
    chassisSide.set(-chassisForward.z, 0, chassisForward.x).normalize()
    const sampleAtOffset = (
      axis: THREE.Vector3,
      distance: number,
    ): LowPolyShanghaiGroundHit | null => {
      sampleOffset.copy(axis).multiplyScalar(distance)
      const sample = ground.sampleGroundAt(
        state.pos.x + sampleOffset.x,
        state.pos.z + sampleOffset.z,
      )
      if (!sample || sample.normal.y < 0.55) return null
      candidates.push(sample)
      return sample
    }
    const front = sampleAtOffset(chassisForward, CHASSIS_SAMPLE_OFFSET)
    const rear = sampleAtOffset(chassisForward, -CHASSIS_SAMPLE_OFFSET)
    const left = sampleAtOffset(chassisSide, CHASSIS_HALF_WIDTH)
    const right = sampleAtOffset(chassisSide, -CHASSIS_HALF_WIDTH)

    const sortedHeights = candidates.map((sample) => sample.point.y).sort((a, b) => a - b)
    const medianHeight = sortedHeights[Math.floor(sortedHeights.length / 2)]
    const samples = candidates.filter(
      (sample) => Math.abs(sample.point.y - medianHeight) <= GROUND_OUTLIER_TOLERANCE,
    )
    if (samples.length === 0) samples.push(center)

    const point = new THREE.Vector3(state.pos.x, 0, state.pos.z)
    const normal = new THREE.Vector3()
    for (const sample of samples) {
      point.y += sample.point.y
      normal.add(sample.normal)
    }
    point.y /= samples.length

    // Preserve broad crests without letting one noisy center triangle snap the
    // whole chassis upward between neighboring ground-grid samples.
    point.y = Math.max(point.y, Math.min(center.point.y, medianHeight + 0.14))

    const accepted = new Set(samples)
    const longitudinal = chassisForward.clone()
    const lateralRight = chassisSide.clone().negate()
    let hasFittedSlope = false
    if (front && rear && accepted.has(front) && accepted.has(rear)) {
      longitudinal.y = (front.point.y - rear.point.y) / (CHASSIS_SAMPLE_OFFSET * 2)
      hasFittedSlope = true
    }
    if (left && right && accepted.has(left) && accepted.has(right)) {
      lateralRight.y = (right.point.y - left.point.y) / (CHASSIS_HALF_WIDTH * 2)
      hasFittedSlope = true
    }
    if (hasFittedSlope) {
      const fittedNormal = longitudinal.cross(lateralRight).normalize()
      if (fittedNormal.y < 0) fittedNormal.negate()
      // Contact heights define the chassis pitch and roll more reliably than
      // interpolated vertex normals on imported, triangulated road surfaces.
      normal.normalize().lerp(fittedNormal, 0.88).normalize()
    } else {
      normal.normalize()
    }

    return {
      point,
      normal,
      isRoad: center.isRoad,
      isRunoff: samples.some((sample) => sample.isRunoff === true),
    }
  }

  const reset = (pose: { pos: THREE.Vector3; heading: number; normal?: THREE.Vector3 }): void => {
    state.pos.copy(pose.pos)
    state.heading = pose.heading
    state.speed = 0
    state.topSpeed = 0
    state.normal.copy(pose.normal ?? new THREE.Vector3(0, 1, 0)).normalize()
    state.onRoad = true
    resetWallContact(wallContact)
    const forward = new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading))
    const hit = sampleChassisGround(forward)
    if (hit) applyHit(hit, 0, true)
    lastGood = state.pos.clone()
  }

  const update = (dt: number, input: GameInput): void => {
    const manualThrottle = input.manualThrottle === true
    const was = state.pos.clone()

    state.speed += input.throttle * ACCEL * dt
    state.speed -= input.brake * BRAKE * dt
    state.speed -= state.speed * DRAG * dt
    if (!manualThrottle && input.brake < 0.05 && state.speed < AUTO_CRUISE_SPEED) {
      state.speed = Math.min(AUTO_CRUISE_SPEED, state.speed + AUTO_CRUISE_ACCEL * dt)
    }
    if (!manualThrottle && state.speed > AUTO_CRUISE_SPEED) {
      state.speed = Math.max(AUTO_CRUISE_SPEED, state.speed - AUTO_CRUISE_DECEL * dt)
    }
    state.speed = clamp(state.speed, 0, MAX_SPEED)
    if (state.speed > state.topSpeed) state.topSpeed = state.speed

    const drifting = input.drift && state.speed >= DRIFT_MIN_SPEED && Math.abs(input.steer) > 0.12
    const turnFactor = 1 - (state.speed / MAX_SPEED) * 0.52
    const driftBoost = drifting ? DRIFT_TURN_BOOST : 1
    state.heading -= input.steer * TURN_RATE * turnFactor * driftBoost * dt
    if (drifting) state.speed *= Math.exp(-DRIFT_DRAG * dt)

    const forward = new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading))
    forward.addScaledVector(state.normal, -forward.dot(state.normal))
    if (forward.lengthSq() < 1e-5) forward.set(Math.sin(state.heading), 0, Math.cos(state.heading))
    forward.normalize()
    const gravityOnSurface = new THREE.Vector3(0, -9.81, 0)
      .addScaledVector(state.normal, 9.81 * state.normal.y)
    const slopeAccel = gravityOnSurface.dot(forward) * SLOPE_GRAVITY_FACTOR
    state.speed = clamp(state.speed + slopeAccel * dt, 0, MAX_SPEED)
    if (state.speed > state.topSpeed) state.topSpeed = state.speed

    state.pos.x += forward.x * state.speed * dt
    state.pos.z += forward.z * state.speed * dt
    if (drifting) {
      const side = new THREE.Vector3(-forward.z, 0, forward.x)
      const slide = input.steer * state.speed * 0.24 * dt
      state.pos.addScaledVector(side, slide)
    }

    let hit = sampleChassisGround(forward)
    if (obstacles && was.distanceToSquared(state.pos) > 1e-10) {
      const wallMove = resolveWallMovement(
        was,
        state.pos,
        forward,
        obstacles,
        CAR_COLLISION_RADIUS,
        CAR_COLLISION_FRONT_OFFSET,
        wallContact,
      )
      if (wallMove.corrected) hit = sampleChassisGround(forward)
      if (wallMove.impacted) state.speed *= wallMove.speedRetention
    }

    if (hit) {
      applyHit(hit, dt)
      lastGood = state.pos.clone()
      if (!hit.isRoad) state.speed *= Math.exp(-0.28 * dt)
      return
    }

    // Keep moving across small holes in imported runoff geometry. Reverting
    // x/z to `was` traps the car forever because every retry hits the same gap.
    state.pos.y = lastGood.y
    state.normal.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-3 * dt)).normalize()
    state.speed *= Math.exp(-0.9 * dt)
    state.onRoad = false
  }

  reset(initialPose)

  const coast = (dt: number, drag = 0.35): void => {
    const forward = new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading))
    forward.addScaledVector(state.normal, -forward.dot(state.normal))
    if (forward.lengthSq() < 1e-5) forward.set(Math.sin(state.heading), 0, Math.cos(state.heading))
    forward.normalize()
    state.pos.x += forward.x * state.speed * dt
    state.pos.z += forward.z * state.speed * dt
    const hit = sampleChassisGround(forward)
    if (hit) {
      applyHit(hit, dt)
      lastGood = state.pos.clone()
    } else {
      state.pos.y = lastGood.y
    }
    state.speed *= Math.exp(-drag * dt)
  }

  return { state, reset, update, coast }
}

export const GLB_DRIVE_MAX_SPEED = MAX_SPEED
