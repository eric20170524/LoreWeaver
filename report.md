# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: 进行中 / **C2 Playwright E2E（survivor_horde demo）已通过**  
> **更新时间**: 2026-07-23  
> **首张竖切**: `survivor_horde` · 成熟度仍为 **`runtime_ready`** · **`releaseEligible: false`**  
> **说明**: 浏览器证据来自 **core demo**，不是完整工作台 export，**不得**据此晋升 `production_ready`

---

## 阶段进度

| 步骤 | 状态 | 证据 |
| --- | --- | --- |
| S0 规格 / DoD | 完成定义 | `docs/reports/step_S0_*.md` |
| C1 Headless 23/23 | 完成 | `check:node-smoke` |
| A1 运行核 production throw | 完成 | `check:art-binder` |
| N+2 golden atlas 覆盖 | 完成 | `check:survivor-golden-atlas` |
| **C2 Playwright 进关/撤/胜** | **完成（demo）** | `check:survivor-e2e` |
| C3–C4 全流 / 工作台路径 | 未做 | — |
| C5–C6 视觉 + soak | 未做 | — |
| C7 production_ready | 未做 | 0 张 |

---

## C2 摘要

```bash
npm run check:survivor-e2e
```

- 视口：`720×1280` + `1280×800`  
- 流：进关 → 运行/timer → 撤退 → 菜单；mobile 另测 force 胜利  
- 报告：  
  - `minigame_master/capabilities/reports/runtime_e2e_survivor_horde_latest.json`  
  - `.../standalone_browser_report.json`  
- `specHash`: `survivor_horde:core_demo:v1`  
- `releaseEligible`: **false**  
- `errors`: []

详情：[step_C2_survivor_playwright_e2e.md](docs/reports/step_C2_survivor_playwright_e2e.md)

---

## 常用校验

```bash
npm run check:node-smoke
npm run check:art-binder
npm run check:survivor-golden-atlas
npm run check:survivor-e2e
```

---

## 下一步建议

1. **C3**：工作台/standalone 路径上启动 `survivor_horde`（带 workspace atlas）并复用 Playwright  
2. **自然失败流**（HP=0）+ 暂停恢复  
3. **C5–C6** 视觉抽检 + soak  
4. 证据齐后 **C7** 再谈 `gate_verified` / `production_ready`  
