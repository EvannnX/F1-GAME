import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const offline8m = process.env.VITE_F1TI_OFFLINE_8M === '1'

function offlineAssetAliases(): Plugin {
  const generated = resolve(__dirname, '.offline8m-assets')
  const embeddedAssets = new Map<string, string>([
    ['src/assets/models/RB19_REDBULL.opt.glb', 'redbull'],
    ['src/assets/models/Ferrari_26.opt.glb', 'ferrari'],
    ['src/assets/models/Mercedes_W13.glb', 'mercedes'],
    ['src/assets/models/McLaren_MCL35M.opt.glb', 'mclaren'],
    ['src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb', 'shanghai'],
  ].map(([source, key]) => [resolve(__dirname, source), key]))
  const replacements = new Map<string, string>([
    ['src/assets/models/RB19_REDBULL.opt.glb', 'redbull-mobile.glb'],
    ['src/assets/models/Ferrari_26.opt.glb', 'ferrari-mobile.glb'],
    ['src/assets/models/Mercedes_W13.glb', 'mercedes-mobile.glb'],
    ['src/assets/models/McLaren_MCL35M.opt.glb', 'mclaren-mobile.glb'],
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

  return {
    name: 'f1ti-offline-8m-assets',
    enforce: 'pre',
    resolveId(source, importer) {
      if (offline8m && source.includes('three/examples/jsm/libs/draco/gltf/draco_decoder.js?raw')) {
        return `${resolve(generated, 'draco-decoder-stub.js')}?raw`
      }
      if (!offline8m || !importer || !source.includes('?url')) return null
      const requestPath = source.slice(0, source.indexOf('?'))
      const importerPath = importer.slice(0, importer.indexOf('?') === -1 ? undefined : importer.indexOf('?'))
      const absoluteSource = resolve(dirname(importerPath), requestPath)
      const embeddedKey = embeddedAssets.get(absoluteSource)
      if (embeddedKey) return `\0f1ti-embedded-asset:${embeddedKey}`
      const replacement = replacements.get(absoluteSource)
      return replacement ? `${replacement}?url` : null
    },
    load(id) {
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
  publicDir: offline8m ? false : 'public',
  plugins: [
    threeWebGLStateFactoryCalls(),
    offlineAssetAliases(),
    offlineSandboxCompatibility(),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  build: {
    target: ['ios13.4', 'chrome119'],
    minify: 'terser',
    cssCodeSplit: false,
    assetsInlineLimit: offline8m ? 100_000_000 : 100_000_000,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        inlineDynamicImports: true,
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
