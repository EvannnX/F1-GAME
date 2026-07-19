import type { TeamId } from '../utils/storage'
import ferrariUrl from '../assets/models/Ferrari_26.opt.glb?url'
import mclarenUrl from '../assets/models/McLaren_MCL35M.opt.glb?url'
import mercedesUrl from '../assets/models/Mercedes_W13.glb?url'
import redbullUrl from '../assets/models/RB19_REDBULL.opt.glb?url'

export type PlayerCarId = 'redbull' | 'ferrari' | 'mclaren' | 'mercedes'
export type PlayerCarWheelStrategy = 'redbull-github-v1' | 'pending'

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
}

export const PLAYER_CARS: readonly PlayerCarDefinition[] = [
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
    model: 'SF-26',
    url: ferrariUrl,
    reverse: true,
    teamId: 'ferrari',
    accent: '#e3202f',
    wheelStrategy: 'pending',
  },
  {
    id: 'mclaren',
    name: 'McLaren Racing',
    team: 'McLaren Formula 1 Team',
    model: 'MCL35M',
    url: mclarenUrl,
    reverse: false,
    teamId: 'mclaren',
    accent: '#ff8700',
    wheelStrategy: 'pending',
  },
  {
    id: 'mercedes',
    name: 'Mercedes-AMG',
    team: 'Mercedes-AMG Petronas',
    model: 'W13',
    url: mercedesUrl,
    reverse: true,
    teamId: 'merc',
    accent: '#00a99d',
    wheelStrategy: 'pending',
  },
] as const

const STORAGE_KEY = 'f1s_selected_player_car_v1'
const CHANGE_EVENT = 'f1s-player-car-change'

export function playerCarById(id: PlayerCarId): PlayerCarDefinition {
  return PLAYER_CARS.find((car) => car.id === id) ?? PLAYER_CARS[0]
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
