import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'

const archive = process.argv[2]
if (!archive) {
  throw new Error('Usage: node scripts/host-safe-validator.mjs <archive.zip>')
}

const block = []
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)

if (entries.filter((entry) => entry === 'index.html').length !== 1) {
  block.push('A unique root index.html is required')
}
for (const entry of entries) {
  if (!/^[\x20-\x7E]+$/.test(entry)) block.push(`Non-ASCII path: ${entry}`)
  if (
    entry.startsWith('/')
    || entry.includes('../')
    || entry.includes('__MACOSX')
  ) {
    block.push(`Unsafe ZIP path: ${entry}`)
  }
}

const output = mkdtempSync(join(tmpdir(), 'f1ti-host-safe-'))
try {
  execFileSync('unzip', ['-q', archive, '-d', output])
  const walk = (directory) => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    })
  const text = walk(output)
    .filter((path) => ['.html', '.js', '.css'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')

  const rules = [
    ['network request API', /\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b|\bWebSocket\b|\bEventSource\b/],
    ['external URL', /https?:\/\/|(?:src|href)\s*=\s*["']\/\/|["']\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2}/i],
    ['external navigation', /window\.open\s*\(|location\.(?:href|assign|replace)\b|target\s*=\s*["']_blank/i],
    ['clipboard API', /navigator\.clipboard/],
    ['HTML injection pattern', /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write(?:ln)?\s*\(/],
  ]
  for (const [label, pattern] of rules) {
    if (pattern.test(text)) block.push(label)
  }
} finally {
  rmSync(output, { recursive: true, force: true })
}

console.log(`[host-safe-validator] archive: ${archive}`)
console.log(`[host-safe-validator] entries: ${entries.length}`)
for (const item of block) console.error(`[host-safe-validator] BLOCK: ${item}`)
if (block.length > 0) process.exit(1)
console.log('[host-safe-validator] PASS: 0 block errors')
