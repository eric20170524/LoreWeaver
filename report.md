# minigame_master 关卡生产化进度与质量报告 (report.md)

> **当前总体状态**: **`survivor_horde` = `gate_verified`**（自动化证据齐）；**仍非 `production_ready`**  
> **更新时间**: 2026-07-23  
> **releaseEligible**: **false**

---

## 成熟度

| Card | status | productionReady |
| --- | --- | --- |
| **survivor_horde** | **`gate_verified`** | false |
| 其余 22 张基础卡 | `runtime_ready` | false |

---

## C7 就绪检查

```bash
npm run check:survivor-c7-readiness
```

```text
gateVerifiedEligible: true
productionReadyEligible: false
open blockers:
  - human_playtest_approved
  - release_eligible_true
  - device_class_fps_evidence
  - vlm_visual_overflow
  - export_policy_and_status_aligned
```

---

## 已完成链路（survivor_horde）

| 阶段 | 命令 |
| --- | --- |
| A1 运行核 | `check:art-binder` |
| N+2 golden atlas | `check:survivor-golden-atlas` |
| C2/C3 E2E | `check:survivor-e2e` · `check:standalone-survivor-e2e` |
| C5–C6 visual+600s soak | `check:survivor-visual-soak:full` |
| C7 汇总 | `check:survivor-c7-readiness` |

---

## 如何到达 production_ready

1. 完成并批准 `docs/reports/step_C7_human_playtest_signoff.md`  
2. 真机帧率记录 +（可选）VLM  
3. 明确决策后将相关报告 `releaseEligible=true`（与当前 specHash 绑定）  
4. 卡 `status=production_ready` 且 `exportPolicy.productionReady=true`  
5. 再跑 `validate-gameplay-card` 硬门禁  

**禁止**在未签字时批量抬其他卡。  
