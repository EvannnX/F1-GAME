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
const CAR_COLLISION_RADIUS = 1.45
const WALL_REBOUND_SPEED = 10.5
const WALL_REBOUND_DAMPING = 7.5
const OBSTACLE_CHECK_INTERVAL = 0.045

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
  let obstacleCheckTimer = 0

  const reset = (pose: { pos: THREE.Vector3; heading: number; normal?: THREE.Vector3 }): void => {
    state.pos.copy(pose.pos)
    state.heading = pose.heading
    state.speed = 0
    state.topSpeed = 0
    state.normal.copy(pose.normal ?? new THREE.Vector3(0, 1, 0)).normalize()
    state.onRoad = true
    lastGood = state.pos.clone()
    reboundVelocity.set(0, 0, 0)
    obstacleCheckTimer = 0
  }

  const applyHit = (hit: LowPolyShanghaiGroundHit): void => {
    state.pos.y = hit.point.y + RIDE_HEIGHT
    state.normal.lerp(hit.normal, 0.35).normalize()
    state.onRoad = hit.isRoad
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

    obstacleCheckTimer += dt
    if (obstacles && obstacleCheckTimer >= OBSTACLE_CHECK_INTERVAL && was.distanceToSquared(state.pos) > 0.0004) {
      obstacleCheckTimer = 0
      const side = forward.clone().negate()
      const obstacle = obstacles.sampleObstacleBetween(was, state.pos, {
        radius: CAR_COLLISION_RADIUS,
        side,
      })
      if (obstacle) {
        state.pos.copy(was).addScaledVector(obstacle.normal, 0.18)
        reboundVelocity.copy(obstacle.normal).multiplyScalar(WALL_REBOUND_SPEED)
        state.speed *= forward.dot(obstacle.normal) < 0 ? 0.12 : 0.35
      }
    }

    const hit = ground.sampleGroundAt(state.pos.x, state.pos.z)
    if (hit) {
      applyHit(hit)
      lastGood = state.pos.clone()
      if (!hit.isRoad) state.speed *= Math.exp(-0.28 * dt)
      return
    }

    // No ground mesh below us: don't glue the car to an old "good" point.
    // Stay at the previous frame's pose so the player can steer/brake out.
    state.pos.copy(was)
    state.pos.y = lastGood.y
    state.speed *= Math.exp(-3.2 * dt)
    state.onRoad = false
  }

  const initialHit = ground.sampleGroundAt(state.pos.x, state.pos.z)
  if (initialHit) applyHit(initialHit)

  const coast = (dt: number, drag = 0.35): void => {
    const forward = new THREE.Vector3(Math.sin(state.heading), 0, Math.cos(state.heading))
    forward.addScaledVector(state.normal, -forward.dot(state.normal))
    if (forward.lengthSq() < 1e-5) forward.set(Math.sin(state.heading), 0, Math.cos(state.heading))
    forward.normalize()
    state.pos.x += forward.x * state.speed * dt
    state.pos.z += forward.z * state.speed * dt
    const hit = ground.sampleGroundAt(state.pos.x, state.pos.z)
    if (hit) {
      applyHit(hit)
      lastGood = state.pos.clone()
    } else {
      state.pos.y = lastGood.y
    }
    state.speed *= Math.exp(-drag * dt)
  }

  return { state, reset, update, coast }
}

export const GLB_DRIVE_MAX_SPEED = MAX_SPEED
