# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **publish hard-gate + Level Recipe 工作台路径 + stale 联动已落地**  
> **更新时间**: 2026-07-24

---

## 成熟度

| Card | status | 自动编排 |
| --- | --- | --- |
| **survivor_horde** | **production_ready** | **是** |
| 其余 22 | runtime_ready | 否 |

---

## 本轮（D1 收口 + publish hard-block）

| 能力 | 命令 / 模块 |
| --- | --- |
| 生产导出硬门禁 | `productize/lib/production-export-gate.mjs` · `npm run productize:card` · `npm run check:production-export-gate` |
| 证据 stale 标记 | `productize/lib/mark-gate-reports-stale.mjs`（recipe apply 写节点后联动） |
| Recipe 共享 apply | `productize/lib/apply-level-recipe-core.mjs` · CLI `recipe:apply` / `recipe:list` |
| 工作台 UI | GameplayPanel「Level Recipe 一键应用」 |
| 后端 API | `POST /api/workspaces/{id}/level-recipe/apply` · `GET …/level-recipes` |

验收要点：

1. 完整证据 → `productionExportAllowed: true`
2. 报告 stale / 缺失 / cardId 不匹配 / `releaseEligible!=true` → **硬失败**
3. cyber recipe dry-run → 节点标题 **霓虹脉冲清场**（与 CLI 同路径）
4. 写节点 apply 会标记门禁报告 stale，发布门禁拒绝直至重跑证据

详见 [step_D1_publish_gate_recipe_ui.md](docs/reports/step_D1_publish_gate_recipe_ui.md)

---

## 换皮最短路径（生产）

```bash
# 1) 校验配方
npm run check:level-recipe

# 2) 应用到工作区节点（CLI 或工作台 UI 按钮）
npm run recipe:apply -- \
  --recipe minigame_master/gameplay/cards/fixtures/survivor_horde/level_recipe.cyber_pulse.json \
  --workspace 20260611-060754-719406 \
  --node 1

# 3) 重跑 E2E/视觉/性能证据后：
npm run productize:card -- minigame_master/gameplay/cards/survivor_horde.json

# 4) 打开 http://localhost:3000 模拟器验证
```

---

## 下一步（非本轮 scope）

1. 横向认证 `rhythm_timing`  
2. residual：真机 FPS / VLM  
3. 生产音频 cue 全矩阵硬失败  
