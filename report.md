# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **5 张 production_ready 卡**  
> **更新时间**: 2026-07-24

---

## 成熟度

| Card | status | 自动编排 |
| --- | --- | --- |
| **survivor_horde** | **production_ready** | **是**（默认冷启动） |
| **rhythm_timing** | **production_ready** | **是**（tap_reaction） |
| **drag_collect_grid** | **production_ready** | **是**（collect_dodge） |
| **turn_based_skill_battle** | **production_ready** | **是** |
| **sequence_synthesis** | **production_ready** | **是**（memory_sequence） |
| 其余 18 | runtime_ready | 否 |

---

## 本轮（E3：`sequence_synthesis` → production_ready）

| 能力 | 命令 / 报告 |
| --- | --- |
| Core demo | `minigame_master/core/demo/sequence_synthesis`（`?theme=alchemy\|neon`） |
| Release E2E | `npm run check:seq-e2e:release` |
| Visual + 120s soak | `npm run check:seq-visual-soak:release`（avgFps≈60） |
| Gate | `npm run check:seq-gate` |
| Catalog | `productionReady: 5` |

详见 [step_E3_sequence_synthesis_production_ready.md](docs/reports/step_E3_sequence_synthesis_production_ready.md)

### Residual（多卡共用）

- 真机 FPS P95 / VLM / 完整 standalone zip host E2E

---

## 下一步

1. 横向 **`side_scrolling_brawler`**（更重）或其它 runtime_ready 轻量卡  
2. residual：真机 FPS / VLM  
3. 多 production 卡按主题/节奏的编排选型  
