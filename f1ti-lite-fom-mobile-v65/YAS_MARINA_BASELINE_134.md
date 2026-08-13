# 亚斯码头赛道固定基准

> 状态：用户已确认，已固化到项目  
> 赛道 ID：`yas-marina`  
> 资源：`assets/yas-marina-2021.glb`  
> 记录日期：2026-08-11  
> 确认版本：`yas-frozen-gui-guide-134`  
> 固化版本：`65-yas-baseline-cota-start-135`

## 固化的路线数据

用户在亚斯码头导览线拖动 GUI 中最后保存的数据已从页面本地存储中提取，并写入：

- `yas-marina-baseline-data.js`
- `routeXZ`：809 个有序 X/Z 路线点，用于正式赛道中心线、AI、小地图和终点线计算。
- `visualGuide`：1154 个 GUI 最终可视虚线采样点，包含 X/Y/Z、法线、切线和速度上限。

数据校验：

```text
routeXZ JSON SHA-256:
f42426abe618ed72acc9aefb45e74e01c67b1c5d9b6891b92731a9aba400267a

visualGuide JSON SHA-256:
cedbf882185cba3ba88c188aae1bd6eabfec68ac4153023c19467eb4a2dbf114
```

路线首尾数据：

```json
{
  "routeXZFirst": [-104.35, -74.70],
  "routeXZLast": [-104.657, -75.241],
  "visualGuideFirst": [-104.35, 32.53513, -74.70, -0.00073, 1, -0.00144, 0.46795, 0.00178, 0.88375, 67.9645],
  "visualGuideLast": [-105.41138, 32.53005, -76.85034, -0.00073, 1, -0.00145, 0.43213, 0.00178, 0.90181, 65.8606]
}
```

### 加载优先级

1. 如果存在有效的 `localStorage` GUI 新调整，使用 GUI 数据。
2. 如果本地存储被清理，使用 `yas-marina-baseline-data.js` 中的本基准。
3. 不得因自动路线生成器的点数变化而整条丢弃 GUI 路线。
4. 正式游戏的可视导览线应直接使用已确认的 `visualGuide`，不再二次重采样。

## 固定发车位

| 车辆 | ID | X | Z | 朝向 |
| --- | --- | ---: | ---: | ---: |
| 玩家 | `player` | -104.35 | -74.70 | 27.0° |
| Red Bull | `redbull` | -102.56 | -80.10 | 27.0° |
| Ferrari | `ferrari` | -107.97 | -81.89 | 27.0° |
| 创变者 | `creator` | -106.03 | -87.18 | 27.0° |
| Mercedes | `mercedes` | -111.52 | -89.13 | 27.0° |

这些发车位不得被自动路线、自动发车格或其他赛道的默认间距逻辑覆盖。

## 车辆比例

```json
{
  "player":   { "x": 0.4, "y": 0.4, "z": 0.4 },
  "redbull":  { "x": 0.4, "y": 0.4, "z": 0.4 },
  "ferrari":  { "x": 0.4, "y": 0.4, "z": 0.4 },
  "creator":  { "x": 0.4, "y": 0.4, "z": 0.28 },
  "mercedes": { "x": 0.4, "y": 0.4, "z": 0.4 }
}
```

- 亚斯码头实际位移速度使用 0.4 缩放，表显车速保持原数值。
- 摄像机距离和近裁剪面按车辆缩放比适配。
- Red Bull 和 Ferrari 应以轮胎接触面贴地，不得用固定高度弥补。

## 路面和双层判定

- 主赛道：节点 `Object_40`、mesh `Object_36`、材质 `tentrail_32`。
- `Object_17` 不是赛道，不得用于地面、AI 或导览线投射。
- 上层弯道允许 `Object_77` / `tentrail_64`，只限区域：`X -62..12`、`Z 14..70`。
- `Object_34` 不得作为该上层弯道的路面。
- 路线投射高度基准为 `Y 32.5`，不得在交叉位置跳到地下通道。

## 已删除场景对象

```text
Object_101
Object_128
Object_121
Object_112
Object_104
Object_125
Object_102
Object_113
```

以上对象在亚斯码头中必须隐藏，不得影响道路显示和碰撞。

## 本地存储键

```text
f1ti_track_calibration_v1:yas-marina
f1ti_yas_route_xz_override_v1
f1ti_yas_visual_guide_v1
```

## 基准文件 SHA-256

```text
2098a40e4e8adc7869274412ddf492994e06686f7bcb3355f4682c7729ce0a4b  index.html
7d0b765c699f2abe9cf7cf54004aaac41103ca6b1851090be7bda1fd5a54e8eb  track-selector.js
6e9d87a4ee9bf1f9d4405b6ecef00e05ec555596f45ab0c15d7fe5cb1cdfc6b3  assets/index-BlSzAKoK.js
5f29e5ff41773d5b855cf2746fbaf7aff2b8c367a41ed55b584c1e95c9799c29  yas-marina-baseline-data.js
079d0e3a6f1aabf4804b8a8bea63e1692e208971fa028e80f83c0888c0c18b91  assets/yas-marina-2021.glb
```

> 注：`index.html` 和 `track-selector.js` 在固化脚本接入后会发生预期内的 SHA 变化；路线数据的独立 JSON SHA 是确认坐标内容的主要依据。

## 后续迭代约束

1. 调试其他赛道时，不得修改亚斯码头发车位、车辆比例、路面节点白名单、删除对象或固化路线。
2. 小地图、AI、终点线与可视导览线必须保持同一路线顺序。
3. 如果以后再次通过 GUI 修改亚斯码头，必须同时更新固化脚本、数据 SHA 和本文档。

## 验证边界

- 已完成 JavaScript 语法检查。
- 已确认本地服务器可访问。
- 按用户要求，未使用 Browser 工具进行自动化游戏测试。
