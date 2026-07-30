import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const offline8m = process.env.VITE_F1TI_OFFLINE_8M === '1'
const compact30 = process.env.VITE_F1TI_COMPACT30 === '1'
const embeddedTrackTextures = process.env.VITE_F1TI_USE_EMBEDDED_TRACK_TEXTURES === '1'
const compressedTrackTextures = process.env.VITE_F1TI_COMPRESSED_TRACK_TEXTURES === '1'
const liteSingleCar = true
const diagnosticNoMap = process.env.VITE_F1TI_DIAGNOSTIC_NO_MAP === '1'
const diagnosticEmbedCar = process.env.VITE_F1TI_DIAGNOSTIC_EMBED_CAR === '1'
const fullOfflineUpload = process.env.VITE_F1TI_FULL_UPLOAD === '1'

function offlineAssetAliases(): Plugin {
  const generated = resolve(__dirname, '.offline8m-assets')
  const compactGenerated = resolve(__dirname, '.compact30-assets')
  const embeddedAssets = new Map<string, string>([
    ['src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb', 'shanghai'],
  ].map(([source, key]) => [resolve(__dirname, source), key]))
  const replacements = new Map<string, string>([
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
  const fullOfflineReplacements = new Map<string, string>([
    ['src/assets/background/Cloudymorning2k.hdr', 'sky-compact.hdr'],
    ['src/assets/audio/engine.mp3', 'engine-compact.mp3'],
    ['src/assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3', 'bgm-compact.mp3'],
    ['src/f1ti/首页背景.gif', 'home-compact.gif'],
    ['F1-卡通图/KimiAntonelli.png', 'portrait-antonelli.png'],
    ['F1-卡通图/LouisHamilton.png', 'portrait-hamilton.png'],
    ['F1-卡通图/MaxVerstappen.png', 'portrait-verstappen.png'],
  ].map(([source, target]) => [resolve(__dirname, source), resolve(compactGenerated, target)]))
  const compactReplacements = new Map<string, string>([
    ['src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb', 'shanghai-compact.glb'],
    ['src/assets/FOM赛车涂装贴花可复用包-v54/f1_2026_fom-nyu-purple-color-only.glb', 'fom-player.glb'],
    ['src/assets/background/Cloudymorning2k.hdr', 'sky-compact.hdr'],
    ['src/assets/audio/engine.mp3', 'engine-compact.mp3'],
    ['src/assets/audio/Don Toliver - Lose My Mind (feat. Doja Cat) [From F1® The Movie] [Official Audio].mp3', 'bgm-compact.mp3'],
    ['src/f1ti/首页背景.gif', 'home-compact.gif'],
    ['F1-卡通图/KimiAntonelli.png', 'portrait-antonelli.png'],
    ['F1-卡通图/LouisHamilton.png', 'portrait-hamilton.png'],
    ['F1-卡通图/MaxVerstappen.png', 'portrait-verstappen.png'],
  ].map(([source, target]) => [resolve(__dirname, source), resolve(compactGenerated, target)]))

  return {
    name: 'f1ti-offline-8m-assets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './render/opponentCars') {
        return '\0f1ti-lite-opponent-cars-stub'
      }
      if (compact30) {
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
      if (
        diagnosticNoMap
        && absoluteSource === resolve(
          __dirname,
          'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb',
        )
      ) {
        return '\0f1ti-diagnostic-empty-map-url'
      }
      if (
        (diagnosticEmbedCar || fullOfflineUpload)
        && absoluteSource === resolve(
          __dirname,
          'src/assets/FOM赛车涂装贴花可复用包-v54/f1_2026_fom-nyu-purple-color-only.glb',
        )
      ) {
        if (diagnosticEmbedCar) return '\0f1ti-diagnostic-fom-data-url'
        return offline8m
          ? '\0f1ti-current-packaged-fom-url'
          : null
      }
      if (compact30) {
        const compactReplacement = compactReplacements.get(absoluteSource)
        return compactReplacement ? `${compactReplacement}?url` : null
      }
      const embeddedKey = embeddedAssets.get(absoluteSource)
      if (embeddedKey) return `\0f1ti-embedded-asset:${embeddedKey}`
      if (
        fullOfflineUpload
        && absoluteSource === resolve(__dirname, 'src/assets/textures/shanghai_environment.webp')
      ) {
        return null
      }
      const fullReplacement = fullOfflineUpload
        ? fullOfflineReplacements.get(absoluteSource)
        : undefined
      if (fullReplacement) return `${fullReplacement}?url`
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
      if (id === '\0f1ti-diagnostic-empty-map-url') {
        return "export default 'data:application/octet-stream;base64,'"
      }
      if (id === '\0f1ti-current-packaged-fom-url') {
        return "export default 'f1ti-asset:fom'"
      }
      if (id === '\0f1ti-diagnostic-fom-data-url') {
        const bytes = readFileSync(resolve(compactGenerated, 'fom-player-no-draco.glb'))
        return `export default ${JSON.stringify(
          `data:application/octet-stream;base64,${bytes.toString('base64')}`,
        )}`
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
      const normalizedId = id.replaceAll('\\', '/')
      let transformed = code

      if (offline8m && /\bfetch\b/.test(transformed)) {
        transformed = [
          "const __f1tiNetworkDisabled = () => Promise.reject(new Error('Network access disabled'));",
          transformed.replace(/\bfetch\b/g, '__f1tiNetworkDisabled'),
        ].join('\n')
      }
      if (offline8m && normalizedId.endsWith('/three/build/three.module.js')) {
        transformed = transformed.replace(
            "document.createElementNS( 'http://www.w3.org/1999/xhtml', name )",
            'document.createElement( name )',
          )
      }
      if (
        (offline8m || diagnosticNoMap)
        && normalizedId.endsWith('/three/examples/jsm/loaders/GLTFLoader.js')
      ) {
        transformed = transformed.replace("typeof createImageBitmap === 'undefined'", 'true')
      }
      if (transformed.includes('navigator.clipboard')) {
        transformed = transformed.replaceAll('navigator.clipboard', 'undefined')
      }
      return transformed === code ? null : { code: transformed, map: null }
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
