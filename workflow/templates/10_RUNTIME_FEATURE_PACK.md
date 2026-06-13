# 10_RUNTIME_FEATURE_PACK.md: 运行期能力包沉淀

制定日期：[YYYY-MM-DD]

## 1. 目标

本文件用于记录 `[项目名]` 的可试玩 MVP 是否已经把角色、敌人、主动能力、被动技能、VFX、SFX、首关局内技能循环和模拟器预览能力沉淀为可复用 Runtime Feature Pack。

完成后，本项目不应只是一份能跑的单次 Demo，而应能为同类新产品生成提供引擎级基础。

## 2. 必须产出的 catalog

| Artifact | 状态 | 说明 |
| --- | --- | --- |
| `loreweaver/ability-catalog.json` | [pending/fresh] | 主动能力、宝术、技能谱系、解锁来源、runtime skill id、适用节点 |
| `loreweaver/passive-skill-catalog.json` | [pending/fresh] | 被动技能树、成本、前置、effect、UI 文案 |
| `loreweaver/character-design-catalog.json` | [pending/fresh] | 玩家、支援、宿敌、Boss 的视觉阶段、动作 cue、技能连接 |
| `loreweaver/enemy-design-catalog.json` | [pending/fresh] | 敌人轮廓、runtime enemy id、调色、战斗读法 |
| `loreweaver/skill-effect-catalog.json` | [pending/fresh] | runtime skill id 到 VFX key、形状语言、调色、镜头反馈的映射 |
| `loreweaver/audio-cue-catalog.json` | [pending/fresh] | runtime skill id 到 WebAudio cue、混音角色的映射 |
| `loreweaver/workbench.json` | [pending/fresh] | 记录所有能力包 artifactStatus |

## 3. 首关技能循环验收

首个 playable node 必须证明：

- 玩家开局有可用技能池，不是纯占位战斗。
- 局内 HUD 能看到至少一个主动技能。
- 局内能触发技能效果，且有 VFX 与 SFX。
- 至少一次升级、解锁或候选选择能改变局内技能状态。
- 结算能把 `unlocks.abilities`、奖励或进度写回 Store。
- Playwright 或人工试玩能复现上述路径。

## 4. 角色与敌人形象验收

即使没有手绘资产，也必须具备程序化表现：

- 玩家角色有 silhouette、palette、阶段变化和动作 cue。
- 核心敌人有 runtime enemy id、silhouette、palette、combat read。
- 关键角色与 ability catalog 通过 `skillConnections` 绑定。
- 敌人视觉与实际刷怪 id 对齐，避免 catalog 写了但运行时看不到。

## 5. 特效与音效验收

首关技能必须满足：

- 每个 `planning.runSkillPool` 条目可以是 ability id 或 runtime skill id，但必须能解析到实际 runtime skill。
- 解析后的每个首关 runtime skill 至少有一条 VFX。
- 解析后的每个首关 runtime skill 至少有一条 SFX。
- 自动释放技能的音量和持续时间不刺耳。
- 高强度技能可以使用屏幕震动，但必须控制强度和时长。

## 6. 模拟器预览验收

若本项目在 LoreWeaver Workbench 中调试：

- 模拟器应支持嵌入、浮框、尺寸切换。
- 浮框状态下应可放大或全屏预览。
- 预览控制不遮挡游戏关键 HUD。
- 移动端尺寸下仍能正常点击、拖动、关闭。

推荐在 `workbench.artifactStatus` 中记录：

- `floatingSimulatorPreview`
- `simulatorFullscreenPreview`

## 7. Workbench artifactStatus

`loreweaver/workbench.json` 至少包含：

```json
{
  "artifactStatus": {
    "abilityCatalog": "fresh",
    "passiveSkillCatalog": "fresh",
    "characterDesignCatalog": "fresh",
    "enemyDesignCatalog": "fresh",
    "skillEffectCatalog": "fresh",
    "audioCueCatalog": "fresh",
    "runtimeSkillFeedback": "fresh",
    "runtimeAbilityUnlocks": "fresh",
    "runtimeSkillHud": "fresh",
    "nodeSkillPreview": "fresh",
    "runtimeCharacterSprites": "fresh",
    "runtimeEnemySprites": "fresh",
    "firstNodeRunSkillLoop": "fresh"
  }
}
```

## 8. 机器验收

在 LoreWeaver 根目录运行：

```bash
npm run check:runtime-feature-pack -- --workspace data/workspaces/[workspace-id]
```

通过后，把报告路径写入任务历史：

```text
LoreWeaver/workflow/reports/runtime_feature_pack_latest.json
```

## 9. 反哺记录

若本项目发现了可复用的新能力，必须记录：

| 新能力 | 是否已沉淀到 engine | 位置 | 下一步 |
| --- | --- | --- | --- |
| [例如：浮框模拟器预览] | [yes/no] | [docs/templates/scripts/src] | [待办] |

未沉淀的能力不能只留在项目总结中，必须进入下一轮 engine backlog。
