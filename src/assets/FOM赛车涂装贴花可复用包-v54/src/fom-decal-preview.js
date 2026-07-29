import * as THREE from "three";
import { GLTFLoader } from "../vendor/GLTFLoader.js";
import { DRACOLoader } from "../vendor/DRACOLoader.js";
import { DecalGeometry } from "../vendor/DecalGeometry.js";

const MODEL_URL = new URL(
  "../f1_2026_fom-nyu-purple-color-only.glb?v=8",
  import.meta.url,
).href;
const REAR_LOGO_URL = new URL(
  "../ChatGPT Image Jul 26, 2026, 02_07_44 AM.png",
  import.meta.url,
).href;
const SIDE_LOGO_URL = new URL("../download-1.svg", import.meta.url).href;
const DELTAX_LOGO_URL = new URL("../DeltaX.png", import.meta.url).href;
const FRONT_ZJUAP_URL = new URL(
  "../抖音官方赞助商logo/ZJUAP.jpg",
  import.meta.url,
).href;
const FRONT_CREATOR_SYMBOL_URL = new URL(
  "../assets/douyin-creator-symbol.svg",
  import.meta.url,
).href;
const SPONSOR_LOGOS = [
  {
    id: "sponsorDouyin",
    label: "赞助商 1",
    url: new URL(
      "../抖音官方赞助商logo/download-2.svg",
      import.meta.url,
    ).href,
    baseWidth: 0.55,
    baseHeight: 0.083,
    scale: 1,
    y: 0.702,
    z: -0.925,
  },
  {
    id: "sponsorDownload3",
    label: "赞助商 2",
    url: new URL(
      "../抖音官方赞助商logo/download-3.svg",
      import.meta.url,
    ).href,
    baseWidth: 0.42,
    baseHeight: 0.139,
    scale: 0.8,
    y: 0.562,
    z: -1.58,
  },
  {
    id: "sponsorJoint",
    label: "联合主办",
    url: new URL(
      "../抖音官方赞助商logo/joint-organizer.30e85169.svg",
      import.meta.url,
    ).href,
    baseWidth: 0.48,
    baseHeight: 0.13,
    scale: 0.87,
    y: 0.524,
    z: 0.81,
  },
  {
    id: "sponsorBlue",
    label: "蓝色标志",
    url: new URL(
      "../抖音官方赞助商logo/download.png",
      import.meta.url,
    ).href,
    baseWidth: 0.18,
    baseHeight: 0.133,
    scale: 1.37,
    height: 0.61,
    y: 0.82,
    z: -0.765,
    trimTransparent: true,
  },
  {
    id: "sponsorTrae",
    label: "TRAE",
    url: new URL(
      "../抖音官方赞助商logo/trae.ec67ce78.png",
      import.meta.url,
    ).href,
    baseWidth: 0.48,
    baseHeight: 0.091,
    scale: 0.74,
    y: 0.66,
    z: -0.15,
  },
  {
    id: "sponsorJinqiu",
    label: "锦秋基金",
    url: new URL(
      "../抖音官方赞助商logo/jinqiu.2db5dbb8.png",
      import.meta.url,
    ).href,
    baseWidth: 0.52,
    baseHeight: 0.118,
    scale: 0.53,
    y: 0.43,
    z: 2.195,
  },
];
const TARGET_MATERIAL = "livery_audi_01";
const THEME_MATERIAL_NAMES = new Set([
  "livery_audi_01",
  "fom_car_dummy_decal",
  "boya",
]);
const REAR_TARGET_MATERIALS = new Set([
  "livery_audi_01",
  "fom_car_detail",
  "generics",
]);
const NORMAL_OFFSET = 0.0035;
const SIDE_NORMAL_OFFSET = 0.0007;
const REAR_LIGHT_PERIOD_MS = 500;
const REAR_LIGHT_RED = new THREE.Color(0xff1808);
const LIVERY_SCHEMES = {
  clean: { name: "纯色" },
  classic: {
    name: "红白经典",
    primary: "#e10600",
    primaryName: "竞速红",
    accentA: "#161719",
    accentB: "#ffffff",
  },
  silver: {
    name: "银黑青线",
    primary: "#151515",
    primaryName: "哑光黑",
    accentA: "#50565c",
    accentB: "#00d9d2",
  },
  orange: {
    name: "橙黑切面",
    primary: "#ff8700",
    primaryName: "活力橙",
    accentA: "#101214",
    accentB: "#00b8a9",
  },
  blueArrow: {
    name: "蓝白箭锋",
    primary: "#0067ff",
    primaryName: "电光蓝",
    accentA: "#f4f7ff",
    accentB: "#111820",
  },
  violetGold: {
    name: "紫金翼面",
    primary: "#57068c",
    primaryName: "NYU 紫",
    accentA: "#ffcc33",
    accentB: "#17131d",
  },
  greenCut: {
    name: "绿黑渐切",
    primary: "#00a86b",
    primaryName: "翡翠绿",
    accentA: "#111513",
    accentB: "#dfff32",
  },
  silverSpine: {
    name: "银白红脊",
    primary: "#d9d9d6",
    primaryName: "银白",
    accentA: "#e10600",
    accentB: "#151515",
  },
};

const PRESETS = {
  frontCreatorSymbol: {
    kind: "top",
    baseWidth: 0.22,
    baseHeight: 0.215,
    depth: 0.5,
    scale: 1,
    width: 1,
    height: 1,
    x: 0,
    y: 0.3,
    z: 2.325,
    rotationX: -90,
    rotationY: 0,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: false,
  },
  frontZjuap: {
    kind: "top",
    baseWidth: 0.28,
    baseHeight: 0.28,
    depth: 0.5,
    scale: 0.79,
    width: 1,
    height: 1,
    x: 0,
    y: 0.34,
    z: 1.415,
    rotationX: -90,
    rotationY: 0,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: false,
  },
  rear: {
    kind: "rear",
    baseWidth: 1.22,
    baseHeight: 0.17,
    depth: 1.3,
    scale: 1.49,
    width: 0.64,
    height: 1.22,
    x: 0,
    y: 0.93,
    z: -2.75,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: true,
  },
  right: {
    kind: "side",
    baseWidth: 0.82,
    baseHeight: 0.21,
    depth: 0.24,
    scale: 1.2,
    width: 1,
    height: 1,
    x: 0.405,
    y: 0.424,
    z: -0.295,
    rotationX: 0,
    rotationY: 90,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: false,
  },
  left: {
    kind: "side",
    baseWidth: 0.82,
    baseHeight: 0.21,
    depth: 0.24,
    scale: 1.2,
    width: 1,
    height: 1,
    x: -0.405,
    y: 0.424,
    z: -0.295,
    rotationX: 0,
    rotationY: -90,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: false,
  },
  deltaRight: {
    kind: "side",
    baseWidth: 0.42,
    baseHeight: 0.36,
    depth: 0.24,
    scale: 0.81,
    width: 1,
    height: 1,
    x: 0.55,
    y: 0.46,
    z: -1.235,
    rotationX: 0,
    rotationY: 90,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: false,
  },
  deltaLeft: {
    kind: "side",
    baseWidth: 0.42,
    baseHeight: 0.36,
    depth: 0.24,
    scale: 0.81,
    width: 1,
    height: 1,
    x: -0.55,
    y: 0.46,
    z: -1.235,
    rotationX: 0,
    rotationY: -90,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: false,
  },
};

for (const sponsor of SPONSOR_LOGOS) {
  PRESETS[`${sponsor.id}Right`] = {
    kind: "side",
    baseWidth: sponsor.baseWidth,
    baseHeight: sponsor.baseHeight,
    depth: 0.24,
    segmentsX: 32,
    segmentsY: 10,
    scale: sponsor.scale ?? 1,
    width: sponsor.width ?? 1,
    height: sponsor.height ?? 1,
    x: 0.405,
    y: sponsor.y,
    z: sponsor.z,
    rotationX: 0,
    rotationY: 90,
    rotationZ: 0,
    flipHorizontal: false,
    flipVertical: false,
    reverseFacing: false,
  };
  PRESETS[`${sponsor.id}Left`] = {
    ...PRESETS[`${sponsor.id}Right`],
    x: -0.405,
    rotationY: -90,
  };
}

PRESETS.accentSideRight = {
  kind: "side",
  baseWidth: 4.2,
  baseHeight: 0.62,
  depth: 0.24,
  segmentsX: 96,
  segmentsY: 20,
  scale: 1,
  width: 1,
  height: 1,
  x: 0.405,
  y: 0.48,
  z: 0.25,
  rotationX: 0,
  rotationY: 90,
  rotationZ: 0,
  flipHorizontal: false,
  flipVertical: false,
  reverseFacing: false,
};
PRESETS.accentSideLeft = {
  ...PRESETS.accentSideRight,
  x: -0.405,
  rotationY: -90,
};
PRESETS.accentTop = {
  kind: "top",
  baseWidth: 0.76,
  baseHeight: 2.3,
  depth: 0.5,
  scale: 1,
  width: 1,
  height: 1,
  x: 0,
  y: 0.3,
  z: 1.45,
  rotationX: -90,
  rotationY: 0,
  rotationZ: 0,
  flipHorizontal: false,
  flipVertical: false,
  reverseFacing: false,
};

const states = Object.fromEntries(
  Object.entries(PRESETS).map(([key, value]) => [key, { ...value }]),
);
const decals = {};
const rebuildTimers = {};
let activeKey = "rear";
let carRoot = null;
let projectionSource = null;
let surfaceMeshes = [];
let rearSurfaceMeshes = [];
const themeMaterials = new Set();
const rearLightMaterials = [];
let rearLightEnabled = true;
let activeThemeColor = "#57068c";
let activeLiveryScheme = "clean";
let drag = null;

const canvas = document.querySelector("#preview-canvas");
const loading = document.querySelector("#loading");
const status = document.querySelector("#facing-status");
const decalToggle = document.querySelector("#decal-toggle");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd8d8da);
scene.fog = new THREE.Fog(0xd8d8da, 9, 22);
scene.add(new THREE.HemisphereLight(0xffffff, 0x77777b, 3.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
keyLight.position.set(5, 8, 4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.65);
fillLight.position.set(-5, 3, -4);
scene.add(fillLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0xc9c9cc, roughness: 0.92 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
const target = new THREE.Vector3();
let radius = 6.5;
let yaw = 0;
let pitch = 0.18;
let desiredRadius = radius;
let desiredYaw = yaw;
let desiredPitch = pitch;

const draco = new DRACOLoader();
draco.setDecoderPath("./vendor/draco/");
draco.preload();
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);
const textureLoader = new THREE.TextureLoader();

Promise.all([
  loader.loadAsync(MODEL_URL),
  textureLoader.loadAsync(REAR_LOGO_URL),
  textureLoader.loadAsync(SIDE_LOGO_URL),
  textureLoader.loadAsync(DELTAX_LOGO_URL),
  textureLoader.loadAsync(FRONT_ZJUAP_URL),
  textureLoader.loadAsync(FRONT_CREATOR_SYMBOL_URL),
  ...SPONSOR_LOGOS.map((sponsor) => textureLoader.loadAsync(sponsor.url)),
]).then(([
  gltf,
  rearSourceTexture,
  sideSourceTexture,
  deltaTexture,
  frontZjuapSourceTexture,
  frontCreatorSymbolSourceTexture,
  ...sponsorSourceTextures
]) => {
  carRoot = gltf.scene;
  carRoot.name = "fom-nyu-purple-color-only";
  scene.add(carRoot);
  carRoot.updateMatrixWorld(true);

  const initialBox = new THREE.Box3().setFromObject(carRoot);
  const center = initialBox.getCenter(new THREE.Vector3());
  carRoot.position.x -= center.x;
  carRoot.position.z -= center.z;
  carRoot.position.y -= initialBox.min.y;
  carRoot.updateMatrixWorld(true);

  carRoot.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    if (materials.some((material) => material?.name === TARGET_MATERIAL)) {
      surfaceMeshes.push(object);
    }
    for (const material of materials) {
      if (THEME_MATERIAL_NAMES.has(material?.name)) {
        themeMaterials.add(material);
      }
    }
    if (materials.some((material) => REAR_TARGET_MATERIALS.has(material?.name))) {
      rearSurfaceMeshes.push(object);
    }
    if (materials.some((material) => material?.name === "rear_light")) {
      const registerRearLightMaterial = (material) => {
        if (material?.name !== "rear_light") return material;
        const blinkMaterial = material.clone();
        blinkMaterial.name = "rear_light_blink";
        rearLightMaterials.push({
          material: blinkMaterial,
          baseColor: blinkMaterial.color?.clone(),
          baseEmissive: blinkMaterial.emissive?.clone(),
          baseEmissiveIntensity: blinkMaterial.emissiveIntensity ?? 1,
        });
        return blinkMaterial;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(registerRearLightMaterial)
        : registerRearLightMaterial(object.material);
    }
  });
  projectionSource = prepareProjectionSource(surfaceMeshes, carRoot);
  for (const material of themeMaterials) {
    installLiveryPartitionShader(material);
  }
  applyThemeColor(activeThemeColor);

  const rearTexture = createWhiteTextureFromSourceAlpha(rearSourceTexture);
  rearSourceTexture.dispose();
  const sideTexture = createHighResolutionTexture(sideSourceTexture, 2048);
  sideSourceTexture.dispose();
  sideTexture.colorSpace = THREE.SRGBColorSpace;
  rearTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  sideTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  deltaTexture.colorSpace = THREE.SRGBColorSpace;
  deltaTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const leftTexture = sideTexture.clone();
  leftTexture.needsUpdate = true;
  const deltaLeftTexture = deltaTexture.clone();
  deltaLeftTexture.needsUpdate = true;
  const frontZjuapTexture = frontZjuapSourceTexture;
  frontZjuapTexture.colorSpace = THREE.SRGBColorSpace;
  frontZjuapTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const frontCreatorSymbolTexture = createHighResolutionTexture(
    frontCreatorSymbolSourceTexture,
    1024,
  );
  frontCreatorSymbolSourceTexture.dispose();
  frontCreatorSymbolTexture.anisotropy =
    renderer.capabilities.getMaxAnisotropy();
  decals.frontCreatorSymbol = createDecalMesh(
    frontCreatorSymbolTexture,
    "fom-front-creator-symbol-decal",
  );
  decals.frontZjuap = createDecalMesh(
    frontZjuapTexture,
    "fom-front-zjuap-decal",
  );
  decals.rear = createDecalMesh(rearTexture, "fom-rear-creator-decal");
  decals.right = createDecalMesh(sideTexture, "fom-right-creator-decal");
  decals.left = createDecalMesh(leftTexture, "fom-left-creator-decal");
  decals.deltaRight = createDecalMesh(
    deltaTexture,
    "fom-right-deltax-decal",
  );
  decals.deltaLeft = createDecalMesh(
    deltaLeftTexture,
    "fom-left-deltax-decal",
  );
  for (let i = 0; i < SPONSOR_LOGOS.length; i += 1) {
    const sponsor = SPONSOR_LOGOS[i];
    const sourceTexture = sponsorSourceTextures[i];
    const rightTexture = sponsor.trimTransparent
      ? createTrimmedTransparentTexture(sourceTexture, 1024)
      : createHighResolutionTexture(sourceTexture, 2048);
    sourceTexture.dispose();
    rightTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const leftTexture = rightTexture.clone();
    leftTexture.needsUpdate = true;
    decals[`${sponsor.id}Right`] = createDecalMesh(
      rightTexture,
      `fom-right-${sponsor.id}-decal`,
    );
    decals[`${sponsor.id}Left`] = createDecalMesh(
      leftTexture,
      `fom-left-${sponsor.id}-decal`,
    );
  }
  carRoot.add(
    decals.frontCreatorSymbol,
    decals.frontZjuap,
    decals.rear,
    decals.right,
    decals.left,
    decals.deltaRight,
    decals.deltaLeft,
    ...SPONSOR_LOGOS.flatMap((sponsor) => [
      decals[`${sponsor.id}Right`],
      decals[`${sponsor.id}Left`],
    ]),
  );

  for (const key of Object.keys(decals)) rebuildDecal(key);
  if (new URLSearchParams(location.search).has("export-decals")) {
    window.__exportFomV54Decals = () => Object.fromEntries(
      Object.entries(decals).map(([key, decal]) => {
        const geometry = decal.geometry;
        return [key, {
          positions: Array.from(geometry.getAttribute("position").array),
          normals: Array.from(geometry.getAttribute("normal").array),
          uvs: Array.from(geometry.getAttribute("uv").array),
          indices: Array.from(geometry.index.array),
        }];
      }),
    );
    document.body.textContent = JSON.stringify(window.__exportFomV54Decals());
  }
  applyLiveryScheme(activeLiveryScheme);
  selectDecal("rear");
  setView("rear");
  loading.classList.add("is-hidden");
}).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  loading.querySelector("p").textContent = `LOAD FAILED · ${reason}`;
  console.error(error);
});

function createWhiteTextureFromSourceAlpha(sourceTexture) {
  const image = sourceTexture.image;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = image.naturalWidth || image.width;
  textureCanvas.height = image.naturalHeight || image.height;
  const context = textureCanvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(
    0,
    0,
    textureCanvas.width,
    textureCanvas.height,
  );
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = 255;
    pixels.data[i + 1] = 255;
    pixels.data[i + 2] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createHighResolutionTexture(sourceTexture, targetWidth) {
  const image = sourceTexture.image;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = targetWidth;
  textureCanvas.height = Math.round(targetWidth * sourceHeight / sourceWidth);
  const context = textureCanvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  context.drawImage(
    image,
    0,
    0,
    textureCanvas.width,
    textureCanvas.height,
  );
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createLiveryCanvasTexture(width, height) {
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = width;
  canvasTexture.height = height;
  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

function fillNormalizedPolygon(context, color, points) {
  const { width, height } = context.canvas;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(points[0][0] * width, points[0][1] * height);
  for (let i = 1; i < points.length; i += 1) {
    context.lineTo(points[i][0] * width, points[i][1] * height);
  }
  context.closePath();
  context.fill();
}

function drawSideLiveryScheme(texture, scheme) {
  const context = texture.image.getContext("2d");
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (scheme === "classic") {
    fillNormalizedPolygon(context, "#161719", [
      [0, 0.58], [0.48, 0.58], [0.66, 0.76], [1, 0.78], [1, 1], [0, 1],
    ]);
    fillNormalizedPolygon(context, "#ffffff", [
      [0.02, 0.08], [0.22, 0.08], [0.34, 0.24], [0.28, 0.34], [0.04, 0.26],
    ]);
    fillNormalizedPolygon(context, "#ffffff", [
      [0.78, 0.12], [0.98, 0.12], [0.98, 0.3], [0.84, 0.34], [0.72, 0.24],
    ]);
  } else if (scheme === "silver") {
    fillNormalizedPolygon(context, "#3e444a", [
      [0, 0.08], [0.45, 0.08], [0.62, 0.3], [1, 0.34], [1, 0.68], [0.58, 0.62], [0.42, 0.42], [0, 0.4],
    ]);
    fillNormalizedPolygon(context, "#151719", [
      [0, 0.7], [0.5, 0.66], [0.68, 0.82], [1, 0.84], [1, 1], [0, 1],
    ]);
    fillNormalizedPolygon(context, "#00d9d2", [
      [0, 0.43], [0.4, 0.45], [0.58, 0.66], [1, 0.71], [1, 0.76], [0.56, 0.71], [0.38, 0.5], [0, 0.48],
    ]);
  } else if (scheme === "orange") {
    fillNormalizedPolygon(context, "#101214", [
      [0, 0.18], [0.38, 0.16], [0.52, 0.3], [0.72, 0.38], [1, 0.4], [1, 0.9], [0.7, 0.86], [0.5, 0.72], [0, 0.68],
    ]);
    fillNormalizedPolygon(context, "#00b8a9", [
      [0, 0.69], [0.49, 0.73], [0.69, 0.88], [1, 0.92], [1, 0.96], [0.67, 0.93], [0.47, 0.78], [0, 0.74],
    ]);
  }
  texture.needsUpdate = true;
}

function drawTopLiveryScheme(texture, scheme) {
  const context = texture.image.getContext("2d");
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (scheme === "classic") {
    fillNormalizedPolygon(context, "#ffffff", [
      [0, 0], [0.18, 0], [0.28, 0.44], [0.2, 1], [0, 1],
    ]);
    fillNormalizedPolygon(context, "#ffffff", [
      [0.82, 0], [1, 0], [1, 1], [0.8, 1], [0.72, 0.44],
    ]);
    fillNormalizedPolygon(context, "#161719", [
      [0.06, 0.78], [0.2, 0.76], [0.23, 1], [0.08, 1],
    ]);
    fillNormalizedPolygon(context, "#161719", [
      [0.94, 0.78], [0.8, 0.76], [0.77, 1], [0.92, 1],
    ]);
  } else if (scheme === "silver") {
    fillNormalizedPolygon(context, "#50565c", [
      [0, 0], [0.25, 0], [0.31, 1], [0.08, 1],
    ]);
    fillNormalizedPolygon(context, "#50565c", [
      [0.75, 0], [1, 0], [0.92, 1], [0.69, 1],
    ]);
    fillNormalizedPolygon(context, "#00d9d2", [
      [0.22, 0], [0.255, 0], [0.32, 1], [0.285, 1],
    ]);
    fillNormalizedPolygon(context, "#00d9d2", [
      [0.745, 0], [0.78, 0], [0.715, 1], [0.68, 1],
    ]);
  } else if (scheme === "orange") {
    fillNormalizedPolygon(context, "#101214", [
      [0.2, 0], [0.8, 0], [0.72, 1], [0.28, 1],
    ]);
    fillNormalizedPolygon(context, "#00b8a9", [
      [0.17, 0], [0.205, 0], [0.285, 1], [0.25, 1],
    ]);
    fillNormalizedPolygon(context, "#00b8a9", [
      [0.795, 0], [0.83, 0], [0.75, 1], [0.715, 1],
    ]);
  }
  texture.needsUpdate = true;
}

function applyLiveryScheme(scheme) {
  if (!LIVERY_SCHEMES[scheme]) return;
  activeLiveryScheme = scheme;
  const schemeConfig = LIVERY_SCHEMES[scheme];
  if (schemeConfig.primary) {
    applyThemeColor(schemeConfig.primary, schemeConfig.primaryName);
  }
  const schemeValue = {
    clean: 0,
    classic: 1,
    silver: 2,
    orange: 3,
    blueArrow: 4,
    violetGold: 5,
    greenCut: 6,
    silverSpine: 7,
  }[scheme];
  for (const material of themeMaterials) {
    const uniforms = material.userData.liveryPartitionUniforms;
    if (!uniforms) continue;
    uniforms.scheme.value = schemeValue;
    uniforms.accentA.value.set(schemeConfig.accentA ?? "#000000");
    uniforms.accentB.value.set(schemeConfig.accentB ?? "#000000");
  }
  document.querySelectorAll("[data-livery-scheme]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.liveryScheme === scheme);
  });
  const output = document.querySelector("#livery-scheme-name");
  if (output) output.textContent = schemeConfig.name;
}

function createTrimmedTransparentTexture(sourceTexture, targetWidth) {
  const image = sourceTexture.image;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight);
  let minX = sourceWidth;
  let minY = sourceHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const offset = (y * sourceWidth + x) * 4;
      const alpha = pixels.data[offset + 3];
      if (alpha < 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return createHighResolutionTexture(sourceTexture, targetWidth);
  }
  const padding = 2;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(sourceWidth - 1, maxX + padding);
  maxY = Math.min(sourceHeight - 1, maxY + padding);
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = targetWidth;
  outputCanvas.height = Math.max(
    1,
    Math.round(targetWidth * cropHeight / cropWidth),
  );
  const outputContext = outputCanvas.getContext("2d");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(
    sourceCanvas,
    minX,
    minY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  );
  const texture = new THREE.CanvasTexture(outputCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createDecalMesh(texture, name) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    alphaTest: 0.001,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -8,
    side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = name;
  mesh.renderOrder = 10;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function prepareProjectionSource(meshes, root) {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const output = [];
  const vertex = new THREE.Vector3();

  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.index;
    const meshToRoot = rootInverse.clone().multiply(mesh.matrixWorld);
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 1) {
      const vertexIndex = index ? index.getX(i) : i;
      vertex.fromBufferAttribute(position, vertexIndex).applyMatrix4(meshToRoot);
      output.push(vertex.x, vertex.y, vertex.z);
    }
  }
  return new Float32Array(output);
}

function buildProjectionSubset(state) {
  const positions = projectionSource;
  const output = [];
  const width = state.baseWidth * state.scale * state.width;
  const height = state.baseHeight * state.scale * state.height;
  const sideSign = state.x < 0 ? -1 : 1;
  const minX = state.kind === "side"
    ? state.x - state.depth * 0.7
    : state.x - width * 0.5 - 0.08;
  const maxX = state.kind === "side"
    ? state.x + state.depth * 0.7
    : state.x + width * 0.5 + 0.08;
  const minY = state.y - height * 0.5 - 0.08;
  const maxY = state.y + height * 0.5 + 0.08;
  const minZ = state.kind === "side"
    ? state.z - width * 0.5 - 0.1
    : state.z - state.depth * 0.75;
  const maxZ = state.kind === "side"
    ? state.z + width * 0.5 + 0.1
    : state.z + state.depth * 0.75;

  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i];
    const ay = positions[i + 1];
    const az = positions[i + 2];
    const bx = positions[i + 3];
    const by = positions[i + 4];
    const bz = positions[i + 5];
    const cx = positions[i + 6];
    const cy = positions[i + 7];
    const cz = positions[i + 8];
    if (
      Math.max(ax, bx, cx) < minX || Math.min(ax, bx, cx) > maxX ||
      Math.max(ay, by, cy) < minY || Math.min(ay, by, cy) > maxY ||
      Math.max(az, bz, cz) < minZ || Math.min(az, bz, cz) > maxZ
    ) continue;

    const centroidX = (ax + bx + cx) / 3;
    const centroidZ = (az + bz + cz) / 3;
    const edge1 = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const edge2 = new THREE.Vector3(cx - ax, cy - ay, cz - az);
    const normal = edge1.cross(edge2);

    if (state.kind === "side") {
      if (centroidX * sideSign <= 0.015) continue;
      if (normal.x * sideSign <= 0) continue;
    } else {
      if (centroidZ > -2.3) continue;
    }
    output.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(output, 3),
  );
  if (output.length) geometry.computeVertexNormals();
  return geometry;
}

function rebuildDecal(key) {
  if (!carRoot || !projectionSource || !decals[key]) return;
  const state = states[key];
  const decal = decals[key];
  if (state.kind === "rear" && state.z > -2.4) {
    showPlaneFallback(
      key,
      "正在穿过车身与尾翼间隙 · 到 Z -2.4 后自动贴合尾翼",
    );
    return;
  }
  if (state.kind === "rear") {
    rebuildRearShrinkwrapDecal(key);
    return;
  }
  if (state.kind === "top") {
    rebuildTopShrinkwrapDecal(key);
    return;
  }
  if (state.kind === "side") {
    rebuildSideShrinkwrapDecal(key);
    return;
  }
  const subset = buildProjectionSubset(state);
  if (!subset.getAttribute("position")?.count) {
    subset.dispose();
    showPlaneFallback(key, "当前位置没有紫色外表面");
    return;
  }

  const projectionMesh = new THREE.Mesh(subset);
  projectionMesh.matrixAutoUpdate = false;
  projectionMesh.matrixWorld.copy(carRoot.matrixWorld);
  const worldPosition = new THREE.Vector3(
    state.x,
    state.y,
    state.z,
  ).applyMatrix4(carRoot.matrixWorld);
  const localEuler = new THREE.Euler(
    THREE.MathUtils.degToRad(state.rotationX),
    THREE.MathUtils.degToRad(
      state.rotationY + (state.reverseFacing ? 180 : 0),
    ),
    THREE.MathUtils.degToRad(state.rotationZ),
    "XYZ",
  );
  const localQuaternion = new THREE.Quaternion().setFromEuler(localEuler);
  const rootQuaternion = carRoot.getWorldQuaternion(new THREE.Quaternion());
  const worldEuler = new THREE.Euler().setFromQuaternion(
    rootQuaternion.multiply(localQuaternion),
    "XYZ",
  );
  const rootScale = carRoot.getWorldScale(new THREE.Vector3());
  const size = new THREE.Vector3(
    state.baseWidth * state.scale * state.width * Math.abs(rootScale.x),
    state.baseHeight * state.scale * state.height * Math.abs(rootScale.y),
    state.depth * Math.abs(rootScale.z),
  );

  let geometry = new DecalGeometry(
    projectionMesh,
    worldPosition,
    worldEuler,
    size,
  );
  subset.dispose();
  geometry.applyMatrix4(carRoot.matrixWorld.clone().invert());
  if (!geometry.getAttribute("position")?.count) {
    geometry.dispose();
    showPlaneFallback(key, "投射为空，请移动后重新吸附");
    return;
  }

  offsetAlongNormals(geometry, NORMAL_OFFSET);
  decal.geometry.dispose();
  decal.geometry = geometry;
  decal.position.set(0, 0, 0);
  decal.rotation.set(0, 0, 0);
  decal.scale.set(1, 1, 1);
  updateTextureFlip(decal.material.map, state);
  if (activeKey === key) {
    status.textContent = key === "rear"
      ? "后部外表面贴合完成"
      : `${key === "left" ? "左侧" : "右侧"}半轴隔离贴合完成`;
  }
}

function rebuildRearShrinkwrapDecal(key) {
  const state = states[key];
  const decal = decals[key];
  const geometry = new THREE.PlaneGeometry(
    state.baseWidth,
    state.baseHeight,
    64,
    18,
  );
  const positions = geometry.getAttribute("position");
  const localEuler = new THREE.Euler(
    THREE.MathUtils.degToRad(state.rotationX),
    THREE.MathUtils.degToRad(
      state.rotationY + (state.reverseFacing ? 180 : 0),
    ),
    THREE.MathUtils.degToRad(state.rotationZ),
    "XYZ",
  );
  const localQuaternion = new THREE.Quaternion().setFromEuler(localEuler);
  const localTransform = new THREE.Matrix4().compose(
    new THREE.Vector3(state.x, state.y, state.z),
    localQuaternion,
    new THREE.Vector3(
      state.scale * state.width,
      state.scale * state.height,
      1,
    ),
  );
  const outward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(localQuaternion)
    .normalize();
  const inward = outward.clone().negate();
  const worldQuaternion = carRoot.getWorldQuaternion(new THREE.Quaternion());
  const worldDirection = inward.clone().applyQuaternion(worldQuaternion).normalize();
  const point = new THREE.Vector3();
  const hitFlags = new Uint8Array(positions.count);
  const retryOffsets = [
    [0, 0],
    [0, 0.008],
    [0, -0.008],
    [0.008, 0],
    [-0.008, 0],
    [0, 0.018],
    [0, -0.018],
  ];
  let hitCount = 0;
  let retryHitCount = 0;

  carRoot.updateMatrixWorld(true);
  for (let i = 0; i < positions.count; i += 1) {
    point.fromBufferAttribute(positions, i).applyMatrix4(localTransform);
    let hit = null;
    let usedRetry = false;
    for (let retryIndex = 0; retryIndex < retryOffsets.length; retryIndex += 1) {
      const [offsetX, offsetY] = retryOffsets[retryIndex];
      const rayOriginLocal = point
        .clone()
        .add(new THREE.Vector3(offsetX, offsetY, 0))
        .addScaledVector(outward, 1.2);
      const rayOriginWorld = rayOriginLocal.applyMatrix4(carRoot.matrixWorld);
      const raycaster = new THREE.Raycaster(
        rayOriginWorld,
        worldDirection,
        0,
        2.4,
      );
      hit = raycaster.intersectObjects(rearSurfaceMeshes, false).find(
        (candidate) => {
          const localPoint = carRoot.worldToLocal(candidate.point.clone());
          return localPoint.z < -2.3;
        },
      );
      if (hit) {
        usedRetry = retryIndex > 0;
        break;
      }
    }
    if (hit) {
      const hitPoint = carRoot.worldToLocal(hit.point.clone());
      point.z = hitPoint.z;
      point.addScaledVector(outward, NORMAL_OFFSET);
      hitFlags[i] = 1;
      hitCount += 1;
      if (usedRetry) retryHitCount += 1;
    }
    positions.setXYZ(i, point.x, point.y, point.z);
  }

  if (hitCount < 8) {
    geometry.dispose();
    showPlaneFallback(key, "尾翼射线命中不足 · 请先调整 Y 到上层尾翼高度");
    return;
  }
  const sourceIndex = geometry.index;
  const keptIndices = [];
  for (let i = 0; i < sourceIndex.count; i += 3) {
    const a = sourceIndex.getX(i);
    const b = sourceIndex.getX(i + 1);
    const c = sourceIndex.getX(i + 2);
    if (!hitFlags[a] || !hitFlags[b] || !hitFlags[c]) continue;
    keptIndices.push(a, b, c);
  }
  if (!keptIndices.length) {
    geometry.dispose();
    showPlaneFallback(key, "尾翼真实表面命中为空 · 请微调 Y 高度");
    return;
  }
  geometry.setIndex(keptIndices);
  positions.needsUpdate = true;
  orientIndexedGeometryOutward(geometry, outward);
  geometry.computeVertexNormals();
  decal.geometry.dispose();
  decal.geometry = geometry;
  decal.position.set(0, 0, 0);
  decal.rotation.set(0, 0, 0);
  decal.scale.set(1, 1, 1);
  updateTextureFlip(decal.material.map, state);
  status.textContent =
    `尾翼真实表面贴合 · ${hitCount - retryHitCount} 直接命中 + ${retryHitCount} 邻域补射`;
}

function rebuildTopShrinkwrapDecal(key) {
  const state = states[key];
  const decal = decals[key];
  const geometry = new THREE.PlaneGeometry(
    state.baseWidth,
    state.baseHeight,
    48,
    48,
  );
  const positions = geometry.getAttribute("position");
  const localEuler = new THREE.Euler(
    THREE.MathUtils.degToRad(state.rotationX),
    THREE.MathUtils.degToRad(
      state.rotationY + (state.reverseFacing ? 180 : 0),
    ),
    THREE.MathUtils.degToRad(state.rotationZ),
    "XYZ",
  );
  const localQuaternion = new THREE.Quaternion().setFromEuler(localEuler);
  const localTransform = new THREE.Matrix4().compose(
    new THREE.Vector3(state.x, state.y, state.z),
    localQuaternion,
    new THREE.Vector3(
      state.scale * state.width,
      state.scale * state.height,
      1,
    ),
  );
  const outward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(localQuaternion)
    .normalize();
  const inward = outward.clone().negate();
  const worldQuaternion = carRoot.getWorldQuaternion(new THREE.Quaternion());
  const worldDirection = inward.clone().applyQuaternion(worldQuaternion).normalize();
  const outwardWorld = outward.clone().applyQuaternion(worldQuaternion).normalize();
  const point = new THREE.Vector3();
  const hitFlags = new Uint8Array(positions.count);
  const retryOffsets = [
    [0, 0],
    [0.004, 0],
    [-0.004, 0],
    [0, 0.004],
    [0, -0.004],
    [0.01, 0],
    [-0.01, 0],
    [0, 0.01],
    [0, -0.01],
    [0.02, 0],
    [-0.02, 0],
  ];
  let hitCount = 0;
  let retryHitCount = 0;

  carRoot.updateMatrixWorld(true);
  for (let i = 0; i < positions.count; i += 1) {
    point.fromBufferAttribute(positions, i).applyMatrix4(localTransform);
    let hit = null;
    let usedRetry = false;
    for (let retryIndex = 0; retryIndex < retryOffsets.length; retryIndex += 1) {
      const [offsetX, offsetZ] = retryOffsets[retryIndex];
      const rayOriginLocal = point
        .clone()
        .add(new THREE.Vector3(offsetX, 0, offsetZ))
        .addScaledVector(outward, 1.2);
      const rayOriginWorld = rayOriginLocal.applyMatrix4(carRoot.matrixWorld);
      const raycaster = new THREE.Raycaster(
        rayOriginWorld,
        worldDirection,
        0,
        2.4,
      );
      hit = raycaster.intersectObjects(surfaceMeshes, false).find((candidate) => {
        const localPoint = carRoot.worldToLocal(candidate.point.clone());
        if (localPoint.z < 0.5 || !candidate.face) return false;
        const faceNormalWorld = candidate.face.normal
          .clone()
          .transformDirection(candidate.object.matrixWorld);
        return faceNormalWorld.dot(outwardWorld) > 0.08;
      });
      if (hit) {
        usedRetry = retryIndex > 0;
        break;
      }
    }
    if (hit) {
      point.copy(carRoot.worldToLocal(hit.point.clone()));
      point.addScaledVector(outward, 0.001);
      hitFlags[i] = 1;
      hitCount += 1;
      if (usedRetry) retryHitCount += 1;
    }
    positions.setXYZ(i, point.x, point.y, point.z);
  }

  if (hitCount < 8) {
    geometry.dispose();
    showPlaneFallback(key, "前部上表面命中不足 · 请调整 Z");
    return;
  }
  const sourceIndex = geometry.index;
  const keptIndices = [];
  for (let i = 0; i < sourceIndex.count; i += 3) {
    const a = sourceIndex.getX(i);
    const b = sourceIndex.getX(i + 1);
    const c = sourceIndex.getX(i + 2);
    if (!hitFlags[a] || !hitFlags[b] || !hitFlags[c]) continue;
    keptIndices.push(a, b, c);
  }
  if (!keptIndices.length) {
    geometry.dispose();
    showPlaneFallback(key, "前部贴花有效曲面为空 · 请调整 Z");
    return;
  }
  geometry.setIndex(keptIndices);
  positions.needsUpdate = true;
  orientIndexedGeometryOutward(geometry, outward);
  geometry.computeVertexNormals();
  decal.geometry.dispose();
  decal.geometry = geometry;
  decal.position.set(0, 0, 0);
  decal.rotation.set(0, 0, 0);
  decal.scale.set(1, 1, 1);
  updateTextureFlip(decal.material.map, state);
  if (activeKey === key) {
    status.textContent =
      `前部鼻锥曲面贴合 · ${hitCount - retryHitCount} 直接命中 + ` +
      `${retryHitCount} 邻域补射`;
  }
}

function rebuildSideShrinkwrapDecal(key) {
  const state = states[key];
  const decal = decals[key];
  const isMainLeftLogo = key === "left";
  const surfaceOffset = isMainLeftLogo ? 0.001 : SIDE_NORMAL_OFFSET;
  const geometry = new THREE.PlaneGeometry(
    state.baseWidth,
    state.baseHeight,
    state.segmentsX ?? (isMainLeftLogo ? 128 : 64),
    state.segmentsY ?? (isMainLeftLogo ? 36 : 18),
  );
  const positions = geometry.getAttribute("position");
  const localEuler = new THREE.Euler(
    THREE.MathUtils.degToRad(state.rotationX),
    THREE.MathUtils.degToRad(
      state.rotationY + (state.reverseFacing ? 180 : 0),
    ),
    THREE.MathUtils.degToRad(state.rotationZ),
    "XYZ",
  );
  const localQuaternion = new THREE.Quaternion().setFromEuler(localEuler);
  const localTransform = new THREE.Matrix4().compose(
    new THREE.Vector3(state.x, state.y, state.z),
    localQuaternion,
    new THREE.Vector3(
      state.scale * state.width,
      state.scale * state.height,
      1,
    ),
  );
  const outward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(localQuaternion)
    .normalize();
  const inward = outward.clone().negate();
  const sideSign = state.x < 0 ? -1 : 1;
  const worldQuaternion = carRoot.getWorldQuaternion(new THREE.Quaternion());
  const worldDirection = inward.clone().applyQuaternion(worldQuaternion).normalize();
  const point = new THREE.Vector3();
  const hitFlags = new Uint8Array(positions.count);
  const retryOffsets = [
    [0, 0],
    [0.006, 0],
    [-0.006, 0],
    [0, 0.008],
    [0, -0.008],
    [0.014, 0],
    [-0.014, 0],
    [0.035, 0],
    [-0.035, 0],
    [0.06, 0],
    [-0.06, 0],
  ];
  let directHitCount = 0;
  let retryHitCount = 0;

  carRoot.updateMatrixWorld(true);
  for (let i = 0; i < positions.count; i += 1) {
    point.fromBufferAttribute(positions, i).applyMatrix4(localTransform);
    let hit = null;
    let usedRetry = false;
    for (let retryIndex = 0; retryIndex < retryOffsets.length; retryIndex += 1) {
      const [offsetY, offsetZ] = retryOffsets[retryIndex];
      const rayOriginLocal = point
        .clone()
        .add(new THREE.Vector3(0, offsetY, offsetZ))
        .addScaledVector(outward, 1.2);
      const rayOriginWorld = rayOriginLocal.applyMatrix4(carRoot.matrixWorld);
      const raycaster = new THREE.Raycaster(
        rayOriginWorld,
        worldDirection,
        0,
        2.4,
      );
      hit = raycaster.intersectObjects(surfaceMeshes, false).find((candidate) => {
        const localPoint = carRoot.worldToLocal(candidate.point.clone());
        return localPoint.x * sideSign > 0.02;
      });
      if (hit) {
        usedRetry = retryIndex > 0;
        break;
      }
    }
    if (hit) {
      const hitPoint = carRoot.worldToLocal(hit.point.clone());
      point.copy(hitPoint);
      point.addScaledVector(outward, surfaceOffset);
      hitFlags[i] = 1;
      if (usedRetry) retryHitCount += 1;
      else directHitCount += 1;
    }
    positions.setXYZ(i, point.x, point.y, point.z);
  }

  let closestPointHitCount = 0;
  for (let i = 0; i < positions.count; i += 1) {
    if (hitFlags[i]) continue;
    point.fromBufferAttribute(positions, i);
    const closestPoint = findClosestSideSurfacePoint(point, sideSign, 0.28);
    if (!closestPoint) continue;
    point.copy(closestPoint).addScaledVector(outward, surfaceOffset);
    positions.setXYZ(i, point.x, point.y, point.z);
    hitFlags[i] = 1;
    closestPointHitCount += 1;
  }

  if (directHitCount + retryHitCount + closestPointHitCount < 8) {
    geometry.dispose();
    showPlaneFallback(key, "外侧车身射线命中不足 · 请调整 Y / Z");
    return;
  }
  const sourceIndex = geometry.index;
  const keptIndices = [];
  for (let i = 0; i < sourceIndex.count; i += 3) {
    const a = sourceIndex.getX(i);
    const b = sourceIndex.getX(i + 1);
    const c = sourceIndex.getX(i + 2);
    if (!hitFlags[a] || !hitFlags[b] || !hitFlags[c]) continue;
    keptIndices.push(a, b, c);
  }
  if (!keptIndices.length) {
    geometry.dispose();
    showPlaneFallback(key, "外侧车身有效三角形为空 · 请调整 Y / Z");
    return;
  }
  geometry.setIndex(keptIndices);
  positions.needsUpdate = true;
  orientIndexedGeometryOutward(geometry, outward);
  geometry.computeVertexNormals();
  decal.geometry.dispose();
  decal.geometry = geometry;
  decal.position.set(0, 0, 0);
  decal.rotation.set(0, 0, 0);
  decal.scale.set(1, 1, 1);
  updateTextureFlip(decal.material.map, state);
  if (activeKey === key) {
    const sideName = key.toLowerCase().includes("left") ? "左侧" : "右侧";
    status.textContent =
      `${sideName}最外层车身贴合 · ` +
      `${directHitCount} 直接命中 + ${retryHitCount} 曲面补射 + ` +
      `${closestPointHitCount} 最近面吸附`;
  }
}

function findClosestSideSurfacePoint(point, sideSign, maximumDistance) {
  const positions = projectionSource;
  const maximumDistanceSquared = maximumDistance * maximumDistance;
  let bestDistanceSquared = maximumDistanceSquared;
  let bestPoint = null;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const candidatePoint = new THREE.Vector3();
  const triangle = new THREE.Triangle();

  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i];
    const ay = positions[i + 1];
    const az = positions[i + 2];
    const bx = positions[i + 3];
    const by = positions[i + 4];
    const bz = positions[i + 5];
    const cx = positions[i + 6];
    const cy = positions[i + 7];
    const cz = positions[i + 8];
    const centroidX = (ax + bx + cx) / 3;
    if (centroidX * sideSign <= 0.02) continue;
    if (
      Math.max(ay, by, cy) < point.y - maximumDistance ||
      Math.min(ay, by, cy) > point.y + maximumDistance ||
      Math.max(az, bz, cz) < point.z - maximumDistance ||
      Math.min(az, bz, cz) > point.z + maximumDistance
    ) continue;

    a.set(ax, ay, az);
    b.set(bx, by, bz);
    c.set(cx, cy, cz);
    triangle.set(a, b, c);
    triangle.closestPointToPoint(point, candidatePoint);
    const distanceSquared = candidatePoint.distanceToSquared(point);
    if (distanceSquared >= bestDistanceSquared) continue;
    bestDistanceSquared = distanceSquared;
    bestPoint ??= new THREE.Vector3();
    bestPoint.copy(candidatePoint);
  }
  return bestPoint;
}

function orientIndexedGeometryOutward(geometry, outward) {
  const positions = geometry.getAttribute("position");
  const index = geometry.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeAB = new THREE.Vector3();
  const edgeAC = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  for (let i = 0; i < index.count; i += 3) {
    const indexA = index.getX(i);
    const indexB = index.getX(i + 1);
    const indexC = index.getX(i + 2);
    a.fromBufferAttribute(positions, indexA);
    b.fromBufferAttribute(positions, indexB);
    c.fromBufferAttribute(positions, indexC);
    edgeAB.subVectors(b, a);
    edgeAC.subVectors(c, a);
    faceNormal.crossVectors(edgeAB, edgeAC);
    if (faceNormal.dot(outward) >= 0) continue;
    index.setX(i + 1, indexC);
    index.setX(i + 2, indexB);
  }
  index.needsUpdate = true;
}

function showPlaneFallback(key, message) {
  const state = states[key];
  const decal = decals[key];
  decal.geometry.dispose();
  decal.geometry = new THREE.PlaneGeometry(state.baseWidth, state.baseHeight);
  decal.position.set(state.x, state.y, state.z);
  decal.rotation.set(
    THREE.MathUtils.degToRad(state.rotationX),
    THREE.MathUtils.degToRad(
      state.rotationY + (state.reverseFacing ? 180 : 0),
    ),
    THREE.MathUtils.degToRad(state.rotationZ),
    "XYZ",
  );
  decal.scale.set(state.scale * state.width, state.scale * state.height, 1);
  updateTextureFlip(decal.material.map, state);
  if (activeKey === key) status.textContent = message;
}

function offsetAlongNormals(geometry, distance) {
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  if (!positions || !normals) return;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setXYZ(
      i,
      positions.getX(i) + normals.getX(i) * distance,
      positions.getY(i) + normals.getY(i) * distance,
      positions.getZ(i) + normals.getZ(i) * distance,
    );
  }
  positions.needsUpdate = true;
}

function updateTextureFlip(texture, state) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(state.flipHorizontal ? -1 : 1, state.flipVertical ? -1 : 1);
  texture.offset.set(state.flipHorizontal ? 1 : 0, state.flipVertical ? 1 : 0);
  texture.needsUpdate = true;
}

function updateRearLight(timeMilliseconds) {
  const redPhase = rearLightEnabled &&
    timeMilliseconds % REAR_LIGHT_PERIOD_MS < REAR_LIGHT_PERIOD_MS * 0.5;
  for (const entry of rearLightMaterials) {
    if (entry.material.color && entry.baseColor) {
      entry.material.color.copy(redPhase ? REAR_LIGHT_RED : entry.baseColor);
    }
    if (entry.material.emissive && entry.baseEmissive) {
      entry.material.emissive.copy(
        redPhase ? REAR_LIGHT_RED : entry.baseEmissive,
      );
      entry.material.emissiveIntensity = redPhase
        ? 4
        : entry.baseEmissiveIntensity;
    }
  }
}

function installLiveryPartitionShader(material) {
  if (material.userData.liveryPartitionUniforms) return;
  const uniforms = {
    scheme: { value: 0 },
    themeColor: { value: new THREE.Color(activeThemeColor) },
    accentA: { value: new THREE.Color(0x000000) },
    accentB: { value: new THREE.Color(0x000000) },
  };
  material.userData.liveryPartitionUniforms = uniforms;
  const originalOnBeforeCompile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, rendererInstance) => {
    originalOnBeforeCompile(shader, rendererInstance);
    shader.uniforms.uLiveryScheme = uniforms.scheme;
    shader.uniforms.uLiveryThemeColor = uniforms.themeColor;
    shader.uniforms.uLiveryAccentA = uniforms.accentA;
    shader.uniforms.uLiveryAccentB = uniforms.accentB;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vLiveryLocalPosition;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLiveryLocalPosition = position;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        [
          "#include <common>",
          "varying vec3 vLiveryLocalPosition;",
          "uniform float uLiveryScheme;",
          "uniform vec3 uLiveryThemeColor;",
          "uniform vec3 uLiveryAccentA;",
          "uniform vec3 uLiveryAccentB;",
        ].join("\n"),
      )
      .replace(
        "#include <map_fragment>",
        [
          "#include <map_fragment>",
          "vec3 liveryP = vLiveryLocalPosition;",
          "float liveryAbsX = abs(liveryP.x);",
          "float liverySide = smoothstep(0.20, 0.34, liveryAbsX);",
          "float liveryBody = smoothstep(-1.72, -1.42, liveryP.y) * (1.0 - smoothstep(1.42, 1.72, liveryP.y));",
          "float liveryFront = smoothstep(0.78, 1.08, liveryP.y);",
          "float liveryBaseLum = max(dot(uLiveryThemeColor, vec3(0.299, 0.587, 0.114)), 0.055);",
          "float liveryDetail = clamp(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)) / liveryBaseLum, 0.42, 1.28);",
          "vec3 liveryAccentA = uLiveryAccentA * liveryDetail;",
          "vec3 liveryAccentB = uLiveryAccentB * liveryDetail;",
          "float liveryMaskA = 0.0;",
          "float liveryMaskB = 0.0;",
          "if (uLiveryScheme > 0.5 && uLiveryScheme < 1.5) {",
          "  float lowerStructure = 1.0 - smoothstep(0.38, 0.5, liveryP.z);",
          "  liveryMaskA = liverySide * liveryBody * lowerStructure;",
          "  float outerShoulder = smoothstep(0.2, 0.34, liveryAbsX) * (1.0 - smoothstep(0.62, 0.76, liveryAbsX));",
          "  float shoulderHeight = smoothstep(0.42, 0.56, liveryP.z);",
          "  liveryMaskB = liveryFront * outerShoulder * shoulderHeight;",
          "} else if (uLiveryScheme > 1.5 && uLiveryScheme < 2.5) {",
          "  float upperStructure = smoothstep(0.43, 0.57, liveryP.z);",
          "  liveryMaskA = liverySide * liveryBody * upperStructure;",
          "  float cyanGuide = 1.0 - smoothstep(0.012, 0.034, abs(liveryP.z - (0.51 + 0.035 * liveryP.y)));",
          "  liveryMaskB = liverySide * liveryBody * cyanGuide;",
          "} else if (uLiveryScheme > 2.5 && uLiveryScheme < 3.5) {",
          "  float sidePanelLow = smoothstep(0.26, 0.36, liveryP.z);",
          "  float sidePanelHigh = 1.0 - smoothstep(0.7, 0.82, liveryP.z);",
          "  float noseSpine = liveryFront * (1.0 - smoothstep(0.2, 0.31, liveryAbsX));",
          "  liveryMaskA = max(liverySide * liveryBody * sidePanelLow * sidePanelHigh, noseSpine);",
          "  float tealSide = 1.0 - smoothstep(0.012, 0.032, abs(liveryP.z - 0.73));",
          "  float tealNose = 1.0 - smoothstep(0.012, 0.03, abs(liveryAbsX - 0.315));",
          "  liveryMaskB = max(liverySide * liveryBody * tealSide, liveryFront * tealNose);",
          "} else if (uLiveryScheme > 3.5 && uLiveryScheme < 4.5) {",
          "  float blueOuterShoulder = smoothstep(0.24, 0.37, liveryAbsX) * (1.0 - smoothstep(0.64, 0.78, liveryAbsX));",
          "  float blueShoulderHeight = smoothstep(0.46, 0.6, liveryP.z);",
          "  liveryMaskA = liveryFront * blueOuterShoulder * blueShoulderHeight;",
          "  float blueArrowEdge = 0.5 + 0.075 * liveryP.y;",
          "  float blueDarkUpper = smoothstep(blueArrowEdge - 0.05, blueArrowEdge + 0.05, liveryP.z) * (1.0 - smoothstep(0.84, 0.96, liveryP.z));",
          "  liveryMaskB = liverySide * liveryBody * blueDarkUpper;",
          "} else if (uLiveryScheme > 4.5 && uLiveryScheme < 5.5) {",
          "  float goldSweepHeight = 0.57 + 0.055 * liveryP.y;",
          "  float goldSideSweep = 1.0 - smoothstep(0.014, 0.038, abs(liveryP.z - goldSweepHeight));",
          "  float goldNoseRail = 1.0 - smoothstep(0.014, 0.034, abs(liveryAbsX - 0.29));",
          "  liveryMaskA = max(liverySide * liveryBody * goldSideSweep, liveryFront * goldNoseRail);",
          "  float violetDarkLower = 1.0 - smoothstep(0.33, 0.46, liveryP.z);",
          "  liveryMaskB = liverySide * liveryBody * violetDarkLower;",
          "} else if (uLiveryScheme > 5.5 && uLiveryScheme < 6.5) {",
          "  float greenCutHeight = 0.44 + 0.1 * liveryP.y;",
          "  float greenDarkCut = 1.0 - smoothstep(greenCutHeight - 0.05, greenCutHeight + 0.05, liveryP.z);",
          "  liveryMaskA = liverySide * liveryBody * greenDarkCut;",
          "  float greenLimeEdge = 1.0 - smoothstep(0.014, 0.036, abs(liveryP.z - greenCutHeight));",
          "  float greenNoseEdge = 1.0 - smoothstep(0.014, 0.034, abs(liveryAbsX - (0.27 + 0.025 * liveryP.y)));",
          "  liveryMaskB = max(liverySide * liveryBody * greenLimeEdge, liveryFront * greenNoseEdge);",
          "} else if (uLiveryScheme > 6.5) {",
          "  float silverRedMidLow = smoothstep(0.39, 0.5, liveryP.z);",
          "  float silverRedMidHigh = 1.0 - smoothstep(0.78, 0.9, liveryP.z);",
          "  float silverRedSpine = liveryFront * (1.0 - smoothstep(0.18, 0.3, liveryAbsX));",
          "  liveryMaskA = max(liverySide * liveryBody * silverRedMidLow * silverRedMidHigh, silverRedSpine);",
          "  float silverBlackLower = 1.0 - smoothstep(0.34, 0.47, liveryP.z);",
          "  liveryMaskB = liverySide * liveryBody * silverBlackLower;",
          "}",
          "diffuseColor.rgb = mix(diffuseColor.rgb, liveryAccentA, clamp(liveryMaskA, 0.0, 1.0));",
          "diffuseColor.rgb = mix(diffuseColor.rgb, liveryAccentB, clamp(liveryMaskB, 0.0, 1.0));",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => "fom-livery-partition-v1";
  material.needsUpdate = true;
}

function applyThemeColor(colorValue, colorName) {
  activeThemeColor = colorValue;
  for (const material of themeMaterials) {
    material.color?.set(colorValue);
    material.userData.liveryPartitionUniforms?.themeColor.value.set(colorValue);
    material.needsUpdate = true;
  }
  document.querySelectorAll("[data-theme-color]").forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.themeColor.toLowerCase() === colorValue.toLowerCase(),
    );
  });
  const output = document.querySelector("#theme-color-name");
  if (output) {
    output.textContent = colorName ??
      document.querySelector(`[data-theme-color="${colorValue}"]`)
        ?.dataset.themeName ??
      colorValue.toUpperCase();
  }
}

function scheduleRebuild(key = activeKey) {
  clearTimeout(rebuildTimers[key]);
  rebuildTimers[key] = setTimeout(() => rebuildDecal(key), 90);
}

function snapActiveToSurface() {
  if (!carRoot || !surfaceMeshes.length) return;
  const state = states[activeKey];
  const targetMeshes = state.kind === "rear" ? rearSurfaceMeshes : surfaceMeshes;
  let localOrigin;
  let localDirection;
  let requestedOutward = null;
  if (state.kind === "side") {
    localOrigin = new THREE.Vector3(
      state.x < 0 ? -1.5 : 1.5,
      state.y,
      state.z,
    );
    localDirection = new THREE.Vector3(state.x < 0 ? 1 : -1, 0, 0);
  } else if (state.kind === "top") {
    localOrigin = new THREE.Vector3(state.x, 1.8, state.z);
    localDirection = new THREE.Vector3(0, -1, 0);
  } else {
    const rearEuler = new THREE.Euler(
      THREE.MathUtils.degToRad(state.rotationX),
      THREE.MathUtils.degToRad(
        state.rotationY + (state.reverseFacing ? 180 : 0),
      ),
      THREE.MathUtils.degToRad(state.rotationZ),
      "XYZ",
    );
    requestedOutward = new THREE.Vector3(0, 0, 1)
      .applyEuler(rearEuler)
      .normalize();
    localOrigin = new THREE.Vector3(state.x, state.y, state.z)
      .addScaledVector(requestedOutward, 1.2);
    localDirection = requestedOutward.clone().negate();
  }
  const worldOrigin = localOrigin.applyMatrix4(carRoot.matrixWorld);
  const worldQuaternion = carRoot.getWorldQuaternion(new THREE.Quaternion());
  const worldDirection = localDirection.applyQuaternion(worldQuaternion).normalize();
  const requestedOutwardWorld = requestedOutward
    ?.clone()
    .applyQuaternion(worldQuaternion)
    .normalize();
  const raycaster = new THREE.Raycaster(worldOrigin, worldDirection, 0, 5);
  const hit = raycaster.intersectObjects(targetMeshes, false).find((candidate) => {
    if (state.kind !== "rear") return true;
    if (carRoot.worldToLocal(candidate.point.clone()).z >= -2.3 || !candidate.face) {
      return false;
    }
    const faceNormalWorld = candidate.face.normal
      .clone()
      .transformDirection(candidate.object.matrixWorld);
    return faceNormalWorld.dot(requestedOutwardWorld) > 0.2;
  });
  if (!hit) {
    status.textContent = "当前横截面未找到紫色车身外表面";
    return;
  }
  const point = carRoot.worldToLocal(hit.point.clone());
  if (state.kind === "side") state.x = point.x;
  else if (state.kind === "top") state.y = point.y;
  else state.z = point.z;
  syncGui();
  rebuildDecal(activeKey);
}

function getOppositeDecalKey(key) {
  if (key === "right") return "left";
  if (key === "left") return "right";
  if (key.endsWith("Right")) {
    const oppositeKey = `${key.slice(0, -"Right".length)}Left`;
    return states[oppositeKey] ? oppositeKey : null;
  }
  if (key.endsWith("Left")) {
    const oppositeKey = `${key.slice(0, -"Left".length)}Right`;
    return states[oppositeKey] ? oppositeKey : null;
  }
  return null;
}

function mirrorActiveToOpposite() {
  const oppositeKey = getOppositeDecalKey(activeKey);
  if (!oppositeKey) {
    status.textContent = "当前贴花没有左右对应版本";
    return;
  }
  const source = states[activeKey];
  const target = states[oppositeKey];
  states[oppositeKey] = {
    ...target,
    scale: source.scale,
    width: source.width,
    height: source.height,
    x: -source.x,
    y: source.y,
    z: source.z,
    rotationX: source.rotationX,
    rotationY: -source.rotationY,
    rotationZ: -source.rotationZ,
    flipHorizontal: source.flipHorizontal,
    flipVertical: source.flipVertical,
    reverseFacing: source.reverseFacing,
  };
  rebuildDecal(oppositeKey);
  const sourceSide = activeKey.toLowerCase().includes("left") ? "左侧" : "右侧";
  const targetSide = oppositeKey.toLowerCase().includes("left") ? "左侧" : "右侧";
  status.textContent = `${sourceSide}参数已镜像同步到${targetSide}`;
}

const guiInputs = {
  scale: document.querySelector("#decal-scale"),
  width: document.querySelector("#decal-width"),
  height: document.querySelector("#decal-height"),
  x: document.querySelector("#decal-x"),
  y: document.querySelector("#decal-y"),
  z: document.querySelector("#decal-z"),
  rotationX: document.querySelector("#decal-rotation-x"),
  rotationY: document.querySelector("#decal-rotation-y"),
  rotationZ: document.querySelector("#decal-rotation-z"),
};

for (const [key, input] of Object.entries(guiInputs)) {
  input.addEventListener("input", () => {
    states[activeKey][key] = Number(input.value);
    updateOutput(input);
    scheduleRebuild();
  });
}

function updateOutput(input) {
  const output = document.querySelector(`[data-output="${input.id}"]`);
  if (!output) return;
  if (input.id.startsWith("decal-rotation-")) {
    output.value = `${Math.round(Number(input.value))}°`;
    return;
  }
  const digits = input.id === "decal-z" ? 4
    : ["decal-x", "decal-y"].includes(input.id) ? 3 : 2;
  output.value = Number(input.value).toFixed(digits);
}

function syncGui() {
  const state = states[activeKey];
  for (const [key, input] of Object.entries(guiInputs)) {
    input.value = state[key];
    updateOutput(input);
  }
  document.querySelector("#flip-horizontal").classList.toggle(
    "is-active",
    state.flipHorizontal,
  );
  document.querySelector("#flip-vertical").classList.toggle(
    "is-active",
    state.flipVertical,
  );
  document.querySelector("#flip-facing").classList.toggle(
    "is-active",
    state.reverseFacing,
  );
  const mirrorButton = document.querySelector("#mirror-opposite");
  const oppositeKey = getOppositeDecalKey(activeKey);
  mirrorButton.disabled = !oppositeKey;
  mirrorButton.textContent = !oppositeKey
    ? "当前贴花无左右镜像"
    : oppositeKey.toLowerCase().includes("left")
      ? "同步镜像到左侧"
      : "同步镜像到右侧";
}

function selectDecal(key) {
  if (!states[key]) return;
  activeKey = key;
  document.querySelectorAll("[data-decal-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.decalTarget === key);
  });
  syncGui();
  const viewName = key === "rear"
    ? "rear"
    : states[key].kind === "top"
      ? "front"
      : key.toLowerCase().includes("left") ? "left" : "right";
  setView(viewName);
  status.textContent = states[key].reverseFacing ? "正反已切换" : "外表面正向";
}

document.querySelectorAll("[data-decal-target]").forEach((button) => {
  button.addEventListener("click", () => selectDecal(button.dataset.decalTarget));
});
document.querySelector("#flip-horizontal").addEventListener("click", () => {
  states[activeKey].flipHorizontal = !states[activeKey].flipHorizontal;
  syncGui();
  scheduleRebuild();
});
document.querySelector("#flip-vertical").addEventListener("click", () => {
  states[activeKey].flipVertical = !states[activeKey].flipVertical;
  syncGui();
  scheduleRebuild();
});
document.querySelector("#flip-facing").addEventListener("click", () => {
  states[activeKey].reverseFacing = !states[activeKey].reverseFacing;
  syncGui();
  scheduleRebuild();
});
document.querySelector("#snap-surface").addEventListener("click", snapActiveToSurface);
document.querySelector("#mirror-opposite").addEventListener(
  "click",
  mirrorActiveToOpposite,
);
document.querySelector("#decal-reset").addEventListener("click", () => {
  states[activeKey] = { ...PRESETS[activeKey] };
  syncGui();
  rebuildDecal(activeKey);
});
document.querySelector("#gui-collapse").addEventListener("click", (event) => {
  const panel = document.querySelector(".decal-panel");
  panel.classList.toggle("is-collapsed");
  event.currentTarget.textContent = panel.classList.contains("is-collapsed") ? "+" : "−";
});
decalToggle.addEventListener("click", () => {
  const visible = !Object.values(decals).every((decal) => decal.visible);
  for (const decal of Object.values(decals)) decal.visible = visible;
  decalToggle.classList.toggle("is-active", visible);
  decalToggle.textContent = visible ? "贴图开启" : "贴图关闭";
});
document.querySelector("#rear-light-toggle").addEventListener("click", (event) => {
  rearLightEnabled = !rearLightEnabled;
  event.currentTarget.classList.toggle("is-active", rearLightEnabled);
  event.currentTarget.textContent = rearLightEnabled
    ? "尾灯闪烁"
    : "尾灯关闭";
});

const VIEWS = {
  car: {
    target: [0, 0.5, 0],
    camera: [4.4, 2.8, 4.8],
  },
  rear: {
    target: [0, 0.82, -2.35],
    camera: [2.5, 1.25, -0.9],
  },
  front: {
    target: [0, 0.28, 1.55],
    camera: [0.75, 3.1, 2.35],
  },
  right: {
    target: [0.35, 0.58, -0.35],
    camera: [3.5, 1.2, -0.3],
  },
  left: {
    target: [-0.35, 0.58, -0.35],
    camera: [-3.5, 1.2, -0.3],
  },
};

function setView(name) {
  if (!carRoot || !VIEWS[name]) return;
  const view = VIEWS[name];
  const worldTarget = new THREE.Vector3(...view.target).applyMatrix4(carRoot.matrixWorld);
  const worldCamera = new THREE.Vector3(...view.camera).applyMatrix4(carRoot.matrixWorld);
  const delta = worldCamera.sub(worldTarget);
  target.copy(worldTarget);
  desiredRadius = delta.length();
  desiredPitch = Math.asin(delta.y / desiredRadius);
  desiredYaw = Math.atan2(delta.x, delta.z);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === name);
  });
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
document.querySelectorAll("[data-theme-color]").forEach((button) => {
  button.addEventListener("click", () => {
    applyThemeColor(button.dataset.themeColor, button.dataset.themeName);
  });
});
document.querySelectorAll("[data-livery-scheme]").forEach((button) => {
  button.addEventListener("click", () => {
    applyLiveryScheme(button.dataset.liveryScheme);
  });
});

canvas.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  desiredYaw -= (event.clientX - drag.x) * 0.006;
  desiredPitch = THREE.MathUtils.clamp(
    desiredPitch + (event.clientY - drag.y) * 0.004,
    -0.1,
    1.25,
  );
  drag = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", () => { drag = null; });
canvas.addEventListener("pointercancel", () => { drag = null; });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  desiredRadius = THREE.MathUtils.clamp(
    desiredRadius * Math.exp(event.deltaY * 0.001),
    0.7,
    18,
  );
}, { passive: false });

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

renderer.setAnimationLoop((timeMilliseconds) => {
  updateRearLight(timeMilliseconds);
  radius = THREE.MathUtils.lerp(radius, desiredRadius, 0.1);
  yaw = THREE.MathUtils.lerp(yaw, desiredYaw, 0.1);
  pitch = THREE.MathUtils.lerp(pitch, desiredPitch, 0.1);
  camera.position.set(
    target.x + Math.cos(pitch) * Math.sin(yaw) * radius,
    target.y + Math.sin(pitch) * radius,
    target.z + Math.cos(pitch) * Math.cos(yaw) * radius,
  );
  camera.lookAt(target);
  renderer.render(scene, camera);
});
