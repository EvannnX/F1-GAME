# Formula TI 当前游戏基线存档

- 存档日期：2026-08-10
- 项目目录：`/Users/xiaobang/f1第一人称测试/f1ti-lite-fom-mobile-v65/`
- 当前构建标识：`65-bahrain-minimap-guide-79`
- 本地测试参考：`http://127.0.0.1:5205/?track=bahrain&build=bahrain-minimap-guide-79`
- 项目当前磁盘大小：约 591 MB

## 终点线判定检查

当前正式游戏中的终点线判定符合“完整跑一圈，第二次通过起终点线时结算”的要求：

1. 起终点位置取当前赛道路线的第一个点，终点线方向由该点的路线切线计算。
2. 倒计时结束开赛时只记录车辆所在终点线的初始侧，不会立即结算。
3. 玩家必须依次通过路线 25%、50%、75% 三个检查点，不能通过掉头或穿越起点误触发结算。
4. 完成检查点后还要满足累计行驶距离要求；巴林赛道使用非斯帕赛道的 3500 m 最低保护阈值。
5. 只有车辆从终点线正侧穿到负侧，且横向距离终点线中心不超过 18 m，才会触发比赛结束。
6. 触发后会锁定结算状态，停止驾驶输入，播放冲线流程，随后进入比赛结果和人格卡流程。

静态检查结果：未发现首次发车误结算、绕过检查点提前结算或反向穿线结算的代码问题。

## 当前保留的核心内容

- 真实赛车玩法与趣味玩法。
- 玩家车辆与 AI 对手，多种车辆模型可共用。
- 已移除迈凯轮模型。
- 车库与页面品牌文字使用 `Formula TI`。
- 背景音乐、引擎声和赛后声音流程。
- 赛道选择、国旗、城市/地标卡片。
- 赛道调校 GUI、多车发车格拖动、赛车尺寸与视角调整。
- 多赛道小地图、绿色行驶轨迹、地面引导线和 AI 路线。
- 巴林赛道当前小地图直接使用实际引导线点列，当前版本为 v79。
- 巴林地面采样保留每辆车已保存的 X/Z 发车位置，不会把所有车吸附到中心线。

## 当前主要赛道资源

- `assets/shanghai_meshopt-DO2YyGsm.glb`
- `assets/spa-francorchamps-2022.glb`
- `assets/suzuka-2001.glb`
- `assets/bahrain.glb`
- `assets/yas-marina-2021.glb`
- `assets/cota-2012.glb`
- `assets/marina-bay-street-circuit.glb`
- `assets/red-bull-ring-2025.glb`

## 基线文件 SHA-256

```text
67a2cdb3e5aa20b86389f6cbdcae4fab6994488c21fd7bd456d6859bff0e050d  index.html
8f73e454e90cf954d603cda4fd4d9f2d59e76d1df4ffef9d0f5d326e9cb90b1e  track-selector.js
3334257c39275e8b316a2b4a3b167b30cbdf6b97ab3ae0e581dd5845fcd14b83  assets/index-BlSzAKoK.js
62e7f82a0bfea26a3b54ecdf5c711fe64a23575b16fd9b15acdbf1fac2450599  assets/bahrain.glb
bb7cc127351f6b9ec70e3c3d9f30816bf47f1699f138a81bf8d1f06391eca00f  assets/suzuka-2001.glb
45d9ace3a8b3f189145824baa5dce6703c9b6e25d24e86d7588bb1c9e57d8b56  assets/spa-francorchamps-2022.glb
```

SHA-256 用于确认后续文件是否与本基线完全一致。本文档只记录当前状态，不代替源码和资源文件本身。

## 验证边界

- 已完成 JavaScript 语法检查和终点线代码路径静态检查。
- 根据用户要求，本次未使用浏览器或自动化实跑测试，实际过线手感由用户自行验证。
