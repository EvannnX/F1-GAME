import {
  createGyro,
  tryRequestGyroPermission,
  type GyroController,
  type GyroDebugSnapshot,
} from './gyro'
import { createMouseJoystick, type MouseJoystickController } from './mouseJoystick'
import { createKeyboard, type KeyboardController } from './keyboard'
import { createMobileControls, type MobileControls } from './mobileControls'
import { clamp } from '../utils/math'

export interface GameInput {
  steer: number // -1..+1
  throttle: number // 0..1 (auto-cruise baseline + DRS)
  brake: number // 0..1
  drs: boolean
  manualThrottle?: boolean
}

export type InputMode = 'gyro' | 'touch' | 'joystick' | 'keyboard'

export type GyroSource = 'sensor' | 'mouse'

export interface InputInitTrace {
  preferred: InputMode | undefined
  wantGyro: boolean
  granted: boolean
  isCoarse: boolean
  gyroCreated: boolean
  finalMode: InputMode
}

export interface InputController {
  mode: InputMode
  /** When `mode === 'gyro'`, identifies which provider supplied the data. */
  gyroSource: GyroSource | null
  getInput: () => GameInput
  /** Live diagnostic snapshot of the gyro pipeline (or null if no gyro). */
  gyroDebug: () => GyroDebugSnapshot | null
  /** Static trace of the init decisions — for diagnostic overlay. */
  initTrace: () => InputInitTrace
  recenter: () => void
  setVisible: (visible: boolean) => void
  destroy: () => void
}

const DEFAULT_THROTTLE = 0.6
const DRS_BOOST = 0.4 // raises throttle from 0.6 to 1.0
// Some webviews (Douyin sandbox, in-app browsers) take >1 s before the
// first DeviceOrientationEvent fires; bump the wait so we don't tear the
// listener down before the host has had a chance to deliver one.
const FALLBACK_MS = 1500

const isCoarsePointer = (): boolean => {
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/** Lightweight common interface for any "tilt/joystick" input source. */
interface VirtualStick {
  getSteer: () => number
  getPitch: () => number
  recenter: () => void
  destroy: () => void
}

/**
 * Must be called from inside a user-gesture handler (e.g. button click).
 * If `preferred` is supplied (from the menu), we try that mode first; on
 * failure we fall back to the device-appropriate default.
 */
export async function initInput(preferred?: InputMode): Promise<InputController> {
  const keyboard: KeyboardController = createKeyboard()

  let gyro: GyroController | null = null
  let mouseJoy: MouseJoystickController | null = null
  let stick: VirtualStick | null = null
  let gyroSource: GyroSource | null = null
  // Default mode: keyboard on desktop (fine pointer), touch on mobile.
  let mode: InputMode = isCoarsePointer() ? 'touch' : 'keyboard'

  const coarse = isCoarsePointer()
  // Try gyro if explicitly requested OR (no preference + touch device).
  const wantGyro = preferred === 'gyro' || (!preferred && coarse)
  let grantedTrace = false
  let gyroCreated = false
  if (wantGyro) {
    let granted = false
    try {
      granted = await tryRequestGyroPermission()
      console.log('[F1S][input] gyro permission granted:', granted)
    } catch (e) {
      console.warn('[F1S] gyro permission ask threw, treating as denied:', e)
    }
    grantedTrace = granted
    // ALWAYS spin up the gyro listener if user explicitly asked for gyro
    // mode — never silently fall back to touch. The event listeners are
    // no-ops while permission is denied but start delivering data the
    // moment the user re-authorises (Settings → Privacy → Motion). This
    // also dodges a class of subtle bugs where matchMedia('(pointer:
    // coarse)') misbehaves in some webviews and would otherwise cause us
    // to skip gyro creation on iPhone.
    if (preferred === 'gyro' || granted) {
      try {
        gyro = createGyro()
        gyroCreated = true
      } catch (e) {
        console.warn('[F1S] createGyro threw:', e)
      }
      if (gyro) {
        await new Promise<void>((res) => setTimeout(res, FALLBACK_MS))
        const available = gyro.isAvailable()
        console.log(
          '[F1S][input] gyro available after wait:',
          available,
          'source:',
          gyro.source(),
          'granted:',
          granted,
        )
        stick = gyro
        gyroSource = 'sensor'
        mode = 'gyro'
        // (Permission-denied toast intentionally omitted — the always-on
        // listener picks up data the moment the user re-grants in iOS
        // settings, so the popup adds noise without functional value.)
      }
    }
    // Desktop fallback: mouse-as-joystick when no real sensor.
    if (!gyro && !coarse) {
      mouseJoy = createMouseJoystick()
      stick = mouseJoy
      gyroSource = 'mouse'
      mode = 'gyro'
    }
  }

  // Honour an explicit non-gyro preference.
  if (preferred === 'keyboard') mode = 'keyboard'
  else if (preferred === 'touch') mode = 'touch'
  else if (preferred === 'joystick') mode = 'joystick'

  const mobile: MobileControls | null = mode === 'keyboard'
    ? null
    : createMobileControls(mode)

  const getInput = (): GameInput => {
    // Steer: sensor/mouse tilt for gyro, then keyboard, then the selected
    // on-screen button or joystick controller.
    let steer = 0
    const kbSteer = keyboard.getSteer()
    if (stick && mode === 'gyro') {
      steer = stick.getSteer()
      if (steer === 0 && kbSteer !== 0) steer = kbSteer
    } else if (kbSteer !== 0) {
      steer = kbSteer
    } else {
      steer = mobile?.getSteer() ?? 0
    }
    steer = clamp(steer, -1, 1)

    const kbThrottle = keyboard.isThrottleHeld()
    const kbBrake = keyboard.isBrakeHeld()
    const kbBoost = keyboard.isBoostHeld()
    const drs = kbBoost
    const manualThrottle = mode !== 'keyboard' || kbThrottle || kbBoost
    let throttle = manualThrottle ? 0 : DEFAULT_THROTTLE
    let brake = 0

    // Keyboard remains a fallback in every mode. Mobile modes otherwise
    // require an explicit accelerator press; releasing it means coasting.
    if (kbThrottle) {
      throttle = drs ? DEFAULT_THROTTLE + DRS_BOOST : 1.0
    } else if (kbBrake) {
      brake = 1.0
    } else if (mobile) {
      brake = mobile.getBrake()
      throttle = brake > 0 ? 0 : mobile.getThrottle()
    } else if (drs) {
      throttle = DEFAULT_THROTTLE + DRS_BOOST
    }

    return { steer, throttle, brake, drs, manualThrottle }
  }

  return {
    mode,
    gyroSource,
    getInput,
    gyroDebug: () => gyro?.debug() ?? null,
    initTrace: () => ({
      preferred,
      wantGyro,
      granted: grantedTrace,
      isCoarse: coarse,
      gyroCreated,
      finalMode: mode,
    }),
    recenter: () => stick?.recenter(),
    setVisible: (visible) => mobile?.setVisible(visible),
    destroy: () => {
      gyro?.destroy()
      mouseJoy?.destroy()
      mobile?.destroy()
      keyboard.destroy()
    },
  }
}
