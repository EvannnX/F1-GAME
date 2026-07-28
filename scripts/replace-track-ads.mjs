import path from 'node:path'
import { unlink } from 'node:fs/promises'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const logoPath = path.join(root, 'src/assets/textures/douyin_ai_creator_plan.png')
const textureDir = path.join(root, 'src/shanghai-international-circuit-2018-layout/textures')

const adTextures = [
  'Emirates_better_11.png',
  'Heine_no_14.png',
  'Petronas_sign_cina_17.png',
  'Pirelli_pan_12.png',
  'allianz_board_a_143.png',
  'f1_board_a_120.png',
  'f1_board_b_16.png',
  'fly_emirates_terrain_a_89.png',
  'lg_board_a_51.png',
  'rolex_board_a_6.png',
  'rolex_board_b_13.png',
  'rolex_terrain_a_142.png',
]

const source = await sharp(logoPath)
  .extract({ left: 12, top: 8, width: 314, height: 96 })
  .png()
  .toBuffer()

const compactLogo = await sharp(source)
  .resize({ width: 112, height: 26, fit: 'inside' })
  .png()
  .toBuffer()

const makeAtlasCell = async (width, height) => {
  const logo = await sharp(source)
    .resize({ width: Math.round(width * 0.88), height: Math.round(height * 0.72), fit: 'inside' })
    .png()
    .toBuffer()
  return sharp({ create: { width, height, channels: 3, background: '#151313' } })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer()
}

const glb = fs.readFileSync(path.join(root, 'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb'))
let glbOffset = 12
let glbJson
let glbBin
while (glbOffset < glb.length) {
  const length = glb.readUInt32LE(glbOffset)
  const type = glb.toString('ascii', glbOffset + 4, glbOffset + 8)
  const chunk = glb.subarray(glbOffset + 8, glbOffset + 8 + length)
  if (type === 'JSON') glbJson = JSON.parse(chunk.toString('utf8').trim())
  if (type === 'BIN\0') glbBin = chunk
  glbOffset += 8 + length
}
const embeddedImage = (name) => {
  const image = glbJson.images.find((candidate) =>
    candidate.name === name || candidate.name === `douyin_ai_${name}`)
  if (!image) throw new Error(`Missing embedded image: ${name}`)
  const view = glbJson.bufferViews[image.bufferView]
  return glbBin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
}

const sponsorAtlasCells = await Promise.all(Array.from({ length: 4 }, () => makeAtlasCell(218, 64)))
await sharp(embeddedImage('BLocchi_sponsor'))
  .composite(sponsorAtlasCells.map((input, row) => ({ input, left: 38, top: row * 64 })))
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(textureDir, 'douyin_ai_BLocchi_sponsor.png'))

const distanceAtlasCells = await Promise.all(Array.from({ length: 4 }, () => makeAtlasCell(102, 48)))
await sharp(embeddedImage('Blocchi _dist'))
  .composite(distanceAtlasCells.map((input, row) => ({ input, left: 103, top: row * 48 })))
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(textureDir, 'douyin_ai_Blocchi_dist.png'))

await sharp({
  create: { width: 256, height: 64, channels: 3, background: '#151313' },
})
  .composite([
    { input: compactLogo, left: 8, top: 3 },
    { input: compactLogo, left: 136, top: 3 },
    { input: compactLogo, left: 8, top: 35 },
    { input: compactLogo, left: 136, top: 35 },
  ])
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(textureDir, 'douyin_ai_track_ad_double.png'))

const pitLogo = await sharp(source)
  .resize({ width: 60, height: 14, fit: 'inside' })
  .png()
  .toBuffer()
await sharp({ create: { width: 256, height: 16, channels: 3, background: '#151313' } })
  .composite(Array.from({ length: 4 }, (_, column) => ({
    input: pitLogo,
    left: column * 64 + 2,
    top: 1,
  })))
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(textureDir, 'douyin_ai_PIT_animato.png'))

for (const filename of adTextures) {
  const target = path.join(textureDir, filename)
  const { width, height } = await sharp(target).metadata()
  if (!width || !height) continue
  const columns = width / height >= 3 ? 2 : 1
  const rows = width / height >= 3 ? 2 : 1
  const slotWidth = Math.floor(width / columns)
  const slotHeight = Math.floor(height / rows)
  const logo = await sharp(source)
    .resize({
      width: Math.round(slotWidth * 0.88),
      height: Math.round(slotHeight * 0.76),
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer()
  const logoMeta = await sharp(logo).metadata()
  const logoWidth = logoMeta.width ?? slotWidth
  const logoHeight = logoMeta.height ?? height

  const temporaryTarget = `${target}.next`
  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#151313',
    },
  })
    .composite(Array.from({ length: columns * rows }, (_, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      return {
        input: logo,
        left: column * slotWidth + Math.round((slotWidth - logoWidth) / 2),
        top: row * slotHeight + Math.round((slotHeight - logoHeight) / 2),
      }
    }))
    .png({ compressionLevel: 9, palette: true })
    .toFile(temporaryTarget)

  await sharp(temporaryTarget).toFile(target)
  await unlink(temporaryTarget)
}

console.log(`Replaced ${adTextures.length} Shanghai track ad textures`)
