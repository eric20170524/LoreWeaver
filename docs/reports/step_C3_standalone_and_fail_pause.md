# 简要步骤报告: C3 — 自然失败/暂停 + Standalone 真实 Atlas E2E

> **交付物ID**: `step_C3_standalone_and_fail_pause`  
> **关联任务**: Phase C3 / C4 补全  
> **完成时间**: 2026-07-23  

---

## 1. Demo 扩展（`npm run check:survivor-e2e`）

| 流 | 视口 | 结果 |
| --- | --- | --- |
| pause → resume（timer 冻结） | mobile | PASS |
| `damagePlayer` → `hp_zero` 自然失败 | mobile | PASS |
| force 胜利 | mobile | PASS |
| 进关 → 撤退 | desktop | PASS |

报告：`runtime_e2e_survivor_horde_latest.json`（`releaseEligible: false`）

---

## 2. Standalone 导出包 E2E（`npm run check:standalone-survivor-e2e`）

| 项 | 值 |
| --- | --- |
| 目标目录 | `productize/exports/standalone-20260611-060754-719406-20260722064022` |
| `specHash` | 与 `release-manifest.json` 一致 |
| Art atlas | **loaded**（真实 imagegen） |
| 启动 `survivor_horde` | LevelActiveScene running |
| 失败 | damagePlayer / finish hp_zero |
| `releaseEligible` | **false** |

报告：`runtime_e2e_standalone_survivor_latest.json`

---

## 3. 未完成

- IDE 工作台完整 UI 路径 E2E  
- 10 分钟 soak / VLM  
- `production_ready` / `releaseEligible: true`  
