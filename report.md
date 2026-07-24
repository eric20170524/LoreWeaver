# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **2 张 production_ready 卡**（survivor_horde · rhythm_timing）  
> **更新时间**: 2026-07-24

---

## 成熟度

| Card | status | 自动编排 |
| --- | --- | --- |
| **survivor_horde** | **production_ready** | **是** |
| **rhythm_timing** | **production_ready** | **是**（tap_reaction 映射） |
| 其余 21 | runtime_ready | 否 |

默认冷启动 / `default_production_card_id` 仍优先 **survivor_horde**。

---

## 本轮（E3：`rhythm_timing` → production_ready）

| 能力 | 命令 / 报告 |
| --- | --- |
| 多卡 hard-gate | `production-export-gate` 按卡文件名解析证据 |
| Release E2E | `npm run check:rhythm-e2e:release` |
| Visual + 120s soak | `npm run check:rhythm-visual-soak:release`（avgFps≈60） |
| 生产 Recipe | temple / neon / production fixtures |
| Catalog | `productionReady >= 2` · `check:catalog-policy` |

详见：

- [step_E3_rhythm_timing_production_ready.md](docs/reports/step_E3_rhythm_timing_production_ready.md)
- [step_E3_rhythm_timing_human_playtest_signoff.md](docs/reports/step_E3_rhythm_timing_human_playtest_signoff.md)

### Residual（有条件认证）

- 真机 FPS P95 / VLM / 完整 standalone zip host E2E / Boss 阶段生产 demo

---

## 换皮最短路径

```bash
# survivor 霓虹
npm run recipe:apply -- \
  --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json \
  --workspace 20260611-060754-719406 --node 1

# rhythm 霓虹节拍
npm run recipe:apply -- \
  --recipe minigame_master/gameplay/cards/fixtures/rhythm_timing/level_recipe.neon.json \
  --workspace 20260611-060754-719406 --node 3
```

---

## 下一步

1. 横向下一张 **`drag_collect_grid` → gate_verified / production_ready**  
2. residual：真机 FPS / VLM  
3. 多 production 卡按主题/节奏的编排选型（D2 余项）  
