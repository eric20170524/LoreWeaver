# 02_ARCHITECTURE.md: Vite + Phaser 架构红线与技术栈

## 1. 技术栈 (Tech Stack)

- 运行时：Phaser 3 + HTML5 Canvas + JavaScript ES Modules。
- 构建工具：Vite，默认脚本为 `npm run dev`、`npm run build`、`npm run preview`。
- 状态存储：`localStorage` + 可序列化 `Store`。
- 体验策略：移动端优先，`Phaser.Scale.FIT` + `720x1280` + `CENTER_BOTH`。
- 资源策略：优先程序化图形、粒子、Web Audio 合成，避免不可控外部素材。

## 2. 架构红线 (Architectural Redlines)

- **Main + Node 解耦**：主干 Scene 负责持久化、成长、资源和 Node 入口；Node Scene 只负责局内玩法与结算。
- **单向结算**：Node 结束后通过 `scene.start("MainScene", { nodeResult })` 或等价桥接回传结果，不直接篡改主干 UI。
- **数据驱动**：Node 标题、战前动员、Boss、机制、奖励、失败惩罚和 sceneClass 必须来自 `data.js` 或等价注册表。
- **Canvas UI**：运行时游戏 UI 使用 Phaser 对象和 helper，不使用 DOM、React 或原生 `alert()` / `confirm()` 做局内交互。
- **Scene 卫生**：所有定时器、输入、并行 UI Scene 和缓存显示对象必须按 `08_SCENE_LIFECYCLE.md` 清理。

## 3. 目录结构规范 (Folder Structure)

```text
/minigame/[slug]/
├── package.json
├── vite.config.js
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js
│   ├── data.js
│   ├── store.js 或核心 Store 接入说明
│   └── game.js 或 registry bootstrap
├── scenes/
│   ├── BootScene.js
│   ├── MainScene.js
│   ├── LevelUpScene.js
│   └── GameOverScene.js
├── nodes/
│   ├── NodeBase.js
│   ├── Node1Scene.js
│   └── Node12Scene.js
├── systems/ 或 utils/
├── tests/
└── docs/
```

## 4. 核心库复用 (Core Library)

- 复用仓库级核心库：`minigame_master/core/lib`。
- 常用模块：`Store`、`ButtonBuilder`、`ModalManager`、`VFX`、`WebAudioSynth`、`GraphicsGen`、`InteractionHelper`。
- 从 `minigame/[slug]/js`、`scenes`、`nodes` 内相对引用核心库时，路径必须回到仓库根目录再进入 `minigame_master/core/lib`，或在 `vite.config.js` 中配置 alias。
- 禁止遗留会解析到不存在目录的旧路径，例如 `../../core/lib/...`。
- `npm run build` 必须作为核心库 import 路径的硬校验；构建失败不得标记任务完成。

## 5. 数据流 (Data Flow)

```text
MainScene
  -> 读取 Store 与 NODE_REGISTRY
  -> 展示资源、成长、12 Node 全局预览
  -> 启动 NodeScene({ nodeId, nodeConfig, playerStats, perks })

NodeScene
  -> 运行局内机制、失败条件、奖励计算
  -> 生成 nodeResult
  -> scene.start("MainScene", { nodeResult })

MainScene
  -> 校验 nodeResult
  -> 写入 Store
  -> 刷新 HUD、解锁、奖励与战前入口状态
```

## 6. 自测与验证命令 (Verification Hub)

进入项目目录后优先运行：

```bash
npm install
npm run build
npm run dev -- --host 127.0.0.1
npm run preview
```

E2E 应接入 Vite dev server 或 preview。统一脚本可作为最低入口：

```bash
python3 minigame_master/workflow/scripts/run_e2e_test.py --game [slug]
python3 minigame_master/workflow/scripts/run_e2e_test.py --game [slug] --node 1
```

验证完成定义：

- 页面加载无 console error 和 page error。
- `npm run build` 成功，且所有核心库 import 可解析。
- 主干 UI 可读写 Store，资源和 Node 状态能刷新。
- Node 至少能进入、撤退、失败或成功结算并返回 Main。
- Playwright 或浏览器自动化已保存并人工查看桌面宽屏、移动端真机/设备模拟和关键弹窗/玩法说明/结算截图，确认无文字溢出、遮挡、按钮越界或安全区问题。
- 发现的新坑已写回 `07_RULES_AND_BUGS.md`，通用经验已检查是否需要同步 master prompts/templates。
