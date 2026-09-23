# 0_TASKLIST.md: 玄界竖切刮骨修复

## 🎯 当前迭代目标 (Current Sprint Goal)

把《玄界之门·石牧武途（同人原型）》做成可打完的 12 节点同人原型：每一关都能从预设开局、打出真实 `NodeResult`，首通成长改下一场战斗。Icebox D 真机试玩仍不做。构建走现有 Grok 客户端，没有密钥时用程序预设，禁止把回退标成 grok。

## ⚠️ AI 工作流要求 (Workflow Rules)

1. 执行入口：阅读本文件，从第一个 `[ ]` 开始。
2. 完成子任务后将 `[ ]` 改为 `[x]`，并记录 **Decision & Audit**。
3. UI / 业务流必须有 AC；完成前跑验证命令。
4. 阻塞即停，标 `[Blocked]`，不编造修复。
5. 红线：`docs/1_PRD.md`、`docs/2_ARCHITECTURE.md`、`docs/5_AGENT_RULES.md`。

---

## 🔄 自我进化循环沉淀

- 修炼购买层只认 `clickPower` / `activeMultiplier` 时，manifest 里的战斗 `effects` 会被写成“规划中”并通过测试——那是诚实性护栏，不是养成闭环。闭环必须另测：购买 → 存档 → 入局 knobs 变化。
- `weapon_stance_cycle` 默认定时轮换是为兼容既有 survivor 单测；石牧 preset 必须显式 `controlMode: "manual"`。
- `GameRunner.setupFirstNodeGrowthLoop` 一旦存在，通用 modifier 只能打补丁禁用它。删除宿主特例，让 modifier 自己挂 `run_growth_milestones`。
- 主界面每秒把 `this.state` 写回 registry。若 MainScene 没停干净，后写的通关列表会被旧的 `[1,2]` 盖掉。进关卡必须 `scene.stop('MainScene')`，写档时合并已通关 id。
- `data/workspaces/` 被 gitignore。契约检查不能读 `xuanjie-shimu-local/manifest.json`（本机这份没有 nodes）。对照物是 `productize/fixtures/xuanjie-shimu-contract.json`。
- `append-effects` 只在快照不存在时复制角色底图。再次 `pack` 必须覆盖 `character-pack`，否则下一次追加会把新角色画回旧图集。空白格粘贴不要把 RGBA 当遮罩，否则 alpha 128 会变成 64。

## 🐛 遗留问题与技术债 (Icebox)

- [x] **Icebox A：** 批量 `production_ready` 降级为 `verified_prototype`（轻量批 ×5 + residual 卡）。
  - **Decision & Audit:** 9 张卡 `status=verified_prototype` 且 `exportPolicy.productionReady=false`。自动选卡只剩 `survivor_horde`。同步 `gameplayManifest.ts`、`check-gameplay-catalog-policy.py`、`report.md`、`task.md`。历史认证字段保留。
- [x] **Icebox B：** Node 2 `dodge_counter_boss` 几何原型升级为有招式/受击反馈的 Boss 卡。
  - **Decision & Audit:** 命中圈保留给判定/测试；叠加战士/Boss 剪影、预警斩线、受击闪白、反击刀光。`lastFeedback` = `player_hurt` / `boss_stagger`。规则未改。
- [x] **Icebox C：** 其余四条成长线（境界 HP、兵刃连射、血脉、吞月）接入运行时。
  - **Decision & Audit:** `resolveNodeCombatStats` 把境界乘到 HP/近战；连珠箭、异血强身、吞月参悟可买。白猿变身仍 planned。Node 2 读取 `playerStats.hp`。
- [ ] **Icebox D：** 真机 5 分钟 Node 1 试玩（本轮用 Chromium E2E 代理，不宣称真机）。
- [x] **Icebox E：** 白猿变身通用 `overdrive_transformation`；切态短时增益。
  - **Decision & Audit:** 手动切刀 1.5s 范围/伤害提升 + 30% 减伤；切弓前 3 发暴击击穿。`overdrive_transformation` 无 IP 名，preset 用 `requiresPassive: white_ape_overdrive_passive` 武装，E / 低血量触发。叠加 wrapper 时 modifier uninstall 倒序。

---

## 📝 任务池

### Task 0: 建立本轮 vibe 合同

- [x] **Task 0.1:** 写入 `docs/0_TASKLIST.md`–`docs/5_AGENT_RULES.md`，范围锁在红队三条结构性缺口。
  - **Decision & Audit:** 本轮 P0 仅刀弓手动、疾风刀势入局、Runner 去 IP、存档隔离。门禁降级与 Node 2 美术进 Icebox。

### Task 1: 刀弓改为玩家主动切换

- [x] **Task 1.1:** `weapon_stance_cycle` 支持 `controlMode: "manual" | "timed"`；手动模式键盘 Q/Shift + 右侧切态按钮 + semantic `toggle_stance`。
- [x] **Task 1.2:** 石牧 Node 1/3 preset 使用 `controlMode: "manual"`。
- **AC:** 定时模式原单测仍过；手动模式不随 `elapsedSeconds` 切态；`toggle_stance` 后 `currentStance` 翻转。
  - **Decision & Audit:** 默认仍为 `timed`，避免打爆既有 survivor 夹具。石牧 preset 显式 manual。文件：`WeaponStanceCycleModifier.js`、preset Node 1/3、`check-weapon-stance-cycle.mjs`、`check-survivor-combat-runtime.mjs`。

### Task 2: 打通一条真实养成

- [x] **Task 2.1:** `cultivationModel` 支持战斗 target；购买成功写入 `unlockedPassives`；未实现 target 仍拒扣费。
- [x] **Task 2.2:** `疾风刀势` 标为 `implemented`；入局时把效果折进 `weapon_stance_cycle.meleeDamage` 与 `playerStats.hp`。
- [x] **Task 2.3:** E2E：购买成功 → 已研习；`连珠箭` 仍规划中；Node 1 近战伤害 = 预设 × 1.15。
- **AC:** `check-cultivation-model.ts` 与 `run-xuanjie-local-play-e2e.mjs` 通过。
  - **Decision & Audit:** 只接通一条线。`foldPassiveEffectsIntoKnobs` 在 GameRunner 创建 modifier 时折叠。E2E 断言 meleeDamage === 5.75 且 `toggle_stance` melee→ranged。

### Task 3: 清洗 Runner 旧 IP 与存档串号

- [x] **Task 3.1:** 删除 `setupFirstNodeGrowthLoop` 及 `primordial_fist` / `suan_ni_roar` / `willow_blessing`；局内成长只走 modifier。
- [x] **Task 3.2:** 生产美术校验不再写死 `wild_rhino` / `qiongqi_cub`；只消费 knobs 映射。
- [x] **Task 3.3:** `localStorage` 键带 `workspaceId`；切换工作区加载对应存档。
- **AC:** 武器架势单测在无 legacy `runGrowthState` 时仍能挂成长；内核 E2E 主 HUD 仍无旧 IP 文案。
  - **Decision & Audit:** `weapon_stance_cycle` 默认自挂 `run_growth_milestones`。存档键 `loreweaver_player_state_${workspaceId}`，缺失不迁入全局旧档。

### Task 4: 验证与审计

- [x] **Task 4.1:** 跑本轮验证命令一次，更新本文件审计，沉淀坑点到 `docs/fangame/`。
  - **Decision & Audit:** 命令见 `docs/2_ARCHITECTURE.md`。E2E 首次失败：Node 1→2 时 MainScene 已停、survivor group.clear 在 shutdown 抛错。已改为从活动场景 restart，cleanup 对失效 Group 容错。见 [[pitfall_cultivation_passthrough_and_scene_restart]]。

### Task 5: 十二节点可玩，首通改下一场

- [x] **Task 5.1:** `black_blade_flame`、`swallow_moon`、`white_ape_overdrive` 在 preset 与 `xuanjie-shimu-local` 上带数值效果；`RewardApplier` 成功才写入，失败/撤退不解锁。
- [x] **Task 5.2:** 入局把已拥有能力折进 `weapon_stance_cycle` / `overdrive_transformation` / `player.hp`。Node 11–12 的爆发用通用 `requiresAbility` 武装，core 不写石牧技能名。
- [x] **Task 5.3:** 所有带刀弓的关卡显式 `controlMode: "manual"`。`focusNodeIds` 为 1–12。两份规格的卡牌、modifier、首通奖励一致。
- [x] **Task 5.4:** 近战一扫多目标、远程开火有伤害、Node 3 危险在预警结束后才扣血，且宿主仍是 `survivor_horde`。
- [x] **Task 5.5:** 本地试玩从预设启动节点 1–12，成功 `NodeResult` 写入 `completedNodeIds`；Node 3 撤退不给 `black_blade_flame`。
- [x] **Task 5.6:** `WorldBuilderAgent.generate_gdd` 有 `XAI_API_KEY` / `GROK_API_KEY` 时走 grok；没有密钥时返回程序预设，且 `OLLAMA_API_BASE` 不改道。不得覆盖石牧预设。
- [x] **Task 5.7:** 契约检查改读受版本控制的夹具；`pack` 刷新 character-pack 快照；半透明特效按源像素粘贴。
- **AC:** `check-cultivation-model.ts`、`check-survivor-combat-runtime.mjs`、`check-xuanjiezhimen-fangame-preset.py`、`check-weapon-stance-cycle.mjs`、`run-xuanjie-local-play-e2e.mjs`、`tsc --noEmit` 通过。Icebox D 保持未勾。
  - **Decision & Audit:** 烈炎改 `weapon_stance_cycle.meleeDamage`（×1.25），吞月改远程倍率（×1.2），白猿改爆发伤害/时长和生命。单测 `check-cultivation-model.ts`、`check-survivor-combat-runtime.mjs`、`check-weapon-stance-cycle.mjs`、`check-xuanjiezhimen-fangame-preset.py` 通过。E2E 连续两遍 `status=passed`、`errors=[]`，存档含节点 1–12；Node 3 撤退不给 `black_blade_flame`，通关后下一场 Node 1 近战高于 5.75。主界面挂机计时器曾把通关列表盖回 `[1,2]`，现进入关卡会停掉 MainScene，存档合并已通关 id。Grok 实调 provider=`grok`，标题 `Clockwork Harbor Ascension`，12 个节点；无密钥两次回退都是程序预设，provider 不是 grok，也不是 ollama。`tsc --noEmit` 通过。预设没写的战斗旋钮按 modifier 默认值再乘能力，不写成 0：Node 8 远程倍率是默认 1×1.2，Node 3 爆发伤害是默认 1.55×1.2。Icebox D 仍未做。
  - **Decision & Audit (5.7):** 预设与养成检查改为读 `productize/fixtures/xuanjie-shimu-contract.json`，不再读 gitignore 的 `xuanjie-shimu-local/manifest.json`。`pack_candidates` 在写出运行时图集后覆盖 `character-pack`。空白格 `paste` 不再把 RGBA 图本身当遮罩。`check-xuanjiezhimen-fangame-preset.py`、`check-cultivation-model.ts`、`check-sprite-gen-bridge.py` 通过。浏览器 E2E 仍受沙盒禁止监听本地端口限制，本项没有界面改动。
