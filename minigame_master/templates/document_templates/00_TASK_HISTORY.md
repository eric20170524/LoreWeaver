# 00_TASK_HISTORY.md: 开发任务与执行记录

## 🎯 文档定位
[待记录当前阶段摘要。本文件是执行记录与历史账本，不是唯一的当前计划入口；当前开发路线以 `09_DEVELOPMENT_AND_POLISH_PLAN.md` 为准。]

## ⚠️ 使用规则 (Workflow Rules)
1. **当前入口**：开始工作前先读 `09_DEVELOPMENT_AND_POLISH_PLAN.md` 的当前阶段目标，再对照本文件避免重复已完成任务。
2. **状态更新**：每次完成一个子任务后，必须在本文件追加或更新执行记录、AC、验证命令和技术决策备注。
3. **验收标准 (AC)**：所有涉及 UI 或业务流的任务，必须在任务下方补充 **AC (Acceptance Criteria)**。
4. **阻塞即停 (Blocked)**：遇到需求模糊、API 冲突或无法解决的环境问题，记录 `[Blocked]` 并附带 Error Log，立即停止工作等待人类确认，严禁凭空猜测。
5. **自测闭环 (Validation)**：在标记任务完成前，必须在终端运行对应的验证命令。如果日志有报错，必须自行修复直至成功。拒绝“假成功”。
6. **视觉验收 (Visual QA)**：所有涉及 UI、布局、HUD、弹窗、玩法说明、结算或移动端体验的任务，必须使用 Playwright 或浏览器自动化产出截图，并人工查看桌面宽屏与移动端真机/设备模拟效果；文字溢出、遮挡、按钮越界或安全区问题必须修复后才能打勾。
7. **全局文档同步 (Doc Sync)**：当一个 Phase 的代码事实变化后，必须同步检查 `02_ARCHITECTURE.md`、`04_STATE_STORAGE.md`、`09_DEVELOPMENT_AND_POLISH_PLAN.md` 是否过期。
8. **Master 沉淀同步 (Master Sync)**：当发现跨项目通用经验时，必须同步检查 `minigame_master/workflow/prompts/` 与 `minigame_master/workflow/templates/` 是否需要更新。
9. **自循环机制**：规划 -> 执行 -> 测试 -> 反思。
10. **文档索引**：遇到不确定的规范，请查阅：
   - `00_TASK_HISTORY.md` (执行记录、历史任务与技术备注)
   - `01_PRD.md` (包含一页纸概念文档、核心循环)
   - `02_ARCHITECTURE.md` (主干+分支架构设计)
   - `03_CANVAS_UI_RULES.md` (UI 基调与响应式安全区规范)
   - `04_STATE_STORAGE.md` (替换原 DB 文档：专注 localStorage、注册表与 Node 结算载荷)
   - `05_AGENT_RULES.md` (AI 行为红线与自测闭环)
   - `06_GAME_FEEL.md` (果汁感打磨：CSS 动效、Canvas 粒子、Web Audio ASMR 规范)
   - `07_RULES_AND_BUGS.md` (Phaser 红线与踩坑记录)
   - `08_SCENE_LIFECYCLE.md` (Scene 切换、UI 子场景与 shutdown 清理)
   - `09_DEVELOPMENT_AND_POLISH_PLAN.md` (当前开发完善计划、测试闭环与 master 沉淀)
---

## 🔄 自我进化循环沉淀 (Learning & Best Practices)
- 记录隐式约束、隐式类型转换等陷阱，到 `07_RULES_AND_BUGS.md` 中
- 如果经验能复用到下一个同人 H5 项目，必须同步回 `minigame_master/workflow/prompts/` 或 `minigame_master/workflow/templates/`

## 🐛 遗留问题与技术债 (Icebox / Known Issues)
- [待记录]

---

## 📝 执行记录 (Execution Log)

### Phase x: [阶段名称]
- [ ] **任务 1**：...
- [ ] **任务 2**：...
- [ ] **更新开发完善计划**：检查并更新 `09_DEVELOPMENT_AND_POLISH_PLAN.md`，确认计划没有落后于当前代码事实。
- [ ] **Master 沉淀检查**：判断本阶段是否有跨项目通用经验需要同步到 `minigame_master/workflow/prompts/` 或 `minigame_master/workflow/templates/`。
- [ ] **执行 Playwright 自驱验证闭环**：(强制要求) 本阶段逻辑开发完成后，使用 Vite dev/preview 或 Vite-aware E2E 模拟玩家操作闭环。如有报错，必须查阅日志并修正。
- [ ] **执行视觉截图验收**：(强制要求) UI/布局相关任务必须保存并查看桌面宽屏、移动端真机/设备模拟和关键弹窗/玩法说明/结算截图；截图路径、发现问题和修复结论写入技术备注。
