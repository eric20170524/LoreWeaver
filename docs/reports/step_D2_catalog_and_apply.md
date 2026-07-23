# Phase D2 — 生产 Catalog 编排 + Recipe 应用到节点

> **时间**: 2026-07-24

## 1. 后端 Catalog 策略

**模块**: `backend/gameplay_catalog.py`

| API | 行为 |
| --- | --- |
| `list_production_cards()` | 仅 `status=production_ready` 且 `exportPolicy.productionReady` |
| `resolve_card_id(mechanics, …)` | 自动路径：实验卡 → 回落 `survivor_horde` |
| `allow_experimental=True` | 才允许 `rhythm_timing` 等 |

**接入**: `department_agents.build_controlled_patches(gameplay)` 用 catalog 解析 cardId。  
**预设**: `theme_presets.get_procedural_preset` 默认 12 节点均 `cardId=survivor_horde`。

```bash
npm run check:catalog-policy
```

## 2. Recipe → 节点

```bash
npm run recipe:apply -- \
  --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json \
  --workspace 20260611-060754-719406 \
  --node 1

# dry-run
npm run recipe:apply -- --recipe … --node 1 --dry-run
```

效果：写入 `nodes/node-*.json` 的 `gameplay.cardId/modifiers/knobs`，并从 Theme Content Pack 填充 `title`/`intro`。

## 3. 验证

- catalog policy unit: **PASS**  
- recipe apply dry-run: 荒域→霓虹 title 切换 **PASS**  
