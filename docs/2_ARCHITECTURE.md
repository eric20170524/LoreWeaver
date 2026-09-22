# 2_ARCHITECTURE.md: 本轮架构红线

## 1. 技术栈

沿用现有：React 工作台、Phaser 4 runtime、`minigame_master/core` 适配器/modifier、Express+FastAPI 网关、workspace 文件。

## 2. 架构红线

- **题材解耦：** `GameRunner` / core adapter 禁止写入具体 IP 技能名、敌人名、故事常量。题材只存在于 workspace/preset/manifest。
- **成长所有权：** 局内成长由 `run_growth_milestones` 或卡 modifier 驱动；Runner 只做容器。
- **工作区隔离：** 玩家存档按 `workspaceId` 分键；manifest 已按 `data/workspaces/<id>` 隔离。
- **网关原则：** 不在前端直连大模型。本轮无新 API。编排仍走 `WorldBuilderAgent.generate_gdd` → `generate_json`。有 `XAI_API_KEY` 或 `GROK_API_KEY` 时 provider 为 `grok`；都没有时返回程序预设，日志不得把这次回退叫 grok。`OLLAMA_API_BASE` 只打延期提示。
- **合同稳定：** 不改 `NodePayload` / `NodeResult` 字段形状。能力数值写在 `abilityCatalog[].effects`，由 `foldOwnedAbilityEffectsIntoKnobs` 折进已有战斗目标。预设没写的旋钮用该 modifier 的默认正数当底，再做乘加；结果不是正数就不写入，避免 0 被运行时夹回另一套默认。

## 3. 目录

- 战斗 modifier：`minigame_master/core/lib/gameplay/survivor_horde/modifiers/`（含 `overdrive_transformation`）
- 修炼交易与首通折算：`src/game/ui/cultivationModel.ts`、`src/utils/RewardApplier.ts`
- 宿主入局：`src/game/GameRunner.ts`
- 存档：`src/runtime/playerState.ts`、`src/store.tsx`
- 石牧内容：`data/presets/xuanjiezhimen_fangame_preset.json`

## 4. 自测与验证命令

```bash
node --test productize/jobs/check-survivor-combat-runtime.mjs
node productize/jobs/check-weapon-stance-cycle.mjs
npx tsx --test productize/jobs/check-cultivation-model.ts
npx tsx --test productize/jobs/check-player-state.ts
python productize/jobs/check-xuanjiezhimen-fangame-preset.py
python productize/jobs/check-gameplay-catalog-policy.py
node --test productize/jobs/check-dodge-counter-runtime.mjs
node productize/jobs/run-xuanjie-local-play-e2e.mjs
npx tsc --noEmit
```

自动选卡只认 `status=production_ready` 且 `exportPolicy.productionReady=true`。本轮降级后默认只剩 `survivor_horde`。

优先 E2E 验证 AC。十二节点试玩要连跑两遍，两遍都是 `status=passed` 且 `errors=[]` 才算过。挂机场景若和关卡同时活着，存档必须合并已通关列表，不能用旧的 `completedNodeIds` 覆盖新结算。
