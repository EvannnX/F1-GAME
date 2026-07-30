import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

const root = process.cwd()
const referenceArchive = join(
  root,
  '.compact30-assets/f1ti-lite-fom-mobile-v6-ai-pro-diy-performance.zip',
)
const homeGif = join(root, 'src/f1ti/首页背景.gif')
const finishVideo = join(root, 'public/video/beginning.mp4')
const outputDir = join(root, 'compact30')
const outputArchive = join(
  outputDir,
  'f1ti-lite-fom-mobile-v6-ai-pro-diy-performance-finish-mbti-homegif.zip',
)
const staging = mkdtempSync(join(tmpdir(), 'f1ti-v6-custom-'))

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function requireFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`)
}

try {
  requireFile(referenceArchive, 'v6 reference ZIP')
  requireFile(homeGif, 'replacement home GIF')
  requireFile(finishVideo, 'finish animation')

  execFileSync('unzip', ['-q', referenceArchive, '-d', staging])

  const entries = execFileSync('unzip', ['-Z1', referenceArchive], { encoding: 'utf8' })
    .trim()
    .split('\n')
  const scriptEntries = entries.filter(
    (entry) => entry.startsWith('assets/') && entry.endsWith('.js'),
  )
  if (scriptEntries.length !== 1) {
    throw new Error(`Expected exactly one v6 app script, found ${scriptEntries.length}`)
  }

  const scriptPath = join(staging, scriptEntries[0])
  const originalScript = readFileSync(scriptPath, 'utf8')
  const gifPattern = /data:image\/gif;base64,([A-Za-z0-9+/=]+)/
  const gifMatches = [...originalScript.matchAll(new RegExp(gifPattern.source, 'g'))]
  if (gifMatches.length !== 1) {
    throw new Error(`Expected exactly one embedded home GIF, found ${gifMatches.length}`)
  }

  const originalGif = Buffer.from(gifMatches[0][1], 'base64')
  const replacementGif = readFileSync(homeGif)
  if (originalGif.equals(replacementGif)) {
    throw new Error('Replacement home GIF is not different from the v6 home GIF')
  }

  const updatedScript = originalScript.replace(
    gifPattern,
    `data:image/gif;base64,${replacementGif.toString('base64')}`,
  )
  for (const marker of [
    'f1s-garage__mobile-dock',
    'creator-special',
    'creator-partner',
    '上传 DIY 图片',
    'video/beginning.mp4',
    '你 的 赛 车 人 格',
  ]) {
    if (!updatedScript.includes(marker)) {
      throw new Error(`v6 feature marker was lost: ${marker}`)
    }
  }

  const modelSizes = [...updatedScript.matchAll(
    /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/g,
  )].map((match) => Buffer.from(match[1], 'base64').length)
  if (!modelSizes.includes(4_873_108)) {
    throw new Error('The exact v6 pure-geometry vehicle is missing')
  }

  const packagedFinishVideo = readFileSync(join(staging, 'video/beginning.mp4'))
  const requestedFinishVideo = readFileSync(finishVideo)
  if (!packagedFinishVideo.equals(requestedFinishVideo)) {
    throw new Error('The v6 ZIP does not contain the requested finish animation')
  }

  writeFileSync(scriptPath, updatedScript)
  mkdirSync(outputDir, { recursive: true })
  rmSync(outputArchive, { force: true })
  execFileSync(
    'zip',
    ['-X', '-9', '-r', outputArchive, ...entries],
    { cwd: staging, stdio: 'inherit' },
  )

  const outputEntries = execFileSync('unzip', ['-Z1', outputArchive], {
    encoding: 'utf8',
  }).trim().split('\n')
  if (
    [...outputEntries].sort().join('\n')
    !== [...entries].sort().join('\n')
  ) {
    throw new Error('Output ZIP architecture differs from the v6 reference')
  }

  const archiveSize = statSync(outputArchive).size
  if (archiveSize > 30_000_000) {
    throw new Error(`Output ZIP exceeds 30 MB: ${archiveSize} bytes`)
  }

  console.log(`Reference ZIP: ${basename(referenceArchive)}`)
  console.log(`Output ZIP: ${outputArchive}`)
  console.log(`ZIP bytes: ${archiveSize}`)
  console.log(`ZIP SHA-256: ${sha256(readFileSync(outputArchive))}`)
  console.log(`Home GIF: ${originalGif.length} -> ${replacementGif.length} bytes`)
  console.log(`Finish video SHA-256: ${sha256(requestedFinishVideo)}`)
  console.log(`Embedded model sizes: ${modelSizes.join(', ')}`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
