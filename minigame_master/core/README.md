# Phaser 常用库 (CommonLib Utils)

本库提供了一套模块化的 Phaser 3 游戏开发工具集，旨在分离关注点，提高代码复用性。
## 6 大核心模块：
1. 🎨 graphics/ (视觉与生成): 保留并强化现有的 GraphicsGen，增加 ProceduralTextureManager（集中管理生成的材质，防止显存泄漏）。
2. 🔊 audio/ (程序化音频): 提炼 WebAudioSynth.js (负责底层振荡器/LFO) 和 SFXManager.js (封装点击、升级、警告、ASMR 等语义化音效)。
3. 🎬 juice/ (果汁感与动效): 提炼 TweenFX.js (按钮呼吸、UI 弹窗缓动)、VFX.js (飘字系统、屏幕震动、代码生成的粒子爆炸)。
4. 🖥️ ui/ (响应式用户界面): 提炼 ButtonBuilder.js (标准按钮，自带按下缩放与音效)、ModalManager.js (标准化弹窗防穿透底板与生命周期)、Layout.js (网格与相对对齐工具)。
5. ⚙️ core/ (底层机制): 提炼 EventBus.js (跨场景解耦通信)、Store.js (封装 localStorage 与状态变更广播)、MathUtils.js。
6. 🕹️ interaction/ (交互): 升级原有的 InteractionHelper，增加防抖 (Debounce) 和长按 (LongPress) 识别。

## 1. 图形与渲染 (Graphics & Rendering)

这一层级负责“看得到”的东西，基于纯代码生成，彻底摆脱对外部图片资源的依赖，并通过 Texture 缓存提升性能。

| 文件名 | 角色 | 产出物 (Output) | 职责与用途 | 典型 API |
| :--- | :--- | :--- | :--- | :--- |
| **`graphics/GraphicsGen.js`** | **程序化纹理生成器** | 纹理 Key (Texture) | **程序化资源生成与缓存**。<br>解决每次渲染都要重绘 Graphics 的性能开销，利用 `generateTexture` 空间换时间。<br>*特点：生成的纹理可直接用于 Sprite、Image 或 Particle 粒子发射器。* | - `generateRoundedRect`: UI底板<br>- `generateGradient`: 渐变天空/海洋<br>- `generateGlowParticle`: 发光粒子<br>- `drawPolygon`: 雷达图/法阵阵型 |

## 2. 交互与控制 (Interaction & Control)

这一层级负责“摸得到”的东西，管理用户的输入行为。

| 文件名 | 角色 | 职责 | 核心功能 |
| :--- | :--- | :--- | :--- |
| **`interaction/InteractionHelper.js`** | **高级交互控制器** | **处理复杂的触控逻辑**。<br>包括长按、防抖和带吸附的拖拽，大大增强了 H5 移动端的交互体验。 | - **长按**: `addLongPress(scene, obj, onShortClick, onLongPress)`<br>- **防抖点击**: `addDebouncedClick(obj, onClick, delay)`<br>- **高级拖拽**: `setupAdvancedDrag(scene, obj, config)` (支持拖拽置顶、松手自动吸附或回弹) |

## 3. 基础工具 (Infrastructure)

提供底层的数值和常量支持。

| 文件名 | 职责 | 说明 |
| :--- | :--- | :--- |
| **`Colors.js`** | **调色板** | 集中管理游戏颜色常量（如 `SKY`, `GRASS`, `BUTTON_RED`），支持语义化颜色命名。 |
| **`Random.js`** | **随机库** | 封装常用的随机数生成逻辑：<br>- `randomInt(min, max)`<br>- `choice(array)`<br>- `shuffle(array)` |

## 4. 音频与程序化合成 (Audio)

利用原生的 Web Audio API 生成音效，摆脱对 `.mp3` 等外部资产的依赖，并且提供移动端的触控解锁封装。

| 文件名 | 角色 | 核心功能 |
| :--- | :--- | :--- |
| **`audio/WebAudioSynth.js`** | **声音合成器** | **1. 移动端解锁**：`unlock()` (需在首次点击时调用)<br>**2. 语义化音效**：`playClick()`, `playCoin()`, `playSuccess()`, `playError()`, `playLevelUp()`<br>**3. ASMR 氛围音**：`startASMR()` (利用 LFO+Filter 生成灵气/呼吸感的低频底噪) |

## 5. 果汁感与特效 (Juice & VFX)

实现“零外部资源”的打击反馈和视觉高光，增强游戏的整体体验表现。

| 文件名 | 角色 | 核心功能 |
| :--- | :--- | :--- |
| **`juice/VFX.js`** | **动效统筹** | **1. 飘字反馈**：`floatText(scene, x, y, text, config)`<br>**2. 程序化爆破**：`burstParticles(scene, x, y, color, count)` (利用 Graphics 动态生成纹理并呈现发射散开缓动)<br>**3. 屏幕震动**：`shake(scene, intensity='light')` (封装统一的震动规格) |

## 6. 响应式用户界面 (UI)

提供标准化的 UI 控件，彻底解决历史遗留的“点击穿透”、“交互区域判定”等问题，并内置动效。

| 文件名 | 角色 | 核心功能 |
| :--- | :--- | :--- |
| **`ui/ButtonBuilder.js`** | **标准按钮构建器** | `create(scene, x, y, text, onClick, config)`<br>自动包含背景绘制、确切尺寸设定(`setSize`)防穿透、点击缩放缓动，以及内建的音效。 |
| **`ui/ModalManager.js`** | **弹窗防穿透底板** | `show(scene, title, content, onClose)`<br>生成带有全屏半透明拦截层（屏蔽底层所有事件）、弹出缓动动画和标准化 UI 的弹窗层。 |

## 7. 核心架构机制 (Core)

为 H5 挂机游戏的“主线与子节点通信”及持久化提供底层支撑。

| 文件名 | 角色 | 核心功能 |
| :--- | :--- | :--- |
| **`core/Store.js`** | **本地持久化封装** | `init(key, default)`, `get(key)`, `set(key, val)`<br>安全封装 `localStorage`，支持默认状态自动合并以及防崩溃 JSON 解析。 |
| **`core/EventBus.js`** | **全局事件总线** | 导出一个单例的 `Phaser.Events.EventEmitter`，实现跨场景解耦通信。 |