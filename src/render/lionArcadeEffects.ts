import * as THREE from 'three'
import {
  SHANGHAI_FINISH_LINE_INDEX,
  SHANGHAI_OPTIMAL_RACING_LINE,
} from '../data/shanghaiOptimalRacingLine'

/*
 * The coin, boost-pad and pickup-feedback design is adapted from
 * cconsta1/threejs_car_demo (MIT). It is rebuilt here with InstancedMesh and
 * a pooled Points effect so the formal Shanghai scene does not inherit the
 * source demo's per-particle meshes and requestAnimationFrame loops.
 *
 * The radial speed-line presentation is informed by
 * MirzaBeig/Anime-Speed-Lines (Unlicense), with camera-space geometry used
 * here to keep the mobile/H5 fragment cost low. See THIRD_PARTY_NOTICES.md.
 */

const COINS_PER_CLUSTER = 3
const COIN_CLUSTER_COUNT = 15
const COIN_COUNT = COINS_PER_CLUSTER * COIN_CLUSTER_COUNT
const BOOST_PAD_COUNT = 6
const COIN_PICKUP_RADIUS_SQ = 2.7 * 2.7
const BOOST_PICKUP_RADIUS_SQ = 5.8 * 5.8
const BOOST_DURATION_S = 3.2
const BOOST_PAD_COOLDOWN_S = 2.4
const MAX_PICKUP_PARTICLES = 144

type RacingLineSample = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
  number,
]

interface PickupParticle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  color: THREE.Color
  life: number
  maxLife: number
}

export interface LionArcadeFrame {
  boostStrength: number
  boosting: boolean
  coinCollected: boolean
  boostCollected: boolean
}

export interface LionArcadeEffects {
  group: THREE.Group
  setEnabled: (enabled: boolean) => void
  reset: () => void
  update: (
    dt: number,
    playerPosition: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    speed01: number,
    canCollect: boolean,
  ) => LionArcadeFrame
  dispose: () => void
}

// The baked guide points face against the actual race direction. Build the
// same finish-first, race-direction route used by the formal GLB game.
const RACING_LINE = SHANGHAI_OPTIMAL_RACING_LINE as unknown as readonly RacingLineSample[]
const LION_ARCADE_ROUTE = [
  RACING_LINE[SHANGHAI_FINISH_LINE_INDEX],
  ...RACING_LINE.slice(0, SHANGHAI_FINISH_LINE_INDEX).reverse(),
  ...RACING_LINE.slice(SHANGHAI_FINISH_LINE_INDEX + 1).reverse(),
]

function sampledIndices(count: number, phase: number): number[] {
  const length = LION_ARCADE_ROUTE.length
  const step = Math.floor(length / count)
  return Array.from({ length: count }, (_, index) => (phase + index * step) % length)
}

function createHud(): HTMLDivElement {
  const hud = document.createElement('div')
  hud.className = 'f1s-lion-arcade-hud'
  hud.innerHTML = `
    <span class="f1s-lion-arcade-hud__coin"><i></i><b>0</b></span>
    <span class="f1s-lion-arcade-hud__boost">BOOST!</span>
  `
  const style = document.createElement('style')
  style.dataset.lionArcadeStyle = 'true'
  style.textContent = `
    .f1s-lion-arcade-hud{position:fixed;left:clamp(18px,3vw,48px);top:clamp(90px,13vh,140px);
      z-index:75;display:none;align-items:center;gap:14px;pointer-events:none;
      font:900 clamp(19px,2.4vw,32px)/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.75)}
    .f1s-lion-arcade-hud__coin{display:flex;align-items:center;gap:9px;padding:8px 14px;
      border:2px solid rgba(255,224,92,.75);border-radius:999px;background:rgba(25,18,3,.58)}
    .f1s-lion-arcade-hud__coin i{display:block;width:22px;height:22px;border-radius:50%;
      background:radial-gradient(circle at 35% 28%,#fff7a8 0 10%,#ffd62e 28%,#ed9800 72%);
      border:3px solid #fff18c;box-shadow:0 0 14px #ffc400}
    .f1s-lion-arcade-hud__boost{opacity:0;transform:translateX(-10px) scale(.88);
      color:#bffcff;font-style:italic;letter-spacing:.08em;
      transition:opacity .12s ease,transform .12s ease}
    .f1s-lion-arcade-hud[data-boosting="true"] .f1s-lion-arcade-hud__boost{
      opacity:1;transform:translateX(0) scale(1)}
  `
  document.head.appendChild(style)
  document.body.appendChild(hud)
  return hud
}

function createArrowGeometry(): THREE.ShapeGeometry {
  const shapes = [-2.15, 0, 2.15].map((offset) => {
    const shape = new THREE.Shape()
    shape.moveTo(offset, 0.88)
    shape.lineTo(offset + 0.72, -0.08)
    shape.lineTo(offset + 0.34, -0.08)
    shape.lineTo(offset + 0.34, -0.76)
    shape.lineTo(offset - 0.34, -0.76)
    shape.lineTo(offset - 0.34, -0.08)
    shape.lineTo(offset - 0.72, -0.08)
    shape.closePath()
    return shape
  })
  const geometry = new THREE.ShapeGeometry(shapes)
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, 0.071, 0.03)
  return geometry
}

export function createLionArcadeEffects(scene: THREE.Scene): LionArcadeEffects {
  const group = new THREE.Group()
  group.name = 'lion-arcade-pickups'
  group.visible = false
  scene.add(group)

  // Low-poly coin with the five-sided center detail from the MIT kart demo.
  const coinGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.12, 16)
  coinGeometry.rotateZ(Math.PI / 2)
  const coinMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc400,
    emissive: 0xa85b00,
    emissiveIntensity: 1.25,
    metalness: 0.72,
    roughness: 0.22,
  })
  const coins = new THREE.InstancedMesh(coinGeometry, coinMaterial, COIN_COUNT)
  coins.name = 'lion-coins'
  coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  coins.frustumCulled = false
  group.add(coins)

  const coinStarGeometry = new THREE.CylinderGeometry(0.21, 0.21, 0.145, 5)
  coinStarGeometry.rotateZ(Math.PI / 2)
  const coinStarMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff69,
    emissive: 0xffcf00,
    emissiveIntensity: 1.4,
    metalness: 0.4,
    roughness: 0.26,
  })
  const coinStars = new THREE.InstancedMesh(coinStarGeometry, coinStarMaterial, COIN_COUNT)
  coinStars.name = 'lion-coin-stars'
  coinStars.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  coinStars.frustumCulled = false
  group.add(coinStars)

  // Reusable dash panels sit on the optimal racing line and reactivate after
  // a short cooldown, matching kart racers better than one-shot floating gems.
  const boostPadGeometry = new THREE.BoxGeometry(7.2, 0.1, 2.25)
  const boostPadMaterial = new THREE.MeshStandardMaterial({
    color: 0x073f59,
    emissive: 0x00a9d8,
    emissiveIntensity: 1.45,
    metalness: 0.12,
    roughness: 0.3,
  })
  const boostPads = new THREE.InstancedMesh(boostPadGeometry, boostPadMaterial, BOOST_PAD_COUNT)
  boostPads.name = 'lion-boost-pads'
  boostPads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  boostPads.frustumCulled = false
  group.add(boostPads)

  const boostArrowGeometry = createArrowGeometry()
  const boostArrowMaterial = new THREE.MeshBasicMaterial({
    color: 0xd9ffff,
    transparent: true,
    opacity: 0.96,
    toneMapped: false,
  })
  const boostArrows = new THREE.InstancedMesh(boostArrowGeometry, boostArrowMaterial, BOOST_PAD_COUNT)
  boostArrows.name = 'lion-boost-pad-arrows'
  boostArrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  boostArrows.frustumCulled = false
  boostArrows.renderOrder = 5
  group.add(boostArrows)

  // Camera-space line segments are one draw call and considerably cheaper on
  // phones than evaluating procedural polar noise for every screen pixel.
  const lineCount = 64
  const linePositions = new Float32Array(lineCount * 2 * 3)
  let seed = 0x51a7cafe
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  for (let index = 0; index < lineCount; index++) {
    const angle = random() * Math.PI * 2
    const radius = 0.34 + random() * 1.08
    const stretch = 0.38 + random() * 0.86
    const aspect = 1.65
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const base = index * 6
    linePositions[base] = cos * radius * aspect
    linePositions[base + 1] = sin * radius
    linePositions[base + 2] = -2.1
    linePositions[base + 3] = cos * (radius + stretch) * aspect
    linePositions[base + 4] = sin * (radius + stretch)
    linePositions[base + 5] = -2.1
  }
  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xd9fbff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const speedLines = new THREE.LineSegments(lineGeometry, lineMaterial)
  speedLines.name = 'lion-camera-speed-lines'
  speedLines.frustumCulled = false
  speedLines.renderOrder = 1000
  speedLines.visible = false
  scene.add(speedLines)

  // One pooled Points object replaces dozens of short-lived meshes.
  const particlePositions = new Float32Array(MAX_PICKUP_PARTICLES * 3)
  const particleColors = new Float32Array(MAX_PICKUP_PARTICLES * 3)
  const particleLife = new Float32Array(MAX_PICKUP_PARTICLES)
  const particleGeometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(particlePositions, 3)
  const colorAttribute = new THREE.BufferAttribute(particleColors, 3)
  const lifeAttribute = new THREE.BufferAttribute(particleLife, 1)
  positionAttribute.setUsage(THREE.DynamicDrawUsage)
  colorAttribute.setUsage(THREE.DynamicDrawUsage)
  lifeAttribute.setUsage(THREE.DynamicDrawUsage)
  particleGeometry.setAttribute('position', positionAttribute)
  particleGeometry.setAttribute('color', colorAttribute)
  particleGeometry.setAttribute('aLife', lifeAttribute)
  particleGeometry.setDrawRange(0, 0)
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
    },
    vertexShader: `
      attribute float aLife;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vLife;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = (4.0 + aLife * 8.0) * uPixelRatio * clamp(12.0 / -viewPosition.z, 0.45, 1.4);
        vColor = color;
        vLife = aLife;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vLife;
      void main() {
        float distanceFromCenter = length(gl_PointCoord - vec2(0.5));
        float disc = 1.0 - smoothstep(0.12, 0.5, distanceFromCenter);
        float core = 1.0 - smoothstep(0.0, 0.18, distanceFromCenter);
        float alpha = disc * smoothstep(0.0, 0.22, vLife);
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(vColor * (1.0 + core * 1.8), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
  })
  const pickupParticles = new THREE.Points(particleGeometry, particleMaterial)
  pickupParticles.name = 'lion-pickup-particles'
  pickupParticles.frustumCulled = false
  pickupParticles.renderOrder = 900
  group.add(pickupParticles)
  const particles: PickupParticle[] = []

  const coinClusterStep = Math.floor(LION_ARCADE_ROUTE.length / COIN_CLUSTER_COUNT)
  const coinIndices = Array.from({ length: COIN_COUNT }, (_, index) => {
    const cluster = Math.floor(index / COINS_PER_CLUSTER)
    const slot = index % COINS_PER_CLUSTER
    return (7 + cluster * coinClusterStep + slot * 2) % LION_ARCADE_ROUTE.length
  })
  const boostIndices = sampledIndices(BOOST_PAD_COUNT, 22)
  const coinPositions = coinIndices.map((routeIndex, index) => {
    const sample = LION_ARCADE_ROUTE[routeIndex]
    const up = new THREE.Vector3(sample[3], sample[4], sample[5]).normalize()
    // Baked forward points backward relative to race direction.
    const forward = new THREE.Vector3(-sample[6], -sample[7], -sample[8])
    forward.addScaledVector(up, -forward.dot(up)).normalize()
    const right = new THREE.Vector3().crossVectors(up, forward).normalize()
    const lateralOffset = (index % COINS_PER_CLUSTER - 1) * 1.45
    return new THREE.Vector3(sample[0], sample[1] + 1.15, sample[2])
      .addScaledVector(right, lateralOffset)
  })
  const boostPositions = boostIndices.map((index) => {
    const sample = LION_ARCADE_ROUTE[index]
    return new THREE.Vector3(sample[0], sample[1] + 0.12, sample[2])
  })
  const boostRotations = boostIndices.map((index) => {
    const sample = LION_ARCADE_ROUTE[index]
    const up = new THREE.Vector3(sample[3], sample[4], sample[5]).normalize()
    const forward = new THREE.Vector3(-sample[6], -sample[7], -sample[8])
    forward.addScaledVector(up, -forward.dot(up)).normalize()
    const right = new THREE.Vector3().crossVectors(up, forward).normalize()
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward))
  })
  const coinActive = Array.from({ length: COIN_COUNT }, () => true)
  const boostCooldowns = Array.from({ length: BOOST_PAD_COUNT }, () => 0)
  const dummy = new THREE.Object3D()
  const hiddenScale = new THREE.Vector3(0, 0, 0)
  const shownScale = new THREE.Vector3(1, 1, 1)
  const hud = createHud()
  const coinLabel = hud.querySelector<HTMLElement>('.f1s-lion-arcade-hud__coin b')!

  let enabled = false
  let elapsed = 0
  let boostRemaining = 0
  let boostStrength = 0
  let coinCount = 0

  const spawnBurst = (position: THREE.Vector3, boost: boolean): void => {
    const count = boost ? 30 : 15
    for (let index = 0; index < count && particles.length < MAX_PICKUP_PARTICLES; index++) {
      const theta = random() * Math.PI * 2
      const speed = (boost ? 4.2 : 2.6) * (0.55 + random() * 0.75)
      const life = (boost ? 0.62 : 0.46) * (0.78 + random() * 0.44)
      particles.push({
        position: position.clone().add(new THREE.Vector3(0, boost ? 0.5 : 0, 0)),
        velocity: new THREE.Vector3(
          Math.cos(theta) * speed,
          1.4 + random() * (boost ? 4.8 : 3.3),
          Math.sin(theta) * speed,
        ),
        color: new THREE.Color(boost && index % 3 !== 0 ? 0x78f7ff : 0xffd52e),
        life,
        maxLife: life,
      })
    }
  }

  const reset = (): void => {
    coinActive.fill(true)
    boostCooldowns.fill(0)
    particles.length = 0
    particleGeometry.setDrawRange(0, 0)
    boostRemaining = 0
    boostStrength = 0
    coinCount = 0
    coinLabel.textContent = '0'
    hud.dataset.boosting = 'false'
    lineMaterial.opacity = 0
    speedLines.visible = false
  }

  const setEnabled = (nextEnabled: boolean): void => {
    enabled = nextEnabled
    group.visible = enabled
    hud.style.display = enabled ? 'flex' : 'none'
    if (!enabled) {
      boostRemaining = 0
      boostStrength = 0
      speedLines.visible = false
      lineMaterial.opacity = 0
      hud.dataset.boosting = 'false'
    }
  }

  const updateInstances = (): void => {
    for (let index = 0; index < COIN_COUNT; index++) {
      dummy.position.copy(coinPositions[index])
      dummy.rotation.set(0, elapsed * 2.8 + index * 0.43, 0)
      dummy.scale.copy(coinActive[index] ? shownScale : hiddenScale)
      dummy.updateMatrix()
      coins.setMatrixAt(index, dummy.matrix)
      coinStars.setMatrixAt(index, dummy.matrix)
    }
    coins.instanceMatrix.needsUpdate = true
    coinStars.instanceMatrix.needsUpdate = true

    for (let index = 0; index < BOOST_PAD_COUNT; index++) {
      const cooldown01 = THREE.MathUtils.clamp(boostCooldowns[index] / BOOST_PAD_COOLDOWN_S, 0, 1)
      const pulse = 1 + Math.sin(elapsed * 7 + index) * 0.035 * (1 - cooldown01)
      dummy.position.copy(boostPositions[index])
      dummy.quaternion.copy(boostRotations[index])
      dummy.scale.set(pulse, 0.72 + (1 - cooldown01) * 0.28, pulse)
      dummy.updateMatrix()
      boostPads.setMatrixAt(index, dummy.matrix)
      boostArrows.setMatrixAt(index, dummy.matrix)
    }
    boostPads.instanceMatrix.needsUpdate = true
    boostArrows.instanceMatrix.needsUpdate = true
  }

  const updateParticles = (dt: number): void => {
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index]
      particle.life -= dt
      if (particle.life <= 0) {
        particles.splice(index, 1)
        continue
      }
      particle.velocity.y -= 9.2 * dt
      particle.velocity.multiplyScalar(Math.exp(-1.7 * dt))
      particle.position.addScaledVector(particle.velocity, dt)
    }
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index]
      const offset = index * 3
      particlePositions[offset] = particle.position.x
      particlePositions[offset + 1] = particle.position.y
      particlePositions[offset + 2] = particle.position.z
      particleColors[offset] = particle.color.r
      particleColors[offset + 1] = particle.color.g
      particleColors[offset + 2] = particle.color.b
      particleLife[index] = particle.life / particle.maxLife
    }
    particleGeometry.setDrawRange(0, particles.length)
    positionAttribute.needsUpdate = true
    colorAttribute.needsUpdate = true
    lifeAttribute.needsUpdate = true
  }

  const update = (
    dt: number,
    playerPosition: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    speed01: number,
    canCollect: boolean,
  ): LionArcadeFrame => {
    elapsed += dt
    let coinCollected = false
    let boostCollected = false

    if (!enabled && particles.length === 0 && boostStrength === 0) {
      return { boostStrength: 0, boosting: false, coinCollected, boostCollected }
    }

    for (let index = 0; index < BOOST_PAD_COUNT; index++) {
      boostCooldowns[index] = Math.max(0, boostCooldowns[index] - dt)
    }

    if (enabled && canCollect) {
      for (let index = 0; index < COIN_COUNT; index++) {
        if (!coinActive[index] || playerPosition.distanceToSquared(coinPositions[index]) > COIN_PICKUP_RADIUS_SQ) continue
        coinActive[index] = false
        coinCount++
        coinCollected = true
        coinLabel.textContent = String(coinCount)
        spawnBurst(coinPositions[index], false)
        // Every ten coins rewards a short mini-boost.
        if (coinCount % 10 === 0) boostRemaining = Math.max(boostRemaining, 1.35)
      }
      for (let index = 0; index < BOOST_PAD_COUNT; index++) {
        if (boostCooldowns[index] > 0 || playerPosition.distanceToSquared(boostPositions[index]) > BOOST_PICKUP_RADIUS_SQ) continue
        boostCooldowns[index] = BOOST_PAD_COOLDOWN_S
        boostRemaining = BOOST_DURATION_S
        boostCollected = true
        spawnBurst(boostPositions[index], true)
      }
    }

    boostRemaining = Math.max(0, boostRemaining - dt)
    const targetStrength = enabled && boostRemaining > 0 ? 1 : 0
    boostStrength += (targetStrength - boostStrength) * (1 - Math.exp(-dt * (targetStrength > boostStrength ? 9 : 4.5)))
    if (boostStrength < 0.002) boostStrength = 0
    const boosting = boostStrength > 0.02
    hud.dataset.boosting = boosting ? 'true' : 'false'

    updateInstances()
    updateParticles(dt)
    speedLines.visible = enabled && boosting
    lineMaterial.opacity = boostStrength * (0.36 + speed01 * 0.44)
    speedLines.position.copy(camera.position)
    speedLines.quaternion.copy(camera.quaternion)
    speedLines.scale.setScalar(0.88 + boostStrength * 0.32)

    return { boostStrength, boosting, coinCollected, boostCollected }
  }

  updateInstances()

  const dispose = (): void => {
    scene.remove(group)
    scene.remove(speedLines)
    coinGeometry.dispose()
    coinMaterial.dispose()
    coinStarGeometry.dispose()
    coinStarMaterial.dispose()
    boostPadGeometry.dispose()
    boostPadMaterial.dispose()
    boostArrowGeometry.dispose()
    boostArrowMaterial.dispose()
    lineGeometry.dispose()
    lineMaterial.dispose()
    particleGeometry.dispose()
    particleMaterial.dispose()
    document.querySelector('style[data-lion-arcade-style="true"]')?.remove()
    hud.remove()
  }

  return { group, setEnabled, reset, update, dispose }
}
