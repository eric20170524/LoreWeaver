# LoreWeaver v2.0 PRD: 体验打磨与 E2E 自动化闭环需求文档

> **提示**：本篇为重构后的 v2.0 需求文档。它专注于在 v1.0 基础设施上扩展由 Orchestrator 驱动的“12关并行API生成”、“静态场景卫生检查”、“本地 Playwright 自动化运行”与“Bug 自动修复自愈闭环”。

---

## 🎯 v2.0 核心使命

解决游戏“假成功（代码编译过了但进去黑屏或点击卡死）”与“干瘪不好玩”的问题。
重点引入：**“Orchestrator 12关并行生成” $\rightarrow$ “静态代码卫生 Linter 门禁” $\rightarrow$ “文本溢出与热区自适应补丁” $\rightarrow$ “Playwright E2E 自动测试门禁” $\rightarrow$ “测试失败后的 Bug_Fix 自动修复自愈”** 的无人值守多 Agent 协同循环。

```
                                ┌─────────────────────────┐
                                ▼                         │ (API 自动修复)
[12关 API 并行量产] ──> [Linter 卫生门禁] ──> [Playwright 运行卡点] ── (编译/运行时报错) ──┘
                                          │
                                   (无 Error 通关)
                                          ▼
                                    [v2.0 门禁通过]
```

---

## ⚙️ 核心打磨子流程规范 (Polish & Juicing)

### 1. IP_Flavor_Polish (灵魂文案与高级换行排版)
- **职责**：由 Orchestrator 驱动的文本和排版优化，消除爆框。
- **技术规范**：
  1. **高级换行保护**：生成器在生成 Text 组件时，强制注入配置对象：
     ```javascript
     { wordWrap: { width: 520, useAdvancedWrap: true } }
     ```
     彻底防止中文字符由于单词边界计算错误在 Canvas 视口中爆框。
  2. **原著梗台词替换**：读取 `manifest.json` 中的 `taunts` 将关卡内的台词替换为具有极强同人沉浸感的文本。

### 2. Juice_Injection (游戏果汁感与指数成长)
- **职责**：由 Polisher Agent 程序化注入动效和数值表现。
- **技术规范**：
  1. **视觉震屏 (Camera Shake)**：凡触发核心突破、BOSS 斩杀或受到致命雷劫时，强制注入 Phaser 震屏调用：
     ```javascript
     this.cameras.main.shake(200, 0.01);
     ```
  2. **伤害飘字 (Floating Damage text)**：数值结算或产生伤害时，自动生成向上漂移并淡出的文本（VFX 文字层，带缓动动画 `tweens`，`alpha: 0` 且自毁）。
  3. **指数/断层式数值体系**：结合境界 `Store` 数值设计，实现断层式的数值膨胀与突破反杀爽感。

### 3. 移动端安全区与点击热区适配
- **职责**：保证在不同尺寸屏幕上的手感合格。
- **技术规范**：
  1. **统一自适应**：主配置启用 `Phaser.Scale.FIT`，设计分辨率严格卡死在 `720x1280`。
  2. **热区自动补丁**：自动扫描可交互组件，凡其宽高小于 60px 的，必须重置扩大交互响应范围：
     ```javascript
     button.setInteractive(new Phaser.Geom.Rectangle(0, 0, button.width, button.height), Phaser.Geom.Rectangle.Contains);
     ```

### 4. 【新增】静态场景卫生门禁 (Scene Hygiene Linter)
在代码提交给 Vite 编译前，Orchestrator 自动运行**场景卫生静态检测算子**，强制拦截以下不合规代码：
- 关卡跳转/结算函数（如 `endGame()`）的 **第一行** 必须加防重入锁：`if (this.isTransitioning) return; this.isTransitioning = true;`。
- 必须通过 `this.events.once("shutdown", ...)` 显式清理局内所有的外部计时器、挂机引擎，绝对禁止内存泄漏。
- 严禁在 `update()` 高频帧循环中通过 `new` 或 `add` 频繁创建新的显示对象。

---

## 🚦 Playwright 自动化运行门禁 (Runtime E2E Gate)

- **职责**：以纯客观的浏览器交互行为作为最终发布门禁，阻断“黑屏、死锁”。
- **测试执行流程**：
  1. Orchestrator 在后台自动开启 Vite 开发服务器（`npm run dev`）。
  2. 自动启动 Playwright 驱动 Chrome 浏览器，访问游戏本地服务。
  3. **自动化测试套件（由 run_e2e_test.py 执行）**：
     - 测试 Zunhunfan 升级和突破的资源条件阻断。
     - 循环测试 Node 1 至 12 的场景切入、战前动员弹窗确认。
     - 进入关卡后，自动模拟交互游玩 5 秒。
     - 触发“撤退/返回”返回主页，并断言主页状态正确更新。
  4. **断言卡点规范**：
     - **Console 无报错**：运行期间浏览器控制台必须完全无 `console.error` 日志。
     - **状态断言成功**：数值升级状态或境界存储逻辑响应正确。
     - **截图存盘**：自动捕获 PC/移动端黄金场景截图，存放至指定目录。

---

## 🔧 Bug 局部自愈与踩坑记忆升级 (Rules & Bugs)

- **自动流转**：当静态 Linter、编译 Build 或 E2E 自动测试失败时，Orchestrator 自动捕获错误输出，并将有缺陷的代码文件打包发送给 `Bug_Fix_Agent` API。
- **程序化修复环 (Self-Healer)**：
  1. `Bug_Fix_Agent` 自动诊断并回写修复代码。
  2. 重构日志自动追加写回项目级文档 `docs/07_RULES_AND_BUGS.md`，格式为：
     `- **【YYYY-MM-DD 沉淀】** [问题特征]。[原因]。[规避机制]`。
  3. 修复后重新进入门禁。

---

## 💡 v2.0 关卡并行量产与修复 API 契约 (API Specification)

在批量生产 12 个 Node 关卡时，Orchestrator 通过 API 并行触发以下提示词结构，接收规范的 JSON 源码文件，避免传统会话的状态分裂：

```json
{
  "node_id": "Node_Mass_Prod",
  "variables": {
    "current_node_id": 5,
    "manifest_config": {
      "title": "血色试炼",
      "intro": "原著凡人修仙经典，禁地夺宝",
      "taunts": ["你这筑基修士，也配与我夺宝？"],
      "mechanics": "躲避地下一维毒蝎并采集灵药"
    }
  },
  "response_format": {
    "type": "json_object",
    "schema": {
      "type": "object",
      "properties": {
        "scene_class_name": { "type": "string" },
        "code_content": { "type": "string", "description": "Complete independent Phaser 3 Scene JS code" }
      }
    }
  }
}
```
