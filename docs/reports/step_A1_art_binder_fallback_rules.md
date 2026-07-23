# 简要步骤报告: Step A1 — Runtime 生产/原型美术门禁 + Golden Fixture

> **交付物ID**: `step_A1_art_binder_fallback_rules`  
> **关联任务**: `task.md` Phase A1 (美术生产接线 & 运行核)  
> **完成时间**: 2026-07-23  
> **状态**: 运行核单元验证通过；真实 Playwright / 全量 atlas 仍待后续 Phase

---

## 1. Golden Asset Fixture

- **路径**: `minigame_master/gameplay/cards/fixtures/survivor_horde/golden_asset_fixture.json`
- **覆盖**: playerClips ×5、enemyKinds(mob/elite/boss)、environments、audioCues
- **生产策略**: `allowProceduralFallback: false`、`onMissingAsset: throw_hard_error`、`releaseEligible: false`
- **原型策略**: `allowProceduralFallback: true`、`exposeStatusInHooks: true`

---

## 2. 运行核行为（已实现）

| 模式 | 行为 | 证据 |
| --- | --- | --- |
| **prototype** | 允许 procedural fallback；`createSprite`/`createBackground` 写入 `artSource`；`degradations` 记入全局 status 与 TestHooks | unit check |
| **production** | 关键 role（player/enemy/environment）缺 atlas → `ArtAssetMissingError`；有纹理则 `artSource=atlas` | unit check |
| **切换入口** | `setRuntimeMode` / `applyFallbackPolicy`；GameRunner：`options.artRuntimeMode`、`window.__LOREWEAVER_ART_RUNTIME_MODE__`、knobs `artRuntimeMode`（默认 prototype） | 代码接线 |

关键 API：`RuntimeArtBinder` — `setRuntimeMode`、`applyFallbackPolicy`、`validateRequiredAssets`、`createSprite`、`createBackground`、`syncToTestHooks`、`getArtTelemetry`；错误类型 `ArtAssetMissingError`。

---

## 3. 校验命令与结论

```bash
node productize/jobs/check-runtime-art-binder.js
```

期望输出摘要：

- 23/23 requiredAssets 结构
- golden fixture `releaseEligible: false`
- prototype fallback + TestHooks degradations **PASS**
- production missing critical **throws** **PASS**
- production createBackground without env **throws** **PASS**

> **仍待**: 真实 workspace atlas 装载下的 Playwright E2E 硬门禁；全卡 golden 资产；生产导出 gate 绑定 `releaseEligible`。
