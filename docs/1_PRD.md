# 1_PRD.md: 本轮竖切修复范围

## 1. 愿景与目标

让《玄界之门》石牧原型在 30 秒内给出可负责的战斗身份：被围时玩家主动亮刀，拉开后主动掏弓；修炼至少一条线改变下一局真实伤害。

## 2. 核心用户路径

1. 打开石牧工作区，主界面显示真气与石牧修炼，无旧 IP 文案。
2. 吐纳积累真气，研习「疾风刀势」。
3. 进入 Node 1，近战扫击伤害高于未研习。
4. 按 Q / Shift 或点右侧切态按钮在黑刀 / 紫钢弓间切换。
5. 结算回主干；换其他工作区时不读到石牧存档。

## 3. MVP 功能范围

- **P0 (已完成):** 手动刀弓、疾风刀势入局、Runner 去旧 IP、工作区存档隔离。
- **P0 (已完成):** Icebox A/B/C。
- **P0 (本轮):** Icebox E — 通用 `overdrive_transformation` + 手动切态短时增益。
- **P1:** 真机试玩（Icebox D）。

## 4. 明确不做

- 不改四层作者进程栈。
- 不把 `survivor_horde` 从自动选卡里拿掉（它是唯一带真人 signoff 的竖切卡；仍带 residual）。
- 不做完整骨骼动画或正式 Boss 立绘；Node 2 用程序化人形/招式图形。
- 不把白猿技能名写进 core modifier；preset 用 `requiresPassive` 把变身接到通用 overdrive。
- 不改 NodePayload / NodeResult 稳定合同字段。
- 不把 Phaser 战斗文案迁到 `t()`。

## 5. 核心实体

- `PlayerState.unlockedPassives`：已研习被动。
- `PassiveSkillSpec.effects[].target`：idle 或战斗路径。
- `weapon_stance_cycle.controlMode`：手动或定时。
- `loreweaver_player_state_${workspaceId}`：工作区存档键。
