# LoreWeaver v1.0 PRD: MVP 核心通路与静态编译打包需求文档

> **提示**：本篇为重构后的引擎需求文档。它专注于通过本地编排器（Orchestrator）以最低复杂度跑通从“输入同人主题”到“单项目程序化生成与静态编译成功”的全部链路，彻底摒弃手动 Copy-Paste 的聊天流。

---

## 🎯 v1.0 核心使命

实现同人微游戏生成引擎的 **最小闭环 (MVP)**。抛弃复杂的并行 DAG、VLM 智能审计以及跨项目经验反哺。
重点解决：**由 `orchestrate.py` 驱动的“输入一个同人主题” $\rightarrow$ “API 解析并生成 12 关 JSON 结构” $\rightarrow$ “自动生成首关可编译的 Phaser 场景与脑文档分片” $\rightarrow$ “程序化静态编译打包通过”** 的端到端线性流程。

```
                       [Orchestrator CLI]
                               │
[用户输入主题] ──> [0. Boot_Init] ──> [1. IP_Deconstruction] ──> [2. Prototype_Core] ──> [Build Gate]
                               │
                       [生成 manifest.json]
```

---

## 🛠️ 基础技术栈与目录架构

### 1. 引擎所生成游戏的技术栈
- **核心框架**：Phaser 3 (用于渲染与游戏场景交互)
- **构建工具**：Vite (提供开发服务器和生产打包)
- **语言**：Vanilla JavaScript (ES6+ 模块化)
- **自适应**：Phaser 运行基准竖屏 `720x1280`

### 2. 生成项目的目标结构
引擎初始化时，应自动生成并补齐以下项目目录：
```text
my-fan-game/
├── package.json               # 包含 vite, phaser 依赖与 build 脚本
├── vite.config.js             # Vite 构建配置文件
├── index.html                 # 挂载游戏 canvas 的 HTML5 容器
├── docs/                      # 【项目脑】上下文记忆目录
│   ├── manifest.json         # 【新增】持久化状态与大纲 JSON 注册表数据源
│   ├── 00_TASK_HISTORY.md    # 增量记录开发历史
│   ├── 01_PRD.md             # 由 IP_Deconstruction 产出的同人策划案
│   └── 09_PLAN.md            # 当前执行规划
├── js/
│   ├── main.js                # Phaser 配置与初始化入口
│   ├── store.js               # 封装 LocalStorage 状态管理器
│   ├── data.js                # 包含 12 关数据的数据表（由 manifest.json 动态编译生成）
│   └── IdleEngine.js          # 挂机/放置数值计算引擎
├── css/
│   └── style.css              # 基础样式
├── scenes/
│   ├── BootScene.js           # 资源预加载场景
│   ├── MainScene.js           # 绘卷主页场景（显示 12 关列表）
│   ├── MenuScene.js           # 菜单与全局设置场景
│   └── LevelUpScene.js        # 突破/升级表现场景
└── nodes/
    └── node1.js               # 首关核心游戏逻辑场景（Node 1）
```

---

## ⚙️ 核心节点开发规范 (DAG Nodes)

### 节点 0：Boot_Init (项目初始化)
- **角色**：Workflow Director (本地 Scaffolder 算子)
- **输入**：用户同人主题词（例如：“逆天凡人修仙记，主打突破境界与十二重天劫”）
- **核心职责**：
  1. 在工作区创建文件夹，由 Python 脚本自动创建并写入基础的 `package.json`，并配置 Vite 脚本（`dev`、`build`）。
  2. 自动生成 `docs/` 上下文结构，并初始化 `09_PLAN.md` 和 `00_TASK_HISTORY.md`。
  3. 执行 `npm install` 安装 Phaser 与 Vite 依赖。

### 节点 1：IP_Deconstruction (同人灵魂拆解)
- **角色**：Core Spec Designer (API 驱动)
- **输入**：用户同人主题词
- **核心职责**：
  1. **调用大模型 API 解析 IP DNA**：提炼名场面并设计 12 个剧情关卡大纲。
  2. **生成并写入 `docs/manifest.json`**：将大纲数据结构化存储，作为后续生成的“源头注册表”。
     每一关卡数据项必须且仅包含以下结构：
     ```json
     {
       "id": 1,
       "title": "名场面/关卡名称",
       "intro": "剧情梗概，富有同人原著感",
       "taunts": ["原著经典台词 1", "原著经典台词 2"],
       "mechanics": "PENDING",
       "rewards": "首通奖励描述",
       "sceneClass": "PENDING"
     }
     ```
  3. **自动派生 `js/data.js` 和 `docs/01_PRD.md`**：脚本读取 `manifest.json`，自动生成数据表和 Markdown 策划案，免去人工粘贴。
  4. **立项确认闸门 (Gate)**：控制台暂停，提示用户已在 `docs/01_PRD.md` 和 `manifest.json` 生成策划案。用户可在 IDE 中直接编辑微调，按车键继续。

### 节点 2：Prototype_Core (垂直切片与场景代码生成)
- **角色**：Full-Stack Dev Agent (API 驱动)
- **输入**：`docs/01_PRD.md` 与 `js/data.js`
- **核心职责**：
  1. 生成 `js/main.js` 配置 Phaser 项目，并绑定 `BootScene`、`MainScene` 与 `node1`。
  2. **实现 MainScene.js (关卡绘卷)**：
     - 在竖屏 `720x1280` 分辨率下，以绘卷列表形式显示 12 个 Node 的卡片。
     - 读取 `data.js` 中的标题与说明，前 1 个 Node 可点击，其余 Node 默认置灰锁定。
     - 点击 Node 1 能够平滑切换并跳转至 `node1` (首关场景)。
  3. **实现 nodes/node1.js (首关垂直切片)**：
     - 最简化实现第一关：读取 `data.js` 中 `id: 1` 的规则和台词。
     - 在场景内以文本形式显示“名场面名”、“Boss 经典 Taunt 台词”以及基本的玩家交互按钮（例如：点击“突破天劫”按钮）。
     - 提供一个“撤退”或“返回”按钮，点击后能安全回到 `MainScene.js` 且不发生 Console 报错。

---

## 🧠 短期记忆与上下文机制

每次节点执行的生命周期中必须强制执行：
1. **前置同步**：调用 Agent 前，自动读取 `docs/01_PRD.md` 和 `docs/09_PLAN.md` 注入上下文。
2. **后置增量更新**：节点执行结束后，将详细的执行动作（如：“已成功注入 12 关数据”、“已创建 node1 场景”）增量追加回写至 `docs/00_TASK_HISTORY.md`，并在其中标记目前已跑通的代码模块。

---

## 🚦 静态编译门禁 (Build Gate)

- **职责**：自动测试与断言。
- **验证手段**：
  1. 自动化在命令行中执行 `npm run build`。
  2. **断言判定**：
     - 若 Vite 编译打包过程中抛出语法错误、模块 import 丢失、路径解析失败等致命 Error，则触发 **门禁失效**。
     - 门禁失效时中断流程，退出生成，打印日志。
     - 编译成功并生成 `dist/` 静态资源目录时，门禁宣告通过，版本开发完成！

---

## 💡 v1.0 API 契约与输入输出规范 (API Contract)

Orchestrator 在触发各个节点时，通过如下结构化的 JSON 约束调用 Gemini API，实现彻底的“零对话”自动化：

```json
{
  "node_id": "IP_Deconstruction",
  "system_instruction": "You are the Core Spec Designer. Your task is to output a raw JSON matching the GDD specification for the target fan-game theme...",
  "response_format": {
    "type": "json_object",
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "economy": {
          "type": "object",
          "properties": {
            "resources": { "type": "array", "items": { "type": "string" } },
            "realms": { "type": "array", "items": { "type": "string" } }
          }
        },
        "nodes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "integer" },
              "title": { "type": "string" },
              "intro": { "type": "string" },
              "taunts": { "type": "array", "items": { "type": "string" } }
            }
          }
        }
      }
    }
  }
}
```
