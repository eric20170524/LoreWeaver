# 0_TASKLIST.md: 玄界竖切刮骨修复

## 🎯 当前迭代目标 (Current Sprint Goal)

把石牧 Vertical Slice 从“门禁自洽、战斗空转”收成一条可感知闭环：玩家能主动切刀弓、至少一条养成改变局内伤害、Runner 不再夹带旧 IP、存档按工作区隔离。

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

## 🐛 遗留问题与技术债 (Icebox)

- [ ] **Icebox A：** 批量 `production_ready` 降级为 `verified_prototype`（轻量批 ×5 + residual 卡）。触及 catalog / export 自动选卡，超出本轮竖切。
- [ ] **Icebox B：** Node 2 `dodge_counter_boss` 几何原型升级为有招式/受击反馈的 Boss 卡。
- [ ] **Icebox C：** 其余四条成长线（境界 HP、兵刃连射、血脉、吞月）接入运行时。
- [ ] **Icebox D：** 真机 5 分钟 Node 1 试玩（本轮用 Chromium E2E 代理，不宣称真机）。

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
