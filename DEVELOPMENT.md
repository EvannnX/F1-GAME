# F1TI 开发与交接文档

> 适用仓库：`F1-GAME`  
> 文档基线：2026-07-30，Git `080dd58`  
> 面向对象：首次接手的前端、Three.js、技术美术、构建发布与测试人员

## 1. 文档定位

本文件描述的是当前仓库实际代码，不复述理想方案。`AGENTS.md` 指向的需求源 `spec.md` 当前不在仓库中，因此新增需求仍需向产品方索取原始 `spec.md`；`PROJECT.md` 是较早的评审介绍，其中“3 个 AI”“约 8 MB 单文件”“14 位现役车手”等描述已经与代码不完全一致。

当前项目是 Vite 5 + TypeScript + Three.js r170 的横屏赛车 H5。它同时保留了两套游戏实现：

| 路径 | 进入方式 | 作用 | 当前定位 |
|---|---|---|---|
| 真实 GLB 主游戏 | 默认启动 | 真实上海赛道模型、真实地面、车库、第一/第三人称、墙体碰撞、单圈冲线 | 当前用户主路径 |
| 程序化 legacy 游戏 | URL 加 `?oldMainGame=1`，也接受 `legacyMainGame`、`originalMainGame` | 程序化赛道、状态机、动态 AI、名次、解说/教练、较完整统计 | 功能参考与兼容路径 |

不要把两套路径混为一谈。修改功能前先确认目标路径，必要时同步修改两套实现。

## 2. 硬约束与当前符合度

项目约束来自 `AGENTS.md`：

1. 提交 ZIP 不超过 8,000,000 字节，完全离线。
2. 提交包禁止 `fetch`、XHR、WebSocket、CDN 和外链跳转。
3. 只支持横屏，竖屏展示旋转蒙版。
4. 异步流程必须捕获异常，catch 不再抛出。
5. localStorage key 使用 `f1s_` 前缀。
6. ES2022 modules，代码使用单引号且不写分号。

当前状态：

| 约束 | 状态 | 说明 |
|---|---|---|
| 横屏 | 已实现 | `index.html` 中 `@media (orientation: portrait)` 显示 `#rotate-mask` |
| 普通构建离线 | 部分实现 | JS/CSS/大部分 import 资源内联，但赛道、贴图、视频、解说仍作为相对路径文件复制 |
| 8 MB 提交包 | 有专用链路 | `npm run package:offline8m` 会优化、重打包并运行 H5 校验器 |
| 禁网络 API | 只保证在 8 MB 包校验阶段 | 开发/普通构建的 `loadLocalAsset()` 与缓存预热会使用相对地址 `fetch` |
| localStorage 前缀 | 存在偏差 | 主数据多为 `f1s_`，FOM 配色和 offline build 仍有 `f1ti_` 开头的 key |
| TypeScript 严格检查 | 未达标 | Vite 构建通过，但 `npx tsc --noEmit` 当前有类型错误 |

## 3. 快速开始

环境建议：

- Node.js 20+；本次验证环境为 Node `v26.5.0`、npm `11.17.0`
- 浏览器优先 Chrome 119+，移动端同时测试 iOS Safari/宿主 WebView
- 8 MB 打包额外依赖系统命令 `ffmpeg`、`zip`、`unzip`，以及脚本可找到的 glTF Transform、Sharp 缓存

```bash
npm install
npm run dev
```

开发服务器固定为 `0.0.0.0:5188`，默认打开 `http://localhost:5188/index.html`。常用命令：

| 命令 | 用途 |
|---|---|
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | 普通单文件构建，并复制运行时资源 |
| `npm run preview` | 预览普通构建 |
| `npm run size` | 仅显示 `dist/index.html` 大小 |
| `npx tsc --noEmit` | 严格类型检查；当前失败，不能把 Vite 成功等同于类型正确 |
| `npm run release:check` | 保护 Red Bull 轮组、普通构建、生成发布元数据 |
| `npm run zip` | 生成普通 `submission.zip`，不代表满足 8 MB |
| `npm run package:offline8m` | 生成并校验 8 MB 离线提交包 |
| `npm run validate:offline8m` | 重新校验已有 `f1ti-offline-8mb.zip` |
| `npm run build:compact30` | 生成资源外置的 compact 构建，去掉解说 |
| `npm run build:lite-fom-test` | 生成仅含 4 个 FOM 车库入口、无对手车的轻量构建 |
| `npm run package:lite-fom-upload` | 按资源外置、根目录 `index.html` 的参考包结构生成 `f1ti-lite-fom-mobile.zip` |

每次修改运行时代码后至少执行 `npm run build` 和 `npm run size`。面向正式提交时必须执行 `npm run package:offline8m`，不能用普通构建大小代替。

## 4. 技术栈与工程规模

- 运行时依赖：`three@0.170`
- 构建：`vite@5.4`、`vite-plugin-singlefile`、Terser
- 语言：TypeScript，`strict: true`，目标 ES2022；Vite 产物目标为 iOS 13.4 与 Chrome 119
- 音频：Web Audio、HTMLAudioElement、SpeechSynthesis、内置 ZzFX
- 模型：GLB/glTF、Meshopt、Draco
- 当前约 85 个 TypeScript 文件、29,865 行 TypeScript；仓库约 1.1 GB，其中 `src/assets` 约 359 MB

依赖保持非常小。添加新 npm 依赖前必须先征得用户同意，并评估 8 MB 包体影响。

## 5. 目录结构

| 路径 | 职责 |
|---|---|
| `src/main.ts` | 两套游戏入口与集成中心；当前 2,400+ 行，是首要拆分候选 |
| `src/game/` | 状态机、两套物理、AI、碰撞、帧循环 |
| `src/render/` | 场景、真实/程序化赛道、赛车、对手、天气、镜头、涂装 |
| `src/input/` | 键盘、屏幕按钮、摇杆、陀螺仪、抖音/微信传感器桥 |
| `src/ui/` | 首页、玩法、车库、菜单、HUD、结果卡及开发调校 GUI |
| `src/audio/` | 引擎/BGM、解说、驾驶教练、ZzFX 音效 |
| `src/racerPersonality/` | 12 维指标、车手画像、匹配、理由生成 |
| `src/data/` | 赛车目录、最佳路线、地图 mask/route 与涂装数据 |
| `src/cache/` | 普通构建的运行时资源预热 |
| `src/f1ti/api.ts` | 暴露 `window.F1TI` / `window.f1ti` |
| `src/multiplayer/`、`src/ui/lobby.ts` | 未接入主入口的开发期 WebSocket 多人原型 |
| `scripts/` | 模型/贴图烘焙、构建、打包、校验、发布元数据 |
| `public/` | 普通构建保留的解说、过场视频及运行时文件 |
| `F1-卡通图/`、`结果文案/`、`f1ti_cards/` | 人格素材源与参考产物 |
| `dist*`、`.offline8m-assets`、`.compact30-assets` | 生成目录，不手改 |

`src/render/car.ts`、`src/render/lowPolyShanghai.ts`、`src/main.ts` 等文件远超 300 行。继续扩展前应优先按模型适配器、物理集成、加载器和 UI orchestration 拆分。

## 6. 启动流程

`index.html` 加载 `src/main.ts`。`bootEntry()` 的顺序如下：

```text
测试/截图 URL 分流
  ├─ wheel test / creator preview / special livery capture
  └─ 正常启动
       ├─ 安装 window.F1TI API
       ├─ 首页 → 玩法说明 → 车库 → 比赛设置
       └─ 后台并行加载真实 GLB 游戏
            ├─ Scene/天气/赛道/赛车
            ├─ 地面网格和障碍物采样
            ├─ 赛车与对手模型
            └─ 用户点击开始后初始化输入、预热 GPU、倒计时
```

首页展示期间 `warmRuntimeAssetCache()` 会对普通构建的相对资源做最多 4 路预热；8 MB 与 compact 构建直接跳过。开发 GUI 参数会绕过首页，直接进入场景。

## 7. 默认真实 GLB 主游戏

入口为 `bootstrapGlbVersion()`。主要阶段：

1. `createScene()` 建立 WebGLRenderer、相机、灯光、天气、雨滴和可选后处理。
2. `addLowPolyShanghai()` 解析真实上海赛道 GLB，修正材质、广告 UV、透明与重叠面。
3. 应用已保存的发车格、场景删除和赛车尺寸数据。
4. 将大场景切块并创建视距优化器。
5. 以 6 米网格预烘焙地面采样；超过 2.6 秒则回退到实时 Raycaster。
6. 从垂直表面构建空间哈希障碍物采样器。
7. `createGlbDrivePhysics()` 初始化玩家；加载第一人称座舱、静态对手和 telemetry map。
8. 玩家确认比赛配置后初始化输入、GPU prewarm、起跑灯倒计时。
9. 单圈必须依次经过 25%、50%、75% 三个半径 28 米检查点，累计至少 3,500 米，再从正确方向穿过终点 36 米宽 gate。

默认物理参数：

| 参数 | 值 |
|---|---|
| 最高速度 | 82 m/s，约 295 km/h |
| 加速度/刹车 | 48 / 72 m/s² |
| 阻力 | 0.42 |
| 无手动油门巡航 | 120 km/h |
| 转向速率 | 2.9 rad/s，随速度降低 |
| 车体碰撞半径 | 0.82 m |
| 墙擦速度上限 | 60 km/h |

地面采用车体中心、前后、左右多点采样，过滤高度离群点并拟合坡度法线；墙体移动由 `wallCollision.ts` 投影到墙面切线，区分撞击和擦墙，避免车辆粘死。

键盘未按油门时使用 120 km/h 自动巡航；按下 `W`、`↑` 或 DRS 后必须把
`manualThrottle` 切为 `true`，实际油门才能越过巡航速度并继续加速到约
295 km/h。输入层与主循环都保留了主动油门兜底判断，修改输入协议时不能让
显式的 `manualThrottle: false` 覆盖正在发生的全油门信号。

### 默认路径当前未完成的竞赛逻辑

- 比赛设置中的 `difficulty` 与 `commentaryMode` 没有接入 GLB 主游戏。
- 对手会加载到发车格，但比赛中没有调用 `updateOpponent()`，因此不会真正行驶。
- 完赛固定记录 `finalPosition: 1`，`carHits: 0`。
- 撞墙数不是累计值，只根据冲线瞬间 `onRoad` 推导 0 或 1。
- HUD 的圈速固定传 0，显示模式固定为 `keyboard`。
- 人格统计大部分为模板值，只让圈速、最高速度和冲线时是否在路面影响少量维度。

这些是新增“完整比赛”功能时的最高优先级接入点。

## 8. Legacy 程序化游戏

入口为 `bootstrap()`，由 `StateMachine` 管理：

```text
BOOT → MENU → SCAN → PICK_TEAM → COUNTDOWN → RACE → FINISH → RESULT
```

`SCAN` 与 `PICK_TEAM` 目前只是延时占位；车队直接取 localStorage 或 Ferrari 默认值。`CRASH` 虽存在于状态表，但实际碰撞主要在 RACE 内处理。

该路径使用 `render/track.ts` 的手工上海轮廓：约 65 个控制点、2,000 段路面采样、14 米赛道和两侧 2 米路肩。物理最高速度 85 m/s，7 米开始智能回正，9 米触发 crash。

Legacy 当前有 4 个动态 AI：Veteran、Aggressor、Rookie、RedBull。难度倍率为 0.88/1/1.12，AI 根据前方 35 米曲率限速，具有追赶、随机失误、独立车道摆动、车身碰撞和实时名次。玩家完成一圈后结束；全部 AI 完赛后还给玩家 8 秒宽限，防止软锁。

这条路径完整接入：

- 预录比赛解说或 SpeechSynthesis 驾驶教练，二者互斥
- 小地图、实时名次、撞墙/撞车累计、最高速度、PB
- 赛后人格卡与普通结果页

## 9. 输入系统

统一输出 `GameInput { steer, throttle, brake, drs, manualThrottle }`。

| 模式 | 实现 | 行为 |
|---|---|---|
| keyboard | `keyboard.ts` | A/D、Q/E 或左右键转向；W/上/空格油门；S/下刹车；Shift boost |
| touch | `mobileControls.ts` | 左侧两个方向按钮，右侧油门/刹车 |
| joystick | `mobileControls.ts` | 左侧模拟摇杆，右侧油门/刹车 |
| gyro | `gyro.ts` + 屏幕踏板 | 手机倾斜只负责转向，油门/刹车来自屏幕踏板 |

陀螺仪有 1.5° 死区、56° 满量程、1.5 次幂曲线和 0.3 EMA。它依次尝试 `deviceorientation`、`deviceorientationabsolute`、`devicemotion`；抖音/微信宿主使用 `tt.*`/`wx.*` 的 devmotion、gyroscope、accelerometer。iOS 权限必须在比赛设置按钮点击的同步调用栈内请求。

注意：`gyro.ts` 和 `mouseJoystick.ts` 都能产生 pitch，但当前 `input/index.ts` 不消费 `getPitch()`，所以“前后倾斜控制油门/刹车”不是当前实际功能。桌面仅在明确选择 gyro 且无法创建真实传感器时使用鼠标虚拟摇杆。

## 10. 渲染、天气与性能

`createScene()` 的关键策略：

- 移动/低配设备由 coarse pointer、屏幕边长和 CPU 核数推断。
- 像素比上限按设备与流畅/高质档调整；每 1.8 秒采样 FPS，低于 43 自动降分辨率，高于 57 缓慢恢复。
- 高质桌面启用 EffectComposer、Bloom、色彩分级和暗角；移动或流畅档直接渲染。
- 阴影相机跟随车辆，每移动约 36–52 米更新一次。
- 雨天最多 1,400 个 shader 点雨滴，移动或流畅档 520 个。
- 天气有 noon、dawn、sunset、overcast、rain、night 六种，只影响视觉，不影响抓地力。

赛车加载器会按车型选择独立轮组策略。Red Bull、Ferrari F1-75、Mercedes W15、FOM 2026 的轮组识别规则都有单独说明文档；改 `car.ts` 前先阅读根目录对应 `*_WHEEL_PROFILE.md`，Red Bull 还受哈希校验保护。

## 11. 车库与涂装

全量构建提供 Audi DIY、Red Bull、Ferrari、Mercedes、Creator、Creator Special、Creator Partner 七个条目。lite single-car 构建只保留 FOM 系列。

- 选择保存到 `f1s_selected_player_car_v1`
- Audi DIY 接受 PNG/JPG/WebP，源文件不超过 8 MB，缩放到最长边 512 后保存 Data URL
- FOM 支持主题色、核心/合作伙伴涂装、烘焙贴花和动态尾灯
- 车库使用独立 renderer、OrbitControls 与 PMREM 环境，退出时必须释放模型、材质、纹理和 renderer
- 横屏手机在 `960×620` 以下隐藏桌面左右圆形箭头，改用底部横向车型卡片；DIY/配色操作固定在卡片上方，确认键占独立右侧区域
- lite 构建的四张手机车型卡依次为“照片 DIY / 纯色 DIY / AI / PRO”；全量七车构建仍可在同一底栏横向滚动
- `680×420` 以下的比赛设置页改为两列三行并隐藏选项副标题，避免四个操作方式按钮在窄列内互相挤压
- 手机布局必须至少回归 `784×352` 与 `568×320` 两个横屏视口，并检查刘海安全区

## 12. 音频

- `engine.ts`：本地引擎与 BGM 解码后循环播放，引擎音量和 playbackRate 随油门/速度变化。
- `zzfx.ts`：倒计时、碰撞、UI、冲线等程序化短音效。
- `commentary.ts`：当前定义 24 类事件，引用 24 个预录 mp3；通过事件冷却、2.2 秒全局间隔和优先级抢占防刷屏。仅 Legacy 普通构建接入。
- `coach.ts`：前看 80 米、采样 8 点，约 24° 判弯、49° 且速度超过 100 km/h 提示刹车。仅 Legacy 接入。
- 8 MB 与 compact 构建会禁用解说资源，菜单只显示“关闭”。

任何 AudioContext、HTMLAudio 或 SpeechSynthesis 失败都应静默降级，不能阻止比赛。

## 13. 人格系统与公开 API

人格系统使用 12 维：pace、consistency、clean、cornering、braking、racingLine、attack、defense、risk、comeback、pressure、management。

`driverProfiles.ts` 定义了 20 套原型，但 `ACTIVE_CODES` 当前只启用 HMLT、ANTO、VSTP 三种结果及三张卡通头像。匹配分数采用加权平均绝对差，不是欧氏距离；再从前 6 名候选按分数软随机抽取，并通过 `sessionStorage.f1s_last_personality` 避免连续重复。由于当前活跃池只有 3 个，所谓 Top 6 实际就是 3 个。

主入口安装：

```ts
window.F1TI.evaluate(input)
window.F1TI.stats(input)
window.F1TI.profiles()
window.F1TI.show(input, telemetry)
window.F1TI.card.hide()
```

赛后卡片是纯 DOM/CSS，自适应横竖布局，不提供图片导出或一键分享。人格卡关闭后才进入普通结果页。

## 14. 本地持久化

主要业务 key：

| Key | 内容 |
|---|---|
| `f1s_bestLap`、`f1s_runs`、`f1s_team` | PB、局数、车队 |
| `f1s_customLogo` | DIY 涂装 Data URL |
| `f1s_performanceMode` | 流畅模式 |
| `f1s_selected_player_car_v1` | 当前赛车 |
| `f1s_shanghai2018_grid_placements_v2` | 发车格 |
| `f1s_shanghai2018_start_pose_v1` | GLB 起点；开发时按 P 保存 |
| `f1s_shanghai2018_object_deletions_v1` | 场景三角面删除记录 |
| `f1s_car_visual_tuning_v3` | 玩家/对手尺寸 |
| `f1s_shanghai2018_camera_tuning_v3` | 追车相机 |
| `f1s_first_person_cockpit_placement_v8` | 座舱模型与视点 |

已知前缀偏差：`f1ti_fom_livery_scheme_v54`、`f1ti_fom_theme_color_v50` 和 `f1ti_offline_20260722_r12_*`。后续迁移应先读旧 key、写入 `f1s_` 新 key、保留一个版本的兼容读取，不能直接丢弃用户数据。

加 `?resetSceneCache=1`、`clearSceneCache` 或 `resetMapCache` 可清理场景/调校缓存并自动移除 URL 参数。

## 15. 构建形态与离线机制

### 普通构建

`vite-plugin-singlefile` 内联入口 JS/CSS 和 import 资源；随后 `copy-runtime-public-assets.mjs` 只保留解说、视频、`fibi.webp`、赛道 GLB 和赛道贴图，并删除三个大体积源模型副本。2026-07-30 实测：

- `dist/index.html`：92,083,931 bytes，约 88 MiB
- `dist/`：约 128 MiB
- gzip 仅 Vite 报告约 53.9 MB

所以普通构建不满足 8 MB 硬约束。

`RELEASE_METADATA.json` 仍是 2026-07-22 的旧快照，不代表当前产物。`capture-release-metadata.mjs` 还硬编码读取名为 `f1-game` 的 Git remote，而当前仓库只有 `origin`；修正前 `release:check` 的 metadata 阶段不可重复。

`vite.config.ts` 还包含宿主兼容补丁：把 Three.js WebGLState 的三个 `new *Buffer()` 调用改成工厂调用，并避免 Terser `unsafe`、箭头构造器改写和属性混淆。不要在未验证抖音沙盒的情况下删除这些看似反常的配置。

### 8 MB 离线包

链路为：

```text
prepare-offline8m-assets
→ diagnose-offline-start
→ VITE_F1TI_OFFLINE_8M=1 vite build
→ package-offline8m
→ h5-validator
```

其核心做法是压缩模型/音频/图片，将 GLB 字节编码进无损 PNG RGB 通道，在页面内按队列经 Image + Canvas 还原 ArrayBuffer；Shanghai PNG 还可附带内嵌 Draco JS。Vite 插件把 `fetch` 等网络入口改写或移除，最终校验唯一根 `index.html`、ASCII 安全路径、固定目录结构、ZIP 与解压后均不超过 8,000,000 字节，并扫描网络 API、外链、iframe、跳转、Service Worker 和敏感浏览器 API。

本次执行在 `prepareShanghaiOptimizedModel()` 阶段失败：脚本找不到缓存的 Sharp/image tools。它不是业务代码失败，而是打包工具依赖没有被 `package.json` 显式声明。不要在未征得同意时直接新增依赖。

### Compact 与实验构建

`build:compact30` 保留精确桌面赛道，将模型/贴图/视频外置并去掉解说；名称中的 30 不是脚本内的硬性体积校验。`embedded-texture-test`、`compressed-texture-test`、`lite-fom-test` 用于比较贴图内嵌、WebP 贴图和单车无对手方案。

`package:lite-fom-upload` 先执行 `build:lite-fom-test`，再把 `dist-lite-fom-test` 的内容直接压到 ZIP 根目录，不额外包一层文件夹。生成结构应与提供的 FOM-only 参考包一致：

```text
index.html
assets/
track-textures/
video/
fibi.webp
```

该包是“参考包兼容模式”，不是正式 8 MB 离线包：当前产物 31 个 ZIP 条目、27,051,276 bytes，使用相对资源请求，不能用 `h5-validator` 的 8 MB/禁 `fetch` 结论替代。正式平台若执行 8 MB 硬规则，仍必须走 `package:offline8m`。

`prepare-compact30-assets.mjs` 会优先复用已生成的音视频与 WebP 贴图；当本机 Sharp 不可用时，只允许复用已经存在的三张 compact 赛道贴图，缺任何一张都会终止。这样可避免工具缓存缺失时静默输出不完整包。

## 16. 开发 URL 参数

| 参数 | 用途 |
|---|---|
| `?oldMainGame=1` | Legacy 游戏 |
| `?weather=rain` | 强制天气；也可用 noon/dawn/sunset/overcast/night |
| `?gridGui=1` / `allianzGridGui` | 发车格编辑/重新选择 Allianz 网格 |
| `?carVisualGui=1` | 赛车尺寸调校 |
| `?cameraGui=1` | 追车相机调校 |
| `?firstPersonGui=1` | 座舱与第一视角调校 |
| `?deleteObjectsGui=1` | 删除场景物体/三角面 |
| `?map2018Test=1` | 上海 2018 地图独立测试 |
| `?amgWheelTest=1`、`redbullWheelTest`、`ferrariF175WheelTest`、`fomWheelTest` | 轮组专项测试 |
| `?creatorCarPreview=1` | Creator 赛车预览 |
| `?specialLiveryCapture=partners` | 特涂截图模式 |

GUI 参数通常有别名，精确列表见相应模块顶部的 `GUI_PARAMS`。这些入口会绕过普通页面流，不应出现在正式外链。

## 17. 常见修改路径

### 增加赛车

1. 把优化后 GLB 放到 `src/assets`，先记录源授权和体积。
2. 在 `data/playerCars.ts` 添加定义、选择正确 wheel strategy。
3. 在 `render/car.ts` 实现或复用轮组 rig，禁止把 Red Bull 专用规则复制给其他车。
4. 在 `render/opponentCars.ts` 决定是否作为对手。
5. 验证车库、第三人称、五个镜头、第一人称、轮子旋转/转向、阴影。
6. 同步 offline/compact alias 和资源准备脚本，再比较最终 ZIP。

### 修改赛道或发车格

优先使用 URL GUI 调整并保存 localStorage，再把确认值回填代码默认值。修改 GLB 后必须验证发车点落在 tarmac、地面高度、三个圈速检查点、终点 gate、墙体碰撞、telemetry map 和离线 canonical alignment。

### 增加人格

在 `F1TI_ARCHETYPES` 完善文案和维度，把 code 加入 `ACTIVE_CODES`，在 `personalityCard.ts` 直接 import 对应头像并加入 `PORTRAIT_BY_TYPECODE`，同步 offline/compact 的头像压缩清单。只有放素材而不修改 `ACTIVE_CODES` 不会产生新结果。

### 增加语音事件

扩展 `CommentaryEvent`、`COMMENTARY_CLIPS` 和检测状态，加入本地 mp3，验证抢占/冷却与移动端解锁。8 MB/compact 默认不会打入解说，若改变此策略必须重新算包体。

## 18. 测试与发布清单

仓库约定不写自动化测试，以浏览器手测为主；但类型检查和构建检查仍应保留。

1. `git status --short`，确认没有覆盖他人改动。
2. `npx tsc --noEmit`，记录并逐步清零现有类型错误。
3. `npm run build && npm run size`。
4. 桌面 Chrome：完整首页、玩法、车库、设置、倒计时、单圈、人格卡、结果页。
5. 键盘和五个镜头：V/C 循环，1–5 直达。
6. 移动真机横屏：触摸、摇杆、陀螺仪权限、重定中、音频解锁、安全区。
7. 雨天与流畅/高质两档，观察 FPS、自适应分辨率、WebGL 内存。
8. 墙体正撞、擦墙、越过小地面洞、驶入 runoff、第一人称坡度。
9. Legacy 路径：三档难度、AI 名次、解说/教练、PB。
10. `npm run verify:redbull-wheels`。
11. 修复/准备 8 MB 工具依赖后运行 `npm run package:offline8m`，以最后一行 `PASS: 0 block errors` 和实际字节数为发布依据。
12. 解压最终 ZIP，从根 `index.html` 在无网络环境手测；不要只测 Vite server。

## 19. 已知技术债与建议优先级

P0：

- 恢复可重复的 8 MB 构建环境，把隐式缓存工具变为有版本、可审计的工具链。
- 修正发布元数据脚本的 Git remote 假设，并在发布时重建过期的 `RELEASE_METADATA.json`。
- 将 GLB 主游戏接上动态 AI、难度、真实名次、累计碰撞、真实 telemetry 和解说/教练。
- 修复 `npx tsc --noEmit`：缺少 Vite env 类型、部分废弃调校模块引用已删除导出、若干 strict-null/implicit-any 错误。

P1：

- 拆分 `main.ts` 为 boot/navigation、GLB race、legacy race、dev routes。
- 拆分 `car.ts` 为车型适配器；拆分 `lowPolyShanghai.ts` 为材质、加载、地面、障碍物、优化器。
- 统一 `f1s_` 存储前缀并做兼容迁移。
- 删除或归档未接入的多人/lobby 与旧调校模块，减少类型噪声和认知负担。
- 修正 `PROJECT.md` 的包体、AI 数量、人格数量与陀螺仪描述。

P2：

- 为人格匹配增加可复现随机种子或调试开关。
- 为资源建立 manifest：用途、授权、源文件、运行时文件、各构建是否纳入、压缩参数。
- 清理未被运行时引用的大模型和重复素材，缩短克隆、扫描和构建时间。

## 20. 当前验证结论

- `npm run build`：通过，Vite 119 个模块，约 14.5 秒。
- `npm run size`：通过，普通 `dist/index.html` 约 88 MiB。
- `npm run verify:redbull-wheels`：通过，模型几何与轮组函数保护值一致。
- `npx tsc --noEmit`：失败，当前不能视为类型安全。
- `npm run package:offline8m`：未完成，缺少脚本期望的 cached image tools。
- `npm run package:lite-fom-upload`：通过，生成 27,051,276-byte、31-entry 的参考结构 ZIP。
- 移动端浏览器手测：`784×352` 与 `568×320` 通过；四个 FOM 车型切换、DIY、纯色和特涂控制区未重叠。
- 工作区在创建本文档前为干净状态；构建目录、compact 中间产物和生成 ZIP 均被 `.gitignore` 忽略。

交接时应把“普通构建可运行”和“正式 8 MB 离线包可发布”视为两个独立门槛。
