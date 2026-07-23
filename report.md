# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **`survivor_horde` = `production_ready`**（有条件认证）  
> **更新时间**: 2026-07-23  
> **productionExportAllowed**: **true**

---

## 成熟度一览

| Card | status | productionReady |
| --- | --- | --- |
| **survivor_horde** | **`production_ready`** | **true** |
| 其余 22 张基础卡 | `runtime_ready` | false |

---

## 认证命令

```bash
npm run check:survivor-c7-readiness
# productionReadyEligible: true · releaseEligible: true

node productize/validate-gameplay-card.mjs minigame_master/gameplay/cards/survivor_horde.json
# status: passed · productionExportAllowed: true
```

---

## 换皮含义（现可宣称）

对 **`survivor_horde` 这一张卡**：

> 在 Theme Content Pack + 合法 Asset/Audio + knobs/modifiers 下换主题文案与美术，  
> **可生成已门禁认证的生产级关卡模板**（仍受 residual risk 约束）。

**不能**宣称全部 23 张卡都已 production_ready。

---

## Residual risk（诚实记录）

- Headless FPS 代理，非真机抓帧  
- 无 VLM 文字溢出审计  
- 所有者指令放行 + 自动化证据 + 试玩清单签字  

详见 [step_C7_production_ready.md](docs/reports/step_C7_production_ready.md)
