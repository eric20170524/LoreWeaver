# Phase D — Level Recipe + 生产 Catalog

> **时间**: 2026-07-24  
> **依赖**: `survivor_horde` = `production_ready`

## 1. Level Recipe

**Schema**: `productize/schemas/level-recipe.schema.json`  

```text
LevelRecipe = card + modifiers + knobs + contentPack + assetPack + audioPack + balanceProfile
```

**Golden recipes**（仅改 content pack 即换皮）:

| recipeId | 主题 |
| --- | --- |
| `survivor_horde_golden_production_v1` | 荒域 wasteland |
| `survivor_horde_cyber_pulse_production_v1` | 霓虹 cyber |

**编译器**:

```bash
npm run check:level-recipe
# or
node productize/jobs/compile-level-recipe.mjs --all
```

校验：card 存在且 **production_ready**、modifier 兼容、Theme Content Pack、workspace atlas/audio 路径、输出 `recipeHash`。

负例：`rhythm_timing` 标 production_recipe → **失败**（非 production 卡不可自动进生产配方）。

## 2. Catalog 策略

```bash
npm run catalog:gameplay
npm run catalog:gameplay:production
```

| 策略 | 行为 |
| --- | --- |
| 自动选用 | **仅** `status=production_ready` 且 `exportPolicy.productionReady=true` |
| 实验卡 | 22 张 `runtime_ready`，必须显式标记 |

当前 auto-select：**1** 张 — `survivor_horde`。

## 3. 未做

- IDE 工作台一键「按 Recipe 编译进节点」UI  
- 主题生成器后端强制读 catalog production filter（可下一跳接 `list-gameplay-catalog`）  
- balance profile 实测数值库  
