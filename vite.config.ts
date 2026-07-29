import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const offline8m = process.env.VITE_F1TI_OFFLINE_8M === '1'
const compact30 = process.env.VITE_F1TI_COMPACT30 === '1'
const embeddedTrackTextures = process.env.VITE_F1TI_USE_EMBEDDED_TRACK_TEXTURES === '1'
const compressedTrackTextures = process.env.VITE_F1TI_COMPRESSED_TRACK_TEXTURES === '1'
const liteSingleCar = process.env.VITE_F1TI_LITE_SINGLE_CAR === '1'
const liteLion = process.env.VITE_F1TI_LITE_LION === '1'
const liteWithoutOpponents = liteSingleCar || liteLion

function offlineAssetAliases(): Plugin {
  const generated = resolve(__dirname, '.offline8m-assets')
  const compactGenerated = resolve(__dirname, '.compact30-assets')
  const embeddedAssets = new Map<string, string>([
    ['src/assets/models/RB19_REDBULL.opt.glb', 'redbull'],
    ['src/assets/models/Ferrari_26.opt.glb', 'ferrari'],
    ['src/assets/models/Mercedes_W13.glb', 'mercedes'],
    ['src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb', 'shanghai'],
  ].map(([source, key]) => [resolve(__dirname, source), key]))
  const replacements = new Map<string, string>([
    ['src/assets/models/RB19_REDBULL.opt.glb', 'redbull-mobile.glb'],
    ['src/assets/models/Ferrari_26.opt.glb', 'ferrari-mobile.glb'],
    ['src/assets/models/Mercedes_W13.glb', 'mercedes-mobile.glb'],
    ['src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb', 'shanghai-mobile.glb'],
    ['src/assets/AutoSave_Shangai_International_Circuit_GP_Track_no_google_earth.glb', 'shanghai-mobile.glb'],
    ['src/assets/background/Cloudymorning2k.hdr', 'sky-mobile.hdr'],
    ['src/assets/audio/engine.mp3', 'engine-mobile.mp3'],
    ['src/assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3', 'bgm-mobile.mp3'],
    ['src/assets/textures/shanghai_environment.webp', 'track-mobile.jpg'],
    ['src/f1ti/首页背景.gif', 'home-mobile.gif'],
    ['F1-卡通图/KimiAntonelli.png', 'portrait-antonelli.png'],
    ['F1-卡通图/LouisHamilton.png', 'portrait-hamilton.png'],
    ['F1-卡通图/MaxVerstappen.png', 'portrait-verstappen.png'],
  ].map(([source, target]) => [resolve(__dirname, source), resolve(generated, target)]))
  const compactReplacements = new Map<string, string>([
    ['src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb', 'shanghai-compact.glb'],
    ['src/assets/已压缩车模型/2022_ferrari_f1-75 (1)-optimized 2.glb', liteLion ? 'lion-player.glb' : liteSingleCar ? 'fom-player.glb' : 'ferrari-player.glb'],
    ['src/assets/已压缩车模型/amg_f1_w15_2024__www.vecarz.com-optimized 2.glb', liteLion ? 'lion-player.glb' : liteSingleCar ? 'fom-player.glb' : 'mercedes-player.glb'],
    ['src/assets/models/RB19_REDBULL.opt.glb', liteLion ? 'lion-player.glb' : liteSingleCar ? 'fom-player.glb' : 'redbull-player.glb'],
    ['src/assets/FOM赛车涂装贴花可复用包-v54/f1_2026_fom-nyu-purple-color-only.glb', liteLion ? 'lion-player.glb' : 'fom-player.glb'],
    ['src/assets/models/Ferrari_26.opt.glb', liteLion ? 'lion-player.glb' : liteSingleCar ? 'fom-player.glb' : 'ferrari-opponent.glb'],
    ['src/assets/models/Mercedes_W13.glb', liteLion ? 'lion-player.glb' : liteSingleCar ? 'fom-player.glb' : 'mercedes-opponent.glb'],
    ['src/assets/models/SaberLionCandidate.opt.glb', 'lion-player.glb'],
    ['src/assets/models/SaberLionCandidate.race.glb', 'lion-race.glb'],
    ['src/assets/background/Cloudymorning2k.hdr', 'sky-compact.hdr'],
    ['src/assets/audio/engine.mp3', 'engine-compact.mp3'],
    ['src/assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3', liteLion ? 'lion-race-bgm-compact.mp3' : 'bgm-compact.mp3'],
    ['src/assets/audio/lion-super-affection-instrumental.mp3', 'lion-race-bgm-compact.mp3'],
    ['src/assets/audio/lion-super-affection-finish.mp3', 'lion-finish-bgm-compact.mp3'],
    ['src/assets/ui/saberReactions/saber-start.png', 'saber-start-compact.webp'],
    ['src/assets/ui/saberReactions/saber-coin.png', 'saber-coin-compact.webp'],
    ['src/assets/ui/saberReactions/saber-boost.png', 'saber-boost-compact.webp'],
    ['src/assets/ui/saberReactions/saber-finish.png', 'saber-finish-compact.webp'],
    ['src/f1ti/首页背景.gif', 'home-compact.gif'],
    ['F1-卡通图/KimiAntonelli.png', 'portrait-antonelli.png'],
    ['F1-卡通图/LouisHamilton.png', 'portrait-hamilton.png'],
    ['F1-卡通图/MaxVerstappen.png', 'portrait-verstappen.png'],
    ...(liteLion
      ? [['src/assets/models/McLaren_MCL35M.opt.glb', 'lion-player.glb']]
      : []),
  ].map(([source, target]) => [resolve(__dirname, source), resolve(compactGenerated, target)]))

  return {
    name: 'f1ti-offline-8m-assets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (compact30) {
        if (liteWithoutOpponents && source === './render/opponentCars') {
          return '\0f1ti-lite-opponent-cars-stub'
        }
        if (source === './ui/shanghai2018MapTest') {
          return '\0f1ti-compact-shanghai-test-stub'
        }
        const compactTestExports = new Map([
          ['./ui/mercedesWheelTest', 'installMercedesWheelTest'],
          ['./ui/ferrariF175WheelTest', 'installFerrariF175WheelTest'],
          ['./ui/fomWheelTest', 'installFomWheelTest'],
          ['./ui/creatorCarPreview', 'installCreatorCarPreview'],
        ])
        const compactTestExport = compactTestExports.get(source)
        if (compactTestExport) {
          return `\0f1ti-compact-test-stub:${compactTestExport}`
        }
      }
      if (offline8m && source.includes('three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw')) {
        return `${resolve(generated, 'draco-decoder-stub.js')}?raw`
      }
      if ((!offline8m && !compact30) || !importer || !source.includes('?url')) return null
      const requestPath = source.slice(0, source.indexOf('?'))
      const importerPath = importer.slice(0, importer.indexOf('?') === -1 ? undefined : importer.indexOf('?'))
      const absoluteSource = resolve(dirname(importerPath), requestPath)
      if (compact30) {
        const compactReplacement = compactReplacements.get(absoluteSource)
        return compactReplacement ? `${compactReplacement}?url` : null
      }
      const embeddedKey = embeddedAssets.get(absoluteSource)
      if (embeddedKey) return `\0f1ti-embedded-asset:${embeddedKey}`
      const replacement = replacements.get(absoluteSource)
      return replacement ? `${replacement}?url` : null
    },
    load(id) {
      if (id === '\0f1ti-compact-shanghai-test-stub') {
        return [
          'export const isShanghai2018MapTestEnabled = () => false',
          'export const installShanghai2018MapTest = () => {}',
        ].join('\n')
      }
      if (id === '\0f1ti-lite-opponent-cars-stub') {
        return 'export const createOpponentCars = () => null'
      }
      if (id.startsWith('\0f1ti-compact-test-stub:')) {
        const exportName = id.slice(id.indexOf(':') + 1)
        return `export const ${exportName} = () => {}`
      }
      if (id.startsWith('\0f1ti-embedded-asset:')) {
        return `export default ${JSON.stringify(`f1ti-asset:${id.slice(id.indexOf(':') + 1)}`)}`
      }
      return null
    },
  }
}

function offlineSandboxCompatibility(): Plugin {
  return {
    name: 'f1ti-offline-sandbox-compatibility',
    enforce: 'pre',
    transform(code, id) {
      if (!offline8m) return null
      const normalizedId = id.replaceAll('\\', '/')
      if (normalizedId.endsWith('/three/build/three.module.js')) {
        const disabledNetwork = code
          .replaceAll('fetch', '__f1tiNetworkDisabled')
          .replace(
            "document.createElementNS( 'http://www.w3.org/1999/xhtml', name )",
            'document.createElement( name )',
          )
        return {
          code: `const __f1tiNetworkDisabled = () => Promise.reject(new Error('Network access disabled'));\n${disabledNetwork}`,
          map: null,
        }
      }
      if (normalizedId.endsWith('/three/examples/jsm/loaders/GLTFLoader.js')) {
        return {
          code: code.replace("typeof createImageBitmap === 'undefined'", 'true'),
          map: null,
        }
      }
      if (code.includes('navigator.clipboard')) {
        return { code: code.replaceAll('navigator.clipboard', 'undefined'), map: null }
      }
      return null
    },
  }
}

function threeWebGLStateFactoryCalls(): Plugin {
  return {
    name: 'three-webgl-state-factory-calls',
    enforce: 'pre',
    transform(code, id) {
      const normalizedId = id.replaceAll('\\', '/')
      const isWebGLStateSource = normalizedId.endsWith('/three/src/renderers/webgl/WebGLState.js')
      const isThreeModuleBuild = normalizedId.endsWith('/three/build/three.module.js')
      if (!isWebGLStateSource && !isThreeModuleBuild) return null
      const transformed = code
        .replace('new ColorBuffer()', 'ColorBuffer()')
        .replace('new DepthBuffer()', 'DepthBuffer()')
        .replace('new StencilBuffer()', 'StencilBuffer()')
      if (transformed === code) throw new Error('Three.js WebGLState factory patch did not apply')
      return { code: transformed, map: null }
    },
  }
}

export default defineConfig({
  base: './',
  define: {
    __F1TI_USE_EMBEDDED_TRACK_TEXTURES__: JSON.stringify(embeddedTrackTextures),
    __F1TI_COMPRESSED_TRACK_TEXTURES__: JSON.stringify(compressedTrackTextures),
    __F1TI_LITE_SINGLE_CAR__: JSON.stringify(liteSingleCar),
    __F1TI_LITE_LION__: JSON.stringify(liteLion),
  },
  publicDir: offline8m || compact30 ? false : 'public',
  plugins: [
    threeWebGLStateFactoryCalls(),
    offlineAssetAliases(),
    offlineSandboxCompatibility(),
    ...(compact30 ? [] : [viteSingleFile({ removeViteModuleLoader: true })]),
  ],
  build: {
    target: ['ios13.4', 'chrome119'],
    minify: 'terser',
    cssCodeSplit: false,
    assetsInlineLimit: compact30 ? 0 : 100_000_000,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        inlineDynamicImports: compact30 ? false : true,
        manualChunks: undefined,
      },
    },
    terserOptions: {
      ecma: 2020,
      compress: {
        passes: 3,
        drop_console: false,
        arrows: false,
        reduce_funcs: false,
      },
      // No `unsafe_arrows` / `unsafe` — they convert constructor functions
      // into arrow functions, which then fail when `new`-ed and surface as
      // "TypeError: ... is not a constructor" at runtime in stricter
      // sandboxes (e.g. Douyin virtual creator). No `mangle.properties` —
      // that renames Three.js internal `_*` fields and breaks rendering.
      format: { comments: false },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5188,
    strictPort: true,
    open: 'http://localhost:5188/index.html',
  },
})
