# 创变者赛车尾翼白色贴花

这是已经确认参数的正式接入包。贴花对应 `创变者配色车-optimized.glb` 的尾翼外侧表面，所有坐标均为赛车模型根节点的局部坐标。

## 文件

- `创变者配色车-optimized.glb`：已经确认贴花参数的赛车模型，模型贴图已内嵌。
- `rear-wing-logo-white.png`：1250 × 230，白色图形、透明背景，可直接作为透明材质贴图。
- `decal-config.json`：引擎无关的尺寸、位置、旋转与材质参数。
- `rear-wing-decal.js`：Three.js 可直接导入的实现。

## 已保存参数

| 参数 | 数值 |
|---|---:|
| 整体大小 | 0.58 |
| 宽度倍率 | 1.24 |
| 高度倍率 | 0.80 |
| X | 0.000 |
| Y | 0.195 |
| Z | -0.4935 |
| 旋转 X | -21° |
| 旋转 Y | 180° |
| 旋转 Z | 0° |
| 旋转顺序 | XYZ |

基础平面为 `0.235 × 0.043`，应用倍率后的实际局部尺寸为 `0.169012 × 0.019952`。

## Three.js 接入

把整个文件夹复制到正式项目。赛车模型使用 Draco 压缩，请确保 `GLTFLoader` 已配置 `DRACOLoader`。模型加载完成后调用：

```js
import { addRearWingDecal } from "./rear-wing-decal-package/rear-wing-decal.js";

const carRoot = gltf.scene; // 创变者配色车-optimized.glb
scene.add(carRoot);

const rearWingDecal = await addRearWingDecal({
  parent: carRoot,
  renderer,
});
```

贴花必须添加到赛车模型根节点 `carRoot`，不要直接添加到全局 `scene`，这样它会跟随赛车的位置、旋转、缩放和动画。

清理赛车时可同步释放贴花资源：

```js
import { disposeRearWingDecal } from "./rear-wing-decal-package/rear-wing-decal.js";

disposeRearWingDecal(rearWingDecal);
```

## Unity、Unreal 或其他引擎

读取 `decal-config.json`，创建一个透明双面平面，并将 `rear-wing-logo-white.png` 设置为颜色/透明度贴图：

1. 平面基础尺寸：宽 `0.235`，高 `0.043`。
2. 应用整体、宽度和高度倍率。
3. 使用模型根节点局部坐标设置位置。
4. 按 `XYZ` 顺序应用欧拉角。
5. 材质启用 Alpha Blend 或 Alpha Test，关闭深度写入。

不同引擎可能使用不同的坐标轴、欧拉角顺序或单位。若导入后方向不一致，请先转换坐标系，不要重新手调这组模型局部参数。

## 注意

- 当前参数针对包内的 `创变者配色车-optimized.glb`。
- 如果正式游戏重新导出、旋转或单独拆分了尾翼，需要把这些局部参数转换到新的父节点空间。
- `Z = -0.4935` 包含防止贴花与尾翼表面闪烁的轻微外移量。
