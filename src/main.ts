import * as THREE from 'three'
import { installGlobalErrorHandlers, showToast } from './utils/error'
import { storage } from './utils/storage'
import { createScene } from './render/scene'
import { createTrack, type TrackBundle } from './render/track'
import { pickRandomWeather } from './render/weather'
import { createCar, type CarBundle } from './render/car'
import { createLightsRig, createCountdown } from './render/lights'
import { createPhysics, PHYS_MAX_SPEED, type PhysicsBundle } from './game/physics'
import { initInput, type InputController } from './input'
import { GameLoop } from './game/loop'
import { StateMachine, GameState, createInitialContext } from './game/state'
import { createMenu, type CameraMode } from './ui/menu'
import { createHud } from './ui/hud'
import { createResult } from './ui/result'
import { createTransitionVideo } from './ui/transitionVideo'
import { createMinimap } from './ui/minimap'
import { createTelemetryMap, type TelemetryMapPoint } from './ui/telemetryMap'
import { createPersonalityCard } from './ui/personalityCard'
import { installGlbObjectDeletionGui, isGlbObjectDeletionGuiEnabled } from './ui/glbObjectDeletion'
import { installF1tiApi } from './f1ti/api'
import { installGlbGridPlacementGui, isGlbGridPlacementGuiEnabled } from './ui/glbGridPlacement'
import {
  installGlbCameraTuningGui,
  isGlbCameraTuningGuiEnabled,
  readSavedGlbCameraTuning,
  type GlbCameraTuning,
} from './ui/glbCameraTuning'
import {
  applyCarVisualTuning,
  installCarVisualTuningGui,
  isCarVisualTuningGuiEnabled,
  readSavedCarVisualTuning,
} from './ui/carVisualTuning'
import type { PlayerStats } from './racerPersonality'
import { SFX, unlockAudio } from './audio/zzfx'
import { createAudioRig, type AudioRig } from './audio/engine'
import { CommentarySystem } from './audio/commentary'
import { CoachSystem } from './audio/coach'
import {
  createOpponents,
  GRID_SLOT_M,
  PLAYER_GRID_SLOT,
  updateOpponent,
  progress as raceProgress,
  type OpponentProfile,
  type OpponentState,
} from './game/opponents'
import { createOpponentCars, type OpponentCarBundle } from './render/opponentCars'
import {
  createFirstPersonCockpit,
  isCockpitPlacementGuiEnabled,
  type FirstPersonCockpitBundle,
} from './render/firstPersonCockpit'
import {
  addLowPolyShanghai,
  createLowPolyShanghaiGroundGridSampler,
  createLowPolyShanghaiGroundSampler,
  createLowPolyShanghaiObstacleSampler,
  createLowPolyShanghaiVisualOptimizer,
  eraseLowPolyShanghaiTriangles,
  optimizeLowPolyShanghaiRendering,
  type LowPolyShanghaiBundle,
  type LowPolyShanghaiGroundSampler,
  type LowPolyShanghaiTriangleErase,
} from './render/lowPolyShanghai'
import { createGlbDrivePhysics, GLB_DRIVE_MAX_SPEED } from './game/glbDrivePhysics'
import { SHANGHAI_GLB_ROAD_ROUTE } from './data/shanghaiGlbRoadRoute'
import { SHANGHAI_GLB_ROAD_MASK } from './data/shanghaiGlbRoadMask'

const GLB_START_FALLBACK = new THREE.Vector3(-140, 0, -52.8)
const GLB_START_HEADING = 0
const GLB_THIRD_BACK_DISTANCE = 4.6
const GLB_THIRD_UP_DISTANCE = 1.75
const GLB_THIRD_LOOK_AHEAD = 8.8
const GLB_THIRD_LOOK_UP = -0.55
const GLB_THIRD_FOV = 43
const DEFAULT_GLB_CAMERA_TUNING: GlbCameraTuning = {
  backDistance: GLB_THIRD_BACK_DISTANCE,
  upDistance: GLB_THIRD_UP_DISTANCE,
  lookAhead: GLB_THIRD_LOOK_AHEAD,
  lookUp: GLB_THIRD_LOOK_UP,
  fov: GLB_THIRD_FOV,
}
const GLB_VISUAL_GROUND_SINK = 0.12
const GLB_PLAYER_BASE_VISUAL_SCALE = 0.58
const GLB_PLAYER_SIZE_MULTIPLIER = 1.7
const GLB_PLAYER_VISUAL_SCALE = GLB_PLAYER_BASE_VISUAL_SCALE * GLB_PLAYER_SIZE_MULTIPLIER
const GLB_PLAYER_TARGET_LENGTH_M = 5.0 * GLB_PLAYER_VISUAL_SCALE
const GLB_START_POSE_STORAGE_KEY = 'f1s_glb_drive_start_pose_v1'
const GLB_GRID_STORAGE_KEY = 'f1s_glb_grid_placements_v3'
const GLB_SIGN_DELETIONS_STORAGE_KEY = 'f1s_glb_sign_deletions_v2'
const LOW_POLY_SHANGHAI_PLACEMENT_STORAGE_KEY = 'f1s_lowpoly_shanghai_placement_v5'
const CAR_VISUAL_TUNING_STORAGE_KEY = 'f1s_car_visual_tuning_v1'
const GLB_CAMERA_TUNING_STORAGE_KEY = 'f1s_glb_camera_tuning_v1'
const SCENE_CACHE_RESET_PARAMS = ['resetSceneCache', 'clearSceneCache', 'resetMapCache']
const SCENE_CACHE_STORAGE_KEYS = [
  GLB_START_POSE_STORAGE_KEY,
  GLB_GRID_STORAGE_KEY,
  GLB_SIGN_DELETIONS_STORAGE_KEY,
  'f1s_glb_sign_deletions_v1',
  LOW_POLY_SHANGHAI_PLACEMENT_STORAGE_KEY,
  'f1s_glb_drive_start_pose',
  'f1s_direct_glb_start_pose',
  'f1s_lowpoly_shanghai_start_pose',
  'f1s_shanghai_glb_start_pose',
  'f1s_glb_start_pose',
  'f1s_start_pose',
  'f1s_autosave_track_local_points',
  'f1s_autosave_map_placement',
  'f1s_start_grandstand_placement',
  'f1s_env_texture_placement',
  'f1s_track_point_editor',
  'f1s_track_outline_trace',
  'f1s_first_person_cockpit_placement_v7',
  'f1s_first_person_cockpit_placement_v2',
  'f1s_first_person_cockpit_placement_v1',
  CAR_VISUAL_TUNING_STORAGE_KEY,
  GLB_CAMERA_TUNING_STORAGE_KEY,
]

interface GlbGridPlacement {
  id: 'player' | 'ferrari' | 'mercedes' | 'mclaren' | 'redbull' | string
  x: number
  z: number
  headingDeg: number
}

const DEFAULT_GLB_GRID_PLACEMENTS: GlbGridPlacement[] = [
  { id: 'ferrari', x: -122.67, z: 116.35, headingDeg: 270.8 },
  { id: 'mercedes', x: -155.09, z: 116.62, headingDeg: 270.1 },
  { id: 'mclaren', x: -131.19, z: 109.09, headingDeg: 271.5 },
  { id: 'player', x: -147.24, z: 109.34, headingDeg: 270.6 },
  { id: 'redbull', x: -139.35, z: 116.66, headingDeg: -89.6 },
]

interface SavedGlbStartPose {
  x: number
  z: number
  y?: number
  heading?: number
  yawDeg?: number
}

function shouldBootMainGame(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('oldMainGame') || params.has('legacyMainGame') || params.has('originalMainGame')
}

function resetSceneCacheFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search)
  if (!SCENE_CACHE_RESET_PARAMS.some((param) => params.has(param))) return false

  try {
    for (const key of SCENE_CACHE_STORAGE_KEYS) localStorage.removeItem(key)
  } catch (e) {
    console.warn('[F1S] scene cache reset failed:', e)
  }

  for (const param of SCENE_CACHE_RESET_PARAMS) params.delete(param)
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  return true
}

function bootApp(): void {
  const sceneCacheWasReset = resetSceneCacheFromUrl()
  ;(shouldBootMainGame() ? bootstrap : bootstrapGlbVersion)()
  if (sceneCacheWasReset) showToast('已清除地图/起点缓存，使用代码默认场景', 3600)
}

function createStatusPanel(): HTMLDivElement {
  const panel = document.createElement('div')
  panel.style.cssText = `
    position:fixed;left:50%;top:50%;z-index:20;transform:translate(-50%,-50%);
    max-width:min(520px,calc(100vw - 48px));color:#fff;text-align:center;
    font:700 16px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    text-shadow:0 3px 14px rgba(0,0,0,.9);
    pointer-events:none;white-space:pre-line;
  `
  document.body.appendChild(panel)
  return panel
}

function createGlbCountdownOverlay(): { flash: (text: string, color?: string, ms?: number) => void; hide: () => void } {
  const el = document.createElement('div')
  el.style.cssText = `
    position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;
    pointer-events:none;color:#fff;font:900 clamp(52px,14vw,160px)/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    text-shadow:0 10px 36px rgba(0,0,0,.55);opacity:0;transform:scale(.92);
    transition:opacity .18s ease,transform .18s ease;
  `
  document.body.appendChild(el)
  let timer: number | null = null
  return {
    flash: (text: string, color = '#ff3b30', ms = 520): void => {
      if (timer !== null) window.clearTimeout(timer)
      el.textContent = text
      el.style.color = color
      el.style.opacity = '1'
      el.style.transform = 'scale(1)'
      timer = window.setTimeout(() => {
        el.style.opacity = '0'
        el.style.transform = 'scale(.92)'
      }, ms)
    },
    hide: (): void => {
      if (timer !== null) window.clearTimeout(timer)
      el.style.opacity = '0'
    },
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeGlbGridPlacement(value: unknown): GlbGridPlacement | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : null
  const x = finiteNumber(record.x)
  const z = finiteNumber(record.z)
  const headingDeg = finiteNumber(record.headingDeg) ?? finiteNumber(record.yawDeg)
  if (!id || x === null || z === null || headingDeg === null) return null
  return { id, x, z, headingDeg }
}

function readSavedGlbGridPlacements(): GlbGridPlacement[] {
  try {
    const raw = localStorage.getItem(GLB_GRID_STORAGE_KEY)
    if (!raw) return DEFAULT_GLB_GRID_PLACEMENTS.map((item) => ({ ...item }))
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_GLB_GRID_PLACEMENTS.map((item) => ({ ...item }))
    const placements = parsed
      .map(normalizeGlbGridPlacement)
      .filter((item): item is GlbGridPlacement => Boolean(item))
    const merged = new Map<string, GlbGridPlacement>()
    for (const item of DEFAULT_GLB_GRID_PLACEMENTS) merged.set(item.id, { ...item })
    for (const item of placements) merged.set(item.id, item)
    return Array.from(merged.values())
  } catch {
    return DEFAULT_GLB_GRID_PLACEMENTS.map((item) => ({ ...item }))
  }
}

function findGlbGridPlacement(placements: GlbGridPlacement[], id: string): GlbGridPlacement | null {
  return placements.find((item) => item.id === id) ?? null
}

function normalizeSavedGlbSignDeletion(value: unknown): LowPolyShanghaiTriangleErase | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const point = record.point && typeof record.point === 'object'
    ? record.point as Record<string, unknown>
    : record
  const x = finiteNumber(point.x)
  const y = finiteNumber(point.y)
  const z = finiteNumber(point.z)
  const radius = finiteNumber(record.radius)
  if (x === null || y === null || z === null || radius === null) return null
  return {
    point: { x, y, z },
    radius,
    meshName: typeof record.meshName === 'string' ? record.meshName : null,
    verticalOnly: typeof record.verticalOnly === 'boolean' ? record.verticalOnly : true,
    connectedOnly: record.connectedOnly === true,
  }
}

function readSavedGlbSignDeletions(): LowPolyShanghaiTriangleErase[] {
  try {
    const raw = localStorage.getItem(GLB_SIGN_DELETIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const source = Array.isArray(parsed) ? parsed : [parsed]
    const deletions = source
      .map(normalizeSavedGlbSignDeletion)
      .filter((item): item is LowPolyShanghaiTriangleErase => Boolean(item))
    return deletions
  } catch {
    return []
  }
}

function applySavedGlbSignDeletions(lowPolyShanghai: LowPolyShanghaiBundle): number {
  let removed = 0
  for (const deletion of readSavedGlbSignDeletions()) {
    removed += eraseLowPolyShanghaiTriangles(lowPolyShanghai.group, deletion)
  }
  return removed
}

function readSavedLowPolyShanghaiPlacementForMain(): Record<string, number> | undefined {
  try {
    const raw = localStorage.getItem(LOW_POLY_SHANGHAI_PLACEMENT_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const x = finiteNumber(parsed.x)
    const z = finiteNumber(parsed.z)
    const y = finiteNumber(parsed.y)
    const yawDeg = finiteNumber(parsed.yawDeg)
    const scale = finiteNumber(parsed.scale)
    if (x === null || z === null || y === null || yawDeg === null || scale === null) return undefined
    return { x, z, y, yawDeg, scale }
  } catch {
    return undefined
  }
}

function normalizeSavedGlbStartPose(value: unknown): SavedGlbStartPose | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const pos = record.pos && typeof record.pos === 'object'
    ? record.pos as Record<string, unknown>
    : record
  const x = finiteNumber(pos.x)
  const z = finiteNumber(pos.z)
  if (x === null || z === null) return null
  const y = finiteNumber(pos.y) ?? undefined
  const heading = finiteNumber(record.heading) ?? finiteNumber(record.yaw) ?? undefined
  const yawDeg = finiteNumber(record.headingDeg) ?? finiteNumber(record.yawDeg) ?? undefined
  return { x, y, z, heading, yawDeg }
}

function readSavedGlbStartPose(): SavedGlbStartPose | null {
  const priorityKeys = [
    GLB_START_POSE_STORAGE_KEY,
    'f1s_glb_drive_start_pose',
    'f1s_direct_glb_start_pose',
    'f1s_lowpoly_shanghai_start_pose',
    'f1s_shanghai_glb_start_pose',
    'f1s_glb_start_pose',
    'f1s_start_pose',
  ]
  const checked = new Set<string>()
  const readKey = (key: string): SavedGlbStartPose | null => {
    if (checked.has(key)) return null
    checked.add(key)
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const normalized = normalizeSavedGlbStartPose(parsed)
      if (normalized) return normalized
      if (key === 'f1s_autosave_track_local_points' && Array.isArray(parsed) && Array.isArray(parsed[0])) {
        const first = parsed[0] as unknown[]
        const second = Array.isArray(parsed[1]) ? parsed[1] as unknown[] : first
        const x = finiteNumber(first[0])
        const z = finiteNumber(first[1])
        const nx = finiteNumber(second[0])
        const nz = finiteNumber(second[1])
        if (x !== null && z !== null) {
          return {
            x,
            z,
            heading: nx !== null && nz !== null ? Math.atan2(nx - x, nz - z) : undefined,
          }
        }
      }
    } catch {
      return null
    }
    return null
  }

  for (const key of priorityKeys) {
    const pose = readKey(key)
    if (pose) return pose
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !/(glb|shanghai|start|drive|起点|发车)/i.test(key)) continue
    const pose = readKey(key)
    if (pose) return pose
  }
  return readKey('f1s_autosave_track_local_points')
}

function writeSavedGlbStartPose(pos: THREE.Vector3, heading: number): void {
  try {
    localStorage.setItem(GLB_START_POSE_STORAGE_KEY, JSON.stringify({
      x: Number(pos.x.toFixed(3)),
      y: Number(pos.y.toFixed(3)),
      z: Number(pos.z.toFixed(3)),
      heading: Number(heading.toFixed(6)),
      yawDeg: Number(THREE.MathUtils.radToDeg(heading).toFixed(2)),
    }))
  } catch {
    /* noop */
  }
}

function glbDrivePoseFromPlacement(
  placement: GlbGridPlacement,
  ground: LowPolyShanghaiGroundSampler,
): { pos: THREE.Vector3; heading: number; normal: THREE.Vector3 } {
  const heading = THREE.MathUtils.degToRad(placement.headingDeg)
  const hit = ground.sampleGroundAt(placement.x, placement.z)
  if (hit) {
    return {
      pos: hit.point.clone().addScaledVector(hit.normal, 0.09),
      heading,
      normal: hit.normal.clone(),
    }
  }
  return {
    pos: new THREE.Vector3(placement.x, GLB_START_FALLBACK.y, placement.z),
    heading,
    normal: new THREE.Vector3(0, 1, 0),
  }
}

const GLB_GRID_OPPONENT_PROFILES: Record<string, OpponentProfile> = {
  mercedes: {
    name: 'Veteran',
    color: '#ffd166',
    baseSpeed: 0,
    latGripG: 1,
    driftAmplitude: 0,
    driftFreq: 0,
    startStagger: 0,
    startLat: 0,
    mistakeRate: 0,
    mistakeMinS: 0,
    mistakeMaxS: 0,
  },
  mclaren: {
    name: 'Aggressor',
    color: '#ef476f',
    baseSpeed: 0,
    latGripG: 1,
    driftAmplitude: 0,
    driftFreq: 0,
    startStagger: 0,
    startLat: 0,
    mistakeRate: 0,
    mistakeMinS: 0,
    mistakeMaxS: 0,
  },
  ferrari: {
    name: 'Rookie',
    color: '#06d6a0',
    baseSpeed: 0,
    latGripG: 1,
    driftAmplitude: 0,
    driftFreq: 0,
    startStagger: 0,
    startLat: 0,
    mistakeRate: 0,
    mistakeMinS: 0,
    mistakeMaxS: 0,
  },
  redbull: {
    name: 'RedBull',
    color: '#1e41ff',
    baseSpeed: 0,
    latGripG: 1,
    driftAmplitude: 0,
    driftFreq: 0,
    startStagger: 0,
    startLat: 0,
    mistakeRate: 0,
    mistakeMinS: 0,
    mistakeMaxS: 0,
  },
}

function createGlbGridOpponentStates(
  placements: GlbGridPlacement[],
  ground: LowPolyShanghaiGroundSampler,
): OpponentState[] {
  return placements
    .filter((placement) => placement.id !== 'player')
    .map((placement) => {
      const profile = GLB_GRID_OPPONENT_PROFILES[placement.id] ?? GLB_GRID_OPPONENT_PROFILES.ferrari
      const pose = glbDrivePoseFromPlacement(placement, ground)
      return {
        profile,
        t: 0,
        lap: 0,
        speed: 0,
        pos: pose.pos,
        heading: pose.heading,
        mistakeRemaining: 0,
        mistakeJustTriggered: false,
      }
    })
}

function createGlbTelemetryRouteMap(
  lowPolyShanghai: LowPolyShanghaiBundle,
): { routePoints: TelemetryMapPoint[]; roadMask: typeof SHANGHAI_GLB_ROAD_MASK & {
  placementX: number
  placementZ: number
  placementYawDeg: number
  placementScale: number
} } {
  const placement = lowPolyShanghai.getPlacement()
  const rotation = THREE.MathUtils.degToRad(placement.yawDeg)
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  return {
    roadMask: {
      ...SHANGHAI_GLB_ROAD_MASK,
      placementX: placement.x,
      placementZ: placement.z,
      placementYawDeg: placement.yawDeg,
      placementScale: placement.scale,
    },
    routePoints: SHANGHAI_GLB_ROAD_ROUTE.map(([sourceX, sourceZ]) => {
      const x = sourceX * placement.scale
      const z = sourceZ * placement.scale
      return {
        x: placement.x + x * cos + z * sin,
        z: placement.z - x * sin + z * cos,
      }
    }),
  }
}

function findGlbStartPose(ground: LowPolyShanghaiGroundSampler): { pos: THREE.Vector3; heading: number; normal: THREE.Vector3 } {
  const gridPlayer = findGlbGridPlacement(readSavedGlbGridPlacements(), 'player')
  if (gridPlayer) return glbDrivePoseFromPlacement(gridPlayer, ground)

  const saved = readSavedGlbStartPose()
  if (saved) {
    const hit = ground.sampleGroundAt(saved.x, saved.z)
    const heading = saved.heading ?? (saved.yawDeg !== undefined ? THREE.MathUtils.degToRad(saved.yawDeg) : GLB_START_HEADING)
    if (hit) {
      return {
        pos: hit.point.clone().addScaledVector(hit.normal, 0.09),
        heading,
        normal: hit.normal.clone(),
      }
    }
    return {
      pos: new THREE.Vector3(saved.x, saved.y ?? GLB_START_FALLBACK.y, saved.z),
      heading,
      normal: new THREE.Vector3(0, 1, 0),
    }
  }

  const candidates: THREE.Vector3[] = []
  for (let dz = -80; dz <= 80; dz += 10) {
    for (let dx = -80; dx <= 80; dx += 10) {
      candidates.push(new THREE.Vector3(GLB_START_FALLBACK.x + dx, 0, GLB_START_FALLBACK.z + dz))
    }
  }
  candidates.sort((a, b) => a.distanceToSquared(GLB_START_FALLBACK) - b.distanceToSquared(GLB_START_FALLBACK))

  let firstHit: ReturnType<LowPolyShanghaiGroundSampler['sampleGroundAt']> = null
  let firstPoint: THREE.Vector3 | null = null
  for (const p of candidates) {
    const hit = ground.sampleGroundAt(p.x, p.z)
    if (!hit) continue
    firstHit = firstHit ?? hit
    firstPoint = firstPoint ?? p
    if (hit.isRoad) {
      return {
        pos: hit.point.clone().addScaledVector(hit.normal, 0.09),
        heading: GLB_START_HEADING,
        normal: hit.normal.clone(),
      }
    }
  }

  if (firstHit && firstPoint) {
    return {
      pos: firstHit.point.clone().addScaledVector(firstHit.normal, 0.09),
      heading: GLB_START_HEADING,
      normal: firstHit.normal.clone(),
    }
  }

  return {
    pos: GLB_START_FALLBACK.clone(),
    heading: GLB_START_HEADING,
    normal: new THREE.Vector3(0, 1, 0),
  }
}

function setObjectOnGroundHeading(obj: THREE.Object3D, pos: THREE.Vector3, heading: number, normal: THREE.Vector3): void {
  const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
  forward.addScaledVector(normal, -forward.dot(normal))
  if (forward.lengthSq() < 1e-5) forward.set(Math.sin(heading), 0, Math.cos(heading))
  forward.normalize()
  const right = new THREE.Vector3().crossVectors(normal, forward).normalize()
  const correctedForward = new THREE.Vector3().crossVectors(right, normal).normalize()
  const basis = new THREE.Matrix4().makeBasis(right, normal, correctedForward)
  obj.position.copy(pos).addScaledVector(normal, -GLB_VISUAL_GROUND_SINK)
  obj.quaternion.setFromRotationMatrix(basis)
}

function updateGlbThirdPersonCamera(
  camera: THREE.PerspectiveCamera,
  pos: THREE.Vector3,
  heading: number,
  normal: THREE.Vector3,
  tuning: GlbCameraTuning,
): void {
  if (camera.near !== 1) camera.near = 1
  const up = normal.clone().normalize()
  const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
  forward.addScaledVector(up, -forward.dot(up))
  if (forward.lengthSq() < 1e-5) forward.set(Math.sin(heading), 0, Math.cos(heading))
  forward.normalize()
  const back = forward.clone().negate()
  camera.position
    .copy(pos)
    .addScaledVector(back, tuning.backDistance)
    .addScaledVector(up, tuning.upDistance)
  camera.up.copy(up)
  const lookTarget = pos
    .clone()
    .addScaledVector(forward, tuning.lookAhead)
    .addScaledVector(up, tuning.lookUp)
  camera.lookAt(lookTarget)
  camera.fov += (tuning.fov - camera.fov) * 0.22
  camera.updateProjectionMatrix()
}

function updateGlbFirstPersonCamera(
  camera: THREE.PerspectiveCamera,
  pos: THREE.Vector3,
  heading: number,
  normal: THREE.Vector3,
  cockpit: FirstPersonCockpitBundle,
): void {
  if (camera.near !== 0.03) camera.near = 0.03
  const up = normal.clone().normalize()
  const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading))
  forward.addScaledVector(up, -forward.dot(up))
  if (forward.lengthSq() < 1e-5) forward.set(Math.sin(heading), 0, Math.cos(heading))
  forward.normalize()
  const right = new THREE.Vector3().crossVectors(up, forward).normalize()
  const correctedForward = new THREE.Vector3().crossVectors(right, up).normalize()
  const cameraOffset = cockpit.getCameraOffset()
  const viewOffset = cockpit.getViewRotationOffset()
  const localDirection = new THREE.Vector3(0, 0, 1)
    .applyEuler(new THREE.Euler(viewOffset.x, viewOffset.y, viewOffset.z, 'YXZ'))
    .normalize()
  const worldDirection = right.clone()
    .multiplyScalar(localDirection.x)
    .addScaledVector(up, localDirection.y)
    .addScaledVector(correctedForward, localDirection.z)
    .normalize()
  camera.position
    .copy(pos)
    .addScaledVector(right, cameraOffset.x)
    .addScaledVector(up, cameraOffset.y)
    .addScaledVector(correctedForward, cameraOffset.z)
  camera.up.copy(up)
  camera.lookAt(camera.position.clone().addScaledVector(worldDirection, 10))
  camera.fov += (58 - camera.fov) * 0.22
  camera.updateProjectionMatrix()
}

function bootstrapGlbVersion(): void {
  installGlobalErrorHandlers()

  const container = document.getElementById('app')
  if (!container) {
    console.warn('[F1S] #app missing')
    return
  }

  let bundle: ReturnType<typeof createScene>
  try {
    bundle = createScene(container, { performanceMode: storage.getPerformanceMode() })
  } catch (e) {
    console.warn('[F1S] scene init failed:', e)
    container.textContent = e instanceof Error ? e.message : String(e)
    return
  }

  const status = createStatusPanel()
  const menu = createMenu()
  const hud = createHud()
  const transitionVideo = createTransitionVideo('video/beginning.mp4')
  const countdownOverlay = createGlbCountdownOverlay()
  const result = createResult()
  const personalityCard = createPersonalityCard()
  const setStatus = (text: string): void => {
    status.style.display = ''
    status.textContent = text
  }
  const hideStatus = (): void => {
    status.style.display = 'none'
  }
  setStatus('上海赛车场 GLB 主游戏\n正在加载地图...')

  const weather = pickRandomWeather()
  bundle.applyWeather(weather)
  const lowPolyShanghai = addLowPolyShanghai(bundle.scene, readSavedLowPolyShanghaiPlacementForMain())
  const car = createCar({ visualScale: GLB_PLAYER_VISUAL_SCALE })
  const carBaseScale = car.group.scale.clone()
  bundle.scene.add(car.group)
  bundle.scene.add(car.particles)
  const firstPersonRig = new THREE.Group()
  firstPersonRig.name = 'glb-first-person-rig'
  firstPersonRig.visible = false
  const firstPersonCockpit = createFirstPersonCockpit()
  firstPersonRig.add(firstPersonCockpit.group)
  bundle.scene.add(firstPersonRig)

  let input: InputController | null = null
  let drive: ReturnType<typeof createGlbDrivePhysics> | null = null
  let cameraMode: CameraMode = 'third'
  const gridPlacements = readSavedGlbGridPlacements()
  const gridPlacementGuiRequested = isGlbGridPlacementGuiEnabled()
  let gridPlacementGuiActive = gridPlacementGuiRequested
  const carVisualTuningGuiRequested = isCarVisualTuningGuiEnabled()
  let carVisualTuningGuiActive = carVisualTuningGuiRequested
  const cameraTuningGuiRequested = isGlbCameraTuningGuiEnabled()
  let cameraTuningGuiActive = cameraTuningGuiRequested
  const firstPersonGuiRequested = isCockpitPlacementGuiEnabled()
  let firstPersonGuiActive = firstPersonGuiRequested
  const objectDeletionGuiRequested = isGlbObjectDeletionGuiEnabled()
  let objectDeletionGuiActive = objectDeletionGuiRequested
  let glbCameraTuning = readSavedGlbCameraTuning(GLB_CAMERA_TUNING_STORAGE_KEY, DEFAULT_GLB_CAMERA_TUNING)
  let glbOpponentStates: OpponentState[] = []
  let glbOpponentStateById = new Map<string, OpponentState>()
  let glbOpponentCars: OpponentCarBundle | null = null
  let telemetryMap: ReturnType<typeof createTelemetryMap> | null = null
  let audio: AudioRig | null = null
  let countdown: ReturnType<typeof createCountdown> | null = null
  let audioStarted = false
  let started = false
  let countdownActive = false
  let glbRaceStartTime = 0
  let glbRaceStartPose: THREE.Vector3 | null = null
  let glbRaceDistance = 0
  let glbRaceArmed = false
  let glbPreviousGateCoordinate = 0
  let glbFinishing = false
  let glbResultVisible = false
  let finishGlbRace: () => void = () => { /* GLB race is not ready yet. */ }
  let updateGlbRaceProgress: (dt: number) => void = () => { /* GLB race is not ready yet. */ }
  let visualOptimizer: ReturnType<typeof createLowPolyShanghaiVisualOptimizer> | null = null
  let telemetryUpdateTimer = 0

  const applyCameraModeVisibility = (): void => {
    firstPersonRig.visible = cameraMode === 'first'
    firstPersonCockpit.group.visible = cameraMode === 'first'
    car.group.visible = true
  }

  const startGlbAudio = (): void => {
    if (!audio || audioStarted) return
    audioStarted = true
    unlockAudio()
    audio.start()
  }
  window.addEventListener('pointerdown', startGlbAudio)
  window.addEventListener('keydown', startGlbAudio)

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'p' || ev.key === 'P') {
      if (!drive) return
      writeSavedGlbStartPose(drive.state.pos, drive.state.heading)
      showToast('已保存当前位置为 GLB 主游戏起点')
      ev.preventDefault()
    }
  })

  const loop = new GameLoop((dt) => {
    if (!drive) {
      bundle.render()
      return
    }
    const rawInput = input?.getInput() ?? { steer: 0, throttle: 0, brake: 0, drs: false }
    if (countdownActive && countdown) {
      countdown.update(dt)
      countdown.setThrottlePressed(rawInput.throttle > 0.7 || rawInput.drs)
    }
    const manualThrottle = rawInput.throttle > 0.7 || rawInput.drs
    const driveInput = {
      ...rawInput,
      throttle: manualThrottle ? rawInput.throttle : 0,
      manualThrottle,
    }
    const gameInput = started && !gridPlacementGuiActive && !carVisualTuningGuiActive && !cameraTuningGuiActive && !firstPersonGuiActive && !objectDeletionGuiActive
      ? driveInput
      : { steer: 0, throttle: 0, brake: 1, drs: false, manualThrottle: true }
    drive.update(dt, gameInput)
    if (started && !glbFinishing) {
      updateGlbRaceProgress(dt)
    }
    setObjectOnGroundHeading(car.group, drive.state.pos, drive.state.heading, drive.state.normal)
    setObjectOnGroundHeading(firstPersonRig, drive.state.pos, drive.state.heading, drive.state.normal)
    applyCameraModeVisibility()
    const speed01 = drive.state.speed / GLB_DRIVE_MAX_SPEED
    car.update(dt, speed01, rawInput.steer)
    firstPersonCockpit.update(dt, speed01, rawInput.steer)
    audio?.setEngine(gameInput.throttle, speed01)
    if (!countdownActive) glbOpponentCars?.update(glbOpponentStates)
    if (!gridPlacementGuiActive && !carVisualTuningGuiActive && !objectDeletionGuiActive) {
      if (cameraMode === 'first') {
        updateGlbFirstPersonCamera(bundle.camera, drive.state.pos, drive.state.heading, drive.state.normal, firstPersonCockpit)
      } else {
        updateGlbThirdPersonCamera(bundle.camera, drive.state.pos, drive.state.heading, drive.state.normal, glbCameraTuning)
      }
    }
    if (!countdownActive) visualOptimizer?.update(drive.state.pos)
    bundle.updateShadowFollow(drive.state.pos)
    telemetryUpdateTimer += dt
    if (!countdownActive && telemetryUpdateTimer >= 0.08) {
      telemetryUpdateTimer = 0
      telemetryMap?.update({
        player: {
          x: drive.state.pos.x,
          z: drive.state.pos.z,
          heading: drive.state.heading,
          speedKmh: drive.state.speed * 3.6,
          onRoad: drive.state.onRoad,
        },
        opponents: glbOpponentStates.map((opp) => ({
          x: opp.pos.x,
          z: opp.pos.z,
          color: opp.profile.color,
        })),
      })
    }
    hud.update({ speedKmh: drive.state.speed * 3.6, lapMs: 0, mode: 'keyboard' })
    bundle.render()
  })
  loop.start()

  void lowPolyShanghai.ready.then(async () => {
    const removedSigns = applySavedGlbSignDeletions(lowPolyShanghai)
    if (removedSigns > 0) console.log(`[F1S] applied sign deletions: ${removedSigns}`)
    const renderOptimization = optimizeLowPolyShanghaiRendering(lowPolyShanghai.group)
    console.log(
      `[F1S] Shanghai render optimization: ${renderOptimization.chunkCount} chunks, ` +
      `${renderOptimization.hiddenOriginals} originals hidden`,
    )
    visualOptimizer = createLowPolyShanghaiVisualOptimizer(lowPolyShanghai.group)
    setStatus('上海赛车场 GLB 主游戏\n正在准备地面采样...')
    let ground: LowPolyShanghaiGroundSampler
    try {
      ground = await createLowPolyShanghaiGroundGridSampler(lowPolyShanghai, {
        cellSize: 6,
        timeBudgetMs: 2600,
        onProgress: (progress) => setStatus(`上海赛车场 GLB 主游戏\n地面采样 ${Math.round(progress * 100)}%`),
      })
    } catch (e) {
      console.warn('[F1S] GLB ground grid fallback:', e)
      ground = createLowPolyShanghaiGroundSampler(lowPolyShanghai)
    }
    const obstacles = createLowPolyShanghaiObstacleSampler(lowPolyShanghai)
    const pose = findGlbStartPose(ground)
    drive = createGlbDrivePhysics(ground, pose, obstacles)
    setObjectOnGroundHeading(car.group, drive.state.pos, drive.state.heading, drive.state.normal)
    setObjectOnGroundHeading(firstPersonRig, drive.state.pos, drive.state.heading, drive.state.normal)
    applyCameraModeVisibility()
    const resetGlbRaceGrid = (): void => {
      if (!drive) return
      drive.reset(pose)
      glbRaceStartPose = pose.pos.clone()
      glbRaceDistance = 0
      glbRaceArmed = false
      glbPreviousGateCoordinate = 0
      glbFinishing = false
      glbResultVisible = false
      setObjectOnGroundHeading(car.group, pose.pos, pose.heading, pose.normal)
      setObjectOnGroundHeading(firstPersonRig, pose.pos, pose.heading, pose.normal)
      applyCameraModeVisibility()
      glbOpponentStates = createGlbGridOpponentStates(gridPlacements, ground)
      glbOpponentStateById = new Map(
        gridPlacements
          .filter((placement) => placement.id !== 'player')
          .map((placement, index) => [placement.id, glbOpponentStates[index]]),
      )
      glbOpponentCars?.update(glbOpponentStates)
      telemetryMap?.resetTrail()
      bundle.updateShadowFollow(pose.pos)
      updateGlbThirdPersonCamera(bundle.camera, pose.pos, pose.heading, pose.normal, glbCameraTuning)
    }
    const clearGlbCountdown = (): void => {
      if (countdown) {
        countdown.destroy()
        countdown = null
      }
    }
    const startGlbCountdown = (): void => {
      if (!drive) return
      clearGlbCountdown()
      hideStatus()
      hud.show()
      hud.update({ speedKmh: 0, lapMs: 0, mode: 'keyboard' })
      started = false
      countdownActive = true
      // Countdown is a presentation phase. Temporarily use the low-cost
      // render path so the overlay and light sequence stay responsive on
      // large GLB scenes; the selected quality returns at lights-out.
      bundle.setPerformanceMode(true)
      const silentCountdownRig = {
        group: new THREE.Group(),
        setLitCount: (_n: number): void => { /* screen-only countdown */ },
        setAllOff: (): void => { /* screen-only countdown */ },
        dispose: (): void => { /* screen-only countdown */ },
      }
      countdownOverlay.flash('READY', '#ffffff', 650)
      countdown = createCountdown(
        silentCountdownRig,
        (n) => {
          SFX.countdownBeep()
          if (navigator.vibrate) navigator.vibrate(60 + n * 20)
          countdownOverlay.flash(`${6 - n}`, '#ff3b30', 430)
        },
        () => {
          SFX.lightsOut()
          if (navigator.vibrate) navigator.vibrate([0, 200, 50, 100, 30, 150])
          countdownActive = false
          started = true
          bundle.setPerformanceMode(storage.getPerformanceMode())
          glbRaceStartTime = performance.now()
          glbRaceDistance = 0
          glbRaceArmed = false
          glbPreviousGateCoordinate = 0
          glbFinishing = false
          glbResultVisible = false
          countdownOverlay.flash('GO!', '#00d2be', 820)
          input?.recenter()
          showToast('比赛开始', 1000)
        },
        () => {
          SFX.jumpStart()
          countdownActive = false
          started = false
          countdownOverlay.flash('抢跑', '#ff1801', 900)
          showToast('抢跑，重新倒计时', 1200)
          if (countdown) {
            countdown.destroy()
            countdown = null
          }
          window.setTimeout(() => {
            if (gridPlacementGuiActive || carVisualTuningGuiActive || cameraTuningGuiActive || firstPersonGuiActive || objectDeletionGuiActive || started) return
            startGlbCountdown()
          }, 900)
        },
      )
    }
    finishGlbRace = (): void => {
      if (!drive || glbFinishing || glbResultVisible) return
      glbFinishing = true
      started = false
      countdownActive = false
      hud.hide()
      const lapMs = Math.max(0, performance.now() - glbRaceStartTime)
      const topSpeedKmh = drive.state.topSpeed * 3.6
      countdownOverlay.flash('FINISH!', '#00d2be', 1400)
      showToast('冲线完成，正在生成比赛结果', 1800)
      const telemetry = {
        bestLapMs: lapMs,
        topSpeedKmh,
        wallHits: drive.state.onRoad ? 0 : 1,
        carHits: 0,
        finalPosition: 1,
        fieldSize: Math.max(1, glbOpponentStates.length + 1),
      }
      const stats: Partial<PlayerStats> = {
        pace: Math.round(Math.min(100, Math.max(0, (topSpeedKmh - 100) * 0.45 + (Math.max(0, 110 - lapMs / 1000) * 0.5)))),
        consistency: drive.state.onRoad ? 82 : 58,
        clean: drive.state.onRoad ? 92 : 65,
        cornering: 70,
        braking: 68,
        racingLine: drive.state.onRoad ? 82 : 58,
        attack: 76,
        defense: 62,
        risk: Math.round(Math.min(100, Math.max(20, topSpeedKmh * 0.22))),
        comeback: 62,
        pressure: 72,
        management: drive.state.onRoad ? 80 : 58,
      }
      void (async () => {
        await transitionVideo.play()
        await personalityCard.show(stats, telemetry)
        if (glbResultVisible) return
        glbResultVisible = true
        result.show({
          lapMs,
          topSpeedKmh,
          crashes: telemetry.wallHits,
          opponentHits: telemetry.carHits,
          position: telemetry.finalPosition,
          fieldSize: telemetry.fieldSize,
          isPB: false,
          onRestart: () => {
            result.hide()
            glbResultVisible = false
            resetGlbRaceGrid()
            startGlbCountdown()
          },
          onMenu: () => {
            result.hide()
            glbResultVisible = false
            resetGlbRaceGrid()
            showGlbStartMenu()
          },
        })
      })()
    }
    updateGlbRaceProgress = (dt: number): void => {
      if (!drive || !glbRaceStartPose) return
      glbRaceDistance += drive.state.speed * dt
      const dx = drive.state.pos.x - glbRaceStartPose.x
      const dz = drive.state.pos.z - glbRaceStartPose.z
      const forwardX = Math.sin(drive.state.heading)
      const forwardZ = Math.cos(drive.state.heading)
      const gateCoordinate = dx * forwardX + dz * forwardZ
      const lateralCoordinate = Math.abs(dx * forwardZ - dz * forwardX)
      if (!glbRaceArmed && glbRaceDistance >= 35) glbRaceArmed = true
      const crossedGate = glbRaceArmed
        && glbPreviousGateCoordinate < -1
        && gateCoordinate >= 0
        && lateralCoordinate <= 12
      const returnedToFinishArea = glbRaceArmed
        && glbRaceDistance >= 1000
        && Math.hypot(dx, dz) <= 22
      glbPreviousGateCoordinate = gateCoordinate
      if (crossedGate || returnedToFinishArea) finishGlbRace()
    }
    const showGlbStartMenu = (): void => {
      hideStatus()
      hud.hide()
      menu.show((cfg) => {
        menu.hide()
        startGlbAudio()
        void (async () => {
          await transitionVideo.play()
          cameraMode = cfg.cameraMode
          applyCameraModeVisibility()
          bundle.setPerformanceMode(cfg.performanceMode)
          storage.setPerformanceMode(cfg.performanceMode)
          resetGlbRaceGrid()
          try {
            const [controller] = await Promise.all([
              initInput(cfg.inputMode),
              firstPersonCockpit.ready.catch((e) => {
                console.warn('[F1S] first person cockpit failed:', e)
              }),
            ])
            input?.destroy()
            input = controller
            startGlbCountdown()
          } catch (e) {
            console.warn('[F1S] GLB input init failed:', e)
            const controller = await initInput('keyboard')
            input?.destroy()
            input = controller
            startGlbCountdown()
          }
        })()
      })
    }
    const applyGridPlacementToWorld = (placement: GlbGridPlacement): void => {
      const nextPose = glbDrivePoseFromPlacement(placement, ground)
      if (placement.id === 'player') {
        drive?.reset(nextPose)
        setObjectOnGroundHeading(car.group, nextPose.pos, nextPose.heading, nextPose.normal)
        setObjectOnGroundHeading(firstPersonRig, nextPose.pos, nextPose.heading, nextPose.normal)
        applyCameraModeVisibility()
        bundle.updateShadowFollow(nextPose.pos)
        return
      }
      const opp = glbOpponentStateById.get(placement.id)
      if (!opp) return
      opp.pos.copy(nextPose.pos)
      opp.heading = nextPose.heading
      opp.speed = 0
      opp.lap = 0
      opp.t = 0
      glbOpponentCars?.update(glbOpponentStates)
    }
    glbOpponentStates = createGlbGridOpponentStates(gridPlacements, ground)
    glbOpponentStateById = new Map(
      gridPlacements
        .filter((placement) => placement.id !== 'player')
        .map((placement, index) => [placement.id, glbOpponentStates[index]]),
    )
    glbOpponentCars = createOpponentCars(glbOpponentStates, {
      targetLengthM: GLB_PLAYER_TARGET_LENGTH_M,
      groundSinkM: GLB_VISUAL_GROUND_SINK,
    })
    glbOpponentCars.update(glbOpponentStates)
    bundle.scene.add(glbOpponentCars.group)
    const applySavedCarVisualTuning = (): void => {
      applyCarVisualTuning(readSavedCarVisualTuning(CAR_VISUAL_TUNING_STORAGE_KEY), {
        playerGroup: car.group,
        playerBaseScale: carBaseScale,
        opponentRoot: glbOpponentCars?.group ?? null,
      })
    }
    applySavedCarVisualTuning()
    telemetryMap = createTelemetryMap(createGlbTelemetryRouteMap(lowPolyShanghai))
    telemetryMap.resetTrail()
    telemetryMap.show()
    updateGlbThirdPersonCamera(bundle.camera, drive.state.pos, drive.state.heading, drive.state.normal, glbCameraTuning)
    await glbOpponentCars.ready
    applySavedCarVisualTuning()
    glbOpponentCars.update(glbOpponentStates)
    input = await initInput('keyboard')
    try {
      audio = await createAudioRig()
      audio.setBgmVolume(0.55)
    } catch (e) {
      console.warn('[F1S] GLB audio rig init failed:', e)
    }
    if (gridPlacementGuiRequested || carVisualTuningGuiRequested || cameraTuningGuiRequested || firstPersonGuiRequested || objectDeletionGuiRequested) {
      started = false
      hideStatus()
      hud.show()
    }
    if (firstPersonGuiRequested) {
      cameraMode = 'first'
      firstPersonGuiActive = true
      started = false
      clearGlbCountdown()
      resetGlbRaceGrid()
      applyCameraModeVisibility()
      await firstPersonCockpit.ready.catch((e) => {
        console.warn('[F1S] first person cockpit failed:', e)
      })
      updateGlbFirstPersonCamera(bundle.camera, drive.state.pos, drive.state.heading, drive.state.normal, firstPersonCockpit)
      showToast('第一视角调参已打开', 1800)
    }
    if (gridPlacementGuiRequested) {
      gridPlacementGuiActive = true
      installGlbGridPlacementGui({
        scene: bundle.scene,
        camera: bundle.camera,
        renderer: bundle.renderer,
        ground,
        placements: gridPlacements,
        defaultPlacements: DEFAULT_GLB_GRID_PLACEMENTS,
        storageKey: GLB_GRID_STORAGE_KEY,
        onPlacementChange: applyGridPlacementToWorld,
        onStartDriving: () => {
          gridPlacementGuiActive = false
          started = !carVisualTuningGuiActive
          startGlbAudio()
          showToast('已进入驾驶预览', 1400)
        },
      })
      showToast('发车格编辑器已打开', 1800)
    }
    if (carVisualTuningGuiRequested) {
      carVisualTuningGuiActive = true
      installCarVisualTuningGui({
        camera: bundle.camera,
        playerGroup: car.group,
        playerBaseScale: carBaseScale,
        opponentRoot: glbOpponentCars?.group ?? null,
        storageKey: CAR_VISUAL_TUNING_STORAGE_KEY,
        onClose: () => {
          carVisualTuningGuiActive = false
          started = !gridPlacementGuiActive
          startGlbAudio()
          showToast('已进入驾驶预览', 1400)
        },
      })
      showToast('赛车尺寸调参已打开', 1800)
    }
    if (cameraTuningGuiRequested) {
      cameraTuningGuiActive = true
      installGlbCameraTuningGui({
        tuning: glbCameraTuning,
        defaults: DEFAULT_GLB_CAMERA_TUNING,
        storageKey: GLB_CAMERA_TUNING_STORAGE_KEY,
        onChange: (next) => {
          glbCameraTuning = next
          if (drive) updateGlbThirdPersonCamera(bundle.camera, drive.state.pos, drive.state.heading, drive.state.normal, glbCameraTuning)
        },
        onClose: () => {
          cameraTuningGuiActive = false
          started = !gridPlacementGuiActive && !carVisualTuningGuiActive
          startGlbAudio()
          showToast('已进入驾驶预览', 1400)
        },
      })
      showToast('相机调参已打开', 1800)
    }
    if (objectDeletionGuiRequested) {
      objectDeletionGuiActive = true
      telemetryMap?.hide()
      hud.hide()
      installGlbObjectDeletionGui({
        root: lowPolyShanghai.group,
        camera: bundle.camera,
        renderer: bundle.renderer,
        storageKey: GLB_SIGN_DELETIONS_STORAGE_KEY,
        onClose: () => {
          objectDeletionGuiActive = false
          telemetryMap?.show()
          resetGlbRaceGrid()
          showGlbStartMenu()
        },
      })
      showToast('场景物体删除 GUI 已打开', 1800)
    }
    if (!gridPlacementGuiRequested && !carVisualTuningGuiRequested && !cameraTuningGuiRequested && !firstPersonGuiRequested && !objectDeletionGuiRequested) {
      started = false
      showGlbStartMenu()
      showToast('第三视角 GLB 主游戏已就绪', 1600)
    }
  }).catch((e) => {
    console.warn('[F1S] GLB version failed:', e)
    setStatus(`上海赛车场 GLB 主游戏\n加载失败: ${e instanceof Error ? e.message : String(e)}`)
  })
}

interface World {
  bundle: ReturnType<typeof createScene>
  track: TrackBundle
  car: CarBundle
  physics: PhysicsBundle
  input: InputController | null
  lightsRig: ReturnType<typeof createLightsRig> | null
  countdown: ReturnType<typeof createCountdown> | null
  audio: AudioRig | null
  commentary: CommentarySystem
  coach: CoachSystem
  raceStart: number
  shakeT: number
  shakeMag: number
  jumpStartPenaltyMs: number
  opponents: OpponentState[]
  opponentCars: OpponentCarBundle | null
  /** Per-opponent debounce: seconds left before another bump can register. */
  opponentBumpCooldown: number[]
  /** Per-opponent: have they already finished the lap? Used so the win check
   *  doesn't fire repeatedly on the same AI after they cross the line. */
  opponentFinished: boolean[]
  /** Timestamp (performance.now()) at which the last AI crossed the line.
   *  Used to give the player a grace period to also cross so the FINISH
   *  cinematic features the player's car, not the AI that just finished.
   *  0 = AIs are still racing. */
  allAisFinishedAt: number
  finishedOrder: Array<'player' | number>
  performanceMode: boolean
}

function bootstrap(): void {
  installGlobalErrorHandlers()

  const container = document.getElementById('app')
  if (!container) {
    console.warn('[F1S] #app missing')
    return
  }

  let bundle: ReturnType<typeof createScene>
  const initialPerformanceMode = storage.getPerformanceMode()
  try {
    bundle = createScene(container, { performanceMode: initialPerformanceMode })
  } catch (e) {
    console.warn('[F1S] scene init failed:', e)
    const detail =
      e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  width:100%;height:100%;color:#fff;font-size:14px;text-align:center;padding:24px;gap:12px;">
        <div style="font-size:18px;font-weight:700;">无法初始化 3D 引擎</div>
        <div style="color:#aaa;max-width:80%;word-break:break-word;">${detail}</div>
        <div style="color:#888;font-size:12px;margin-top:12px;">
          建议:用 <b>Chrome / Safari</b> 通过 <code>npm run dev</code> 或本地 http 打开,<br/>
          某些浏览器禁止 file:// 加载 WebGL。
        </div>
      </div>`
    return
  }

  // Build static world (track + car) once.
  const track = createTrack()
  bundle.scene.add(track.group)
  const car = createCar()
  bundle.scene.add(car.group)
  bundle.scene.add(car.particles)
  const physics = createPhysics(track)

  // Pick a random weather/time-of-day preset for this session and tint
  // sky / sun / hemi / clouds / haze accordingly.
  const weather = pickRandomWeather()
  bundle.applyWeather(weather)
  track.applyWeather(weather)
  console.log('[F1S] weather:', weather.id)
  setTimeout(() => showToast(`今日天气:${weather.label}`, 2400), 200)

  const world: World = {
    bundle,
    track,
    car,
    physics,
    input: null,
    lightsRig: null,
    countdown: null,
    audio: null,
    commentary: new CommentarySystem({ volume: 0.9 }),
    coach: new CoachSystem(track, { volume: 0.95 }),
    raceStart: 0,
    shakeT: 0,
    shakeMag: 0,
    jumpStartPenaltyMs: 0,
    opponents: [],
    opponentCars: null,
    opponentBumpCooldown: [],
    opponentFinished: [],
    allAisFinishedAt: 0,
    finishedOrder: [],
    performanceMode: initialPerformanceMode,
  }

  // --- Commentary: preload clips eagerly, unlock on first user gesture.
  void world.commentary.preload()
  const unlockCommentary = (): void => world.commentary.unlock()
  window.addEventListener('pointerdown', unlockCommentary, { once: true })
  window.addEventListener('keydown', unlockCommentary, { once: true })
  window.addEventListener('touchstart', unlockCommentary, { once: true })

  // --- Corner detector. Samples the curve's tangent at the player's
  // projected t and t+ε to estimate local curvature κ ≈ Δheading / Δs;
  // a state machine fires first_corner / clean_corner / wide_corner.
  const CORNER_KAPPA_ENTER = 0.005 // ~R 200 m: anything tighter counts as cornering
  const CORNER_KAPPA_EXIT = 0.0025
  const CORNER_LOOKAHEAD = 12 // metres
  const cornerState = {
    inCorner: false,
    firstCornerPlayed: false,
    crashedThisCorner: false,
    wideThisCorner: false,
  }
  const sampleCurvature = (t: number): number => {
    const tg1 = track.getTangentAt(((t % 1) + 1) % 1)
    const ds = CORNER_LOOKAHEAD / track.length
    const tg2 = track.getTangentAt((((t + ds) % 1) + 1) % 1)
    const dot = Math.max(-1, Math.min(1, tg1.x * tg2.x + tg1.z * tg2.z))
    const ang = Math.acos(dot)
    return ang / CORNER_LOOKAHEAD
  }
  const updateCorner = (
    t: number,
    offset: number,
    crashed: boolean,
  ): void => {
    const kappa = sampleCurvature(t)
    if (!cornerState.inCorner) {
      if (kappa > CORNER_KAPPA_ENTER) {
        cornerState.inCorner = true
        cornerState.crashedThisCorner = crashed
        cornerState.wideThisCorner = false
        if (!cornerState.firstCornerPlayed) {
          world.commentary.trigger('first_corner', true)
          cornerState.firstCornerPlayed = true
        }
      }
    } else {
      // While in the corner, watch for "running wide" or a crash.
      if (offset > 7.0) cornerState.wideThisCorner = true
      if (crashed) cornerState.crashedThisCorner = true
      if (kappa < CORNER_KAPPA_EXIT) {
        // Corner exit — emit one of two outcome clips.
        if (cornerState.wideThisCorner) {
          world.commentary.trigger('wide_corner')
        } else if (!cornerState.crashedThisCorner) {
          world.commentary.trigger('clean_corner')
        }
        cornerState.inCorner = false
        cornerState.crashedThisCorner = false
        cornerState.wideThisCorner = false
      }
    }
  }
  const resetCornerState = (): void => {
    cornerState.inCorner = false
    cornerState.firstCornerPlayed = false
    cornerState.crashedThisCorner = false
    cornerState.wideThisCorner = false
  }

  const ctx = createInitialContext()
  const sm = new StateMachine(ctx)
  const menu = createMenu()
  const hud = createHud()
  const transitionVideo = createTransitionVideo('video/beginning.mp4')
  hud.show() // visible from boot (kept on through MENU/RACE; only RESULT hides it)
  hud.update({ speedKmh: 0, lapMs: 0, mode: 'keyboard' })
  const result = createResult()
  const personalityCard = createPersonalityCard()
  const minimap = createMinimap(track)

  /** Heuristic mapper: turn the data we actually collect during a race
   *  into a 12-dimension PlayerStats input the personality matcher
   *  understands. Missing dimensions stay near 50 (neutral). */
  const buildPlayerStats = (): Partial<PlayerStats> => {
    const fieldSize = world.opponents.length + 1
    const pos = ctx.raceData.finalPosition || fieldSize
    const positionScore = ((fieldSize - pos) / Math.max(1, fieldSize - 1)) * 100
    const wallHits = ctx.raceData.crashes
    const carHits = ctx.raceData.opponentHits
    const totalHits = wallHits + carHits
    // Top speed → 0..100. 200 km/h ≈ 30, 300 km/h ≈ 90, 320 km/h ≈ 100.
    const topSpeedScore = Math.max(0, Math.min(100, (ctx.raceData.topSpeed - 180) * 0.7))
    // Lap time → reference 80 s; 70 s = 100, 95 s = 0.
    const lapSec = (ctx.raceData.bestLap ?? 0) / 1000
    let lapScore = 50
    if (lapSec > 0) lapScore = Math.max(0, Math.min(100, (95 - lapSec) * 4))
    const cleanScore = Math.max(0, 100 - wallHits * 14 - carHits * 8)
    return {
      pace: Math.round(topSpeedScore * 0.55 + lapScore * 0.45),
      consistency: Math.round(70 - totalHits * 4),
      clean: Math.round(cleanScore),
      cornering: Math.round(50 + topSpeedScore * 0.3 + (positionScore - 50) * 0.3),
      braking: Math.round(50 + (cleanScore - 50) * 0.4 + (positionScore - 50) * 0.2),
      racingLine: Math.round(50 + (cleanScore - 50) * 0.5 + (lapScore - 50) * 0.2),
      attack: Math.round(40 + (positionScore - 50) * 0.6 + carHits * 6),
      defense: Math.round(50 + (positionScore - 50) * 0.4 - carHits * 5),
      // Risk = how aggressive: collisions + speed willingness.
      risk: Math.round(30 + carHits * 12 + wallHits * 6 + topSpeedScore * 0.15),
      // Comeback only meaningful if we know start vs finish; we don't,
      // proxy with how much above mid-pack the player ended.
      comeback: Math.round(40 + (positionScore - 50) * 0.5),
      pressure: Math.round(50 + (lapScore - 50) * 0.4 + (positionScore - 50) * 0.3),
      management: Math.round(50 + (cleanScore - 50) * 0.3 + (positionScore - 50) * 0.3),
    }
  }


  // Helper: position car/camera at start.
  const placeCarAtStart = (): void => {
    physics.reset(track)
    car.group.position.copy(physics.state.pos)
    car.group.rotation.y = physics.state.heading
  }

  // Helper: tear down any existing opponent rig (cars + state).
  const teardownOpponents = (): void => {
    if (world.opponentCars) {
      bundle.scene.remove(world.opponentCars.group)
      world.opponentCars.dispose()
      world.opponentCars = null
    }
    world.opponents = []
    world.opponentBumpCooldown = []
    world.opponentFinished = []
    world.allAisFinishedAt = 0
    world.finishedOrder = []
  }

  // Helper: build AIs at the chosen difficulty and add them to the scene.
  const spawnOpponents = async (): Promise<void> => {
    teardownOpponents()
    world.opponents = createOpponents(track, ctx.difficulty)
    const opponentCars = createOpponentCars(world.opponents)
    world.opponentCars = opponentCars
    opponentCars.update(world.opponents)
    showToast('赛车模型加载中...', 1200)
    await opponentCars.ready
    if (world.opponentCars !== opponentCars) return
    bundle.scene.add(opponentCars.group)
    opponentCars.update(world.opponents)
    world.opponentBumpCooldown = world.opponents.map(() => 0)
    world.opponentFinished = world.opponents.map(() => false)
    world.allAisFinishedAt = 0
    world.finishedOrder = []
  }

  /** Compute current ranking — total race progress (lap + t). */
  const computePosition = (): { position: number; fieldSize: number } => {
    const playerProg = physics.state.lapsCompleted + physics.state.lapProgress
    let ahead = 0
    for (const opp of world.opponents) {
      if (raceProgress(opp) > playerProg) ahead++
    }
    return {
      position: ahead + 1,
      fieldSize: world.opponents.length + 1,
    }
  }

  // Press M to toggle overview camera (top-down, full track visible).
  let overviewMode = false
  let accelLerp = 0 // 0 = normal cruise distance, 1 = close-in accelerating distance
  let savedFog: THREE.Fog | THREE.FogExp2 | null = null
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'm' || ev.key === 'M') {
      overviewMode = !overviewMode
      if (overviewMode) {
        savedFog = bundle.scene.fog
        bundle.scene.fog = null // fog would solid-color the whole bird's-eye view
        bundle.camera.fov = 50
      } else {
        bundle.scene.fog = savedFog
      }
    }
  })

  // Compute track bbox once (excluding the giant ground plane).
  const trackBbox = new THREE.Box3()
  // Sample the curve directly so the ground plane doesn't blow up the bbox.
  for (let i = 0; i < 200; i++) {
    trackBbox.expandByPoint(track.getPositionAt(i / 200))
  }

  const updateCamera = (): void => {
    if (overviewMode) {
      const size = trackBbox.getSize(new THREE.Vector3())
      const center = trackBbox.getCenter(new THREE.Vector3())
      const half = Math.max(size.x, size.z) * 0.65
      const dist = half / Math.tan(((bundle.camera.fov / 2) * Math.PI) / 180)
      bundle.camera.position.set(center.x, dist, center.z + 1)
      bundle.camera.lookAt(center.x, 0, center.z)
      bundle.camera.updateProjectionMatrix()
      return
    }

    const { pos, heading, speed } = physics.state
    // Camera rig: normal cruise sits 4.5 m back at 2.2 m height. While the
    // player is actively accelerating (throttle > cruise baseline), shrink
    // both to 1/3 so the car doesn't visibly run away forward.
    const inp = world.input?.getInput()
    const accelTarget = inp && inp.throttle > 0.7 ? 1 : 0
    accelLerp += (accelTarget - accelLerp) * 0.08 // smooth blend
    // Cruise / countdown sits 0.5 m farther back than the original camera.
    const backDist = 4.5 + accelLerp * (5.5 - 4.5)
    const upDist = 2.2

    const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
    const camPos = pos.clone().addScaledVector(back, backDist).add(new THREE.Vector3(0, upDist, 0))
    bundle.camera.position.lerp(camPos, 0.2)
    // Hard clamp: lerp lag at high speed would otherwise drag the camera
    // many metres beyond the intended `backDist`. Keep the horizontal
    // distance to the car at backDist max.
    const dx = bundle.camera.position.x - pos.x
    const dz = bundle.camera.position.z - pos.z
    const horiz = Math.sqrt(dx * dx + dz * dz)
    if (horiz > backDist) {
      const k = backDist / horiz
      bundle.camera.position.x = pos.x + dx * k
      bundle.camera.position.z = pos.z + dz * k
    }
    const look = pos.clone().addScaledVector(back.negate(), 6)
    look.y += 0.6
    bundle.camera.lookAt(look)
    const targetFov = 60 + (speed / PHYS_MAX_SPEED) * 20
    bundle.camera.fov += (targetFov - bundle.camera.fov) * 0.1
    if (world.shakeT > 0) {
      bundle.camera.position.x += (Math.random() - 0.5) * world.shakeMag
      bundle.camera.position.y += (Math.random() - 0.5) * world.shakeMag
      world.shakeT -= 1 / 60
      world.shakeMag *= 0.85
    }
    bundle.camera.updateProjectionMatrix()
  }

  const triggerShake = (mag: number, durationS: number): void => {
    world.shakeMag = mag
    world.shakeT = durationS
  }

  // ---------------- States ----------------
  sm.register(GameState.MENU, {
    enter: () => {
      // Tear down lights gantry from any previous race (built in COUNTDOWN
      // enter). Without this, repeated MENU↔RACE cycles stack copies in the
      // scene graph.
      if (world.lightsRig) {
        bundle.scene.remove(world.lightsRig.group)
        world.lightsRig.dispose()
        world.lightsRig = null
      }
      placeCarAtStart()
      // Showcase camera: orbit-style 3/4 view of the car at the start grid.
      const carP = car.group.position
      const tg = track.getTangentAt(0)
      const lat = new THREE.Vector3(-tg.z, 0, tg.x).normalize()
      const back = new THREE.Vector3(-tg.x, 0, -tg.z).normalize()
      bundle.camera.position
        .copy(carP)
        .addScaledVector(back, 6)
        .addScaledVector(lat, 4)
        .add(new THREE.Vector3(0, 3.5, 0))
      bundle.camera.lookAt(carP.x, carP.y + 0.6, carP.z)
      menu.show(async ({ difficulty, inputMode, performanceMode, commentaryMode }) => {
        ctx.difficulty = difficulty
        world.performanceMode = performanceMode
        storage.setPerformanceMode(performanceMode)
        bundle.setPerformanceMode(world.performanceMode)
        // Mutually exclusive: only one voice channel runs at a time so
        // they don't talk over each other.
        world.commentary.setEnabled(commentaryMode === 'commentary')
        world.coach.setEnabled(commentaryMode === 'coach')
        if (commentaryMode === 'coach') world.coach.unlock()
        SFX.uiClick()
        unlockAudio()
        await transitionVideo.play()
        // Boot the engine + BGM rig from inside the click handler so iOS
        // unlocks AudioContext on the same gesture.
        try {
          if (!world.audio) {
            world.audio = await createAudioRig()
            world.audio.start()
          }
        } catch (e) {
          console.warn('[F1S] audio rig init failed:', e)
        }
        try {
          world.input = await initInput(inputMode)
          ctx.inputMode = world.input.mode
          if (world.input.mode === 'keyboard') {
            showToast('键盘控制:↑/W 油门,↓/S 刹车,←→/A D 转向,Shift = DRS')
          } else if (world.input.mode === 'touch') {
            showToast('触屏模式:左右半屏转向 + 油门')
          } else if (world.input.mode === 'gyro') {
            if (world.input.gyroSource === 'mouse') {
              showToast('鼠标摇杆:鼠标偏屏幕中心 = 推摇杆。上=加速,下=刹车,左右=转向')
            } else {
              showToast('体感模式:左右倾 = 转向,前倾 = 加速,后倾 = 刹车')
            }
          }
          if (inputMode === 'gyro' && world.input.mode !== 'gyro') {
            showToast('体感不可用,已回退到默认控制')
          }
        } catch (e) {
          console.warn('[F1S] input init failed:', e)
          ctx.inputMode = 'touch'
        }
        // Skip SCAN/PICK_TEAM for MVP wiring; jump straight to countdown.
        // (Those are P1 prompts to land in the next pass.)
        ctx.playerData.team = ctx.playerData.team ?? storage.getTeam() ?? 'ferrari'
        car.setLivery(ctx.playerData.team)
        await sm.transition(GameState.SCAN)
      })
    },
    exit: () => menu.hide(),
  })

  sm.register(GameState.SCAN, {
    enter: async () => {
      // P1 placeholder: brief beat then advance.
      showToast('扫脸阶段(占位,P1 接入)')
      await new Promise<void>((res) => setTimeout(res, 600))
      await sm.transition(GameState.PICK_TEAM)
    },
  })

  sm.register(GameState.PICK_TEAM, {
    enter: async () => {
      // P1 placeholder: keep team from storage / default; ensure livery is applied.
      if (ctx.playerData.team) car.setLivery(ctx.playerData.team)
      await new Promise<void>((res) => setTimeout(res, 200))
      await sm.transition(GameState.COUNTDOWN)
    },
  })

  sm.register(GameState.COUNTDOWN, {
    enter: async () => {
      placeCarAtStart()
      await spawnOpponents()
      // Commentator kicks off the build-up.
      world.commentary.unlock()
      world.commentary.trigger('countdown', true)
      // First gyro recentre — captures the pose the player has settled into
      // as soon as the grid view is ready, BEFORE the lights start (so the
      // jump-start detector during lights doesn't trip on a stale baseline
      // from menu time).
      world.input?.recenter()
      // Snap camera to chase position (4 m back, 2.2 m up) so the
      // countdown view doesn't lerp in from the MENU 3/4 orbit shot.
      accelLerp = 0
      const carP = car.group.position
      const heading = physics.state.heading
      const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
      bundle.camera.position
        .copy(carP)
        .addScaledVector(back, 4.5)
        .add(new THREE.Vector3(0, 2.2, 0))
      const look = carP.clone().addScaledVector(back.negate(), 6)
      look.y += 0.6
      bundle.camera.lookAt(look)

      hud.show()
      hud.update({
        speedKmh: 0,
        lapMs: 0,
        mode: ctx.inputMode,
      })
      // Build lights gantry. Pole position (P1, Veteran) sits ahead
      // of t=0 — the lights stand a few metres further down so the pole
      // sitter looks UP at them, matching real F1 starting-lights
      // placement (≈10 m past the front-row grid box).
      const startPos = track.getPositionAt(0).clone()
      const tg = track.getTangentAt(0)
      const yaw = Math.atan2(tg.x, tg.z)
      const POLE_M = (PLAYER_GRID_SLOT - 1) * GRID_SLOT_M
      const LIGHTS_AHEAD_OF_POLE_M = 10
      startPos.addScaledVector(
        new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
        POLE_M + LIGHTS_AHEAD_OF_POLE_M,
      )
      world.lightsRig = createLightsRig(startPos, yaw)
      bundle.scene.add(world.lightsRig.group)

      world.countdown = createCountdown(
        world.lightsRig,
        (n) => {
          SFX.countdownBeep()
          if (navigator.vibrate) navigator.vibrate(60 + n * 20)
          // n is the LAMP count going UP (1→5). Display as a real countdown
          // (5→1) so the player sees a traditional pre-race countdown.
          hud.flash(`${6 - n}`, '#ff3b30', 400)
        },
        () => {
          SFX.lightsOut()
          // engineStart ZzFX removed — real engine sample handles startup
          if (navigator.vibrate) navigator.vibrate([0, 200, 50, 100, 30, 150])
          triggerShake(0.4, 0.4)
          hud.flash('GO!', '#00d2be', 800)
          world.raceStart = performance.now() + world.jumpStartPenaltyMs
          // Re-zero gyro at the lights-out moment: by now the player is
          // gripping the phone in their race posture (the auto-calibration
          // 1 s after createGyro() may have caught the menu pose, e.g.
          // phone tilted while reading the screen / tapping permission).
          // Recentring here gives a clean baseline for the actual race.
          world.input?.recenter()
          void sm.transition(GameState.RACE)
        },
        () => {
          // Jump start
          SFX.jumpStart()
          hud.flash('JUMP START -2.0s', '#ff1801', 1200)
          world.jumpStartPenaltyMs += 2000
          // Restart countdown sequence by recreating it
          if (world.lightsRig) world.lightsRig.setLitCount(0)
          // simple restart: discard current countdown; new one created on next tick
          if (world.countdown) world.countdown.destroy()
          world.countdown = null
          setTimeout(() => {
            if (sm.context().state !== GameState.COUNTDOWN) return
            if (!world.lightsRig) return
            world.countdown = createCountdown(
              world.lightsRig,
              (n) => SFX.countdownBeep() ?? hud.flash(`${6 - n}`, '#ff3b30', 400),
              () => {
                SFX.lightsOut()
                triggerShake(0.4, 0.4)
                hud.flash('GO!', '#00d2be', 800)
                world.raceStart = performance.now() + world.jumpStartPenaltyMs
                world.input?.recenter()
                void sm.transition(GameState.RACE)
              },
              () => {
                /* nested jump-start ignored for MVP */
              },
            )
          }, 800)
        },
      )
    },
    update: (_, dt) => {
      world.countdown?.update(dt)
      if (world.input) {
        const inp = world.input.getInput()
        world.countdown?.setThrottlePressed(inp.throttle > 0.7 || inp.drs)
      }
      updateCamera()
    },
    exit: () => {
      // Lights rig stays visible briefly; remove on RACE entry instead.
    },
  })

  sm.register(GameState.RACE, {
    enter: () => {
      // Lights gantry stays in the world after lights-out — real F1 leaves
      // the structure standing for the whole race. Only ensure the lamps
      // are off (countdown's done-phase already calls setAllOff, but be
      // defensive in case of a state-machine restart).
      world.lightsRig?.setAllOff()
      ctx.raceData.startTime = world.raceStart
      ctx.raceData.crashes = 0
      ctx.raceData.topSpeed = 0
      ctx.raceData.opponentHits = 0
      ctx.raceData.finalPosition = 0
      world.commentary.resetRace()
      world.coach.resetRace()
      minimap.show()
      world.commentary.unlock() // countdown click already happened
      world.commentary.trigger('race_start', true)
      resetCornerState()
    },
    update: (_, dt) => {
      if (!world.input) return
      const inp = world.input.getInput()
      const wasCrashed = physics.state.crashed
      physics.update(dt, inp, track)
      if (!wasCrashed && physics.state.crashed) {
        SFX.crash()
        triggerShake(0.6, 0.5)
        if (navigator.vibrate) navigator.vibrate(150)
        ctx.raceData.crashes++
        car.emitSparks(physics.state.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 32)
      }
      car.group.position.copy(physics.state.pos)
      car.group.rotation.y = physics.state.heading
      const speed01 = physics.state.speed / PHYS_MAX_SPEED
      car.update(dt, speed01)

      // --- Opponents: drive around the track and detect AI body bumps.
      const COLLIDE_DIST = 3.5 // metres: car length / 2 + buffer
      const COLLIDE_DIST_SQ = COLLIDE_DIST * COLLIDE_DIST
      const BUMP_COOLDOWN_S = 0.8
      const playerProgress = physics.state.lapsCompleted + physics.state.lapProgress
      for (let i = 0; i < world.opponents.length; i++) {
        const opp = world.opponents[i]
        // Stop AIs from running past the line indefinitely so the field
        // settles at the finish — they decelerate after their first lap.
        if (world.opponentFinished[i]) {
          opp.speed *= 0.97
          const tg = track.getTangentAt(opp.t)
          opp.pos.x += tg.x * opp.speed * dt
          opp.pos.z += tg.z * opp.speed * dt
        } else {
          updateOpponent(opp, dt, track, playerProgress)
          // Visual + audio feedback when an AI fumbles a corner.
          if (opp.mistakeJustTriggered) {
            SFX.crash()
            car.emitSparks(opp.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 16)
          }
          if (opp.lap >= 1) {
            world.opponentFinished[i] = true
            world.finishedOrder.push(i)
          }
        }
        // Physical body collision: separate cars every frame they overlap,
        // count it as one bump per cooldown window, slow both cars.
        if (world.opponentBumpCooldown[i] > 0) {
          world.opponentBumpCooldown[i] -= dt
        }
        const dx = physics.state.pos.x - opp.pos.x
        const dz = physics.state.pos.z - opp.pos.z
        const distSq = dx * dx + dz * dz
        if (distSq < COLLIDE_DIST_SQ && !physics.state.crashed) {
          const dist = Math.max(Math.sqrt(distSq), 0.01)
          const nx = dx / dist
          const nz = dz / dist

          // Hard separation — push player out so cars never interpenetrate.
          physics.state.pos.x = opp.pos.x + nx * COLLIDE_DIST
          physics.state.pos.z = opp.pos.z + nz * COLLIDE_DIST

          if (world.opponentBumpCooldown[i] <= 0) {
            ctx.raceData.opponentHits++
            world.opponentBumpCooldown[i] = BUMP_COOLDOWN_S
            SFX.crash()
            triggerShake(0.55, 0.45)
            if (navigator.vibrate) navigator.vibrate(120)
            car.emitSparks(
              physics.state.pos.clone().add(new THREE.Vector3(0, 0.3, 0)),
              28,
            )
            // Player loses momentum on contact.
            physics.state.speed *= 0.55
            // Bounce heading slightly away from contact normal.
            const fx = Math.sin(physics.state.heading)
            const fz = Math.cos(physics.state.heading)
            const cross = fx * nz - fz * nx
            physics.state.heading += Math.sign(cross) * 0.10
            // AI also takes a hit: brief slowdown + wobble.
            opp.speed *= 0.65
            if (opp.mistakeRemaining < 0.5) opp.mistakeRemaining = 0.5
          }
        }
      }
      if (world.opponentCars) world.opponentCars.update(world.opponents)

      // --- Commentary feed: build a snapshot for the auto-detector.
      const _rank = computePosition()
      const _proj = track.projectToTrack(physics.state.pos)
      updateCorner(_proj.t, _proj.offset, physics.state.crashed)
      const _now = performance.now()
      world.commentary.update({
        time: _now,
        raceState: 'running',
        speed: physics.state.speed,
        steeringAbs: Math.abs(inp.steer),
        trackOffset: _proj.offset,
        offTrack: physics.state.crashed,
        crashCount: ctx.raceData.crashes + ctx.raceData.opponentHits,
        lapProgress: physics.state.lapProgress,
        lapCount: physics.state.lapsCompleted,
        position: _rank.position,
        fieldSize: _rank.fieldSize,
      })
      world.coach.update({
        time: _now,
        raceState: 'running',
        speed: physics.state.speed,
        lapProgress: physics.state.lapProgress,
        offTrack: physics.state.crashed,
      })

      // --- Mini-map: 4 dots (player + 3 AI) on a tiny track silhouette.
      minimap.update({
        player: { x: physics.state.pos.x, z: physics.state.pos.z },
        opponents: world.opponents.map((opp) => ({
          x: opp.pos.x,
          z: opp.pos.z,
          color: opp.profile.color,
        })),
      })

      // HUD
      const lapMs = performance.now() - ctx.raceData.startTime
      const rank = computePosition()
      hud.update({
        speedKmh: physics.state.speed * 3.6,
        lapMs: Math.max(0, lapMs),
        mode: ctx.inputMode,
        gyroSource: world.input?.gyroSource ?? null,
        position: rank.position,
        fieldSize: rank.fieldSize,
      })
      ctx.raceData.topSpeed = physics.state.topSpeed * 3.6
      updateCamera()

      // Finish trigger:
      //   - Always wait for the PLAYER to cross the line first so the
      //     FINISH cinematic features the player's car, not whichever AI
      //     happened to cross last.
      //   - Soft fallback: if every AI has finished AND the player is
      //     still on track, give them an 8 s grace window to also cross.
      //     After that we force-finish (player = last) so a stuck player
      //     doesn't softlock the race.
      if (physics.state.lapsCompleted >= 1) {
        ctx.raceData.bestLap = lapMs
        ctx.raceData.finalPosition = rank.position
        void sm.transition(GameState.FINISH)
      } else {
        const allDone = world.opponentFinished.length > 0
          && world.opponentFinished.every((f) => f)
        if (allDone && world.allAisFinishedAt === 0) {
          world.allAisFinishedAt = performance.now()
        }
        if (allDone && performance.now() - world.allAisFinishedAt > 8000) {
          ctx.raceData.bestLap = lapMs
          ctx.raceData.finalPosition = world.opponents.length + 1
          void sm.transition(GameState.FINISH)
        }
      }
    },
  })

  sm.register(GameState.FINISH, {
    enter: async () => {
      SFX.finishHorn()
      world.commentary.trigger('finish_line', true)
      // Tail-end commentary depends on outcome (P1, podium, messy, etc.).
      world.commentary.triggerFinishOutcome({
        position: ctx.raceData.finalPosition || world.opponents.length + 1,
        fieldSize: world.opponents.length + 1,
        crashes: ctx.raceData.crashes + ctx.raceData.opponentHits,
      })
      triggerShake(0.3, 0.6)
      hud.flash('FINISH!', '#00d2be', 1200)
      await new Promise<void>((res) => setTimeout(res, 1500))
      await sm.transition(GameState.RESULT)
    },
    update: (_, dt) => {
      // Keep the car drifting forward visually
      physics.state.speed *= 0.97
      const tg = track.getTangentAt(physics.state.lapProgress)
      physics.state.pos.x += tg.x * physics.state.speed * dt
      physics.state.pos.z += tg.z * physics.state.speed * dt
      car.group.position.copy(physics.state.pos)
      const speed01 = physics.state.speed / PHYS_MAX_SPEED
      car.update(dt, speed01)
      // Coast opponent cars too so the field doesn't visibly freeze.
      for (let i = 0; i < world.opponents.length; i++) {
        const opp = world.opponents[i]
        if (world.opponentFinished[i]) {
          opp.speed *= 0.97
        } else {
          updateOpponent(opp, dt, track)
        }
        const tgo = track.getTangentAt(opp.t)
        opp.pos.x += tgo.x * opp.speed * dt * 0.2
        opp.pos.z += tgo.z * opp.speed * dt * 0.2
      }
      if (world.opponentCars) world.opponentCars.update(world.opponents)
      updateCamera()
    },
  })

  sm.register(GameState.RESULT, {
    enter: async () => {
      hud.hide()
      minimap.hide()
      // Reveal the MBTI-style racer-personality card first, then fall
      // through to the regular result panel.
      await transitionVideo.play()
      await personalityCard.show(buildPlayerStats(), {
        bestLapMs: ctx.raceData.bestLap ?? 0,
        topSpeedKmh: ctx.raceData.topSpeed,
        wallHits: ctx.raceData.crashes,
        carHits: ctx.raceData.opponentHits,
        finalPosition: ctx.raceData.finalPosition || (world.opponents.length + 1),
        fieldSize: world.opponents.length + 1,
      })
      const lap = ctx.raceData.bestLap ?? 0
      const prev = storage.getBestLap()
      // Only count it as a PB if the player actually won the race.
      const wonRace = ctx.raceData.finalPosition === 1
      const isPB = wonRace && (prev === null || lap < prev)
      if (isPB && lap > 0) storage.setBestLap(lap)
      storage.incRuns()
      if (ctx.playerData.team) storage.setTeam(ctx.playerData.team)
      result.show({
        lapMs: lap,
        topSpeedKmh: ctx.raceData.topSpeed,
        crashes: ctx.raceData.crashes,
        opponentHits: ctx.raceData.opponentHits,
        position: ctx.raceData.finalPosition || world.opponents.length + 1,
        fieldSize: world.opponents.length + 1,
        isPB,
        onRestart: () => {
          result.hide()
          world.jumpStartPenaltyMs = 0
          void sm.transition(GameState.COUNTDOWN)
        },
        onMenu: () => {
          result.hide()
          world.jumpStartPenaltyMs = 0
          ctx.raceData.bestLap = null
          teardownOpponents()
          void sm.transition(GameState.MENU)
        },
      })
    },
    exit: () => result.hide(),
  })

  // ---------------- Loop ----------------
  const loop = new GameLoop((dt) => {
    sm.update(dt)
    track.updateAtmosphere(dt)
    bundle.updateShadowFollow(physics.state.pos)
    if (world.audio) {
      const inp = world.input?.getInput()
      const throttle = inp?.throttle ?? 0
      const speed01 = physics.state.speed / PHYS_MAX_SPEED
      world.audio.setEngine(throttle, speed01)
    }
    bundle.render()
  })
  loop.start()

  void sm.transition(GameState.MENU)
}

if (document.readyState === 'loading') {
  installF1tiApi()
  document.addEventListener('DOMContentLoaded', bootApp, { once: true })
} else {
  installF1tiApi()
  bootApp()
}
