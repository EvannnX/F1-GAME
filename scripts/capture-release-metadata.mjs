import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = process.cwd()
const normalize = (value) => value.split('\\').join('/')
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const fileRecord = (absolutePath) => {
  const data = readFileSync(absolutePath)
  return {
    path: normalize(relative(root, absolutePath)),
    bytes: data.byteLength,
    sha256: sha256(data),
  }
}
const walkFiles = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const absolutePath = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath]
  })
  .sort((a, b) => normalize(a).localeCompare(normalize(b)))

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const releaseInputRoots = ['index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']
const tracked = execFileSync(
  'git',
  ['-c', 'core.quotepath=false', 'ls-files', '-z', 'src', 'scripts', 'public', ...releaseInputRoots],
  { cwd: root },
).toString('utf8').split('\0').filter(Boolean)
const additionalReleaseInputs = [
  'scripts/capture-release-metadata.mjs',
  'scripts/copy-runtime-public-assets.mjs',
]
const excludedSourceAssets = new Set([
  'public/assets/上海赛车场.glb',
  'public/assets/上海赛车场压缩.glb',
  'public/assets/第一人称用/第一人称视角.glb',
])
const sourceFiles = [...new Set([...tracked, ...additionalReleaseInputs])]
  .filter((path) => path !== 'RELEASE_METADATA.json' && !excludedSourceAssets.has(path))
  .map((path) => fileRecord(join(root, path)))
const sourceFingerprint = sha256(Buffer.from(sourceFiles.map((file) => `${file.path}:${file.sha256}`).join('\n')))

const distDirectory = join(root, 'dist')
const distFiles = walkFiles(distDirectory).map(fileRecord)
const forbiddenDistFiles = distFiles.filter((file) =>
  file.path.endsWith('/上海赛车场.glb') ||
  file.path.endsWith('/上海赛车场压缩.glb') ||
  file.path.includes('/第一人称用/'),
)
if (forbiddenDistFiles.length) {
  throw new Error(`Release contains excluded duplicate assets: ${forbiddenDistFiles.map((file) => file.path).join(', ')}`)
}
const requiredDistFiles = [
  'dist/index.html',
  'dist/src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb',
  'dist/src/shanghai-international-circuit-2018-layout/textures/asphalt-new.png',
  'dist/video/beginning.mp4',
]
for (const required of requiredDistFiles) {
  if (!distFiles.some((file) => file.path === required)) throw new Error(`Release file missing: ${required}`)
}

const indexPath = join(distDirectory, 'index.html')
const indexBuffer = readFileSync(indexPath)
const indexText = indexBuffer.toString('utf8')
if (/\scrossorigin(?:=|\s|>)/i.test(indexText)) throw new Error('dist/index.html still contains crossorigin')

const excludedAssets = [...excludedSourceAssets].map((path) => {
  const absolutePath = join(root, path)
  return {
    path,
    bytes: statSync(absolutePath).size,
    reason: 'source-only duplicate; excluded from dist and upload ZIP',
  }
})
const totalDistBytes = distFiles.reduce((total, file) => total + file.bytes, 0)
const includeZip = process.argv.includes('--include-zip')
const zipPath = join(root, 'submission.zip')
const zipArtifact = includeZip ? fileRecord(zipPath) : null
const metadata = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  product: {
    name: 'F1TI',
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    htmlTitle: indexText.match(/<title>([^<]+)<\/title>/i)?.[1] ?? null,
  },
  repository: {
    branch: git('branch', '--show-current'),
    headCommit: git('rev-parse', 'HEAD'),
    githubRemote: git('remote', 'get-url', 'f1-game'),
    githubMainCommit: git('rev-parse', 'f1-game/main'),
    workingTreeChanges: git('status', '--short').split('\n').filter(Boolean),
  },
  toolchain: {
    node: process.version,
    npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    vite: packageJson.devDependencies.vite,
    three: packageJson.dependencies.three,
    buildTarget: 'esnext',
    minifier: 'terser',
    singleFilePlugin: packageJson.devDependencies['vite-plugin-singlefile'],
  },
  build: {
    command: 'npm run release:check',
    zipCommand: 'npm run zip',
    publicCopyMode: 'allowlisted public assets plus the external Shanghai 2018 runtime directory',
    assetsInlineLimitBytes: 100000000,
    totalDistBytes,
    indexHtmlBytes: indexBuffer.byteLength,
    indexHtmlGzipBytes: gzipSync(indexBuffer, { level: 9 }).byteLength,
    indexHtmlSha256: sha256(indexBuffer),
    sourceFingerprintSha256: sourceFingerprint,
    zipArtifact,
  },
  gameplayCompatibility: {
    mapProfile: 'shanghai-international-circuit-2018-layout',
    allianzGridAnchorStorageKey: 'f1s_shanghai2018_allianz_grid_anchor_v1',
    gridStorageKey: 'f1s_shanghai2018_grid_placements_v2',
    startPoseStorageKey: 'f1s_shanghai2018_start_pose_v1',
    signDeletionStorageKey: 'f1s_shanghai2018_object_deletions_v1',
    cameraStorageKey: 'f1s_shanghai2018_camera_tuning_v2',
    carVisualStorageKey: 'f1s_car_visual_tuning_v3',
    selectedCarStorageKey: 'f1s_selected_player_car_v1',
    defaultGrid: [
      { id: 'player', x: -264.27, z: 520.03, headingDeg: 281.7 },
      { id: 'redbull', x: -230.42, z: 511.9, headingDeg: 281.7 },
      { id: 'ferrari', x: -257.32, z: 513.86, headingDeg: 284.4 },
      { id: 'mclaren', x: -240.22, z: 509.83, headingDeg: 283.5 },
      { id: 'mercedes', x: -247.97, z: 516.04, headingDeg: 282 },
    ],
    defaultThirdPersonCamera: {
      backDistance: 4.15,
      upDistance: 1.32,
      lookAhead: 7.2,
      lookUp: -0.2,
      fov: 48,
    },
  },
  protectedProfiles: {
    redbull: {
      strategy: 'redbull-github-v1',
      sourceCommit: 'ccc253bf5cbd7e2f09d981eb813ac69071bffc26',
      modelSha1: '66c78ca97b11d3cbaf20f2bf9c7eec7a2614d3ae',
      wheelFunctionSha1: '9f4217b13761e023416082195eb44a6fdfe3a9c0',
      wheelSpinRate: 42,
      frontSteerMaxDegrees: 18,
    },
  },
  weather: {
    rainQuery: '?weather=rain',
    gameplayAndCacheIsolation: true,
    qualityRainDrops: 1400,
    mobileOrPerformanceRainDrops: 520,
  },
  requiredRuntimePublicAssets: [
    'src/shanghai-international-circuit-2018-layout/source/shanghai_meshopt.glb',
    'src/shanghai-international-circuit-2018-layout/textures',
    'public/audio/commentary',
    'public/video/beginning.mp4',
    'public/fibi.webp',
  ],
  excludedSourceAssets: excludedAssets,
  distFiles,
  sourceFiles,
}

const outputPath = join(root, 'RELEASE_METADATA.json')
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`)
console.log(`wrote ${basename(outputPath)} (${distFiles.length} release files, ${totalDistBytes} bytes)`)
