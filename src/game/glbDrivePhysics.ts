import * as THREE from 'three'
import type { GameInput } from '../input'
import type {
  LowPolyShanghaiGroundHit,
  LowPolyShanghaiGroundSampler,
  LowPolyShanghaiObstacleSampler,
} from '../render/lowPolyShanghai'
import { clamp } from '../utils/math'

const MAX_SPEED = 82
const ACCEL = 48
const BRAKE = 72
const DRAG = 0.42
const AUTO_CRUISE_SPEED = 120 / 3.6
const AUTO_CRUISE_ACCEL = 24
const AUTO_CRUISE_DECEL = 18
const TURN_RATE = 2.9
const RIDE_HEIGHT = 0.09
const SLOPE_GRAVITY_FACTOR = 0.42
const CAR_COLLISION_RADIUS = 0.82
const WALL_REBOUND_SPEED = 3.2
const WALL_REBOUND_DAMPING = 10
const OBSTACLE_CHECK_INTERVAL = 0.045
const CHASSIS_SAMPLE_OFFSET = 1.35
const MAX_GROUND_SAMPLE_DELTA = 0.45
const HEIGHT_RISE_RESPONSE = 24
const HEIGHT_FALL_RESPONSE = 10
const NORMAL_RESPONSE = 8
const CREST_CENTER_RECOVERY = 0.75

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
  const reboundVelocity = new THREE.Vector3()
  const sampleOffset = new THREE.Vector3()
  let obstacleCheckTimer = 0

  const applyHit = (hit: LowPolyShanghaiGroundHit, dt = 0, immediate = false): void => {
    const targetY = hit.point.y + RIDE_HEIGHT
    if (immediate || dt <= 0) {
      state.pos.y = targetY
      state.normal.copy(hit.normal).normalize()
    } else {
      const boundedTargetY = state.pos.y + clamp(targetY - state.pos.y, -MAX_GROUND_SAMPLE_DELTA, MAX_GROUND_SAMPLE_DELTA)
      const heightResponse = boundedTargetY > state.pos.y ? HEIGHT_RISE_RESPONSE : HEIGHT_FALL_RESPONSE
      const heightAlpha = 1 - Math.exp(-heightResponse * dt)
      const normalAlpha = 1 - Math.exp(-NORMAL_RESPONSE * dt)
      state.pos.y += (boundedTargetY - state.pos.y) * heightAlpha
      state.normal.lerp(hit.normal, normalAlpha).normalize()
    }
    state.onRoad = hit.isRoad
  }

  const sampleChassisGround = (forward: THREE.Vector3): LowPolyShanghaiGroundHit | null => {
    const center = ground.sampleGroundAt(state.pos.x, state.pos.z)
    if (!center) return null
    const samples = [center]
    for (const direction of [-1, 1]) {
      sampleOffset.copy(forward).multiplyScalar(CHASSIS_SAMPLE_OFFSET * direction)
      const sample = ground.sampleGroundAt(state.pos.x + sampleOffset.x, state.pos.z + sampleOffset.z)
      if (!sample) continue
      if (Math.abs(sample.point.y - center.point.y) > MAX_GROUND_SAMPLE_DELTA) continue
      if (sample.normal.y < 0.55) continue
      samples.push(sample)
    }
    if (samples.length === 1) return center
    const point = center.point.clone().multiplyScalar(2)
    const normal = center.normal.clone().multiplyScalar(2)
    let weight = 2
    for (let index = 1; index < samples.length; index++) {
      point.add(samples[index].point)
      normal.add(samples[index].normal)
      weight++
    }
    point.multiplyScalar(1 / weight)
    // A planar incline averages back to the center height. Only recover the
    // residual on a convex crest, where the rigid chassis would otherwise sink.
    point.y += Math.max(0, center.point.y - point.y) * CREST_CENTER_RECOVERY
    point.x = state.pos.x
    point.z = state.pos.z
    normal.normalize()
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
    reboundVelocity.set(0, 0, 0)
    obstacleCheckTimer = 0

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

    const turnFactor = 1 - (state.speed / MAX_SPEED) * 0.52
    state.heading -= input.steer * TURN_RATE * turnFactor * dt

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
    if (reboundVelocity.lengthSq() > 0.0001) {
      state.pos.addScaledVector(reboundVelocity, dt)
      reboundVelocity.multiplyScalar(Math.exp(-WALL_REBOUND_DAMPING * dt))
      reboundVelocity.y = 0
    } else {
      reboundVelocity.set(0, 0, 0)
    }

    const hit = sampleChassisGround(forward)
    if (hit?.isRunoff) reboundVelocity.set(0, 0, 0)

    obstacleCheckTimer += dt
    if (obstacles && !hit?.isRunoff && obstacleCheckTimer >= OBSTACLE_CHECK_INTERVAL && was.distanceToSquared(state.pos) > 0.0004) {
      obstacleCheckTimer = 0
      const side = forward.clone().negate()
      const obstacle = obstacles.sampleObstacleBetween(was, state.pos, {
        radius: CAR_COLLISION_RADIUS,
        side,
      })
      const impactDot = obstacle ? forward.dot(obstacle.normal) : 1
      if (obstacle && impactDot < 0.05) {
        state.pos.copy(was).addScaledVector(obstacle.normal, 0.04)
        if (impactDot < -0.15) {
          reboundVelocity.copy(obstacle.normal).multiplyScalar(WALL_REBOUND_SPEED * Math.min(1, -impactDot))
        } else {
          reboundVelocity.set(0, 0, 0)
        }
        state.speed *= impactDot < -0.35 ? 0.28 : 0.65
      }
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
