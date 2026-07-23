# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: 进行中 / **C2+C3 浏览器证据已扩展**（demo 失败/暂停 + standalone 真 atlas）  
> **更新时间**: 2026-07-23  
> **首张竖切**: `survivor_horde` · **`runtime_ready`** · **`releaseEligible: false`**  
> **禁止**: 勿因 demo/standalone 冒烟通过而晋升 `production_ready`

---

## 阶段进度

| 步骤 | 状态 | 命令 / 证据 |
| --- | --- | --- |
| A1 美术运行核 | 完成 | `npm run check:art-binder` |
| N+2 golden atlas | 完成 | `npm run check:survivor-golden-atlas` |
| C2 demo E2E 双视口 | 完成 | `npm run check:survivor-e2e` |
| **C3 暂停/自然失败** | **完成** | demo E2E 内嵌 |
| **C3 standalone 真 atlas** | **完成** | `npm run check:standalone-survivor-e2e` |
| C5–C6 视觉 + soak | 未做 | — |
| C7 production_ready | 未做 | 0 张 |

---

## 最新 E2E 摘要

### Demo (`check:survivor-e2e`)

- Mobile：pause/resume · `hp_zero` 失败 · force 胜利  
- Desktop：撤退  
- `specHash`: `survivor_horde:core_demo:v1`  
- errors: []

### Standalone export (`check:standalone-survivor-e2e`)

- 包：`standalone-20260611-060754-719406-20260722064022`  
- `artAtlasLoaded: true`  
- `adapterRunning: true`  
- `specHash` 与 release-manifest 对齐  
- `releaseEligible: false`

详情：

- [step_C2](docs/reports/step_C2_survivor_playwright_e2e.md)  
- [step_C3](docs/reports/step_C3_standalone_and_fail_pause.md)

---

## 下一步

1. 可选：IDE 工作台 UI 进关路径 E2E  
2. C5–C6 视觉 + 10 分钟 soak  
3. 证据齐备后再 C7 晋升（勿提前改 card status）  
