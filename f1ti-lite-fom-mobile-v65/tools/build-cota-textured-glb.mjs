import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'assets', 'cota-2012.glb');
const textureDir = path.join(root, 'assets', 'cota-2012-textures-v156');
const outputPath = path.join(root, 'assets', 'cota-2012-textured-v156.glb');

const normalizeName = (value) => path.basename(value)
  .replace(/@channels=.*(?=\.png$)/i, '')
  .replace(/\.png$/i, '')
  .replace(/_\d+$/, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const textureFiles = fs.readdirSync(textureDir)
  .filter((name) => name.toLowerCase().endsWith('.png'))
  // Files marked @channels are glTF channel-extraction helpers, not complete
  // color textures. Keep their correctly packed versions inside the GLB.
  .filter((name) => !name.includes('@channels='));

const texturesByName = new Map(textureFiles.map((name) => [normalizeName(name), name]));
const source = fs.readFileSync(sourcePath);
const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8'));

let replacements = 0;
for (const image of json.images ?? []) {
  const fileName = texturesByName.get(normalizeName(image.name ?? ''));
  if (!fileName) continue;
  delete image.bufferView;
  delete image.mimeType;
  image.uri = `assets/cota-2012-textures-v156/${fileName}`;
  replacements += 1;
}

const encoded = Buffer.from(JSON.stringify(json), 'utf8');
const paddedLength = Math.ceil(encoded.length / 4) * 4;
const paddedJson = Buffer.alloc(paddedLength, 0x20);
encoded.copy(paddedJson);
const remainingChunks = source.subarray(20 + jsonLength);
const output = Buffer.alloc(12 + 8 + paddedJson.length + remainingChunks.length);

output.write('glTF', 0, 4, 'ascii');
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(paddedJson.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
paddedJson.copy(output, 20);
remainingChunks.copy(output, 20 + paddedJson.length);
fs.writeFileSync(outputPath, output);

console.log(`COTA textures connected: ${replacements}`);
console.log(outputPath);
