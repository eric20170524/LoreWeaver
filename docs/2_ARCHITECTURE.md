# 2_ARCHITECTURE.md: 本轮架构红线

## 1. 技术栈

沿用现有：React 工作台、Phaser 4 runtime、`minigame_master/core` 适配器/modifier、Express+FastAPI 网关、workspace 文件。

## 2. 架构红线

- **题材解耦：** `GameRunner` / core adapter 禁止写入具体 IP 技能名、敌人名、故事常量。题材只存在于 workspace/preset/manifest。
- **成长所有权：** 局内成长由 `run_growth_milestones` 或卡 modifier 驱动；Runner 只做容器。
- **工作区隔离：** 玩家存档按 `workspaceId` 分键；manifest 已按 `data/workspaces/<id>` 隔离。
- **网关原则：** 不在前端直连大模型。本轮无新 API。
- **合同稳定：** 不改 `NodePayload` / `NodeResult` 字段形状；只充实 `playerStats` 与 modifier knobs 的取值。

## 3. 目录

- 战斗 modifier：`minigame_master/core/lib/gameplay/survivor_horde/modifiers/`
- 修炼交易：`src/game/ui/cultivationModel.ts`
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
node --test productize/jobs/check-dodge-counter-runtime.mjs
node productize/jobs/run-xuanjie-local-play-e2e.mjs
npx tsc --noEmit
```

优先 E2E 验证 AC。命令只跑一次；通过即视为物理验证。
