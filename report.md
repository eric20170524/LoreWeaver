# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **production_ready 卡已接入编排 + Recipe 可落到节点**  
> **更新时间**: 2026-07-24

---

## 成熟度

| Card | status | 自动编排 |
| --- | --- | --- |
| **survivor_horde** | **production_ready** | **是** |
| 其余 22 | runtime_ready | 否 |

---

## 本轮（D2 编排落地）

| 能力 | 命令 / 模块 |
| --- | --- |
| 生产 Catalog 策略 | `backend/gameplay_catalog.py` · `npm run check:catalog-policy` |
| 部门补丁用生产卡 | `department_agents` gameplay patches |
| 冷启动预设默认生产卡 | `theme_presets` 12 节点 → `survivor_horde` |
| Recipe 应用到节点 | `npm run recipe:apply -- --recipe … --node 1` |

示例：对 node 1 应用 cyber recipe → 标题变为 **霓虹脉冲清场**（已 dry-run + 实测）。

详见 [step_D2_catalog_and_apply.md](docs/reports/step_D2_catalog_and_apply.md)

---

## 换皮最短路径（生产）

```bash
# 1) 校验配方
npm run check:level-recipe

# 2) 应用到工作区节点
npm run recipe:apply -- \
  --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json \
  --workspace 20260611-060754-719406 \
  --node 1

# 3) 打开 http://localhost:3000 模拟器验证
```

---

## 下一步

1. 工作台 UI 按钮封装 `recipe:apply`  
2. 横向认证 `rhythm_timing`  
3. residual：真机 FPS / VLM  
