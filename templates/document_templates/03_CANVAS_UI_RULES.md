# 03_CANVAS_UI_RULES.md: Phaser Canvas UI 与交互规范 (Vibe Template)

## 1. 核心准则 (UI Principles)
- **Canvas 内 UI**：运行时游戏 UI 必须使用 Phaser `Text`、`Graphics`、`Container`、Scene 或自有 helper 绘制，禁止用原生 DOM、React 组件或浏览器弹窗承载局内交互。
- **移动端优先**：默认使用 `Phaser.Scale.FIT` + `720x1280` + `CENTER_BOTH`，关键按钮和 HUD 必须位于安全区。
- **可观测测试**：Canvas 元素无法挂 `data-testid`，必须通过稳定 Scene key、Store 字段、HUD 文本、可见状态或 E2E helper 暴露断言。
- **视觉截图验收**：UI 完成不能只看 console clean。必须使用 Playwright 或浏览器自动化保存桌面宽屏和移动端真机/设备模拟截图，并人工查看主界面、局内 HUD、战前动员、玩法说明、结算面板等关键界面。
- **配置驱动**：节点入口、资源名、境界名、奖励展示必须读取 `data.js` 与 `store.js`，避免 UI 内复制业务表。

## 2. 文本与排版 (Text & Layout)
- 中文长文必须启用 `wordWrap.useAdvancedWrap: true`，避免战前动员、弹窗、结算文案溢出。
- 按钮、结算、剧情 Modal 的正文宽度不得超过安全区宽度的 85%，必要时拆分多行。
- HUD 文案保持短句：时间、击杀、等级、血量、目标状态优先，不在局内放长篇说明。
- 字体大小基于逻辑画布和安全区计算，避免在小屏上固定过大字号。
- 任何玩法说明、帮助、剧情或结算面板都必须在截图中检查正文是否留有内边距，最长中文段落是否被正确换行，按钮与文本之间是否有可见空隙。

## 3. 交互与触控 (Interaction)
- 可点击对象的 hit area 最小边长或直径为 `60px`。
- 高频操作区域优先放在屏幕中下部，右上角只放撤退、暂停等低频操作。
- 所有按钮必须有按下/释放反馈，可复用 `ButtonBuilder`、`UIHelper.bindButtonBounce` 或等价实现。
- 危险操作必须使用 Canvas 内确认框，例如重置存档、撤退、清空进度。

## 4. 游戏交互反馈与布局规范 (Game UX/UI Rules)
- **动作反馈 (Visual Feedback)**：所有的操作（如突破、升级、购买）必须配有明确的视觉反馈（例如飘字 `VFX.floatText` 或闪烁），严禁只有底层数据更新或 `console.log`，拒绝“哑巴式”交互。
- **全局预览与防卡死 (Navigation & Escapability)**：
  - 关卡/地图选择界面应提供全局预览，解锁与未解锁（锁定状态应置灰并提示条件）必须一目了然。
  - 所有子节点（Node 局内）必须在显眼位置（如右上角）提供“撤退”或“返回主界面”的按钮，防止玩家卡死在局内，撤退可伴随一定惩罚。
- **响应式与居中 (Responsive Centering)**：
  - 使用 `Phaser.Scale.FIT` (720x1280) 约束 PC 端的物理显示范围，但在内部 UI 排版上，依然要处理居中 `(width/2, height/2)`。
  - 元素排版必须根据 `isLandscape = width > height` 动态调整列数或宽高等比例，确保 PC 端（宽屏）不显得空旷且居中，移动端（竖屏）显示合理。
  - 每次改动响应式布局后，至少保存一张桌面宽屏截图和一张移动端真机/设备模拟截图；截图审查不通过时，不能把任务标记完成。


## 5. Scene UI 卫生 (Scene Hygiene)
- 并行 UI Scene 必须遵守 `08_SCENE_LIFECYCLE.md`：谁创建谁停止，切场景前显式 `scene.stop(uiSceneKey)`。
- `create()` 每次进入都重新创建显示对象，不能缓存旧 `Graphics` 或 `Container` 后跳过绘制。
- 弹窗、LevelUp、撤退确认等覆盖层必须 `bringToTop()` 或用明确深度处理遮挡。
- UI 定时刷新使用 Phaser 生命周期内的 timer 或 `update`，禁止用裸 `setInterval`。

## 6. IP 沉浸感与文案包装 (Narrative & Flavor)
同人游戏绝不能只有干瘪的数值，必须让玩家感受到原著的灵魂！
- **包装一切 UI (Flavor Text)**：所有基础操作必须包上原著的皮。例如不要只写“升级”，要写“突破境界”；不要写“Node 1”，要写具体的剧情事件“决战藤家城”。
- **战前动员 (Pre-Battle Intro)**：在点击进入关卡时，**严禁直接切入战斗**。必须先弹出一个剧情面板，用 1-2 句原著金句简述为什么要打这一仗，点击“出战/逆天”等按钮后才进入。
- **战斗喊话 (Battle Taunts)**：核心精英怪或 Boss 出现、释放大招、或死亡时，必须在屏幕显著位置弹出其经典台词（如“顺为凡，逆则仙！”），增强戏剧张力。
