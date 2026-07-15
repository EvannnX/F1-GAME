import {
  DRIVER_PROFILES,
  calculatePlayerStatsFromRaceData,
  generateRacerPersonalityResult,
  type PlayerStats,
  type RaceData,
  type RacerPersonalityResult,
} from '../racerPersonality'
import { createPersonalityCard, type RaceTelemetry } from '../ui/personalityCard'

export type F1tiInput = Partial<PlayerStats> | RaceData
export type F1tiCardInput = F1tiInput | RacerPersonalityResult

export interface F1tiCardApi {
  show: (input: F1tiCardInput, telemetry?: RaceTelemetry) => Promise<RacerPersonalityResult>
  showResult: (result: RacerPersonalityResult, telemetry?: RaceTelemetry) => Promise<RacerPersonalityResult>
  hide: () => void
}

export interface F1tiApi {
  version: string
  evaluate: (input: F1tiInput) => RacerPersonalityResult
  stats: (input: F1tiInput) => PlayerStats
  profiles: () => typeof DRIVER_PROFILES
  show: (input: F1tiCardInput, telemetry?: RaceTelemetry) => Promise<RacerPersonalityResult>
  card: F1tiCardApi
}

declare global {
  interface Window {
    F1TI?: F1tiApi
    f1ti?: F1tiApi
  }
}

const looksLikeRaceData = (input: F1tiInput): input is RaceData => (
  'bestLapTime' in input ||
  'lapTimes' in input ||
  'maxSpeed' in input ||
  'finishPosition' in input ||
  'apexHitRate' in input
)

const looksLikeF1tiResult = (input: F1tiCardInput): input is RacerPersonalityResult => (
  '你的赛车人格' in input &&
  '为何你是这个类型' in input &&
  '核心标签' in input
)

export function createF1tiApi(): F1tiApi {
  let card: ReturnType<typeof createPersonalityCard> | null = null

  const getCard = (): ReturnType<typeof createPersonalityCard> => {
    card ??= createPersonalityCard()
    return card
  }

  const evaluate = (input: F1tiInput): RacerPersonalityResult =>
    generateRacerPersonalityResult(input)

  const stats = (input: F1tiInput): PlayerStats =>
    looksLikeRaceData(input)
      ? calculatePlayerStatsFromRaceData(input)
      : generateRacerPersonalityResult(input)['玩家指标']

  const showResult = async (
    result: RacerPersonalityResult,
    telemetry?: RaceTelemetry,
  ): Promise<RacerPersonalityResult> => {
    await getCard().showResult(result, telemetry)
    return result
  }

  const show = async (
    input: F1tiCardInput,
    telemetry?: RaceTelemetry,
  ): Promise<RacerPersonalityResult> => (
    looksLikeF1tiResult(input)
      ? showResult(input, telemetry)
      : showResult(evaluate(input), telemetry)
  )

  const cardApi: F1tiCardApi = {
    show,
    showResult,
    hide: () => {
      card?.hide()
    },
  }

  return {
    version: '1.0.0-local',
    evaluate,
    stats,
    profiles: () => DRIVER_PROFILES,
    show,
    card: cardApi,
  }
}

export function installF1tiApi(target: Window = window): F1tiApi {
  const api = target.F1TI ?? createF1tiApi()
  target.F1TI = api
  target.f1ti = api
  return api
}
