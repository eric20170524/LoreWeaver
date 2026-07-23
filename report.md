# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: `survivor_horde` = **`gate_verified`** + **主题换皮 demo 已通**；仍非 `production_ready`  
> **更新时间**: 2026-07-23  
> **atlas 残缺**: 已修复（程序化完整全身帧）

---

## 成熟度

| Card | status | 说明 |
| --- | --- | --- |
| **survivor_horde** | **gate_verified** | 自动化 smoke/e2e/visual/600s soak 全绿 |
| 其余基础卡 | runtime_ready | 未逐张认证 |

`exportPolicy.productionReady = false` · `releaseEligible = false`

---

## 本轮：主题换皮

```bash
npm run check:survivor-theme-skin
# wasteland vs cyber 标题/HUD/胜负文案均切换 · passed
```

Demo 用法（survivor Vite 服务，非 3000 工作台）：

- `?theme=wasteland`（默认）→ 荒域生存试炼  
- `?theme=cyber` → 霓虹脉冲清场  
- `?locale=en` → 英文  

详见 [step_theme_skin_swap.md](docs/reports/step_theme_skin_swap.md)

---

## 常用命令

```bash
npm run check:atlas-integrity
npm run rebuild:survivor-atlas
npm run check:survivor-e2e
npm run check:standalone-survivor-e2e
npm run check:survivor-theme-skin
npm run check:survivor-c7-readiness
```

---

## 距 production_ready

1. 真人试玩签字 `docs/reports/step_C7_human_playtest_signoff.md`  
2. 真机 FPS /（可选）VLM  
3. 决策后 `releaseEligible=true` + `status=production_ready`  
