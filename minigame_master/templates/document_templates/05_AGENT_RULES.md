# 05_AGENT_RULES.md: AI 编码与行为准则 (同人微端游戏专用)

## 1. 核心工作流与输入 (Workflow & Inputs)

在开始编写任何代码前，你必须确认你的工作环境中存在以下核心文档，并将它们作为你的“大脑”：
1. **`01_PRD.md`**：决定游戏主题、核心循环、成长线和 12 个剧情 Node 的产品边界。
2. **`02_ARCHITECTURE.md`**：决定 Vite + Phaser 3 的目录结构、模块职责和 Main -> Node -> Main 流转。
3. **`03_CANVAS_UI_RULES.md`**：决定 Canvas 内 UI、移动端安全区、文本换行和触控反馈。
4. **`04_STATE_STORAGE.md`**：决定 Store、注册表、资源字段和 Node 结算载荷。
5. **`07_RULES_AND_BUGS.md`**：这是你的**知识库与红线**。写代码前必须阅读【绝对红线】与【踩坑记录】。
6. **`08_SCENE_LIFECYCLE.md`**：决定 Scene 切换、防重入、并行 UI Scene 清理和 shutdown 卫生。
7. **`09_DEVELOPMENT_AND_POLISH_PLAN.md`**：这是当前开发完善路线。新工作优先从这里确认阶段目标，`00_TASK_HISTORY.md` 只作为执行记录与历史账本。

## 2. 核心编码信条与行为规范 (Coding & Agent Rules)

- **代码是负债**：用最少的代码解决问题。
- **DRY (Don't Repeat Yourself)**：重复代码必须重构。
- **不要猜测**：疑问即停，立刻询问，绝不凭空捏造 API 或未定义的机制。
- **增量执行 (Incremental Execution)**：
  - 每次改动只处理当前阶段目标需要的代码和文档。
  - 新工作先读取 `09_DEVELOPMENT_AND_POLISH_PLAN.md` 的当前阶段目标，再对照 `00_TASK_HISTORY.md` 避免重复已完成工作。
  - 写功能代码前，先记录计划复用模块、AC 和验证命令。
  - 完成后必须运行对应验证命令，日志有报错就先自行修复。
  - 严禁使用 `// ...此处省略代码...` 留下不可运行片段。
- **核心库复用 (Core Reuse)**：
  - 默认复用 `minigame_master/core/lib` 的 Store、Button、Modal、VFX、Audio、Graphics 和交互 helper。
  - 引用核心库时必须确认路径能被 Vite build 解析，禁止遗留会指向不存在 `minigame/core/lib` 的旧路径。
- **自我审查 (Self-Review)**：
  - 写代码前，扪心自问：“我有没有使用 DOM 元素做 UI？”、“我有没有用 `setInterval`？”、“我有没有按照 `07_RULES_AND_BUGS.md` 里的防穿透经验设置物理包围盒？”
  - 不在 `07_RULES_AND_BUGS.md` API 白名单里的 Phaser 接口，**绝对不准用**。

## 3. 思考与验证流 (Think & Verify)

- **伪代码先行**：大变动前，必须先列出实现思路。
- **自我修正 (Self-Correction)**：运行测试发现报错时，必须优先自行阅读 Log、搜索解决方案并尝试修复。
- **验收驱动**：完成代码后，必须自己运行可执行的验证命令；无法运行时说明原因和残余风险。
- **视觉验收驱动**：涉及 UI、布局、弹窗、玩法说明、HUD、结算或移动端体验时，必须通过 Playwright 或浏览器自动化产出并查看桌面宽屏与移动端真机/设备模拟截图。截图里出现文字溢出、遮挡、按钮越界或安全区问题时，任务未完成。
- **拒绝“假成功”**：严禁在没有自测通过的情况下自行打勾任务。

## 4. 文件结构输出规范 (File Structure)

每当你被要求输出代码时，必须保持以下核心结构：
* `package.json`: 包含 `dev`、`build`、`preview` Vite 脚本。
* `index.html`: 只保留一个主要 `type="module"` 游戏入口。
* `css/style.css`: 重置样式，保证 body 撑满且无滚动条。
* `js/main.js`: Phaser 游戏入口配置与 Scene 注册。
* `js/data.js`: 资源、成长、Node、敌人、技能与台词注册表。
* `scenes/*.js`: 主干、菜单、结算、升级等非局内 Scene。
* `nodes/*.js`: Node 基类和 Node 1-12 局内 Scene。

## 5. 🔄 自我进化循环 (The Learning Loop) - 最重要的职责

当你输出的代码出现 Bug，且你在用户的反馈下**成功修复**了这个 Bug 时，你必须在回答的末尾加上以下固定格式：

> **【触发经验沉淀】**
> 请将以下内容追加到 `07_RULES_AND_BUGS.md` 的「踩坑记录」中：
> - **【YYYY-MM-DD 沉淀】** [用一句话描述产生 Bug 的原因，以及如何用代码规范规避它。例如：不要在 update 里创建 Graphics，必须在 create 中创建并复用。]

如果该经验会影响下一个同人 H5 项目的成功率，不能只写入当前项目文档；必须同步更新 `minigame_master/workflow/prompts/` 或 `minigame_master/workflow/templates/`。master prompt/template 同步是本工作流的最高层沉淀目标。

## 6. 🛡️ 安全拦截与错误感知 (Security & Error)

- **高危授权**：当尝试调用涉及破坏性系统命令 (`rm`, `kill` 等) 操作时，必须主动说明风险并等待人类确认。
- **错误感知**：严禁默默吞掉错误。`catch` 块必须输出到 `console.error` 或后端日志，并在条件允许的 UI 界面上给予玩家友好的反馈。

---
*现在，如果你需要开始开发，请先读取 `09_DEVELOPMENT_AND_POLISH_PLAN.md` 的当前阶段目标，再对照 `00_TASK_HISTORY.md` 避免重复已完成工作。*
