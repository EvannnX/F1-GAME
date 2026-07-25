import { readFileSync, writeFileSync } from 'node:fs'

const [path] = process.argv.slice(2)
if (!path) throw new Error('Usage: node scripts/ensure-gif-loop.mjs <animation.gif>')

const gif = readFileSync(path)
if (gif.toString('ascii', 0, 6) !== 'GIF89a' && gif.toString('ascii', 0, 6) !== 'GIF87a') {
  throw new Error(`${path} is not a GIF file`)
}
if (gif.includes(Buffer.from('NETSCAPE2.0', 'ascii'))) {
  console.log(`GIF already loops forever: ${path}`)
  process.exit(0)
}

const packed = gif[10]
const globalColorTableBytes = packed & 0x80
  ? 3 * (2 ** ((packed & 0x07) + 1))
  : 0
const insertAt = 13 + globalColorTableBytes
const loopForever = Buffer.concat([
  Buffer.from([0x21, 0xff, 0x0b]),
  Buffer.from('NETSCAPE2.0', 'ascii'),
  Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00]),
])

writeFileSync(path, Buffer.concat([
  gif.subarray(0, insertAt),
  loopForever,
  gif.subarray(insertAt),
]))
console.log(`Added lossless infinite-loop metadata: ${path}`)
