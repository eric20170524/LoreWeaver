# Runtime Feature Pack Contract

> Runtime Feature Pack 是把单个同人游戏 MVP 中已经验证有效的角色、敌人、技能、被动、特效、音效、局内技能循环和预览能力，上提为 LoreWeaver 可复用引擎资产的合同。

本合同来自 `20260611-060754-719406` 大荒验证工作区的沉淀。它的目标不是保存某个 IP 的内容，而是保存下一类产品都需要的生成结构、运行时映射和验收门槛。

---

## 1. 产物边界

每个可试玩 MVP 工作区都应产出以下 split files：

| File | Purpose |
| --- | --- |
| `loreweaver/ability-catalog.json` | 主动能力、宝术、技能谱系、解锁来源、运行时 skill id、适用节点、VFX/SFX 概念 |
| `loreweaver/passive-skill-catalog.json` | 被动技能树、成本、前置、数值 effect、UI 文案、反馈方向 |
| `loreweaver/character-design-catalog.json` | 玩家、支援、宿敌、Boss 等角色形象、阶段外观、动作 cue、技能连接 |
| `loreweaver/enemy-design-catalog.json` | 敌人 runtime id、轮廓、调色、战斗读法 |
| `loreweaver/skill-effect-catalog.json` | 技能 VFX key、运行时 skill id、形状语言、调色、镜头反馈、实现备注 |
| `loreweaver/audio-cue-catalog.json` | 技能 SFX key、运行时 skill id、WebAudio 合成参数、混音角色 |
| `loreweaver/asset-pipeline.json` | Ability VFX/voice、generated art atlas、BGM/SFX/voice manifest、credits 与 browser verification 的流水线元数据 |
| `loreweaver/workbench.json` | 这些产物与运行时能力的 fresh/approved/validated 状态 |

机器可读字段以 [runtime_feature_pack.schema.json](/Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/docs/runtime_feature_pack.schema.json) 为准。当前工作区可以继续分文件保存，但字段语义必须兼容该 schema。

---

## 2. 核心要求

### Ability Catalog

每个能力必须至少说明：

- `id`, `name`, `description`
- `unlockSource`: `initial`, `mainline`, `node_reward`, `hybrid`
- `unlockCondition`
- `runtimeSkillIds`
- `affectedNodeIds`
- `designRole`
- `vfxConcept` 或可落地的 `skill-effect-catalog` 记录
- `sfxCues` 或可落地的 `audio-cue-catalog` 记录

要求：能力不能只停留在文案。它必须能映射到运行时 skill，能在节点内被解锁、使用或升级，能被测试观察到。

### Passive Skill Catalog

每个被动必须至少说明：

- 成本与前置关系
- `effects[]`: 数值目标、操作、值
- `uiCopy`
- 影响的运行时技能或全局玩家属性

要求：被动树必须改变局内体验，不能只是菜单里的收藏项。

### Character And Enemy Design

角色与敌人设计必须提供程序化可表现的信息：

- silhouette
- palette
- stage variants 或 appearsNodeIds
- combat read
- animation/audio direction
- skillConnections

要求：即使没有美术贴图，也能用 canvas/Phaser 图形、粒子和 WebAudio 做出可识别 MVP 形象。

### VFX And SFX

VFX/SFX catalog 必须用 `runtimeSkillId` 绑定实际技能池。

要求：首关 `planning.runSkillPool` 可以记录 ability id 或 runtime skill id，但必须能解析到真实运行技能；解析后的首关可用技能必须至少有一个 VFX 和一个 SFX cue。后续技能允许先标为 planned，但不能影响首关 MVP 验收。

### Asset Pipelines

Runtime Feature Pack 不能只证明“catalog 写对了”，还必须证明素材生产和运行时接线存在闭环。新项目应按 [asset_pipeline_contract.md](/Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/docs/asset_pipeline_contract.md) 产出 `loreweaver/asset-pipeline.json`，覆盖三条优先流水线：

- **Ability VFX Voice**：玩家技能、敌人招式、Boss/精英 callout、可选 voice manifest、VFX/SFX/voice 统一触发 hook 与 verify coverage。
- **Game Art Asset Pipeline**：imagegen/bitmap atlas、semantic art groups、sprite clips、manifest.json、manifest.js、runtime atlas-first lookup 与真实画面验收。
- **Game Audio Asset Pipeline**：BGM/SFX/voice/ambience coverage matrix、audio manifest、credits/provenance、runtime channel、mute/autoplay/teardown/browser fetch 验收。

要求：如果项目没有外部音频或 voice 资产，必须显式记录 `calloutFallback` 或 synthesized SFX 路径；不能把“未生成资产”伪装成已接入。

---

## 3. Workbench 状态键

MVP 生成完成时，`loreweaver/workbench.json` 的 `artifactStatus` 至少包含这些键，并处于 `fresh`, `approved` 或 `validated`：

- `abilityCatalog`
- `passiveSkillCatalog`
- `characterDesignCatalog`
- `enemyDesignCatalog`
- `skillEffectCatalog`
- `audioCueCatalog`
- `assetPipelineMetadata`
- `abilityVfxVoicePipeline`
- `artAssetPipeline`
- `audioAssetPipeline`
- `assetPipelineVerification`
- `runtimeSkillFeedback`
- `runtimeAbilityUnlocks`
- `runtimeSkillHud`
- `nodeSkillPreview`
- `runtimeCharacterSprites`
- `runtimeEnemySprites`
- `firstNodeRunSkillLoop`

推荐继续记录：

- `floatingSimulatorPreview`
- `simulatorFullscreenPreview`

这些推荐键用于沉淀本次“嵌入页内模拟器太小，改为浮框/放大/全屏测试预览”的能力。若当前产品还未接入，不阻断 runtime feature pack 验收，但应进入 polish backlog。

---

## 4. 验收命令

在 LoreWeaver 根目录运行：

```bash
npm run check:runtime-feature-pack -- --workspace data/workspaces/<workspace-id>
```

该命令会写出：

```text
workflow/reports/runtime_feature_pack_latest.json
```

失败条件包括：

- 任一 catalog 缺失或为空。
- ability/passive/character/enemy/VFX/SFX 的 id 或引用不一致。
- 节点 `planning.runSkillPool` 为空。
- 首关没有可验证的局内技能池。
- 首关 ability/runtime skill 无法解析，或解析后的首关技能缺少 VFX/SFX。
- 必要 workbench artifact 不是 fresh/approved/validated。
- 启用 `--require-asset-pipeline` 时缺少 `loreweaver/asset-pipeline.json` 或其中三条流水线元数据。

警告条件包括：

- 能力缺少概念级 VFX/SFX 描述。
- 首关没有解锁新能力，可能无法证明进度感。
- 模拟器浮框/全屏预览状态未记录。
- 未记录 ability VFX/voice、generated art、audio manifest 三条资产流水线。

---

## 5. 生成器表达模板

下次给 LoreWeaver 或同类 Agent 的需求可以这样表达：

```text
请基于已有项目/参考 IP，按 Runtime Feature Pack Contract 生成一套可试玩 MVP。
必须产出 ability/passive/character/enemy/VFX/SFX catalogs，并把首关做成可验证的局内技能解锁、使用和升级闭环。
同时必须产出 loreweaver/asset-pipeline.json，记录 Ability VFX Voice、Game Art Asset Pipeline、Game Audio Asset Pipeline 三条流水线的 manifest、runtime hook、credits/provenance 与浏览器验收要求。
所有 catalog 要映射到 runtime skill/enemy id，workbench artifactStatus 要标记 fresh。
完成后运行 npm run check:runtime-feature-pack、项目 build 和浏览器试玩验证；若有可复用改进，继续反哺到 LoreWeaver docs/templates/prompts/scripts。
```
