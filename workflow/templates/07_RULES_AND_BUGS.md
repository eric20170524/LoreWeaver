# 07_RULES_AND_BUGS.md: 游戏生成经验与防坑指南 (AI 必读)

> **核心工作流红线：**
> - **增量开发**：严格按照 `09_DEVELOPMENT_AND_POLISH_PLAN.md` 的当前阶段推进，并对照 `00_TASK_HISTORY.md` 记录执行与避免重复已完成工作。
> - **先查红线**：每次编写代码前，必须对照本文件的【绝对红线】和【踩坑记录】进行自我审查。
> - **经验沉淀 (The Learning Loop)**：如果你刚刚修复了一个游戏逻辑或渲染 Bug，**必须**提炼成一句不超过 50 字的【防坑经验】，追加写入到本文档底部的「踩坑记录」中，实现越用越聪明！

## 🚫 1. 绝对红线 (Anti-Patterns)

### 1.1 性能与循环红线
- 🚫 **严禁使用 `setInterval` 或 `setTimeout`**：处理游戏内的定时、延迟逻辑，必须使用 `this.time.addEvent` 或 `this.tweens`，确保时间轴与游戏引擎的生命周期（如游戏暂停、切屏）对齐。
- 🚫 **严禁隐式挂载不受控制的全局定时器**：任何外部常驻业务引擎（如 `IdleEngine`）在真实游戏运行时，必须显式传入并绑定 Phaser `scene` 以收敛在场景内部的定时器中。非测试环境下，绝对禁止允许其静默运行在全局 fallback（如 `setInterval`）中，确保场景切换或退出时能被 100% 自动注销，防范隐性内存无限泄露。
- 🚫 **严禁在 `update()` 中高频 `new` 对象或频繁执行绘图指令**：必须在 `create()` 中使用 **对象池 (Phaser.GameObjects.Group)** 提前初始化，并在 `update()` 中复用实体、改变位置。
- 🚫 **严禁加载外部资源 (PNG/JPG/MP3 等)**：本工作流要求“零外部依赖”。图像必须用 `Phaser.Graphics` 实时绘制，音效必须用原生 `Web Audio API` 程序化生成。

### 1.2 交互与 UI 红线
- 🚫 **严禁使用原生 DOM 元素做游戏内 UI**：所有游戏内的 UI (按钮、文本、血条、计分板) 必须通过 Phaser 的 `Text` 或 `Graphics` 渲染在 Canvas 内。
- 🚫 **严禁仅绑定键盘事件**：生成的小游戏必须是“移动端优先”，所有的核心交互必须绑定 `pointerdown` / `pointerup` / `pointermove` 触摸事件。
- 🚫 **事件未闭环**：开启了 `setInteractive()` 的对象，必须编写对应的事件监听器。使用了拖拽 `setDraggable()` 的对象，必须写完整的 `drag` 和 `drop` 回调，否则失效。

### 1.3 逻辑与物理红线
- 🚫 **严禁忽略帧率差异计算位移**：若在 `update` 中手动修改 `x/y` 进行移动，其增量必须乘以 `delta` (帧间隔)。强烈建议优先使用 `this.physics.arcade.velocity` 让引擎接管运动。
- 🚫 **严禁超界漂移 (内存泄漏)**：任何动态生成的移动物体（子弹、敌人、障碍物），一旦离开屏幕边界，必须被 `destroy()` 或 `disableBody(true, true)` 回收到对象池中。

## 🛠️ 2. API 白名单编译器 (Phaser 3 v3.87.0)

> **不在下述列表中的 API 严禁臆造调用！**

- **场景生命周期**: `preload()`, `create()`, `update(time, delta)`
- **图形绘制 (Graphics)**: `this.add.graphics()`, `lineStyle()`, `fillStyle()`, `fillRect()`, `fillCircle()`, `strokePath()` (🚫严禁使用 `ctx.*` 原生 Canvas API，不支持 `arcTo` 等高级路径，不支持直接给 Graphics `add()` 子元素)。
- **物理系统 (Arcade)**: `this.physics.add.sprite()`, `this.physics.add.group()`, `setVelocity()`, `setCollideWorldBounds()`, `this.physics.add.collider()`, `this.physics.add.overlap()`。
- **Web Audio (音频)**: `ctx.createOscillator()`, `ctx.createGain()`。
- **音频上下文预热**：必须在 `MenuScene` 的“开始游戏”按钮被**首次点击**时，立即预热 AudioContext (`ctx.resume()` 或发一声极短的静音)，否则移动端浏览器会严格静音拦截。

---

## 📝 3. 踩坑记录 (Bug Fix History - 越用越聪明)

> **AI 必读**：遇到同类问题直接规避。在解决新 Bug 后需按格式在此处追加记录。

- **【2024-04-27 沉淀】** Phaser 3 绘制圆形按钮时，如果仅绘制而不配置确切的 hitArea `setInteractive(new Phaser.Geom.Circle(x,y,r), Phaser.Geom.Circle.Contains)`，会导致点击判定变成正方形或边缘点击无效。
- **【2024-04-27 沉淀】** 使用 `Container` 打包组合多个 `Graphics` 时，Container 自身没有物理尺寸。若需绑定点击交互，必须手动调用 `setSize(w, h)` 和 `setInteractive()`，否则点击穿透或无效。
- **【2024-04-27 沉淀】** 物理引擎中高速移动的物体（如子弹/球）极易“穿透”薄壁，必须限制最大速度，或给高速物体设置较厚的包围盒 `body.setSize()` 并适当减小游戏世界的步长。
- **【2026-05-09 沉淀】** 在原生 ESM 环境下（未用打包工具），跨文件引用 `window.Phaser` 极易因模块加载时序导致 `Cannot set properties of undefined`。必须在底层的单例类（如 EventBus）中使用延迟初始化（Lazy Init），即在首次调用方法时才去 `new window.Phaser.Events.EventEmitter()`。

- **【2026-05-10 沉淀】** 游戏主干界面开发时，必须提供“全局预览与状态反馈”：不仅要用飘字（floatText）代替 console.log 作为成功/失败的反馈，主界面的选关列表也应该默认渲染出所有节点的全局预览网格（区分解锁与灰色锁定状态）。同时，所有的 Node 场景**必须配置“撤退/返回”按钮**，并配合横竖屏检测（isLandscape）进行动态响应式居中，防止宽屏下布局散架或移动端越界。


- **【2026-05-10 沉淀】** Phaser 跨场景传递结算数据时，严禁使用全局 `EventBus.emit`（会导致生命周期错位或重复监听），必须使用 `this.scene.start("MainScene", { result: data })`，并在目标场景的 `create(data)` 中接收解析。
- **【2026-05-10 沉淀】** 开发移动端优先的同人 H5 游戏时，游戏容器 `Scale` 配置**必须**使用 `mode: Phaser.Scale.FIT` 与固定逻辑分辨率（如 `width: 720, height: 1280`）配合 `autoCenter: Phaser.Scale.CENTER_BOTH`。这能避免在 PC 宽屏下游戏场景（如满屏乱跑的敌人）变得不合理地巨大，且极大简化了 UI 的绝对定位。
- **【2026-05-10 沉淀】** Phaser 3 的 Arcade Physics 中不存在 `this.physics.add.rectangle` API。必须使用 `this.add.rectangle(...)` 创建原生矩形后，再通过 `this.physics.add.existing(rect)` 赋予其物理属性。同时，后续操作必须调用 `rect.body.setVelocity(...)` 而不能直接 `rect.setVelocity(...)`。
- **【2026-05-11 沉淀】** 在 Phaser 中弹窗或者拉起并行 UI 时（如 LevelUpScene），必须在其 `create` 方法首行调用 `this.scene.bringToTop()`，否则可能会被其他动态挂载的 Scene 遮挡导致层级异常。同时，在暂停游戏场景时，别忘了 `this.scene.pause(UI_SCENE_KEY)` 一起暂停其绑定的 UI 场景。
- **【2026-05-11 沉淀】** 必须通过 `this.events.once('shutdown', ...)` 监听当前 Scene 销毁事件并清理其中的定时任务（如 setInterval 或外部 Engine 实例），不能依赖开发者手动调用，否则会在多次 Scene 切换时引发内存泄漏及报错。
- **【2026-05-11 沉淀】** 跨 Scene 动态创建 UI 场景时，严禁无脑使用 `this.scene.add()`。必须先通过 `if (this.scene.get(key))` 判断是否存在，若存在则使用 `this.scene.launch(key)` 唤醒，否则会报 `Cannot add a Scene with duplicate key`。

- **【2026-05-12 沉淀】** Phaser 3 的 `wordWrap` 默认基于空格分词，对于中文 (CJK) 字符会导致整段文字被视为一个长单词而溢出边界失效。必须在 `wordWrap` 配置项中显式开启 `useAdvancedWrap: true` 启用高级逐字换行策略。
- **【2026-05-28 沉淀】** 挂机引擎 `IdleEngine` 必须严格限制 fallback (`setInterval`) 运行边界。非测试环境下如果缺少 `scene` 绑定，必须通过带 Error Call Stack 的 `console.warn` 强警示开发者，防止隐藏的生命周期泄露。
- **【2026-05-28 沉淀】** 核心库真实位置是 `minigame_master/core/lib`。从 `minigame/[slug]/js`、`scenes`、`nodes` 内引用时，必须使用能回到仓库根目录的正确相对路径或 Vite alias；`../../core/lib/...` 容易解析到不存在的 `minigame/core/lib`，必须用 `npm run build` 作为硬校验。
- **【2026-05-28 沉淀】** 构建成功和 console clean 不能证明布局合格。UI、弹窗、玩法说明或响应式改动必须用 Playwright 保存并查看桌面宽屏与移动端真机/设备模拟截图；文字溢出、遮挡、按钮越界或安全区问题必须先修复。
- **【2026-06-08 沉淀】** Canvas 游戏的 E2E 不能只依赖截图或猜坐标。必须暴露稳定的 DOM test-state 镜像或 TestHooks，使测试能断言 scene、timer、HP、result 与 console error。
- **【2026-06-08 沉淀】** CDN Phaser 可用于原型，但自动化 gate 必须支持本地可服务的 Phaser bundle 或临时测试根目录，避免网络波动导致运行时误判失败。

## 💡 4. 最佳实践与技术规范 (Best Practices)

> **编码时必须强制落实的设计模式，以保证 H5 游戏的工业级可用性。**

- **全屏防抖容器 (移动端必备)**：
  - HTML `body` 必须强制设置 `margin: 0; padding: 0; overflow: hidden; background-color: #000;`。
  - Canvas 容器 CSS 必须包含 `touch-action: none; user-select: none; -webkit-user-select: none;`，以彻底屏蔽浏览器默认的“双击缩放”和“下拉刷新”干扰。
- **自适应与安全区**：
  - 默认使用 `Phaser.Scale.FIT` + 固定逻辑分辨率 `720x1280` + `Phaser.Scale.CENTER_BOTH`。
  - 核心操作与战斗 HUD 必须被约束在固定逻辑分辨率的安全区内，确保在各种极端长宽比的手机上都不会被裁剪。
  - UI/布局改动的验收截图必须覆盖桌面宽屏、移动端真机/设备模拟以及至少一个关键弹窗或玩法说明面板；截图需人工查看，不能只保存文件路径。
- **UI 尺寸计算**：
  - 所有可点击按钮的判定区域 (Hit Area) 直径/边长不得小于 60px。
  - 字体大小必须使用 `Math.min(width, height)` 的百分比动态计算，严禁固定死 `px`。
- **音频预热与解锁机制 (Audio Unlock)**：
  - 移动端浏览器对自动播放音频有严格拦截！必须设计一个单例 `AudioManager`。
  - 在 `MenuScene` 中，当玩家**第一次点击**“开始游戏”等有效按钮时，其事件回调中必须立即执行 `context.resume()` 或播放一段极短的静音音效，从而解锁 Web Audio API。
- **性能与渲染层**：
  - 强制使用 Phaser 内置的 `update` 循环。
  - 分离 UI 层 (静态) 与 游戏层 (动态)，不要将 UI 和高速运动的物体放在同一个深度组里。
- **扁平化常量定义**：
  - 代码顶部或外部配置中定义常量时必须扁平化（如：`const COLORS = { BG_MAIN: 0x000, BTN_TEXT: 0xFFF };`），严禁使用深层嵌套对象（如 `COLORS = { UI: { Text: ... } }`）以防 `undefined` 报错崩溃。

## 🔁 5. Master 沉淀规则 (Prompt/Template Sync)

- 修复项目内 Bug 后，优先写入当前项目 `docs/07_RULES_AND_BUGS.md`。
- 如果经验影响跨项目工作流、文档骨架、Node 生产线、IP 能力设计或 E2E 能力，必须同步到 `minigame_master/workflow/prompts/` 或 `minigame_master/workflow/templates/`。
- `minigame_master/workflow/prompts/` 是最高层经验沉淀目标，不要让通用经验只停留在单个项目文档中。
