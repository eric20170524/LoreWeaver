---
title: 养成入局与关卡重入
category: pitfall
tags:
  - cultivation
  - weapon_stance_cycle
  - e2e
related:
  - "[[0_TASKLIST]]"
  - "[[xuanjiezhimen_local_play_fixes]]"
---

# 养成入局与关卡重入

## 场景

修炼目录把未实现技能标成「规划中」并通过测试，容易被当成养成闭环已完成。E2E 从 Node 1 再进 Node 2 时，停掉的 MainScene 无法 `scene.start` 重开关卡；survivor 物理组在 shutdown 时 `Group.children` 已失效。

## 根因

1. `cultivationModel` 曾经只认 `clickPower` / `activeMultiplier`。manifest 里的 `weapon_stance_cycle.meleeDamage` 被标 planned 后，测试断言「规划中」会绿，局内 knobs 不变。
2. `LevelActiveScene` 已激活时，应从当前关卡场景 `scene.start`，不能再走已停止的 MainScene。
3. Phaser 在 scene shutdown 过程中拆掉 Physics Group 的 `children`，`group.clear(true, true)` 会抛错并被 SceneLifecycle 打到 console.error，E2E 把 pageerror 当失败。

## 解法

- 购买层区分 idle target 与战斗 target；入局用 `foldPassiveEffectsIntoKnobs` / `resolveCombatHp`。
- 「规划中仍不可买」保留；另测「已实现技能购买后 meleeDamage 变化」。
- 切关：`isActive('LevelActiveScene') ? LevelActiveScene : MainScene` 再 `start`。
- survivor cleanup：仅当 `group.children` 仍在时 clear，并用 try/catch 兜底。

## 验证

`npx tsx --test productize/jobs/check-cultivation-model.ts`
`node productize/jobs/run-xuanjie-local-play-e2e.mjs`
