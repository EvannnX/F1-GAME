import fs from 'node:fs'
import path from 'node:path'

const source = path.resolve('src/assets/AutoSave_Shangai+International+circuit+GP+Track[1].glb')
const target = path.resolve('src/assets/AutoSave_Shangai_International_Circuit_GP_Track_no_google_earth.glb')
const removeNodePattern = /google earth (terrain|snapshot)/i

function align4(value) {
  return (value + 3) & ~3
}

function readGlb(file) {
  const data = fs.readFileSync(file)
  if (data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a GLB file')
  const chunks = []
  let offset = 12
  while (offset < data.length) {
    const length = data.readUInt32LE(offset)
    const type = data.toString('ascii', offset + 4, offset + 8)
    const start = offset + 8
    chunks.push({ type, data: data.subarray(start, start + length) })
    offset = start + length
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === 'JSON')
  const binChunk = chunks.find((chunk) => chunk.type === 'BIN\0')
  if (!jsonChunk || !binChunk) throw new Error('GLB must contain JSON and BIN chunks')
  return {
    json: JSON.parse(jsonChunk.data.toString('utf8').trim()),
    bin: binChunk.data,
  }
}

function textureIndexFrom(info) {
  return typeof info?.index === 'number' ? info.index : null
}

function collectMaterialTextureRefs(material, out) {
  const pbr = material?.pbrMetallicRoughness
  for (const tex of [
    textureIndexFrom(pbr?.baseColorTexture),
    textureIndexFrom(pbr?.metallicRoughnessTexture),
    textureIndexFrom(material?.normalTexture),
    textureIndexFrom(material?.occlusionTexture),
    textureIndexFrom(material?.emissiveTexture),
  ]) {
    if (tex !== null) out.add(tex)
  }
}

function remapTextureInfo(info, textureMap) {
  if (textureIndexFrom(info) !== null) info.index = textureMap.get(info.index)
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildCleanGlb(gltf, bin) {
  const removedNodes = new Set()
  for (const [index, node] of (gltf.nodes ?? []).entries()) {
    if (removeNodePattern.test(node.name ?? '')) removedNodes.add(index)
  }

  const usedNodes = new Set()
  const walkNode = (index) => {
    if (removedNodes.has(index) || usedNodes.has(index)) return
    const node = gltf.nodes?.[index]
    if (!node) return
    usedNodes.add(index)
    for (const child of node.children ?? []) walkNode(child)
  }

  for (const scene of gltf.scenes ?? []) {
    for (const nodeIndex of scene.nodes ?? []) walkNode(nodeIndex)
  }

  const usedMeshes = new Set()
  const usedMaterials = new Set()
  const usedAccessors = new Set()
  const usedTextures = new Set()
  const usedImages = new Set()
  const usedBufferViews = new Set()

  for (const nodeIndex of usedNodes) {
    const node = gltf.nodes[nodeIndex]
    if (typeof node.mesh === 'number') usedMeshes.add(node.mesh)
  }

  const collectAccessor = (index) => {
    if (typeof index !== 'number' || usedAccessors.has(index)) return
    usedAccessors.add(index)
    const accessor = gltf.accessors?.[index]
    if (!accessor) return
    if (typeof accessor.bufferView === 'number') usedBufferViews.add(accessor.bufferView)
    if (typeof accessor.sparse?.indices?.bufferView === 'number') {
      usedBufferViews.add(accessor.sparse.indices.bufferView)
    }
    if (typeof accessor.sparse?.values?.bufferView === 'number') {
      usedBufferViews.add(accessor.sparse.values.bufferView)
    }
  }

  for (const meshIndex of usedMeshes) {
    const mesh = gltf.meshes?.[meshIndex]
    for (const primitive of mesh?.primitives ?? []) {
      for (const accessor of Object.values(primitive.attributes ?? {})) collectAccessor(accessor)
      collectAccessor(primitive.indices)
      for (const target of primitive.targets ?? []) {
        for (const accessor of Object.values(target)) collectAccessor(accessor)
      }
      if (typeof primitive.material === 'number') usedMaterials.add(primitive.material)
    }
  }

  for (const materialIndex of usedMaterials) {
    collectMaterialTextureRefs(gltf.materials?.[materialIndex], usedTextures)
  }

  for (const textureIndex of usedTextures) {
    const texture = gltf.textures?.[textureIndex]
    if (typeof texture?.source === 'number') usedImages.add(texture.source)
  }

  for (const imageIndex of usedImages) {
    const image = gltf.images?.[imageIndex]
    if (typeof image?.bufferView === 'number') usedBufferViews.add(image.bufferView)
  }

  const makeMap = (used) => {
    const map = new Map()
    Array.from(used).sort((a, b) => a - b).forEach((oldIndex, newIndex) => map.set(oldIndex, newIndex))
    return map
  }

  const nodeMap = makeMap(usedNodes)
  const meshMap = makeMap(usedMeshes)
  const materialMap = makeMap(usedMaterials)
  const accessorMap = makeMap(usedAccessors)
  const textureMap = makeMap(usedTextures)
  const imageMap = makeMap(usedImages)
  const bufferViewMap = makeMap(usedBufferViews)

  const next = cloneJson(gltf)
  next.nodes = Array.from(nodeMap.keys()).map((oldIndex) => {
    const node = cloneJson(gltf.nodes[oldIndex])
    if (node.children) node.children = node.children.filter((child) => nodeMap.has(child)).map((child) => nodeMap.get(child))
    if (typeof node.mesh === 'number') node.mesh = meshMap.get(node.mesh)
    return node
  })
  next.scenes = (gltf.scenes ?? []).map((scene) => {
    const clean = cloneJson(scene)
    clean.nodes = (scene.nodes ?? []).filter((node) => nodeMap.has(node)).map((node) => nodeMap.get(node))
    return clean
  })

  next.meshes = Array.from(meshMap.keys()).map((oldIndex) => {
    const mesh = cloneJson(gltf.meshes[oldIndex])
    for (const primitive of mesh.primitives ?? []) {
      for (const [name, accessor] of Object.entries(primitive.attributes ?? {})) {
        primitive.attributes[name] = accessorMap.get(accessor)
      }
      if (typeof primitive.indices === 'number') primitive.indices = accessorMap.get(primitive.indices)
      if (typeof primitive.material === 'number') primitive.material = materialMap.get(primitive.material)
      for (const target of primitive.targets ?? []) {
        for (const [name, accessor] of Object.entries(target)) target[name] = accessorMap.get(accessor)
      }
    }
    return mesh
  })

  next.materials = Array.from(materialMap.keys()).map((oldIndex) => {
    const material = cloneJson(gltf.materials[oldIndex])
    const pbr = material.pbrMetallicRoughness
    remapTextureInfo(pbr?.baseColorTexture, textureMap)
    remapTextureInfo(pbr?.metallicRoughnessTexture, textureMap)
    remapTextureInfo(material.normalTexture, textureMap)
    remapTextureInfo(material.occlusionTexture, textureMap)
    remapTextureInfo(material.emissiveTexture, textureMap)
    return material
  })
  next.textures = Array.from(textureMap.keys()).map((oldIndex) => {
    const texture = cloneJson(gltf.textures[oldIndex])
    if (typeof texture.source === 'number') texture.source = imageMap.get(texture.source)
    return texture
  })
  next.images = Array.from(imageMap.keys()).map((oldIndex) => {
    const image = cloneJson(gltf.images[oldIndex])
    if (typeof image.bufferView === 'number') image.bufferView = bufferViewMap.get(image.bufferView)
    return image
  })
  next.accessors = Array.from(accessorMap.keys()).map((oldIndex) => {
    const accessor = cloneJson(gltf.accessors[oldIndex])
    if (typeof accessor.bufferView === 'number') accessor.bufferView = bufferViewMap.get(accessor.bufferView)
    if (typeof accessor.sparse?.indices?.bufferView === 'number') {
      accessor.sparse.indices.bufferView = bufferViewMap.get(accessor.sparse.indices.bufferView)
    }
    if (typeof accessor.sparse?.values?.bufferView === 'number') {
      accessor.sparse.values.bufferView = bufferViewMap.get(accessor.sparse.values.bufferView)
    }
    return accessor
  })

  const chunks = []
  let binaryLength = 0
  next.bufferViews = Array.from(bufferViewMap.keys()).map((oldIndex) => {
    const bufferView = cloneJson(gltf.bufferViews[oldIndex])
    const sourceStart = bufferView.byteOffset ?? 0
    const sourceEnd = sourceStart + bufferView.byteLength
    const offset = align4(binaryLength)
    chunks.push({ offset, data: bin.subarray(sourceStart, sourceEnd) })
    binaryLength = offset + bufferView.byteLength
    bufferView.buffer = 0
    bufferView.byteOffset = offset
    return bufferView
  })

  const nextBin = Buffer.alloc(align4(binaryLength))
  for (const chunk of chunks) chunk.data.copy(nextBin, chunk.offset)
  next.buffers = [{ byteLength: nextBin.length }]
  delete next.animations
  delete next.skins

  return {
    gltf: next,
    bin: nextBin,
    removedNodes: Array.from(removedNodes).map((index) => gltf.nodes[index]?.name),
  }
}

function writeGlb(file, gltf, bin) {
  const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8')
  const jsonPadded = Buffer.concat([jsonRaw, Buffer.alloc(align4(jsonRaw.length) - jsonRaw.length, 0x20)])
  const totalLength = 12 + 8 + jsonPadded.length + 8 + bin.length
  const header = Buffer.alloc(12)
  header.write('glTF', 0, 'ascii')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLength, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonPadded.length, 0)
  jsonHeader.write('JSON', 4, 'ascii')
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(bin.length, 0)
  binHeader.write('BIN\0', 4, 'ascii')
  fs.writeFileSync(file, Buffer.concat([header, jsonHeader, jsonPadded, binHeader, bin]))
}

const { json, bin } = readGlb(source)
const cleaned = buildCleanGlb(json, bin)
writeGlb(target, cleaned.gltf, cleaned.bin)

console.log(JSON.stringify({
  source,
  target,
  removedNodes: cleaned.removedNodes,
  originalBytes: fs.statSync(source).size,
  cleanedBytes: fs.statSync(target).size,
  originalImages: json.images?.length ?? 0,
  cleanedImages: cleaned.gltf.images?.length ?? 0,
}, null, 2))
