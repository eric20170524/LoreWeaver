# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **10 张 production_ready 卡**  
> **更新时间**: 2026-07-24

---

## 成熟度

| 批次 | Cards |
| --- | --- |
| 竖切首卡 | `survivor_horde` |
| 横向认证 | `rhythm_timing` · `drag_collect_grid` · `turn_based_skill_battle` · `sequence_synthesis` |
| **轻量批** | **`reaction_pick` · `energy_balance` · `observe_capture` · `drag_to_core` · `pressure_survival`** |
| 仍 runtime_ready | brawler / platform / maze / shooter / qix / dialogue / container 等 |

自动编排：仅 `production_ready` 可 auto-select；默认冷启动仍优先 **survivor_horde**。

---

## 本轮（轻量批 ×5）

共享 demo：`minigame_master/core/demo/lightweight?card=<id>`  

```bash
npm run check:light-batch          # SOAK_SECONDS=90
npm run check:light-e2e -- --card reaction_pick
npm run check:light-soak -- --card energy_balance
```

报告：`lightweight_batch_cert_latest.json`  
文档：[step_E3_lightweight_batch_production_ready.md](docs/reports/step_E3_lightweight_batch_production_ready.md)

### Residual

真机 FPS / VLM / 完整 standalone zip host E2E

---

## 下一步

1. 中等卡（`rune_connect_sequence` / `point_drag_progression` / `shooter_duel`…）  
2. 重卡 `side_scrolling_brawler`  
3. residual 真机/VLM  
