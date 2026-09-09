# 同人游戏共创启动方案

> 分支：`feat/fangame-co-development`
>
> 目标：基于 LoreWeaver 的现有工作台、Gameplay Card、manifest、Phaser runtime 与审计能力，用“边讨论、边决策、边实现、边验证”的方式完成一款同人游戏原型。

## 1. 共创原则

1. **先做可玩竖切，不先做大而全 GDD**
   - 第一目标是一个能从主界面进入、完成一局、结算并回到主干的 Vertical Slice。
   - 竖切验证通过后，再扩展完整节点、长期养成与内容量。

2. **讨论结果必须落到工程资产**
   - 世界观/角色/数值：落到 `manifest.json`、catalog 或项目设计文档。
   - 玩法选择：落到 Gameplay Card + modifiers。
   - 新机制：优先做 modifier，其次 adapter，最后才改 core contract。
   - 每轮关键决策都形成可追踪 commit。

3. **优先复用 LoreWeaver，不为单个同人项目重造引擎**
   - 工作台层：项目、GDD、manifest、patch、revision、audit。
   - 运行时层：`minigame_master/core`。
   - 玩法层：现有 Gameplay Cards / modifiers。
   - 仅当现有卡无法表达目标体验时，新增 adapter 或 modifier。

4. **每轮都闭环**
   - 讨论 -> 设计决策 -> 实现 -> 自动检查/可玩验证 -> 复盘 -> 下一轮。

## 2. 第一阶段：Vertical Slice

第一版只要求证明以下闭环：

```text
IP / 主题输入
  -> 世界与角色定义
  -> 1 个主干入口
  -> 1 个核心玩法节点
  -> 1 个明确胜负目标
  -> 1 个角色能力成长反馈
  -> NodeResult 结算
  -> 回写主干进度
```

### 默认技术策略

- 平台：H5 / Desktop Browser 原型。
- 引擎：现有 Phaser runtime。
- 项目规格：LoreWeaver `manifest.json`。
- 玩法实现：优先选已有 Gameplay Card。
- AI 参与：世界构建、剧情、角色、玩法映射、数值初稿、局部 patch、审计。
- 测试：沿用现有 build/runtime/browser deterministic gates。

## 3. 第一轮需要共同确定的设计变量

| 变量 | 需要确认的内容 |
| --- | --- |
| 同人 IP | 原作/作品名，以及是否仅个人非商业使用 |
| 玩家幻想 | 玩家最核心要“扮演/获得”的体验 |
| 主角 | 原作角色、自建角色、旁观者或原创支线角色 |
| 核心玩法 | 割草、横版动作、回合技能、探索、节奏、合成、对话判定等 |
| 视角 | 俯视、横版、固定场景、卡牌/界面化 |
| 单局目标 | 生存、击败 Boss、护送、收集、逃脱、完成剧情目标等 |
| 长期成长 | 技能、装备、羁绊、境界、收藏、角色解锁等 |
| 美术方向 | 原作还原 / 二次风格化 / Q 版 / 像素 / 梦幻化等 |

## 4. LoreWeaver 现有能力的优先复用顺序

### A. 直接可复用

- `survivor_horde`
- `side_scrolling_brawler`
- `turn_based_skill_battle`
- `rhythm_timing`
- `drag_collect_grid`
- `sequence_synthesis`
- `branching_dialogue_check`
- `node_iframe_microgame`
- 现有 survivor / brawler modifiers
- `NodePayload` / `NodeResult`
- RuntimeArtBinder
- audit / TestHooks / determinism gates

### B. 需要按项目生成/配置

- IP DNA
- 世界观与角色表
- progressionSystems
- abilityCatalog / passiveSkillCatalog
- characterDesignCatalog / enemyDesignCatalog
- 节点 narrative / reward / planning
- 玩法卡与节点映射
- 项目专属素材 manifest

### C. 只有必要时才新增代码

- 新 GameplayModifier
- 新 GameplayAdapter
- 新 runtime feature contract
- 新资产管线能力

## 5. 每轮协作格式

后续每一轮默认使用下面的节奏：

1. **讨论**：明确一个设计问题。
2. **决策**：给出推荐方案与被舍弃方案。
3. **实现**：直接修改当前分支上的文档、manifest、玩法卡或代码。
4. **验证**：检查 schema、build、runtime contract、测试或审计影响。
5. **汇报**：说明本轮改了什么、还缺什么、下一轮最值得讨论什么。

## 6. 第一里程碑完成条件

- [ ] 确定同人 IP 与使用边界。
- [ ] 确定核心玩家幻想。
- [ ] 确定第一核心玩法卡。
- [ ] 产出项目 Design Seed / GDD v0.1。
- [ ] 产出首版 manifest。
- [ ] 首个核心节点可以在 Emulator 中启动。
- [ ] NodeResult 能正常结算并回写进度。
- [ ] 角色能力至少有一次可感知成长。
- [ ] 通过基础 build/runtime gate。
- [ ] 完成第一轮可玩复盘。

## 7. 暂不做

- 不在第一轮铺满 12 个高完成度关卡。
- 不先做完整商业化 UI。
- 不为单个 IP 大规模改 core。
- 不在玩法尚未验证时批量生成美术资产。
- 不把 Agent 生成结果未经审核直接写入稳定 runtime。
