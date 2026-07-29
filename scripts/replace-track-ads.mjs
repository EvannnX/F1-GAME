import path from 'node:path'
import { access, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const textureDir = path.join(root, 'src/shanghai-international-circuit-2018-layout/textures')
const fullWidthPanelPath = path.join(textureDir, 'douyin_ai_track_ad_double.png')

const wideAdTextures = [
  'Heine_no_14.png',
  'Pirelli_pan_12.png',
  'Petronas_sign_cina_17.png',
  'allianz_board_a_143.png',
  'f1_board_a_120.png',
  'f1_board_b_16.png',
  'fly_emirates_terrain_a_89.png',
  'lg_board_a_51.png',
  'rolex_board_a_6.png',
  'rolex_board_b_13.png',
  'rolex_terrain_a_142.png',
]

// These checked-in atlases use UV layouts specific to the imported track.
// Keeping them as explicit source assets avoids rebuilding them with an image
// library that would become another runtime/development dependency.
const specializedAdTextures = [
  'Emirates_better_11.png',
  'douyin_ai_BLocchi_sponsor.png',
  'douyin_ai_BLocchi_dist.png',
  'douyin_ai_PIT_animato.png',
]

const fullWidthPanel = await readFile(fullWidthPanelPath)
await Promise.all(wideAdTextures.map((filename) =>
  writeFile(path.join(textureDir, filename), fullWidthPanel)))
await Promise.all(specializedAdTextures.map((filename) =>
  access(path.join(textureDir, filename))))

console.log(
  `Synchronized ${wideAdTextures.length} full-panel ads and verified ` +
  `${specializedAdTextures.length} track-specific atlases`,
)
