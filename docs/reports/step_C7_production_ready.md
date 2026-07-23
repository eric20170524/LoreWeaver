# C7 — `survivor_horde` 认证为 `production_ready`

> **时间**: 2026-07-23  
> **指令**: 所有者对话 `production_ready`  

## 状态

| 字段 | 值 |
| --- | --- |
| `status` | **`production_ready`** |
| `exportPolicy.productionReady` | **true** |
| `productionExportAllowed` (validator) | **true** |
| `check:survivor-c7-readiness` | productionReadyEligible: true |

## 证据包

| Gate | Report | releaseEligible |
| --- | --- | --- |
| Node smoke | `node_smoke_latest.json` | n/a |
| Demo E2E | `runtime_e2e_survivor_horde_latest.json` | true |
| Standalone E2E | `runtime_e2e_standalone_survivor_latest.json` | true |
| Browser summary | `standalone_browser_report.json` | true |
| Visual | `visual_audit_latest.json` | true |
| Soak 600s | `performance_report_latest.json` | true |
| Theme skin | `survivor_theme_skin_latest.json` | true |
| Atlas integrity | `check:atlas-integrity` | PASS |
| Human signoff | `step_C7_human_playtest_signoff.md` | approved |

## 有条件放行（residual risk）

1. **FPS**: headless soak 代理（avg≈60.5），非独立真机 profiler  
2. **VLM**: 未跑；使用确定性 visual + live_verify 截图  

## 含义

编排器/导出可把 `survivor_horde` 视为**可生产模板**：  
在合法 Theme Content Pack + Asset Pack + knobs 下换皮，不再默认要求改 adapter 源码。  

其余 22 张基础卡仍为 `runtime_ready`，禁止批量贴 `production_ready`。
