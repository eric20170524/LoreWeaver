# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **`survivor_horde` = production_ready** + **Phase D Recipe/Catalog 已落地**  
> **更新时间**: 2026-07-24

---

## 成熟度

| Card | status | 自动编排 |
| --- | --- | --- |
| **survivor_horde** | **production_ready** | **是** |
| 其余 22 张 | runtime_ready | 否（实验，需显式） |

---

## Phase D（本轮）

```bash
npm run check:level-recipe          # 2 条 production recipe 编译通过
npm run catalog:gameplay:production # auto-select: survivor_horde ×1
```

- Schema: `productize/schemas/level-recipe.schema.json`  
- 荒域 / 霓虹 两套 recipe，**同一 card + atlas，只换 content pack**  
- 非 production 卡写 production_recipe → **硬拒绝**

详见 [step_D_level_recipe.md](docs/reports/step_D_level_recipe.md)

---

## 换皮操作面（生产卡）

1. 复制 recipe JSON  
2. 改 `contentPackRef`（及可选 knobs/modifiers）  
3. `npm run check:level-recipe`  
4. 通过后可接入工作台节点 / 导出  

---

## 下一步

1. 工作台「应用 Recipe」按钮 / 后端 preset 读 production catalog  
2. 横向认证 `rhythm_timing`  
3. 补真机 FPS / VLM residual  
