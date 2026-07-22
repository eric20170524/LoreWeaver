# LoreWeaver v3.0 PRD: 智能审计与自进化引擎需求文档

> **提示**：本篇为重构后的 v3.0 需求文档。它专注于利用视觉大模型 (VLM) 实现无须人工的双端视口智能 UI 审计，并实现全局去敏感化的踩坑经验跨项目程序化反哺，达成真正的**无人值守自进化**。

---

## 🎯 v3.0 核心使命

实现同人微游戏生成引擎的**无人值守自进化**状态。
传统的代码单元测试和 Playwright 交互断言**无法捕获视觉错位、UI 重叠、文字爆框**等“体验级缺陷”。
v3.0 通过 **多模态 VLM 自动审计算子** 与 **Decoupled Master Prompts 自动反哺** 打造一个能够自我写游戏、自我审计视觉、自我沉淀底层避坑常识并自动进化变强的闭环流水线。

```
                                  ┌────────────────────────────────┐
                                  ▼                                │ (API 坐标修正)
[E2E 交互截图自动抓取] ──> [多模态 VLM API 审计] ─ (视觉缺陷) ─> [UI 自动坐标微调]
                                  │
                             (视觉无瑕疵)
                                  ▼
                            [Master_Reflow] ──> [程序化自动反哺全局 master prompts 知识库]
                                  ▼
                            [自进化交付发布]
```

---

## 👁️ 智能视觉审计卡点门禁 (Visual_VLM_QA)

- **角色**：Vision Critic Agent (VLM 自动审计算子)
- **执行条件**：当前项目已成功通过 Build 编译和 Playwright E2E 交互断言。
- **技术规范**：

### 1. 自动视口截图抓取 (Orchestrator 调度)
由 Playwright 自动仿真不同硬件视口，捕获三个黄金画面的截图并保存到本地：
- **黄金画面 1**：战前动员与玩法说明 Modal
- **黄金画面 2**：局内战斗 HUD 与特效震屏画面
- **黄金画面 3**：胜利或失败结算面板与指数数值变化

| 仿真视口类型 | 目标终端分辨率 | 截图文件标识 |
| :---: | :---: | :---: |
| **PC 宽屏端** | `1920 x 1080` | `screenshots/*_desktop.png` |
| **移动竖屏端** | `720 x 1280` | `screenshots/*_mobile.png` |

### 2. 多模态 VLM 自动审计 (Gemini API 闭环)
Orchestrator 自动将截图进行 Base64 编码，调用 Gemini-1.5-Flash 多模态 API。注入严格的视觉诊断契约，重点审查以下规则：
- **重叠判定**：交互按钮、文本、血条是否在 Canvas 内发生像素重叠，导致无法点击或阅读。
- **文字爆框与穿模**：剧情弹窗和长对话框中是否有中文文本爆出了 UI 框边界，或者两端被截断。
- **安全区越界**：在移动端竖屏下，按钮或 HUD 状态栏是否越出了安全边缘。

### 3. 视觉审计报告与自愈回流 (UI Auto-Fix)
- **如果 VLM 发现问题**：API 必须返回格式化的 JSON 诊断报告，包含问题组件名称（如 `StartButton`）与具体修改参数（如将 `y` 坐标调整 `+20` 或重置 `origin`）。
- **自愈微循环**：Orchestrator 解析报告，触发 `Bug_Fix_Agent` 针对性重构该场景的 UI 坐标代码，重新跑 Build、E2E 测试与 VLM 审计，直至全票通过。

---

## 🔄 全局经验反哺进化系统 (Master_Reflow)

- **角色**：Knowledge Distiller (去敏感化自进化算子)
- **核心目标**：将单个项目的本地避坑经验（`07_RULES_AND_BUGS.md`），自动蒸馏并追加写入全局 `workflow/prompts/`，使引擎的通用常识不断强大。
- **技术规范**：

### 1. 踩坑经验去敏感化蒸馏 (LLM API)
- 游戏成功发布前，Orchestrator 自动读取项目本地的 `docs/07_RULES_AND_BUGS.md`。
- 调用大模型 API 进行**通用特征蒸馏**，彻底过滤并剥离与特定同人 IP 相关的敏感词汇（如：仙逆、完美世界、尊魂幡、雷劫等专属词）。
- 提炼出通用的、与特定同人主题无关的 **纯底层 Phaser 3 / Vite 工程防错常识**。
  - *例如*：“在 Phaser 3 中，主摄像头抖动 `main.shake` 必须在场景切换前显式重置，否则会导致下个场景 Canvas 渲染死锁。”

### 2. 全局 Master Prompts 自动追加回写
- 脚本自动将蒸馏出的技术要点格式化为 `【知识沉淀】` 标准段落。
- **程序化无损追加**：Orchestrator 自动寻址到全局 `minigame_master/workflow/prompts/` 下的全局提示词文件，无损地追加写入其末尾。
- **效果**：后续生成全新同人主题时，AI Agent 读到的全局提示词已经是进化后的最新版本，天然规避了路径别名和生命周期死锁等历史 Bug，实现**引擎越用越稳健**。

---

## 💡 v3.0 视觉审计与自进化 API 契约 (Self-Evolution API Contract)

Orchestrator 执行视觉审计与去敏感化反哺时，通过以下规范的 JSON 契约直接驱动 API：

```json
{
  "node_id": "Visual_VLM_QA",
  "multimodal_inputs": [
    { "mime_type": "image/png", "data": "BASE64_IMAGE_DATA_1" },
    { "mime_type": "image/png", "data": "BASE64_IMAGE_DATA_2" }
  ],
  "system_instruction": "You are the Vision Critic Agent. Analyze these screenshots from a Phaser 3 H5 game for overlaps, clipping, text overflows...",
  "response_format": {
    "type": "json_object",
    "schema": {
      "type": "object",
      "properties": {
        "pass": { "type": "boolean" },
        "visual_bugs": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "scene": { "type": "string" },
              "component": { "type": "string" },
              "issue": { "type": "string" },
              "coordinate_fix_suggestion": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```
