import * as THREE from 'three'
import type { PlayerCarId } from '../data/playerCars'

const DRIFT_START = 2.12
const DRIFT_END = 4.35
const HERO_START = 4.3
const HERO_REVEAL_START = 5.72
const CONTINUE_READY_START = 6.2
const LEAVE_DURATION = 0.28
const SMOKE_CAPACITY = 144
const CONFETTI_CAPACITY = 112
const DEAD_Y = -10000

export interface FinishCinematicPose {
  pos: THREE.Vector3
  heading: number
  speed: number
  normal: THREE.Vector3
}

export interface FinishGroundSample {
  point: THREE.Vector3
  normal: THREE.Vector3
}

export interface FinishCinematicPlayOptions {
  carId: PlayerCarId
  sampleGround?: (x: number, z: number) => FinishGroundSample | null
  onDrift?: () => void
  onHero?: () => void
  onContinue?: () => void
}

export interface FinishCinematicFrame {
  active: boolean
  steer: number
}

export interface FinishCinematicDirector {
  isActive: () => boolean
  isAwaitingContinue: () => boolean
  play: (state: FinishCinematicPose, options: FinishCinematicPlayOptions) => Promise<void>
  update: (dt: number) => FinishCinematicFrame
  cancel: () => void
  dispose: () => void
}

interface SmokeParticle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  life: number
  maxLife: number
}

interface ConfettiParticle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  rotation: THREE.Euler
  spin: THREE.Vector3
  life: number
  maxLife: number
  scale: number
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1)
}

function easeInOutCubic(value: number): number {
  const t = clamp01(value)
  return t < 0.5
    ? 4 * t * t * t
    : 1 - ((-2 * t + 2) ** 3) / 2
}

function easeOutCubic(value: number): number {
  return 1 - (1 - clamp01(value)) ** 3
}

function createOverlay(): {
  root: HTMLDivElement
  flash: HTMLDivElement
  shot: HTMLSpanElement
} {
  const styleId = 'f1s-finish-cinematic-style'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      .f1s-finish-cinematic {
        position: fixed;
        inset: 0;
        z-index: 2250;
        pointer-events: none;
        opacity: 0;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        color: #fff;
        font-family: Inter, "Arial Black", "Microsoft YaHei", sans-serif;
        transition: opacity 140ms ease;
      }
      .f1s-finish-cinematic.is-active { opacity: 1; }
      .f1s-finish-cinematic.is-leaving { opacity: 0; transition-duration: 280ms; }
      .f1s-finish-cinematic__focus-blur {
        position: absolute;
        inset: -24px;
        z-index: 1;
        opacity: 0;
        background: rgba(3, 5, 8, .26);
        backdrop-filter: blur(17px) saturate(.52) brightness(.64);
        -webkit-backdrop-filter: blur(17px) saturate(.52) brightness(.64);
        transform: scale(1.035);
        transition: opacity 440ms ease;
      }
      .f1s-finish-cinematic.is-finish-intro .f1s-finish-cinematic__focus-blur {
        opacity: 1;
      }
      .f1s-finish-cinematic.is-finish-intro.is-hero .f1s-finish-cinematic__focus-blur {
        opacity: 0;
      }
      .f1s-finish-cinematic.is-awaiting .f1s-finish-cinematic__focus-blur,
      .f1s-finish-cinematic.is-awaiting .f1s-finish-cinematic__finish-intro {
        display: none;
      }
      .f1s-finish-cinematic__bar {
        position: absolute;
        left: 0;
        z-index: 10;
        width: 100%;
        height: 0;
        background: #05070a;
        transition: height 420ms cubic-bezier(.2,.75,.2,1);
      }
      .f1s-finish-cinematic.is-active .f1s-finish-cinematic__bar { height: 6.5vh; }
      .f1s-finish-cinematic__bar--top { top: 0; }
      .f1s-finish-cinematic__bar--bottom { bottom: 0; }
      .f1s-finish-cinematic__live {
        position: absolute;
        z-index: 11;
        top: max(22px, 8.2vh);
        left: clamp(20px, 4vw, 72px);
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 12px;
        background: rgba(5, 7, 10, .72);
        border-left: 3px solid #00d2be;
        font: 800 clamp(10px, 1vw, 13px)/1 monospace;
        letter-spacing: .16em;
        text-transform: uppercase;
        text-shadow: 0 1px 8px #000;
      }
      .f1s-finish-cinematic__live::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #ff2038;
        box-shadow: 0 0 12px #ff2038;
      }
      .f1s-finish-cinematic__shot { color: #aeb7c4; }
      .f1s-finish-cinematic__finish-intro {
        position: absolute;
        inset: 0;
        z-index: 5;
        opacity: 0;
        overflow: hidden;
        transition:
          opacity 360ms ease,
          transform 480ms cubic-bezier(.55,.02,.84,.33),
          filter 320ms ease;
      }
      .f1s-finish-cinematic.is-finish-intro .f1s-finish-cinematic__finish-intro {
        opacity: 1;
      }
      .f1s-finish-cinematic.is-finish-intro.is-hero .f1s-finish-cinematic__finish-intro {
        opacity: 0;
        transform: translateX(12vw);
        filter: blur(7px);
      }
      .f1s-finish-cinematic__checker-band {
        position: absolute;
        /* A skewed rectangle loses horizontal coverage at its top-right and
           bottom-left corners. Overdraw by a full quarter viewport on both
           sides so even ultrawide screens never expose a right-edge seam. */
        left: -25vw;
        top: 50%;
        width: 150vw;
        height: clamp(90px, 16vh, 156px);
        transform: translate(-160vw, -50%) skewX(-10deg);
        background:
          linear-gradient(90deg, rgba(0,0,0,.24), rgba(0,0,0,.3) 50%, rgba(0,0,0,.24)),
          conic-gradient(
            from 90deg,
            #f8f8f8 0 25%,
            #111 0 50%,
            #f8f8f8 0 75%,
            #111 0
          );
        background-size: 100% 100%, clamp(38px, 4vw, 62px) clamp(38px, 4vw, 62px);
        box-shadow:
          0 -3px 0 rgba(255,255,255,.86),
          0 3px 0 rgba(0,0,0,.92),
          0 12px 42px rgba(0,0,0,.62);
        opacity: .96;
        filter: contrast(1.12);
        will-change: transform;
      }
      .f1s-finish-cinematic.is-finish-intro .f1s-finish-cinematic__checker-band {
        animation: f1s-finish-band-in 820ms cubic-bezier(.12,.72,.16,1) 40ms forwards;
      }
      .f1s-finish-cinematic__metal-finish {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-125vw, -52%) skewX(-9deg);
        opacity: 0;
        color: transparent;
        background:
          linear-gradient(
            180deg,
            #3d4249 0%,
            #fdfefe 18%,
            #7c8289 38%,
            #fff 49%,
            #51565d 61%,
            #eceff2 78%,
            #6b7077 100%
          );
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-stroke: 1px rgba(255,255,255,.72);
        font: 1000 italic clamp(76px, 15vw, 210px)/.82 "Arial Black", Impact, sans-serif;
        letter-spacing: -.075em;
        filter:
          drop-shadow(0 5px 0 rgba(0,0,0,.85))
          drop-shadow(0 14px 20px rgba(0,0,0,.82));
        white-space: nowrap;
        will-change: transform, opacity, filter;
      }
      .f1s-finish-cinematic.is-finish-intro .f1s-finish-cinematic__metal-finish {
        animation: f1s-finish-word-in 760ms cubic-bezier(.08,.84,.16,1) 130ms forwards;
      }
      .f1s-finish-cinematic__metal-finish::after {
        content: "FINISH";
        position: absolute;
        inset: 0;
        color: rgba(255,255,255,.96);
        -webkit-text-stroke: 0;
        text-shadow: 0 0 18px rgba(255,255,255,.96);
        clip-path: polygon(-18% 0, -4% 0, -28% 100%, -42% 100%);
        opacity: 0;
      }
      .f1s-finish-cinematic.is-finish-intro .f1s-finish-cinematic__metal-finish::after {
        animation: f1s-finish-metal-sweep 620ms ease-out 690ms forwards;
      }
      .f1s-finish-cinematic__finish-slash {
        position: absolute;
        left: 10vw;
        top: calc(50% + clamp(54px, 9vh, 90px));
        width: min(360px, 36vw);
        height: 5px;
        opacity: 0;
        transform: translateX(-70vw) skewX(-22deg);
        background: linear-gradient(90deg, #d30d28 0 58%, #fff 58% 72%, #00d2be 72%);
        box-shadow: 0 0 18px rgba(255,255,255,.55);
      }
      .f1s-finish-cinematic.is-finish-intro .f1s-finish-cinematic__finish-slash {
        animation: f1s-finish-slash-in 680ms cubic-bezier(.08,.8,.16,1) 230ms forwards;
      }
      .f1s-finish-cinematic__title {
        position: absolute;
        left: 50%;
        z-index: 6;
        bottom: clamp(50px, 7.5vh, 82px);
        width: min(1120px, 94vw);
        text-align: center;
        opacity: 0;
        transform: translate(-50%, 34px) scale(.94);
        filter: blur(8px);
        transition:
          opacity 300ms ease,
          transform 620ms cubic-bezier(.14,.84,.2,1),
          filter 420ms ease;
      }
      .f1s-finish-cinematic.is-hero .f1s-finish-cinematic__title {
        opacity: 1;
        transform: translate(-50%, 0) scale(1);
        filter: blur(0);
      }
      .f1s-finish-cinematic__eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 7px;
        color: #00e5cf;
        font: 900 clamp(11px, 1.1vw, 15px)/1 monospace;
        letter-spacing: .34em;
        text-shadow: 0 2px 12px #000;
      }
      .f1s-finish-cinematic__eyebrow::before,
      .f1s-finish-cinematic__eyebrow::after {
        content: "";
        width: clamp(28px, 5vw, 72px);
        height: 2px;
        background: #00d2be;
        box-shadow: 0 0 10px rgba(0, 210, 190, .85);
      }
      .f1s-finish-cinematic__complete {
        display: block;
        font: 1000 italic clamp(34px, 6.2vw, 82px)/.9 "Arial Black", Inter, sans-serif;
        letter-spacing: -.045em;
        text-transform: uppercase;
        white-space: nowrap;
        text-shadow:
          0 4px 0 rgba(0, 0, 0, .3),
          0 10px 34px rgba(0, 0, 0, .72);
      }
      .f1s-finish-cinematic__position {
        display: inline-block;
        margin-top: 14px;
        padding: 7px 22px 8px;
        background: #c80d25;
        clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
        font: 900 clamp(13px, 1.5vw, 20px)/1 monospace;
        letter-spacing: .18em;
        box-shadow: 0 8px 26px rgba(0, 0, 0, .35);
      }
      .f1s-finish-cinematic__continue {
        position: absolute;
        right: clamp(22px, 5vw, 80px);
        bottom: max(74px, 9vh);
        z-index: 12;
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 10px 15px 10px 18px;
        color: #fff;
        background: rgba(5,7,10,.78);
        border: 1px solid rgba(255,255,255,.38);
        border-right: 3px solid #00d2be;
        font: 900 clamp(11px, 1vw, 14px)/1 monospace;
        letter-spacing: .14em;
        opacity: 0;
        transform: translateX(24px);
        transition: opacity 260ms ease, transform 360ms cubic-bezier(.15,.8,.2,1);
        text-shadow: 0 2px 8px #000;
      }
      .f1s-finish-cinematic__continue::after {
        content: "›";
        color: #00e5cf;
        font: 1000 24px/10px sans-serif;
        animation: f1s-finish-continue-pulse 900ms ease-in-out infinite alternate;
      }
      .f1s-finish-cinematic.is-awaiting {
        pointer-events: auto;
        cursor: pointer;
      }
      .f1s-finish-cinematic.is-awaiting .f1s-finish-cinematic__continue {
        opacity: 1;
        transform: translateX(0);
      }
      .f1s-finish-cinematic.is-awaiting .f1s-finish-cinematic__focus-blur,
      .f1s-finish-cinematic.is-awaiting .f1s-finish-cinematic__finish-intro {
        display: none;
      }
      .f1s-finish-cinematic__flash {
        position: absolute;
        inset: 0;
        z-index: 20;
        background: #fff;
        opacity: 0;
        mix-blend-mode: screen;
      }
      @keyframes f1s-finish-band-in {
        0% { transform: translate(-160vw, -50%) skewX(-10deg); }
        72% { transform: translate(2.5vw, -50%) skewX(-10deg); }
        100% { transform: translate(0, -50%) skewX(-10deg); }
      }
      @keyframes f1s-finish-word-in {
        0% {
          transform: translate(-125vw, -52%) skewX(-9deg) scaleX(1.18);
          opacity: 0;
          filter: blur(9px) drop-shadow(0 12px 20px rgba(0,0,0,.8));
        }
        72% {
          transform: translate(-47%, -52%) skewX(-9deg) scaleX(.98);
          opacity: 1;
          filter: blur(0) drop-shadow(0 5px 0 rgba(0,0,0,.85)) drop-shadow(0 14px 20px rgba(0,0,0,.82));
        }
        100% {
          transform: translate(-50%, -52%) skewX(-9deg) scaleX(1);
          opacity: 1;
          filter: blur(0) drop-shadow(0 5px 0 rgba(0,0,0,.85)) drop-shadow(0 14px 20px rgba(0,0,0,.82));
        }
      }
      @keyframes f1s-finish-metal-sweep {
        0% {
          clip-path: polygon(-18% 0, -4% 0, -28% 100%, -42% 100%);
          opacity: 0;
        }
        15% { opacity: 1; }
        100% {
          clip-path: polygon(128% 0, 142% 0, 118% 100%, 104% 100%);
          opacity: 0;
        }
      }
      @keyframes f1s-finish-slash-in {
        0% { transform: translateX(-70vw) skewX(-22deg); opacity: 0; }
        75% { transform: translateX(2vw) skewX(-22deg); opacity: 1; }
        100% { transform: translateX(0) skewX(-22deg); opacity: 1; }
      }
      @keyframes f1s-finish-continue-pulse {
        from { transform: translateX(0); opacity: .55; }
        to { transform: translateX(5px); opacity: 1; }
      }
      @media (max-width: 640px) {
        .f1s-finish-cinematic.is-active .f1s-finish-cinematic__bar { height: 4.5vh; }
        .f1s-finish-cinematic__live { top: 6vh; }
        .f1s-finish-cinematic__title { bottom: 6vh; }
        .f1s-finish-cinematic__checker-band { height: 12vh; }
        .f1s-finish-cinematic__continue {
          right: 50%;
          bottom: 5.7vh;
          transform: translate(50%, 18px);
        }
        .f1s-finish-cinematic.is-awaiting .f1s-finish-cinematic__continue {
          transform: translate(50%, 0);
        }
      }
    `
    document.head.appendChild(style)
  }

  const root = document.createElement('div')
  root.className = 'f1s-finish-cinematic'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = `
    <div class="f1s-finish-cinematic__focus-blur"></div>
    <div class="f1s-finish-cinematic__finish-intro">
      <div class="f1s-finish-cinematic__checker-band"></div>
      <div class="f1s-finish-cinematic__metal-finish">FINISH</div>
      <div class="f1s-finish-cinematic__finish-slash"></div>
    </div>
    <div class="f1s-finish-cinematic__bar f1s-finish-cinematic__bar--top"></div>
    <div class="f1s-finish-cinematic__bar f1s-finish-cinematic__bar--bottom"></div>
    <div class="f1s-finish-cinematic__live">
      FINISH REPLAY <span class="f1s-finish-cinematic__shot">CAM 01</span>
    </div>
    <div class="f1s-finish-cinematic__title">
      <span class="f1s-finish-cinematic__eyebrow">SHANGHAI · FINAL</span>
      <span class="f1s-finish-cinematic__complete">Race Complete</span>
      <span class="f1s-finish-cinematic__position">P1 · VICTORY</span>
    </div>
    <div class="f1s-finish-cinematic__continue">点击继续</div>
    <div class="f1s-finish-cinematic__flash"></div>
  `
  document.body.appendChild(root)
  const flash = root.querySelector<HTMLDivElement>('.f1s-finish-cinematic__flash')
  const shot = root.querySelector<HTMLSpanElement>('.f1s-finish-cinematic__shot')
  if (!flash || !shot) throw new Error('Finish cinematic overlay failed to initialize')
  return { root, flash, shot }
}

function createSmoke(scene: THREE.Scene): {
  emit: (position: THREE.Vector3, velocity: THREE.Vector3) => void
  update: (dt: number) => void
  clear: () => void
  dispose: () => void
} {
  const positions = new Float32Array(SMOKE_CAPACITY * 3)
  const lifeFractions = new Float32Array(SMOKE_CAPACITY)
  for (let index = 0; index < SMOKE_CAPACITY; index++) positions[index * 3 + 1] = DEAD_Y
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aLife', new THREE.BufferAttribute(lifeFractions, 1))
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float aLife;
      varying float vLife;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float age = 1.0 - aLife;
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (12.0 + age * 30.0) * (9.0 / max(5.0, -mvPosition.z));
        vLife = aLife;
      }
    `,
    fragmentShader: `
      varying float vLife;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float d = length(p);
        float cloud = 1.0 - smoothstep(0.18, 0.5, d);
        float softCore = 0.72 + 0.28 * (1.0 - smoothstep(0.0, 0.32, d));
        float alpha = cloud * softCore * smoothstep(0.0, 0.3, vLife) * 0.48;
        if (alpha < 0.012) discard;
        vec3 color = mix(vec3(0.18, 0.2, 0.22), vec3(0.82, 0.84, 0.86), vLife);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.name = 'finish-tire-smoke'
  points.frustumCulled = false
  points.renderOrder = 120
  scene.add(points)
  const particles: Array<SmokeParticle | null> = Array.from({ length: SMOKE_CAPACITY }, () => null)
  let cursor = 0

  const clear = (): void => {
    for (let index = 0; index < SMOKE_CAPACITY; index++) {
      particles[index] = null
      positions[index * 3] = 0
      positions[index * 3 + 1] = DEAD_Y
      positions[index * 3 + 2] = 0
      lifeFractions[index] = 0
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aLife.needsUpdate = true
  }

  return {
    emit: (position, velocity) => {
      const index = cursor % SMOKE_CAPACITY
      cursor++
      const maxLife = 0.95 + Math.random() * 0.65
      particles[index] = {
        position: position.clone(),
        velocity: velocity.clone(),
        life: maxLife,
        maxLife,
      }
    },
    update: (dt) => {
      for (let index = 0; index < SMOKE_CAPACITY; index++) {
        const particle = particles[index]
        if (!particle) continue
        particle.life -= dt
        if (particle.life <= 0) {
          particles[index] = null
          positions[index * 3 + 1] = DEAD_Y
          lifeFractions[index] = 0
          continue
        }
        particle.velocity.multiplyScalar(Math.exp(-1.7 * dt))
        particle.velocity.y += dt * 0.62
        particle.position.addScaledVector(particle.velocity, dt)
        positions[index * 3] = particle.position.x
        positions[index * 3 + 1] = particle.position.y
        positions[index * 3 + 2] = particle.position.z
        lifeFractions[index] = particle.life / particle.maxLife
      }
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.aLife.needsUpdate = true
    },
    clear,
    dispose: () => {
      scene.remove(points)
      geometry.dispose()
      material.dispose()
    },
  }
}

function createConfetti(scene: THREE.Scene): {
  burst: (origin: THREE.Vector3, forward: THREE.Vector3, right: THREE.Vector3) => void
  update: (dt: number) => void
  clear: () => void
  dispose: () => void
} {
  const geometry = new THREE.PlaneGeometry(0.075, 0.24)
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, CONFETTI_CAPACITY)
  mesh.name = 'finish-confetti'
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(CONFETTI_CAPACITY * 3),
    3,
  )
  mesh.frustumCulled = false
  mesh.renderOrder = 130
  scene.add(mesh)
  const particles: Array<ConfettiParticle | null> = Array.from({ length: CONFETTI_CAPACITY }, () => null)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const hiddenPosition = new THREE.Vector3(0, DEAD_Y, 0)
  const palette = ['#00d2be', '#ffffff', '#d30d28', '#ffd447', '#2d7dff']

  const hideInstance = (index: number): void => {
    matrix.compose(hiddenPosition, quaternion.identity(), scale.set(0, 0, 0))
    mesh.setMatrixAt(index, matrix)
  }

  const clear = (): void => {
    for (let index = 0; index < CONFETTI_CAPACITY; index++) {
      particles[index] = null
      hideInstance(index)
    }
    mesh.instanceMatrix.needsUpdate = true
  }
  clear()

  return {
    burst: (origin, forward, right) => {
      const up = new THREE.Vector3(0, 1, 0)
      for (let index = 0; index < CONFETTI_CAPACITY; index++) {
        const maxLife = 1.65 + Math.random() * 1.2
        const launchSide = index % 2 === 0 ? -1 : 1
        const sideDistance = launchSide * (2.1 + Math.random() * 2.8)
        particles[index] = {
          position: origin.clone()
            .addScaledVector(right, sideDistance)
            .addScaledVector(forward, (Math.random() - 0.5) * 2.8)
            .addScaledVector(up, 0.4 + Math.random() * 1.4),
          velocity: right.clone().multiplyScalar(-launchSide * (1.5 + Math.random() * 4.5))
            .addScaledVector(forward, (Math.random() - 0.5) * 6)
            .addScaledVector(up, 5.5 + Math.random() * 7),
          rotation: new THREE.Euler(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI,
          ),
          spin: new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 14,
          ),
          life: maxLife,
          maxLife,
          scale: 0.75 + Math.random() * 1.15,
        }
        mesh.setColorAt(index, new THREE.Color(palette[index % palette.length]))
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
    update: (dt) => {
      let changed = false
      for (let index = 0; index < CONFETTI_CAPACITY; index++) {
        const particle = particles[index]
        if (!particle) continue
        changed = true
        particle.life -= dt
        if (particle.life <= 0) {
          particles[index] = null
          hideInstance(index)
          continue
        }
        particle.velocity.y -= 7.4 * dt
        particle.velocity.multiplyScalar(Math.exp(-0.22 * dt))
        particle.position.addScaledVector(particle.velocity, dt)
        particle.rotation.x += particle.spin.x * dt
        particle.rotation.y += particle.spin.y * dt
        particle.rotation.z += particle.spin.z * dt
        quaternion.setFromEuler(particle.rotation)
        const fade = Math.min(1, particle.life / Math.min(0.4, particle.maxLife))
        const visibleScale = particle.scale * fade
        matrix.compose(
          particle.position,
          quaternion,
          scale.set(visibleScale, visibleScale, visibleScale),
        )
        mesh.setMatrixAt(index, matrix)
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true
    },
    clear,
    dispose: () => {
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
    },
  }
}

export function createFinishCinematic(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): FinishCinematicDirector {
  const overlay = createOverlay()
  const smoke = createSmoke(scene)
  const confetti = createConfetti(scene)
  let active = false
  let elapsed = 0
  let pose: FinishCinematicPose | null = null
  let options: FinishCinematicPlayOptions | null = null
  let startPosition = new THREE.Vector3()
  let startHeading = 0
  let entrySpeed = 0
  let forward = new THREE.Vector3(0, 0, 1)
  let right = new THREE.Vector3(1, 0, 0)
  let up = new THREE.Vector3(0, 1, 0)
  let driftStartPosition = new THREE.Vector3()
  let finalPosition = new THREE.Vector3()
  let driftDirection = 1
  let currentShot = -1
  let flashStrength = 0
  let smokeAccumulator = 0
  let driftTriggered = false
  let finishIntroTriggered = false
  let heroTriggered = false
  let continuePromptShown = false
  let waitingForContinue = false
  let leaving = false
  let leaveStartedAt = 0
  let resolvePlayback: (() => void) | null = null
  const cameraTarget = new THREE.Vector3()
  const desiredCameraPosition = new THREE.Vector3()
  const currentForward = new THREE.Vector3()
  const currentRight = new THREE.Vector3()
  const tmpVelocity = new THREE.Vector3()

  const coastDistance = (time: number): number => {
    const drag = 0.68
    return entrySpeed / drag * (1 - Math.exp(-drag * Math.max(0, time)))
  }

  const setShot = (shot: number): void => {
    if (shot === currentShot) return
    currentShot = shot
    flashStrength = shot === 3 ? 0.72 : 0.42
    overlay.shot.textContent = `CAM 0${shot + 1}`
  }

  const applyGround = (): void => {
    if (!pose || !options?.sampleGround) return
    const hit = options.sampleGround(pose.pos.x, pose.pos.z)
    if (!hit || hit.normal.y < 0.45) return
    pose.pos.y = hit.point.y + 0.09
    pose.normal.copy(hit.normal).normalize()
    up.copy(pose.normal)
  }

  const updateVehiclePose = (dt: number): number => {
    if (!pose) return 0
    if (elapsed < DRIFT_START) {
      const distance = coastDistance(elapsed)
      pose.pos.copy(startPosition).addScaledVector(forward, distance)
      pose.heading = startHeading
      pose.speed = entrySpeed * Math.exp(-0.68 * elapsed)
      applyGround()
      return 0
    }

    const driftT = clamp01((elapsed - DRIFT_START) / (DRIFT_END - DRIFT_START))
    const easedDrift = easeInOutCubic(driftT)
    const travel = 12.5 * easeOutCubic(driftT)
    const lateral = Math.sin(driftT * Math.PI) * 5.3 * driftDirection
    pose.pos.copy(driftStartPosition)
      .addScaledVector(forward, travel)
      .addScaledVector(right, lateral)
    pose.heading = startHeading + driftDirection * Math.PI * easedDrift
    pose.speed = entrySpeed * 0.28 * (1 - easeOutCubic(driftT))
    applyGround()
    if (driftT >= 1) {
      pose.pos.copy(finalPosition)
      pose.heading = startHeading + driftDirection * Math.PI
      pose.speed = 0
      applyGround()
    }

    if (driftT > 0.03 && driftT < 0.94) {
      smokeAccumulator += dt * (48 + entrySpeed * 0.22)
      currentForward.set(Math.sin(pose.heading), 0, Math.cos(pose.heading))
        .addScaledVector(up, -currentForward.dot(up))
        .normalize()
      currentRight.crossVectors(up, currentForward).normalize()
      while (smokeAccumulator >= 1) {
        smokeAccumulator--
        for (const side of [-1, 1]) {
          const wheel = pose.pos.clone()
            .addScaledVector(currentForward, -1.38)
            .addScaledVector(currentRight, side * 0.72)
            .addScaledVector(up, 0.12)
          tmpVelocity.copy(currentRight)
            .multiplyScalar(-driftDirection * (0.7 + Math.random() * 1.2))
            .addScaledVector(currentForward, -0.5 - Math.random() * 0.8)
            .addScaledVector(up, 0.2 + Math.random() * 0.45)
          smoke.emit(wheel, tmpVelocity)
        }
      }
    }
    return driftDirection * Math.sin(driftT * Math.PI)
  }

  const updateCamera = (dt: number): void => {
    if (!pose) return
    let desiredFov = 42
    let shot = 0
    if (elapsed < 1.08) {
      shot = 0
      desiredCameraPosition.copy(startPosition)
        .addScaledVector(forward, 13.5)
        .addScaledVector(right, -driftDirection * 5.4)
        .addScaledVector(up, 0.62)
      cameraTarget.copy(pose.pos).addScaledVector(up, 0.62)
      desiredFov = 49
    } else if (elapsed < DRIFT_START) {
      shot = 1
      desiredCameraPosition.copy(pose.pos)
        .addScaledVector(forward, -1.15)
        .addScaledVector(right, driftDirection * 4.65)
        .addScaledVector(up, 0.86)
      cameraTarget.copy(pose.pos)
        .addScaledVector(forward, 4.2)
        .addScaledVector(up, 0.66)
      desiredFov = 55
    } else if (elapsed < HERO_START) {
      shot = 2
      const driftT = clamp01((elapsed - DRIFT_START) / (DRIFT_END - DRIFT_START))
      desiredCameraPosition.copy(pose.pos)
        .addScaledVector(forward, THREE.MathUtils.lerp(-1.2, 1.8, driftT))
        .addScaledVector(right, -driftDirection * THREE.MathUtils.lerp(5.8, 4.6, driftT))
        .addScaledVector(up, 2.1 + Math.sin(driftT * Math.PI) * 0.85)
      cameraTarget.copy(pose.pos).addScaledVector(up, 1.05)
      desiredFov = 44 - driftT * 3
    } else {
      shot = 3
      const heroT = clamp01((elapsed - HERO_START) / (CONTINUE_READY_START - HERO_START))
      const idleT = Math.max(0, elapsed - CONTINUE_READY_START)
      const idlePhase = idleT * 0.52
      const finalForward = forward.clone().negate()
      const finalRight = right.clone().negate()
      desiredCameraPosition.copy(finalPosition)
        .addScaledVector(finalForward, THREE.MathUtils.lerp(8.7, 5.35, easeOutCubic(heroT)))
        .addScaledVector(finalRight, driftDirection * THREE.MathUtils.lerp(2.15, 0.82, heroT))
        .addScaledVector(up, THREE.MathUtils.lerp(3.15, 1.72, easeOutCubic(heroT)))
      if (idleT > 0) {
        // Slow real 3D orbit for the click-to-continue hero shot. The scene is
        // rendered at a deliberately low cadence in main, keeping this alive
        // without returning to a full-rate GPU loop.
        desiredCameraPosition
          .addScaledVector(finalRight, Math.sin(idlePhase) * 0.42)
          .addScaledVector(finalForward, Math.cos(idlePhase * 0.73) * 0.18)
          .addScaledVector(up, Math.sin(idlePhase * 0.61) * 0.12)
      }
      cameraTarget.copy(finalPosition)
        .addScaledVector(up, 1.0)
        .addScaledVector(finalRight, driftDirection * 0.15)
      if (idleT > 0) {
        cameraTarget
          .addScaledVector(finalRight, Math.sin(idlePhase * 0.67) * 0.11)
          .addScaledVector(up, Math.cos(idlePhase * 0.57) * 0.045)
      }
      desiredFov = THREE.MathUtils.lerp(46, 34, easeOutCubic(heroT))
        + (idleT > 0 ? Math.sin(idlePhase * 0.48) * 0.35 : 0)
    }

    const shotChanged = shot !== currentShot
    setShot(shot)
    if (shotChanged) {
      camera.position.copy(desiredCameraPosition)
      camera.fov = desiredFov
    } else {
      const moveAlpha = 1 - Math.exp(-dt * (shot === 3 ? 2.5 : 5.5))
      camera.position.lerp(desiredCameraPosition, moveAlpha)
      camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-dt * 5))
    }
    camera.near = 0.1
    camera.up.lerp(up, 1 - Math.exp(-dt * 8)).normalize()
    camera.lookAt(cameraTarget)
    camera.updateProjectionMatrix()
  }

  const finish = (): void => {
    if (!active) return
    active = false
    overlay.root.classList.remove(
      'is-active',
      'is-finish-intro',
      'is-hero',
      'is-awaiting',
      'is-leaving',
    )
    overlay.root.setAttribute('aria-hidden', 'true')
    overlay.flash.style.opacity = '0'
    const resolve = resolvePlayback
    resolvePlayback = null
    resolve?.()
  }

  const cancel = (): void => {
    active = false
    pose = null
    options = null
    elapsed = 0
    currentShot = -1
    flashStrength = 0
    smokeAccumulator = 0
    driftTriggered = false
    finishIntroTriggered = false
    heroTriggered = false
    continuePromptShown = false
    waitingForContinue = false
    leaving = false
    leaveStartedAt = 0
    overlay.root.classList.remove(
      'is-active',
      'is-finish-intro',
      'is-hero',
      'is-awaiting',
      'is-leaving',
    )
    overlay.root.setAttribute('aria-hidden', 'true')
    overlay.flash.style.opacity = '0'
    smoke.clear()
    confetti.clear()
    const resolve = resolvePlayback
    resolvePlayback = null
    resolve?.()
  }

  const requestContinue = (): void => {
    if (!active || !waitingForContinue || leaving) return
    waitingForContinue = false
    leaving = true
    leaveStartedAt = elapsed
    overlay.root.classList.remove('is-awaiting')
    overlay.root.classList.add('is-leaving')
    overlay.root.setAttribute('aria-hidden', 'true')
    options?.onContinue?.()
  }

  const handlePointerDown = (event: PointerEvent): void => {
    if (!waitingForContinue || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    requestContinue()
  }
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!waitingForContinue || event.repeat) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    requestContinue()
  }
  overlay.root.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('keydown', handleKeyDown)

  return {
    isActive: () => active,
    isAwaitingContinue: () => waitingForContinue,
    play: (state, nextOptions) => {
      cancel()
      pose = state
      options = nextOptions
      active = true
      elapsed = 0
      startPosition = state.pos.clone()
      startHeading = state.heading
      entrySpeed = THREE.MathUtils.clamp(state.speed, 24, 62)
      up = state.normal.clone().normalize()
      forward = new THREE.Vector3(Math.sin(startHeading), 0, Math.cos(startHeading))
      forward.addScaledVector(up, -forward.dot(up)).normalize()
      right = new THREE.Vector3().crossVectors(up, forward).normalize()
      driftDirection = nextOptions.carId === 'lion' || nextOptions.carId === 'mclaren' ? -1 : 1
      driftStartPosition = startPosition.clone().addScaledVector(forward, coastDistance(DRIFT_START))
      finalPosition = driftStartPosition.clone().addScaledVector(forward, 12.5)
      state.speed = entrySpeed
      overlay.root.classList.add('is-active')
      overlay.root.classList.remove(
        'is-finish-intro',
        'is-hero',
        'is-awaiting',
        'is-leaving',
      )
      overlay.root.setAttribute('aria-hidden', 'true')
      overlay.shot.textContent = 'CAM 01'
      currentShot = -1
      setShot(0)
      return new Promise<void>((resolve) => {
        resolvePlayback = resolve
      })
    },
    update: (rawDt) => {
      const dt = Math.min(0.05, Math.max(0, rawDt))
      smoke.update(dt)
      confetti.update(dt)
      if (!active || !pose || !options) return { active: false, steer: 0 }
      if (waitingForContinue) {
        elapsed += dt
        updateCamera(dt)
        flashStrength *= Math.exp(-dt * 12)
        overlay.flash.style.opacity = flashStrength.toFixed(3)
        return { active: true, steer: 0 }
      }
      elapsed += dt
      const steer = updateVehiclePose(dt)

      if (!driftTriggered && elapsed >= DRIFT_START + 0.08) {
        driftTriggered = true
        options.onDrift?.()
      }
      if (!finishIntroTriggered && elapsed >= HERO_START) {
        finishIntroTriggered = true
        overlay.root.classList.add('is-finish-intro')
        flashStrength = Math.max(flashStrength, 0.82)
      }
      if (!heroTriggered && elapsed >= HERO_REVEAL_START) {
        heroTriggered = true
        overlay.root.classList.add('is-hero')
        flashStrength = Math.max(flashStrength, 0.26)
        const finalForward = forward.clone().negate()
        const finalRight = right.clone().negate()
        confetti.burst(
          finalPosition.clone().addScaledVector(up, 0.35),
          finalForward,
          finalRight,
        )
        options.onHero?.()
      }
      if (!continuePromptShown && elapsed >= CONTINUE_READY_START) {
        continuePromptShown = true
        waitingForContinue = true
        overlay.root.classList.add('is-awaiting')
        overlay.root.setAttribute('aria-hidden', 'false')
      }

      updateCamera(dt)
      flashStrength *= Math.exp(-dt * 12)
      overlay.flash.style.opacity = flashStrength.toFixed(3)
      if (leaving && elapsed - leaveStartedAt >= LEAVE_DURATION) finish()
      return { active: true, steer }
    },
    cancel,
    dispose: () => {
      cancel()
      smoke.dispose()
      confetti.dispose()
      overlay.root.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      overlay.root.remove()
    },
  }
}
