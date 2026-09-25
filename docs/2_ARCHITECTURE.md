# 2_ARCHITECTURE.md: 本轮架构红线

## 1. 技术栈

沿用现有：React 工作台、Phaser 4 runtime、`minigame_master/core` 适配器/modifier、Express+FastAPI 网关、workspace 文件。

## 2. 架构红线

- **题材解耦：** `GameRunner` / core adapter 禁止写入具体 IP 技能名、敌人名、故事常量。题材只存在于 workspace/preset/manifest。
- **成长所有权：** 局内成长由 `run_growth_milestones` 或卡 modifier 驱动；Runner 只做容器。
- **工作区隔离：** 玩家存档按 `workspaceId` 分键；manifest 已按 `data/workspaces/<id>` 隔离。
- **网关原则：** 不在前端直连大模型。本轮无新 API。编排仍走 `WorldBuilderAgent.generate_gdd` → `generate_json`。有 `XAI_API_KEY` 或 `GROK_API_KEY` 时 provider 为 `grok`；都没有时返回程序预设，日志不得把这次回退叫 grok。`OLLAMA_API_BASE` 只打延期提示。
- **合同稳定：** 不改 `NodePayload` / `NodeResult` 字段形状。能力数值写在 `abilityCatalog[].effects`，由 `foldOwnedAbilityEffectsIntoKnobs` 折进已有战斗目标。预设没写的旋钮用该 modifier 的默认正数当底，再做乘加；结果不是正数就不写入，避免 0 被运行时夹回另一套默认。
- **部门绑定：** 玩法组只补缺。石牧节点 2、4、5、7、10 在 `gameplay.knobs.allowExperimentalCard` 写 `true`。没有这个开关时，筹备会把 `dodge_counter_boss`、`side_scrolling_brawler`、`shooter_duel`、`rhythm_timing` 换成 `survivor_horde`。已有 `cardId`、modifier、首通奖励和战斗数值保持原值。
- **缺文件的 BGM：** `playBgm` 找不到文件时，若 `audioCueCatalog` 里有同 id 的合成频率，背景用该频率。没有这条时仍用 60Hz。换关要停掉上一关的底噪再起新的。不把缺失的 `build_gate` 报告写成通过。
- **候选包资源：** 角色 atlas 与环境 atlas 分开加载。后者由 `scripts/build_environment_atlas.py` 从 12 张原创场景图生成，宽高均不超过 4096；`RuntimeArtBinder` 按 frame 所属 atlas 取图。独立包 manifest 与图片共同打包，缺帧仍按既有 art telemetry 报告。
- **候选包音频与静音：** 关卡手势解锁音频后优先播放 `audioCueCatalog` 的文件 BGM/音效；文件缺失或播放失败时回退既有 WebAudio 合成 cue。独立包和主界面静音控制与 `AudioAssetResolver` 同步，切关后保持静音。浏览器验收检查实际 `bgmSource=asset`、播放/就绪、语义事件文件请求以及静音、暂停、撤退，不以目录存在代替播放证据。
- **手机布局：** 独立包在窄于 500 CSS 像素的容器使用 540 逻辑宽度，并按容器宽高比计算逻辑高度；桌面仍用 720×1280。宿主操作栏占画布外一行，避免挡住 Phaser 底部 HUD。
- **横版关方向：** `side_scrolling_brawler` 开局调用 `scale.setGameSize(960, 540)`，并派发 `loreweaver:orientation` 为 `landscape`。standalone 宿主在竖握时显示旋转提示并暂停 `LevelActiveScene`，横握后恢复；横屏时画布与宿主按钮采用左右两列，粗指针设备显示上/下/左/右/轻击/重击六键。离开关卡或重整前恢复进入前的尺寸，再派发 `portrait`。波次画面只读 `waveList[].theme`，不在适配器里写关卡专名。

## 3. 目录

- 战斗 modifier：`minigame_master/core/lib/gameplay/survivor_horde/modifiers/`（含 `overdrive_transformation`）
- 修炼交易与首通折算：`src/game/ui/cultivationModel.ts`、`src/utils/RewardApplier.ts`
- 宿主入局：`src/game/GameRunner.ts`
- 存档：`src/runtime/playerState.ts`、`src/store.tsx`
- 石牧内容：`data/presets/xuanjiezhimen_fangame_preset.json`。契约对照夹具：`productize/fixtures/xuanjie-shimu-contract.json`（不读 gitignore 的 workspace manifest）。

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
