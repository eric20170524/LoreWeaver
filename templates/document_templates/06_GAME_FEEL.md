# 06_GAME_FEEL.md: 游戏果汁感与体验打磨规范 (Juice & Atmosphere)

## 1. 核心理念 (Core Philosophy)
本游戏秉持**“零外部资源”**的开发原则。游戏中的所有“果汁感 (Juice)”——即打击反馈、视听特效、氛围营造，都必须通过**代码程序化生成 (Procedural Generation)** 实现。
在执行【第五步：果汁感与体验打磨】任务时，必须严格遵守以下标准，让干瘪的逻辑变成上头的游戏体验。

## 2. 视觉反馈与动效 (Visual Feedback)

### 2.1 交互动画 (Interaction Tweens)
- **按钮缩放**：所有可点击 UI 必须绑定按下与抬起/移出的反馈。
  - `pointerdown`: 缩放至 `0.9` (耗时 50ms)。
  - `pointerup`/`pointerout`: 恢复至 `1.0` (耗时 100ms, 使用 `Back.easeOut` 缓动)。
- **飘字效果 (Floating Text)**：资源获得或造成伤害时，必须在原地生成飘字效果。
  - 向上移动 30-50 像素，同时 `alpha` 从 1 渐变到 0。
  - 存活时间控制在 800ms - 1200ms 内，结束后必须 `destroy()`。

### 2.2 摄像机震动 (Camera Shake)
- **触发时机**：角色突破、暴击、受到重创、Node 关卡结算成功/失败时。
- **强度规范**：
  - 微震 (轻击)：`this.cameras.main.shake(100, 0.005)`
  - 强震 (突破/爆炸)：`this.cameras.main.shake(250, 0.02)`

### 2.3 程序化粒子特效 (Procedural Particles)
严禁加载 PNG 图片作为粒子！必须使用 `GraphicsGen` 生成的临时纹理（如纯色小圆点、星星）结合 `Phaser.GameObjects.Particles` 系统。
- **爆发特效 (Burst)**：用于收集资源或击杀敌人（发射 10-20 个小圆点，向四周呈发射状散开后消失）。
- **持续氛围 (Ambient)**：用于挂机主界面的背景（如缓慢向上漂浮的光点，营造灵气/修仙氛围，使用低 `alpha` 值）。


### 2.4 剧情氛围演出 (Narrative Presentation)
- **Boss 登场与台词**：当重要剧情节点触发时，配合屏幕强震 `shake(250, 0.02)`，使用巨大的带颜色文字（如血红色字体 + 黑色粗描边）从屏幕中央放大并淡出，展示 Boss 名称或名台词，制造极强的压迫感。

## 3. 听觉氛围 (Audio Atmosphere - Web Audio ASMR)

严禁使用外部 `.mp3`。所有声音必须基于原生的 `Web Audio API` 动态合成！

### 3.1 交互音效合成 (Synthesized SFX)
- **UI 点击 (Click)**：极短的高频正弦波 (Sine) 结合极快的音量衰减 (0.05秒)。
- **获得资源 (Coin/Loot)**：连续两个上升频率的方波 (Square)，如从 400Hz 滑到 800Hz。
- **升级/突破 (Level Up)**：多频段和弦，长衰减 (0.5秒 - 1秒)。

### 3.2 低频环境音 (Background ASMR)
- 主干 (Main) 界面需提供环境底噪以提升沉浸感（类似呼吸、低沉风声或灵气涌动）。
- **实现方式参考**：使用低频 (40Hz-80Hz) 的三角波 (Triangle) 加上低通滤波器 (Lowpass Filter)，并用 LFO (低频振荡器) 缓慢调制滤波器的频率，实现“呼——吸——”的海浪感。
- **注意**：必须由玩家**首次点击屏幕后**主动触发 `audioCtx.resume()` 才能开始播放，防止浏览器静音报错。

## 4. 移动端触控优化 (Touch Ergonomics)

### 4.1 大拇指热区 (Thumb Zones)
- 移动端下，玩家通常单手握持。高频点击区域（如“疯狂点击获取资源”按钮）必须放置在屏幕中下部（高度的 60% - 90% 区间），避免让玩家频繁跨越屏幕顶部操作。

### 4.2 防误触与判定区扩展 (HitArea Padding)
- 视觉上很小的元素（如 20x20 的关闭按钮或图标），其 `HitArea` 必须被设定为至少 `60x60`。
- 如果使用 `Phaser.Geom.Circle` 或 `Phaser.Geom.Rectangle` 设置交互区，必须保证其足够大以适应手指宽度。

## 5. 动效节奏基准表 (Timing Standards)
统一游戏内的时间感受，防止拖沓或突兀：
- **瞬发/打击 (Snap/Hit)**: `50ms - 100ms`
- **UI 弹窗展开 (Modal Open)**: `200ms - 300ms` (Back.easeOut)
- **UI 弹窗关闭 (Modal Close)**: `150ms` (Power2)
- **场景转场/淡入淡出 (Fade)**: `500ms`
- **挂机大循环节拍 (Idle Tick)**: `1000ms` (1秒 1 结算)

---
> **AI 执行指令**：
> 当你执行阶段 C 的打磨任务时，必须仔细阅读本文件的每一项标准，利用代码中的数学与物理，将数学公式转化为玩家的爽感。每次增加一个果汁感要素，都要反思是否导致了性能卡顿或垃圾堆积。
