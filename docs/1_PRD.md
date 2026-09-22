# 1_PRD.md: 本轮竖切修复范围

## 1. 愿景与目标

《玄界之门·石牧武途（同人原型）》是一条可打完的 12 节点同人路线。玩家主动在黑刀和紫钢弓之间切换；首通写入主干，并改变下一场的近战、远程或爆发数值。真机 5 分钟试玩仍是 Icebox D，Chromium 试玩不能当成手机验收。

## 2. 核心用户路径

1. 打开石牧工作区，主界面显示真气与石牧修炼，无旧 IP 文案。
2. 吐纳积累真气，研习「疾风刀势」。
3. 进入 Node 1，近战扫击伤害高于未研习。
4. 按 Q / Shift 或点右侧切态按钮在黑刀 / 紫钢弓间切换。
5. 结算回主干；换其他工作区时不读到石牧存档。
6. 按顺序打完节点 1–12。失败或撤退不写入该关首通；成功才解锁下一关。
7. Node 3 之后黑刀更疼，Node 6 之后弓箭更疼，Node 10 之后白猿爆发才能在节点 11–12 武装。

## 3. MVP 功能范围

- **P0 (已完成):** 手动刀弓、疾风刀势入局、Runner 去旧 IP、工作区存档隔离。
- **P0 (已完成):** Icebox A/B/C。
- **P0 (已完成):** Icebox E — 通用 `overdrive_transformation` + 手动切态短时增益。
- **P0 (已完成):** 节点 1–12 都能开局并结算；Node 3 烈炎、Node 6 吞月、Node 10 白猿解锁改变后续战斗数值。两遍 Chromium 试玩通过。真机不在这项里。
- **P1:** 真机试玩（Icebox D）。本轮不勾。

## 4. 明确不做

- 不改四层作者进程栈。
- 不把 `survivor_horde` 从自动选卡里拿掉（它是唯一带真人 signoff 的竖切卡；仍带 residual）。
- 不做完整骨骼动画或正式 Boss 立绘；Node 2 用程序化人形/招式图形。
- 不把白猿技能名写进 core modifier。商店被动仍用 `requiresPassive`；节点 11–12 用通用 `requiresAbility`，能力 id 只写在 preset。
- 不改 NodePayload / NodeResult 稳定合同字段。
- 不把 Phaser 战斗文案迁到 `t()`。

## 5. 核心实体

- `PlayerState.unlockedPassives`：已研习被动。
- `PassiveSkillSpec.effects[].target`：idle 或战斗路径。
- `weapon_stance_cycle.controlMode`：手动或定时。
- `loreweaver_player_state_${workspaceId}`：工作区存档键。
