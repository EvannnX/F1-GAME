import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

const archive = process.argv[2]
if (!archive) throw new Error('Usage: node scripts/h5-validator.mjs <archive.zip>')

const maxBytes = 8_000_000
const allowOversize = process.env.F1TI_ALLOW_OVERSIZE === '1'
const block = []
const warn = []
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean)

if (!allowOversize && statSync(archive).size > maxBytes) {
  block.push('ZIP exceeds 8,000,000 bytes')
}
const indexEntries = entries.filter((entry) => entry.endsWith('index.html'))
if (indexEntries.length !== 1 || indexEntries[0] !== 'index.html') {
  block.push('A unique root index.html is required')
}
const indexEntry = 'index.html'
for (const entry of entries) {
  if (!/^[\x20-\x7E]+$/.test(entry)) block.push(`Non-ASCII path: ${entry}`)
  if (entry.startsWith('/') || entry.includes('../') || entry.includes('__MACOSX')) {
    block.push(`Unsafe ZIP path: ${entry}`)
  }
}

const output = mkdtempSync(join(tmpdir(), 'f1ti-h5-'))
try {
  execFileSync('unzip', ['-q', archive, '-d', output])
  const index = readFileSync(join(output, indexEntry), 'utf8')
  for (const required of [/<!doctype html>/i, /<html[\s>]/i, /<head[\s>]/i, /<body[\s>]/i]) {
    if (!required.test(index)) block.push(`index.html missing ${required}`)
  }

  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
  const textFiles = walk(output).filter((path) => ['.html', '.js', '.css'].includes(extname(path)))
  const text = textFiles.map((path) => readFileSync(path, 'utf8')).join('\n')

  const blockRules = [
    ['network request API', /\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b|\bWebSocket\b|\bEventSource\b/],
    ['external URL', /https?:\/\/|(?:src|href)\s*=\s*["']\/\/|["']\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2}/i],
    ['iframe', /<iframe\b|createElement\s*\(\s*["']iframe/i],
    ['external navigation', /window\.open\s*\(|location\.(?:href|assign|replace)\b|target\s*=\s*["']_blank/i],
    ['service worker', /navigator\.serviceWorker|ServiceWorkerRegistration/],
    ['sensitive browser API', /navigator\.(?:geolocation|clipboard|mediaDevices)/],
  ]
  const warnRules = [
    ['dynamic execution', /\beval\s*\(|new\s+Function\b|set(?:Timeout|Interval)\s*\(\s*["'`]/],
    ['native dialog', /\b(?:alert|confirm|prompt|print)\s*\(/],
    ['inline event attribute', /\son[a-z]+\s*=/i],
    ['deprecated execCommand', /document\.execCommand/],
    ['HTML injection pattern', /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write(?:ln)?\s*\(/],
  ]
  for (const [label, pattern] of blockRules) if (pattern.test(text)) block.push(label)
  for (const [label, pattern] of warnRules) if (pattern.test(text)) warn.push(label)
} finally {
  rmSync(output, { recursive: true, force: true })
}

console.log(`[h5-validator] archive: ${archive}`)
console.log(`[h5-validator] size: ${statSync(archive).size} bytes`)
console.log(`[h5-validator] entries: ${entries.length}`)
console.log(`[h5-validator] entry: ${indexEntry}`)
for (const item of warn) console.log(`[h5-validator] WARN: ${item}`)
for (const item of block) console.error(`[h5-validator] BLOCK: ${item}`)
if (block.length) process.exit(1)
console.log('[h5-validator] PASS: 0 block errors')
