import type { TeamId } from '../utils/storage'
import ferrariUrl from '../assets/已压缩车模型/2022_ferrari_f1-75 (1)-optimized 2.glb?url'
import mercedesUrl from '../assets/已压缩车模型/amg_f1_w15_2024__www.vecarz.com-optimized 2.glb?url'
import redbullUrl from '../assets/models/RB19_REDBULL.opt.glb?url'
import fomCreatorUrl from '../assets/FOM赛车涂装贴花可复用包-v54/f1_2026_fom-nyu-purple-color-only.glb?url'

export type PlayerCarId =
  | 'audi'
  | 'redbull'
  | 'ferrari'
  | 'mercedes'
  | 'creator'
  | 'creator-special'
export type PlayerCarWheelStrategy =
  | 'redbull-github-v1'
  | 'ferrari-f1-75-named-v1'
  | 'mercedes-w15-compressed-v1'
  | 'fom-2026-material-v1'
  | 'pending'
export type PlayerCarLivery = 'model' | 'fom-special'

export interface PlayerCarDefinition {
  id: PlayerCarId
  name: string
  team: string
  model: string
  url: string
  reverse: boolean
  teamId: TeamId
  accent: string
  wheelStrategy: PlayerCarWheelStrategy
  livery?: PlayerCarLivery
}

export const PLAYER_CARS: readonly PlayerCarDefinition[] = [
  {
    id: 'audi',
    name: 'Audi DIY',
    team: 'F1 2026 Custom Works',
    model: 'FOM 白车 · 痛车专用',
    url: fomCreatorUrl,
    reverse: false,
    teamId: 'merc',
    accent: '#d41222',
    wheelStrategy: 'fom-2026-material-v1',
  },
  {
    id: 'redbull',
    name: 'Red Bull Racing',
    team: 'Oracle Red Bull Racing',
    model: 'RB19',
    url: redbullUrl,
    reverse: false,
    teamId: 'redbull',
    accent: '#3158ff',
    wheelStrategy: 'redbull-github-v1',
  },
  {
    id: 'ferrari',
    name: 'Scuderia Ferrari',
    team: 'Scuderia Ferrari',
    model: 'F1-75',
    url: ferrariUrl,
    reverse: false,
    teamId: 'ferrari',
    accent: '#e3202f',
    wheelStrategy: 'ferrari-f1-75-named-v1',
  },
  {
    id: 'mercedes',
    name: 'Mercedes-AMG',
    team: 'Mercedes-AMG Petronas',
    model: 'W15',
    url: mercedesUrl,
    reverse: true,
    teamId: 'merc',
    accent: '#00a99d',
    wheelStrategy: 'mercedes-w15-compressed-v1',
  },
  {
    id: 'creator',
    name: '创变者',
    team: 'FOM 创变者赛车',
    model: 'FOM 2026',
    url: fomCreatorUrl,
    reverse: false,
    teamId: 'ferrari',
    accent: '#57068c',
    wheelStrategy: 'fom-2026-material-v1',
  },
  {
    id: 'creator-special',
    name: '抖音AI创变者计划2026特涂',
    team: '抖音 AI 创变者计划',
    model: 'FOM 2026 特涂',
    url: fomCreatorUrl,
    reverse: false,
    teamId: 'ferrari',
    accent: '#57068c',
    wheelStrategy: 'fom-2026-material-v1',
    livery: 'fom-special',
  },
] as const

const STORAGE_KEY = 'f1s_selected_player_car_v1'
const CHANGE_EVENT = 'f1s-player-car-change'

export function playerCarById(id: PlayerCarId): PlayerCarDefinition {
  return PLAYER_CARS.find((car) => car.id === id) ?? PLAYER_CARS[0]
}

export function wheelStrategyForPlayerCar(
  id: PlayerCarId,
): PlayerCarWheelStrategy {
  const definition = playerCarById(id)
  // Every paint/livery entry based on this exact FOM GLB must inherit the
  // single geometry-verified wheel profile. Do not duplicate or recalibrate
  // wheel logic per livery.
  if (definition.url === fomCreatorUrl) return 'fom-2026-material-v1'
  return definition.wheelStrategy
}

export function readSelectedPlayerCar(): PlayerCarId {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return PLAYER_CARS.some((car) => car.id === value) ? value as PlayerCarId : 'redbull'
  } catch {
    return 'redbull'
  }
}

export function selectPlayerCar(id: PlayerCarId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* Selection still applies for this page through the event below. */
  }
  window.dispatchEvent(new CustomEvent<PlayerCarId>(CHANGE_EVENT, { detail: id }))
}

export function onPlayerCarChange(listener: (id: PlayerCarId) => void): () => void {
  const handler = (event: Event): void => {
    listener((event as CustomEvent<PlayerCarId>).detail)
  }
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}
