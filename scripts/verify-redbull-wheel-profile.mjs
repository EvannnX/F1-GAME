import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const EXPECTED = {
  sourceCommit: 'ccc253bf5cbd7e2f09d981eb813ac69071bffc26',
  modelSha1: '66c78ca97b11d3cbaf20f2bf9c7eec7a2614d3ae',
  wheelFunctionSha1: '9f4217b13761e023416082195eb44a6fdfe3a9c0',
}

const sha1 = (value) => createHash('sha1').update(value).digest('hex')
const fail = (message) => {
  console.error(`[redbull-wheel-profile] FAIL: ${message}`)
  process.exitCode = 1
}

const model = readFileSync('src/assets/models/RB19_REDBULL.opt.glb')
const modelSha1 = sha1(model)
if (modelSha1 !== EXPECTED.modelSha1) {
  fail(`model hash changed: ${modelSha1}`)
}

const carSource = readFileSync('src/render/car.ts', 'utf8')
const functionStart = carSource.indexOf('function createRedBullWheelRigs')
const functionEnd = carSource.indexOf('\nfunction createSteerOnlyRig', functionStart)
if (functionStart < 0 || functionEnd < 0) {
  fail('createRedBullWheelRigs could not be located')
} else {
  const wheelFunctionSha1 = sha1(carSource.slice(functionStart, functionEnd))
  if (wheelFunctionSha1 !== EXPECTED.wheelFunctionSha1) {
    fail(`wheel function changed: ${wheelFunctionSha1}`)
  }
}

const strategySource = readFileSync('src/data/playerCars.ts', 'utf8')
const redBullBlock = strategySource.match(/id: 'redbull',[\s\S]*?wheelStrategy: '([^']+)'/)
if (redBullBlock?.[1] !== 'redbull-github-v1') {
  fail(`Red Bull strategy changed: ${redBullBlock?.[1] ?? 'missing'}`)
}
for (const carId of ['ferrari', 'mclaren', 'mercedes']) {
  const block = strategySource.match(new RegExp(`id: '${carId}',[\\s\\S]*?wheelStrategy: '([^']+)'`))
  if (block?.[1] === 'redbull-github-v1') fail(`${carId} is using the Red Bull strategy`)
}

if (!process.exitCode) {
  console.log(`[redbull-wheel-profile] OK (${EXPECTED.sourceCommit.slice(0, 7)})`)
}
