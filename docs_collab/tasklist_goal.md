**结论**
LoreWeaver 现在不是空壳，已经有“工作台 + manifest + gameplay card + core adapter + gate”的主架构；但还没稳定达到 `Path_to_Immortality` 那种“主干完整、每个节点独立可玩、奖励回流、故事推进、可直接交付”的标准。

我已核查并实际跑了当前检查：

- `LoreWeaver`：`npm run lint` 通过，`npm run build` 通过；仅有 bundle 超 500 kB 警告。
- 工作台运行时：`GameRunner.ts` 已接入 `survivor_horde`、`rhythm_timing`、`drag_collect_grid` 三类 Phaser adapter，见 [GameRunner.ts](/Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/src/game/GameRunner.ts:581)。
- 参照样例：`Path_to_Immortality` 有 `index + battle + node1-node17`，每个节点独立玩法并通过 `postMessage` 回传奖励，设计记录在 [tasklist.md](/Users/lm/pyProj/hungry-for-knowledge/minigame/Path_to_Immortality/docs/tasklist.md:1)。
- 当前强样本 workspace `20260611-060754-719406` 有 12 个节点、9 个能力、12 个被动、13 个敌人、19 个 VFX、19 个音频 cue，基础 Runtime Feature Pack 检查通过。
- 严格资产流水线检查失败：缺 `loreweaver/asset-pipeline.json` 和 art/audio/voice pipeline 状态。
- 通用导出仍是“manifest 预览 shell + core 源码”，不是完整可玩游戏包，见 [main.py](/Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/backend/main.py:754)。

---

# 以 LoreWeaver/data/workspaces/20260611-060754-719406 为例的达标任务清单：

1. **定义交付验收口径**
   - 明确 “Path 标准” 的 LoreWeaver 版本定义：完整主干、12-17 个节点、每节点可玩、奖励/解锁/flag 回流、无 console error、可本地静态服务运行。
   - 把 Gameplay Card 状态从单一 `candidate` 升级为 `inventoried / card_json / ui_registered / runtime_ready / gate_verified`。

2. **补齐节点运行时矩阵**
   - 为每个节点生成 `node.gameplay.cardId + modifiers + knobs + storyBeat + reward + unlockNext`。
   - 不要只用 `survivor_horde` 铺满全部节点；优先把 `rhythm_timing`、`drag_collect_grid`、`sequence_synthesis`、`turn_based_skill_battle`、`node_iframe_microgame` 推到可运行。
   - 接入 `node_iframe_microgame` 容器，复用 Path 的 iframe/postMessage 模式承载轻量独立 HTML 节点。

3. **完善主干与故事绑定**
   - 增加节点依赖、剧情 flag、分支结果、前置能力/法宝/境界检查。
   - 奖励回流统一成 `NodeResult -> RewardApplier -> Store`，覆盖资源、能力、被动、道具、storyFlags、下一节点解锁。
   - 为同人 IP 建立 `IP Bible / mainline beats / node beats / character hooks`，每个关卡必须能说明它对应哪段 IP 情节。

4. **修正导出形态**
   - 当前 `/export` 只能算预览包；需要新增 “完整 H5 playable export”。
   - 对生成/导入型 workspace，导出应包含真实 `index.html`、`scenes/`、`nodes/`、`js/`、`systems/`、`loreweaver/`、assets、manifest。
   - 增加 export smoke test：解压、起静态服务、进入主界面、进入至少 3 个节点、完成/撤退并验证回流。

5. **补严格资产流水线**
   - 为成熟 workspace 生成 `loreweaver/asset-pipeline.json`。
   - 覆盖 ability VFX/voice、generated art atlas、audio manifest、credits/provenance、browser verification。
   - 让 `--require-asset-pipeline` gate 通过，而不是停留在 warning。

6. **修 gate 与工具链**
   - 修 `check-loreweaver-runtime.mjs`：它当前误判动态生成的 `ENEMY_VISUAL_DESIGN`。
   - 修 `check-ability-progression.mjs` 的 Node 20 JSON import assertion 报错。
   - Runtime Feature Pack gate 默认应面向 active workspace，而不是误查 LoreWeaver 根目录。
   - 把 visual audit 的 1x1/黑屏失败修掉，恢复真实 canvas 截图验收。

7. **建立多节点 E2E 矩阵**
   - 每个 `runtime_ready` Gameplay Card 至少一条 5-10 秒 smoke test。
   - 每个完整 game workspace 至少覆盖：主界面、节点进入、胜利、失败/撤退、奖励回流、下一节点解锁、存档恢复。
   - 对 `Path 标准` 目标，最终要做到全部节点可自动走 smoke flow。

8. **性能与交付打磨**
   - 拆分当前 2.2 MB 左右主 bundle，减少 H5 首屏负担。
   - 明确移动端 9:16、触控热区、文本不溢出、BGM 不叠播、scene teardown 无泄漏。
   - 导出前跑内容安全/IP 文案扫描，版权合规可以后置，但必须成为最终 gate。

# 注意：
- LoreWeaver/docs_collab/guide.md 是 Codex 和 Antigravity 协作的规约，一起协作完成上面任务目标；
