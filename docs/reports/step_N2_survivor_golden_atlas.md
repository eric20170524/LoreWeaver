# 简要步骤报告: N+2 — `survivor_horde` 真 Atlas 与换皮 Recipe 夹具

> **交付物ID**: `step_N2_survivor_golden_atlas`  
> **关联任务**: `task.md` Phase A1 真资产 / Recipe 草稿  
> **完成时间**: 2026-07-23  

---

## 1. 产出

| 文件 | 作用 |
| --- | --- |
| `minigame_master/gameplay/cards/fixtures/survivor_horde/golden_asset_fixture.json` | 绑定 workspace atlas 帧源 + 语义 key + 音频 cue（`releaseEligible: false`） |
| `.../theme_content_pack.fixture.json` | 可换皮主题文案包（zh-CN / en） |
| `.../level_recipe.fixture.json` | `card + knobs + content + asset + audio` 配方草稿 |
| `productize/jobs/check-survivor-golden-atlas.js` | 校验 golden ⊆ 真实 workspace atlas（116 帧中的关键源） |

Workspace: `20260611-060754-719406`  
Atlas: `assets/imagegen/atlas.png` + `manifest.json`（已存在 player/enemy/env 帧）

---

## 2. 运行时对齐

- `textureKeyForFrame` 扩展：player clips → `lw_runtime_player_*`，与 golden 语义一致  
- `validateRequiredAssets` 支持 `semanticAssetMapping` / `envKeyMap`（`bg_default` → desert）  
- `seedTextureKeys` / `applySemanticAssetMapping`：合同测试可在无 PNG decode 时种子化  
- `GameRunner`：`artRuntimeMode=production` 且 `survivor_horde` 时进关前 `validateRequiredAssets`（缺图硬失败）

---

## 3. 验证

```bash
npm run check:survivor-golden-atlas
# 或
node productize/jobs/check-survivor-golden-atlas.js
```

期望：atlas 帧 / 音频 basename / theme / recipe / production validate + artSource=atlas 全 PASS；`releaseEligible` 仍为 false。

---

## 4. 未完成

- 浏览器内真实 Phaser 切片装载后的 Playwright E2E  
- 主题包运行时完整注入 adapter 文案（不仅 fixture 文件）  
- `production_ready` 晋升  
