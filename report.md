# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **survivor_horde = production_ready** · **rhythm_timing = gate_verified**  
> **更新时间**: 2026-07-24

---

## 成熟度

| Card | status | 自动编排 | 说明 |
| --- | --- | --- | --- |
| **survivor_horde** | **production_ready** | **是** | 有 residual（真机 FPS / VLM） |
| **rhythm_timing** | **gate_verified** | 否（需显式 experimental） | demo E2E 竖切；未 production |
| 其余 21 | runtime_ready | 否 | — |

---

## 本轮（E3：`rhythm_timing` 竖切）

| 能力 | 命令 / 路径 |
| --- | --- |
| Core demo | `minigame_master/core/demo/rhythm_timing`（`?theme=temple|neon`） |
| Playwright E2E | `npm run check:rhythm-e2e` |
| Gate 就绪 | `npm run check:rhythm-gate` |
| 实验 Recipe | `fixtures/rhythm_timing/level_recipe.*.json` |
| 主题包 | 灵息试炼 / 霓虹节拍 |

证据：进关、暂停恢复、`hp_zero` 失败、force 胜利、桌面撤退；`releaseEligible: false`。

详见 [step_E3_rhythm_timing_gate_verified.md](docs/reports/step_E3_rhythm_timing_gate_verified.md)

---

## 换皮最短路径（生产卡 survivor）

```bash
npm run check:level-recipe
npm run recipe:apply -- \
  --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json \
  --workspace 20260611-060754-719406 --node 1
npm run productize:card -- minigame_master/gameplay/cards/survivor_horde.json
```

## rhythm_timing 体验

```bash
npx vite --config minigame_master/core/demo/rhythm_timing/vite.config.mjs --host 127.0.0.1 --port 5190
# open http://127.0.0.1:5190/?theme=neon
npm run check:rhythm-e2e
```

---

## 下一步

1. 将 `rhythm_timing` 推到 `production_ready`（standalone E2E + 证据包 + 签字）  
2. 或横向下一张 **`drag_collect_grid`** → gate_verified  
3. residual：真机 FPS / VLM  
