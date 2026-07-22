# minigame_master 关卡生产化进度报告 (report.md)

> **当前总体状态**: 进行中 / 核心架构与底层框架重构就绪 (待补齐 Playwright E2E / 真实 Canvas 视觉 / 10 分钟 Soak 性能 Gate 证据)  
> **更新时间**: 2026-07-22 (三轮深度整改完成)

---

## 审查意见响应与三轮整改明细 (Audit & Response Log - Round 3)

针对提出的 2 个门禁问题和 4 个报告判定项，已完成全量整改与代码合规：

| 审查问题项 | 三轮整改措施 |
| --- | --- |
| **[P0] Passing JSON 伪造生产证据问题** | **硬门禁校验升级**: `validate-gameplay-card.mjs` 解析 E2E / Standalone / Visual / Performance 报告时，强制校验 `report.status === "passed"`、`specHash === card.id`、`releaseEligible === true` 及有效 timestamp。不匹配或伪造报告立刻阻断。 |
| **[P1] Node Smoke 字段读取错误** | **兼容 summary 结构**: `validate-gameplay-card.mjs` 重构节点 Smoke 读取逻辑为 `e2eReport?.passed ?? e2eReport?.summary?.passed`，避免结构层差异导致正常证据被判失败。 |
| **[P1] UI 禁用 21 张基础卡问题** | **成熟度一致性修护**: 修复 `GameplayPanel.tsx` 成熟度评估表达式为 `card.maturityStatus || (card.implementationStatus === "implemented" ? "runtime_ready" : "card_json")`，所有 22 张已实现基础卡均在工作台下拉框中解除禁用并正常可选。 |
| **[P1] Modifier V2 结构校验补齐** | **全量 Modifier 校验**: `validate-gameplay-card.mjs` 为 24 个 Modifier 增加了 `schemaVersion` (2.0)、`compatibleBaseCards` (非空数组)、`requiredAssets`、`maturityImpact` 及 `exportPolicy` 的完整 V2 结构门禁断言。 |
| **[P1] GameRunner 去题材化扫描与清理** | **扩展扫描目标至 GameRunner.ts**: `check-theme-decoupling.js` 扩展扫描 `src/game/GameRunner.ts`，并将 36 个黑名单词库应用全量代码清理（移除修真/境界/造化/功德/灵石/心魔/天劫/元神/仙途/修为/灵珠/御煞/符文/炼制等）；扫描实现 100% 零残留通过。 |
| **[P2] 美术检查把 null 当作有效解析** | **精细化断言**: `check-runtime-art-binder.js` 明确指出无工作台 Atlas 时 `resolve()` 返回 null (仅触发 Procedural Fallback)；明确记录 `Workspace Atlas Loaded: false`，绝不夸大美术接线结论。 |

---

## 阶段进展与交付明细

### 1. Milestone A (P0 - 成熟度模型与状态表达)
- **完成项**:
  - `gameplay-card-v2.schema.json` 规范制定，23 张基础卡与 24 张修饰卡结构重构。
  - 成熟度状态拆分为 6 级：`inventoried` | `card_json` | `ui_registered` | `runtime_ready` | `gate_verified` | `production_ready`。
  - `GameplayPanel.tsx` 动态渲染成熟度 Tag (`[runtime_ready]`)，22 张已实现基础卡正常可选。
  - `validate-gameplay-card.mjs` 门禁重构：解析并校验 specHash、runtimeVersion 与 E2E / 视觉 / 性能报告；`survivor_horde` 当前为 `runtime_ready` (`productionExportAllowed: false`)。

### 2. Milestone B (P1 - 运行时文案彻底数据化)
- **完成项**:
  - `ThemeContentResolver.js` 与 `theme-content-pack.schema.json` 架构完成。
  - 核心 Adapter 与 `GameRunner.ts` 结算/失败界面全量去题材化重构。
  - `check-theme-decoupling.js` 36 词黑名单门禁（涵盖 `core/lib` 与 `GameRunner.ts`）静态检查通过 (0 题材词残留，违规 exit 1 门禁)。
  - `check-text-visual-layout.js` 启发式字数槽位校验通过。

### 3. Milestone C (P2 & P5.1 - 资产/音频/测试底座)
- **完成项**:
  - 23 张卡片 `requiredAssets` 语义结构完成。
  - `AudioAssetResolver.js` 接入 `GameRunner.ts` 生命周期，场景销毁时自动销毁音频/ASMR，消除重复 BGM 启动。
  - `MockPhaserScene.js` 补齐 `setRadius`、`ellipse`、`camera bounds/follow` API。
  - `npm run check:node-smoke` 12/12 节点 Node Smoke 测试 100% 通过。

---

## 校验证据汇总 (Execution Log)

```bash
npx tsc --noEmit                                    # Passed (0 TypeScript errors)
npm run check:node-smoke                            # Passed (12/12 nodes passed)
node productize/validate-gameplay-card.mjs --all    # Passed (23 base cards + 24 modifiers = 47 V2 schema structural checks)
node productize/jobs/check-theme-decoupling.js       # Passed (0 theme terms in 36-word dictionary across core/lib & GameRunner.ts, exit 1 active)
node productize/jobs/check-runtime-art-binder.js    # Passed (23/23 requiredAssets contracts valid)
node productize/jobs/check-audio-asset-resolver.js  # Passed (Audio resolver unit check)
node productize/jobs/check-text-visual-layout.js   # Passed (7 text limit heuristic checks)
```

---

## 剩余待完成事项 (Pending Milestone Roadmap)

- [ ] **P5.4 真实浏览器 E2E 矩阵**: 搭建 Playwright 覆盖 Chrome Desktop / Mobile 胜利与失败流，生成真实 E2E 报告 (`standalone_browser_report.json`)。
- [ ] **P6 真实视觉/VLM 审计**: 对无黑屏、HUD 遮挡、文字溢出进行真实 Canvas 截图与 VLM 检查，生成 `visual_audit_latest.json`。
- [ ] **P5.5 性能 Soak 测试**: 跑 10 分钟高频动作关卡，校验 P95 FPS、内存与对象泄漏，生成 `performance_report_latest.json`。
- [ ] **P7 认证首张 Production Ready 关卡**: 在补齐上述真实 Gate 证据包后，正式认证 `survivor_horde` 为 `production_ready`。
