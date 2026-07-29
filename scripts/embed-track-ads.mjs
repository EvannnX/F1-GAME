import fs from 'node:fs'
import path from 'node:path'

const glbPath = path.resolve('src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb')
const textureDir = path.resolve('src/shanghai-international-circuit-2018-layout/textures')
const replacements = new Map([
  ['BLocchi_sponsor', 'douyin_ai_BLocchi_sponsor.png'],
  ['Blocchi _dist', 'douyin_ai_Blocchi_dist.png'],
  ['helix_board_c', 'douyin_ai_track_ad_double.png'],
  ['fly_better', 'douyin_ai_track_ad_double.png'],
  ['PIT_animato', 'douyin_ai_PIT_animato.png'],
  ['rolex_board_a', 'rolex_board_a_6.png'],
  ['Emirates_better', 'douyin_ai_track_ad_double.png'],
  ['Pirelli_pan', 'Pirelli_pan_12.png'],
  ['rolex_board_b', 'rolex_board_b_13.png'],
  ['Heine_no', 'Heine_no_14.png'],
  ['PAT_Einak_basso', 'douyin_ai_track_ad_double.png'],
  ['f1_board_b', 'f1_board_b_16.png'],
  ['Petronas_sign_cina', 'Petronas_sign_cina_17.png'],
  ['Petronas_sign', 'douyin_ai_track_ad_double.png'],
  ['lg_board_a', 'lg_board_a_51.png'],
  ['fly_emirates_terrain_a', 'fly_emirates_terrain_a_89.png'],
  ['f1_board_a', 'f1_board_a_120.png'],
  ['rolex_terrain_a', 'rolex_terrain_a_142.png'],
  ['allianz_board_a', 'allianz_board_a_143.png'],
])

const align4 = (value) => (value + 3) & ~3
const source = fs.readFileSync(glbPath)
if (source.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a GLB file')

let offset = 12
let json
let bin
while (offset < source.length) {
  const length = source.readUInt32LE(offset)
  const type = source.toString('ascii', offset + 4, offset + 8)
  const chunk = source.subarray(offset + 8, offset + 8 + length)
  if (type === 'JSON') json = JSON.parse(chunk.toString('utf8').trim())
  if (type === 'BIN\0') bin = chunk
  offset += 8 + length
}
if (!json || !bin) throw new Error('GLB must contain JSON and BIN chunks')

const additions = []
let nextOffset = align4(bin.length)
for (const image of json.images ?? []) {
  const originalName = image.name?.startsWith('douyin_ai_')
    ? image.name.slice('douyin_ai_'.length)
    : image.name
  const filename = replacements.get(originalName)
  if (!filename || typeof image.bufferView !== 'number') continue
  const bytes = fs.readFileSync(path.join(textureDir, filename))
  const bufferView = json.bufferViews[image.bufferView]
  const currentOffset = bufferView.byteOffset ?? 0
  const currentLength = bufferView.byteLength
  const canReplaceInPlace = bytes.length <= currentLength
  const replacementOffset = canReplaceInPlace ? currentOffset : nextOffset
  bufferView.byteOffset = replacementOffset
  bufferView.byteLength = bytes.length
  image.mimeType = 'image/png'
  image.name = `douyin_ai_${originalName}`
  additions.push({ offset: replacementOffset, bytes })
  if (!canReplaceInPlace) nextOffset = align4(nextOffset + bytes.length)
}
if (additions.length === 0) throw new Error('No original ad images found; GLB may already be branded')

const nextBin = Buffer.alloc(nextOffset)
bin.copy(nextBin)
for (const addition of additions) addition.bytes.copy(nextBin, addition.offset)
json.buffers[0].byteLength = nextBin.length

let jsonBytes = Buffer.from(JSON.stringify(json))
const paddedJsonLength = align4(jsonBytes.length)
if (paddedJsonLength !== jsonBytes.length) {
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(paddedJsonLength - jsonBytes.length, 0x20)])
}

const output = Buffer.alloc(12 + 8 + jsonBytes.length + 8 + nextBin.length)
output.write('glTF', 0)
output.writeUInt32LE(2, 4)
output.writeUInt32LE(output.length, 8)
output.writeUInt32LE(jsonBytes.length, 12)
output.write('JSON', 16)
jsonBytes.copy(output, 20)
const binHeader = 20 + jsonBytes.length
output.writeUInt32LE(nextBin.length, binHeader)
output.write('BIN\0', binHeader + 4)
nextBin.copy(output, binHeader + 8)

const temporaryPath = `${glbPath}.next`
fs.writeFileSync(temporaryPath, output)
fs.renameSync(temporaryPath, glbPath)
console.log(`Embedded ${additions.length} branded ad textures in ${path.basename(glbPath)}`)
