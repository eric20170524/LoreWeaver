# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **3 张 production_ready 卡**  
> **更新时间**: 2026-07-24

---

## 成熟度

| Card | status | 自动编排 |
| --- | --- | --- |
| **survivor_horde** | **production_ready** | **是**（默认冷启动） |
| **rhythm_timing** | **production_ready** | **是**（tap_reaction） |
| **drag_collect_grid** | **production_ready** | **是**（collect_dodge） |
| 其余 20 | runtime_ready | 否 |

---

## 本轮（E3：`drag_collect_grid` → production_ready）

| 能力 | 命令 / 报告 |
| --- | --- |
| Core demo | `minigame_master/core/demo/drag_collect_grid`（`?theme=void\|neon`） |
| Release E2E | `npm run check:drag-e2e:release` |
| Visual + 120s soak | `npm run check:drag-visual-soak:release`（avgFps≈60） |
| Gate | `npm run check:drag-gate` · productionExportAllowed |
| Catalog | `productionReady: 3` |

修复：faller 循环在 `finish`/clear 后空引用；soak 仅点击可见 Start/Back。

详见 [step_E3_drag_collect_grid_production_ready.md](docs/reports/step_E3_drag_collect_grid_production_ready.md)

### Residual（三卡共用策略）

- 真机 FPS P95 / VLM / 完整 standalone zip host E2E

---

## 换皮示例

```bash
# drag 霓虹数据雨
npm run recipe:apply -- \
  --recipe minigame_master/gameplay/cards/fixtures/drag_collect_grid/level_recipe.neon.json \
  --workspace 20260611-060754-719406 --node 2
```

---

## 下一步

1. 横向 **`turn_based_skill_battle`**  
2. residual：真机 FPS / VLM  
3. 多 production 卡按主题/节奏的编排选型  
