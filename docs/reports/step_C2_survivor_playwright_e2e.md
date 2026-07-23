# 简要步骤报告: C2 — `survivor_horde` Playwright 浏览器 E2E

> **交付物ID**: `step_C2_survivor_playwright_e2e`  
> **关联任务**: `task.md` Phase C2–C4（本步完成 C2 最小矩阵）  
> **完成时间**: 2026-07-23  

---

## 1. 范围

| 项 | 内容 |
| --- | --- |
| 目标 | `minigame_master/core/demo/survivor_horde`（core adapter 演示，非完整工作台 export） |
| 工具 | Playwright Chromium + Vite 本地起 demo |
| 脚本 | `productize/jobs/run-survivor-e2e.mjs` · `npm run check:survivor-e2e` |
| 视口 | Mobile 720×1280 · Desktop 1280×800 |

### 流程

1. Boot → Start  
2. 运行态：timer 递减、canvas 非空、指针移动  
3. Retreat → `resultReason=retreated` → 回菜单  
4. （仅 mobile）再开一局 force `finish(true)` → 胜利结算  

---

## 2. 报告产物

| 文件 | 说明 |
| --- | --- |
| `minigame_master/capabilities/reports/runtime_e2e_survivor_horde_latest.json` | 完整断言与观察态 |
| `minigame_master/capabilities/reports/standalone_browser_report.json` | 摘要（`releaseEligible: false`） |

报告字段含：`cardId`、`specHash`、`runtimeVersion`、`platforms`、`modifiers`、`releaseEligible: false`。

Demo meta：`survivor_horde:core_demo:v1`（`main.js` 中 `DEMO_SPEC_HASH`）。

---

## 3. 验证结果（本机）

```bash
npm run check:survivor-e2e
# status: passed
# mobile + desktop 全 assertion true
# errors: []
# releaseEligible: false
```

---

## 4. 明确未完成（勿晋升 production）

- 工作台 IDE / standalone export 路径 E2E（本报告仅 **core demo**）  
- 真实 workspace atlas 在 demo 中的装载（demo 仍为程序化精灵为主）  
- 失败流自然死亡（当前胜利为 force finish）  
- 10 分钟 soak / VLM 视觉  
- `gate_verified` / `production_ready` / `releaseEligible=true`  
