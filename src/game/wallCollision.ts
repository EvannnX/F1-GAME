import * as THREE from 'three'
import type { LowPolyShanghaiObstacleSampler } from '../render/lowPolyShanghai'
import { clamp } from '../utils/math'

const WALL_RELEASE_DOT = 0.08
const WALL_CONTACT_EPSILON = 1e-5
const WALL_CONTACT_PROBE_EXTRA = 0.45
const MIN_IMPACT_SPEED_RETENTION = 0.45
const GLANCING_SLIDE_RETENTION = 0.72
const HEAD_ON_SLIDE_RETENTION = 0.24

export interface WallContactState {
  locked: boolean
  normal: THREE.Vector3
}

export interface WallMoveResult {
  corrected: boolean
  impacted: boolean
  move: THREE.Vector3
  scraping: boolean
  speedRetention: number
}

export function resetWallContact(contact: WallContactState): void {
  contact.locked = false
  contact.normal.set(0, 0, 0)
}

function removeInwardMovement(move: THREE.Vector3, normal: THREE.Vector3): boolean {
  const inwardDistance = move.dot(normal)
  if (inwardDistance >= 0) return false
  move.addScaledVector(normal, -inwardDistance)
  return true
}

export function resolveWallMovement(
  from: THREE.Vector3,
  target: THREE.Vector3,
  headingDirection: THREE.Vector3,
  obstacles: LowPolyShanghaiObstacleSampler,
  radius: number,
  forwardProbeOffset: number,
  contact: WallContactState,
): WallMoveResult {
  const options = { radius, side: headingDirection.clone().negate() }
  const probeOffset = headingDirection.clone()
  probeOffset.y = 0
  if (probeOffset.lengthSq() > WALL_CONTACT_EPSILON) {
    probeOffset.normalize().multiplyScalar(forwardProbeOffset)
  }
  const probeFrom = from.clone().add(probeOffset)
  const probeTarget = target.clone().add(probeOffset)
  const startObstacle = obstacles.sampleObstacleNear(probeFrom, contact.locked
    ? { ...options, radius: radius + WALL_CONTACT_PROBE_EXTRA }
    : options)

  if (contact.locked) {
    if (!startObstacle) {
      resetWallContact(contact)
    } else {
      contact.normal.copy(startObstacle.normal).normalize()
      if (headingDirection.dot(contact.normal) > WALL_RELEASE_DOT) {
        resetWallContact(contact)
      }
    }
  }

  const move = target.clone().sub(from)
  const intendedDistance = move.length()
  let corrected = contact.locked && removeInwardMovement(move, contact.normal)
  target.copy(from).add(move)
  probeTarget.copy(probeFrom).add(move)

  let impacted = false
  if (move.lengthSq() > WALL_CONTACT_EPSILON) {
    const obstacle = obstacles.sampleObstacleBetween(probeFrom, probeTarget, options)
    const movingAlongOrAway = startObstacle
      ? move.dot(startObstacle.normal) >= -WALL_CONTACT_EPSILON
      : false
    if (obstacle && !movingAlongOrAway) {
      contact.normal.copy(startObstacle?.normal ?? obstacle.normal).normalize()
      contact.locked = true
      corrected = removeInwardMovement(move, contact.normal) || corrected
      target.copy(from).add(move)
      impacted = true
    }
  }

  const retainedMovement = intendedDistance > WALL_CONTACT_EPSILON
    ? clamp(move.length() / intendedDistance, 0, 1)
    : 0
  if (contact.locked) {
    const pressure = clamp(-headingDirection.dot(contact.normal), 0, 1)
    const slideRetention = GLANCING_SLIDE_RETENTION
      + (HEAD_ON_SLIDE_RETENTION - GLANCING_SLIDE_RETENTION) * pressure
    move.multiplyScalar(slideRetention)
    target.copy(from).add(move)
    probeTarget.copy(probeFrom).add(move)
    corrected = true
  }
  return {
    corrected,
    impacted,
    move,
    scraping: contact.locked,
    speedRetention: impacted
      ? MIN_IMPACT_SPEED_RETENTION + (1 - MIN_IMPACT_SPEED_RETENTION) * retainedMovement
      : 1,
  }
}
