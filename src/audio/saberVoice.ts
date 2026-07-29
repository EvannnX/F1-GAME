import summonUrl from '../assets/audio/saberVoice/summon.mp3?url'
import start1Url from '../assets/audio/saberVoice/start_1.mp3?url'
import start2Url from '../assets/audio/saberVoice/start_2.mp3?url'
import start3Url from '../assets/audio/saberVoice/start_3.mp3?url'
import start4Url from '../assets/audio/saberVoice/start_4.mp3?url'
import chargePrepareUrl from '../assets/audio/saberVoice/charge_prepare.mp3?url'
import fullPowerUrl from '../assets/audio/saberVoice/full_power.mp3?url'
import noEscapeUrl from '../assets/audio/saberVoice/no_escape.mp3?url'
import faceOnUrl from '../assets/audio/saberVoice/face_on.mp3?url'
import victoryRoadUrl from '../assets/audio/saberVoice/victory_road.mp3?url'
import holySwordReleaseUrl from '../assets/audio/saberVoice/holy_sword_release.mp3?url'
import leaveItToMeUrl from '../assets/audio/saberVoice/leave_it_to_me.mp3?url'
import niceUrl from '../assets/audio/saberVoice/nice.mp3?url'
import yesUrl from '../assets/audio/saberVoice/yes.mp3?url'
import settleThisUrl from '../assets/audio/saberVoice/settle_this.mp3?url'
import yourDecisionUrl from '../assets/audio/saberVoice/your_decision.mp3?url'
import guardHumanityUrl from '../assets/audio/saberVoice/guard_humanity.mp3?url'
import gotItUrl from '../assets/audio/saberVoice/got_it.mp3?url'
import windRiseUrl from '../assets/audio/saberVoice/wind_rise.mp3?url'
import strikeAirUrl from '../assets/audio/saberVoice/strike_air.mp3?url'
import strikeCaliburnUrl from '../assets/audio/saberVoice/strike_caliburn.mp3?url'
import answerYouUrl from '../assets/audio/saberVoice/answer_you.mp3?url'
import hit1Url from '../assets/audio/saberVoice/hit_1.mp3?url'
import hit2Url from '../assets/audio/saberVoice/hit_2.mp3?url'
import victory1Url from '../assets/audio/saberVoice/victory_1.mp3?url'
import victory2Url from '../assets/audio/saberVoice/victory_2.mp3?url'
import victory3Url from '../assets/audio/saberVoice/victory_3.mp3?url'
import victory4Url from '../assets/audio/saberVoice/victory_4.mp3?url'
import levelUpUrl from '../assets/audio/saberVoice/level_up.mp3?url'

export type SaberVoiceEvent =
  | 'select'
  | 'start'
  | 'coin'
  | 'boost'
  | 'midRace'
  | 'halfway'
  | 'sprint'
  | 'hit'
  | 'finish'

interface VoiceClip {
  id: string
  url: string
  meaning: string
}

interface VoiceEventConfig {
  priority: number
  cooldownMs: number
  pool: readonly VoiceClip[]
}

const clip = (id: string, url: string, meaning: string): VoiceClip => ({ id, url, meaning })
// Keep reaction lines feeling intentional instead of turning a dense row of
// coins into a queue of overlapping acknowledgements.
const GLOBAL_VOICE_COOLDOWN_MS = 3000

// The pools intentionally follow the source entry meanings rather than using
// random combat shouts everywhere. Short acknowledgement clips belong to coin
// pickups; wind/full-power clips belong to boost; victory clips only play
// after the finish line.
const CLIPS = {
  summon: clip('summon', summonUrl, '试问，你是我的御主吗？'),
  start1: clip('start-1', start1Url, '让我们开始吧，御主。'),
  start2: clip('start-2', start2Url, '拼尽所有实力放马过来吧。'),
  start3: clip('start-3', start3Url, '既然是战斗，唯有击溃。'),
  start4: clip('start-4', start4Url, '冷静下来，不要掉以轻心。'),
  chargePrepare: clip('charge-prepare', chargePrepareUrl, '全员，突击准备！'),
  fullPower: clip('full-power', fullPowerUrl, '让你见识我的全力！'),
  noEscape: clip('no-escape', noEscapeUrl, '决不放过！'),
  faceOn: clip('face-on', faceOnUrl, '正面应战！'),
  victoryRoad: clip('victory-road', victoryRoadUrl, '为这条道路带来胜利！'),
  holySwordRelease: clip('holy-sword-release', holySwordReleaseUrl, '圣剑，解放——'),
  leaveItToMe: clip('leave-it-to-me', leaveItToMeUrl, '交给我吧。'),
  nice: clip('nice', niceUrl, '真不错。'),
  yes: clip('yes', yesUrl, '是。'),
  settleThis: clip('settle-this', settleThisUrl, '嗯，让我们分个胜负吧——'),
  yourDecision: clip('your-decision', yourDecisionUrl, '如果这就是你的决定……'),
  guardHumanity: clip('guard-humanity', guardHumanityUrl, '这是守护人理之战。'),
  gotIt: clip('got-it', gotItUrl, '得手了！'),
  windRise: clip('wind-rise', windRiseUrl, '风啊，飞舞吧！'),
  strikeAir: clip('strike-air', strikeAirUrl, '风王铁锤！'),
  strikeCaliburn: clip('strike-caliburn', strikeCaliburnUrl, '上！Strike Caliburn！'),
  answerYou: clip('answer-you', answerYouUrl, '精彩！我定会给予回应！'),
  hit1: clip('hit-1', hit1Url, '区区这种水平……！'),
  hit2: clip('hit-2', hit2Url, '呃！'),
  victory1: clip('victory-1', victory1Url, '还不够熟练呢。'),
  victory2: clip('victory-2', victory2Url, '不违背骑士的誓言。'),
  victory3: clip('victory-3', victory3Url, '为伤者治疗。战斗还将继续。'),
  victory4: clip('victory-4', victory4Url, '兵站还能维持吗？那就好。'),
  levelUp: clip('level-up', levelUpUrl, '又变强了一些呢。'),
} as const

const EVENT_CONFIG: Record<SaberVoiceEvent, VoiceEventConfig> = {
  select: {
    priority: 95,
    cooldownMs: 2500,
    pool: [CLIPS.summon],
  },
  start: {
    priority: 82,
    cooldownMs: 8000,
    pool: [CLIPS.start1, CLIPS.start2, CLIPS.start3, CLIPS.start4, CLIPS.chargePrepare],
  },
  coin: {
    priority: 25,
    cooldownMs: 4000,
    pool: [CLIPS.leaveItToMe, CLIPS.nice, CLIPS.yes, CLIPS.gotIt, CLIPS.levelUp],
  },
  boost: {
    priority: 72,
    cooldownMs: 3800,
    pool: [
      CLIPS.fullPower,
      CLIPS.victoryRoad,
      CLIPS.holySwordRelease,
      CLIPS.windRise,
      CLIPS.strikeAir,
      CLIPS.strikeCaliburn,
    ],
  },
  midRace: {
    priority: 48,
    cooldownMs: 20_000,
    pool: [CLIPS.noEscape, CLIPS.faceOn, CLIPS.yourDecision],
  },
  halfway: {
    priority: 58,
    cooldownMs: 20_000,
    pool: [CLIPS.settleThis, CLIPS.guardHumanity, CLIPS.answerYou],
  },
  sprint: {
    priority: 86,
    cooldownMs: 20_000,
    pool: [CLIPS.victoryRoad, CLIPS.holySwordRelease, CLIPS.strikeCaliburn, CLIPS.settleThis],
  },
  hit: {
    priority: 92,
    cooldownMs: 2600,
    pool: [CLIPS.hit1, CLIPS.hit2],
  },
  finish: {
    priority: 100,
    cooldownMs: 20_000,
    pool: [CLIPS.victory1, CLIPS.victory2, CLIPS.victory3, CLIPS.victory4],
  },
}

export interface SaberVoiceSystem {
  setEnabled: (enabled: boolean) => void
  preload: () => void
  play: (event: SaberVoiceEvent, force?: boolean) => void
  isSpeaking: () => boolean
  resetRace: () => void
  stop: () => void
  dispose: () => void
}

export interface SaberVoiceOptions {
  volume?: number
  onSpeakingChange?: (speaking: boolean) => void
}

export function createSaberVoiceSystem(options: SaberVoiceOptions = {}): SaberVoiceSystem {
  const volume = options.volume ?? 1
  const audioByClip = new Map<string, HTMLAudioElement>()
  const lastClipByEvent = new Map<SaberVoiceEvent, string>()
  const lastEventAt = new Map<SaberVoiceEvent, number>()
  let enabled = false
  let currentAudio: HTMLAudioElement | null = null
  let currentPriority = 0
  let lastGlobalClip = ''
  let lastAnyAt = -Infinity
  let disposed = false
  let speaking = false

  const setSpeaking = (nextSpeaking: boolean): void => {
    if (speaking === nextSpeaking) return
    speaking = nextSpeaking
    options.onSpeakingChange?.(speaking)
  }

  const allClips = [...new Map(
    Object.values(EVENT_CONFIG)
      .flatMap((config) => config.pool)
      .map((voiceClip) => [voiceClip.id, voiceClip]),
  ).values()]

  const getAudio = (voiceClip: VoiceClip): HTMLAudioElement => {
    const cached = audioByClip.get(voiceClip.id)
    if (cached) return cached
    const audio = new Audio(voiceClip.url)
    audio.preload = 'auto'
    audio.volume = volume
    audioByClip.set(voiceClip.id, audio)
    return audio
  }

  const stop = (): void => {
    if (!currentAudio) return
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
    currentPriority = 0
    setSpeaking(false)
  }

  const chooseClip = (event: SaberVoiceEvent, pool: readonly VoiceClip[]): VoiceClip => {
    const previousForEvent = lastClipByEvent.get(event)
    const fresh = pool.filter((voiceClip) =>
      voiceClip.id !== previousForEvent && voiceClip.id !== lastGlobalClip,
    )
    const candidates = fresh.length > 0
      ? fresh
      : pool.filter((voiceClip) => voiceClip.id !== previousForEvent)
    const available = candidates.length > 0 ? candidates : pool
    return available[Math.floor(Math.random() * available.length)]
  }

  const play = (event: SaberVoiceEvent, force = false): void => {
    if (!enabled || disposed) return
    const config = EVENT_CONFIG[event]
    const now = performance.now()
    // Applies even to important/forced calls: force may bypass an event's own
    // cooldown or priority, but it must not create back-to-back voices.
    if (now - lastAnyAt < GLOBAL_VOICE_COOLDOWN_MS) return
    if (!force) {
      if (now - (lastEventAt.get(event) ?? -Infinity) < config.cooldownMs) return
      if (currentAudio && !currentAudio.paused && config.priority <= currentPriority) return
    }
    if (currentAudio && !currentAudio.paused) {
      // Only the final victory line may replace a genuinely long-running
      // lower-priority clip after the global quiet window has elapsed.
      if (event !== 'finish') return
      stop()
    }

    const voiceClip = chooseClip(event, config.pool)
    const audio = getAudio(voiceClip)
    audio.currentTime = 0
    audio.volume = volume
    currentAudio = audio
    currentPriority = config.priority
    setSpeaking(true)
    lastClipByEvent.set(event, voiceClip.id)
    lastGlobalClip = voiceClip.id
    lastEventAt.set(event, now)
    lastAnyAt = now
    const clear = (): void => {
      audio.removeEventListener('ended', clear)
      if (currentAudio === audio) {
        currentAudio = null
        currentPriority = 0
        setSpeaking(false)
      }
    }
    audio.addEventListener('ended', clear)
    void audio.play().catch((error) => {
      clear()
      if ((error as DOMException).name !== 'NotAllowedError') {
        console.warn(`[F1S] Saber voice failed (${event}/${voiceClip.id}):`, error)
      }
    })
  }

  return {
    setEnabled: (nextEnabled) => {
      enabled = nextEnabled
      if (!enabled) stop()
    },
    preload: () => {
      if (disposed) return
      for (const voiceClip of allClips) getAudio(voiceClip).load()
    },
    play,
    isSpeaking: () => speaking,
    resetRace: () => {
      stop()
      lastEventAt.clear()
      lastClipByEvent.clear()
      lastGlobalClip = ''
      lastAnyAt = -Infinity
    },
    stop,
    dispose: () => {
      disposed = true
      stop()
      for (const audio of audioByClip.values()) {
        audio.removeAttribute('src')
        audio.load()
      }
      audioByClip.clear()
    },
  }
}
