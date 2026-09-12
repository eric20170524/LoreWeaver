# 同人游戏共创启动方案

> 分支：`feat/fangame-co-development`
>
> 当前项目：国漫《玄界之门》石牧同人原型。
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
《玄界之门》石牧主题
  -> 石牧角色/成长定义
  -> 主干入口
  -> Node 1 丰城敌潮（刀弓双态）
  -> Node 2 四馆较技（Boss 反击）
  -> Node 3 破庙尸潮（敌潮 + 弹幕）
  -> NodeResult 结算
  -> 回写主干成长
```

### 默认技术策略

- 平台：H5 / Desktop Browser 原型。
- 引擎：现有 Phaser runtime。
- 项目规格：LoreWeaver `manifest.json` / preset。
- 主玩法：`survivor_horde`。
- 节奏变化：`dodge_counter_boss` 等现有 Gameplay Card。
- 新机制：通用 `weapon_stance_cycle` modifier，项目内映射为陨铁黑刀 / 紫钢弓。
- 测试：沿用现有 build/runtime/browser deterministic gates，并增加同人 preset 静态校验。

## 3. 已确认的设计变量

| 变量 | 当前决策 |
| --- | --- |
| 同人 IP | 国漫《玄界之门》，当前按个人非商业原型推进 |
| 玩家幻想 | 扮演石牧，从强韧武者成长为可破万敌的核心战力 |
| 主角 | 石牧 |
| 核心玩法 | 割草 / 弹幕空间压力 / 闯关 + 少量 Boss 节奏变化 |
| 视角 | 主玩法俯视 Phaser 战场；个别关卡可切现有横版/固定场景卡 |
| 单局目标 | 清波、生存、Boss、守线等，根据 modifier 改变 |
| 长期成长 | 境界、武技熟练、兵刃炼化、吞月参悟、白猿血脉 |
| 第一战斗身份 | 黑刀近战扫群 + 紫钢弓远程压制 |
| 美术方向 | 暂缓正式资产生成；先用 RuntimeArtBinder 原型兜底验证手感 |

详细设计见：`docs/fangame/xuanjiezhimen_design_v0.1.md`。

## 4. LoreWeaver 现有能力的优先复用顺序

### A. 直接可复用

- `survivor_horde`
- `side_scrolling_brawler`
- `turn_based_skill_battle`
- `rhythm_timing`
- `drag_collect_grid`
- `sequence_synthesis`
- `branching_dialogue_check`
- `dodge_counter_boss`
- `shooter_duel`
- `node_iframe_microgame`
- 现有 survivor / brawler modifiers
- `NodePayload` / `NodeResult`
- RuntimeArtBinder
- audit / TestHooks / determinism gates

### B. 本项目已生成/配置

- `data/presets/xuanjiezhimen_fangame_preset.json`
- 石牧角色设计 catalog
- 武技 / 兵刃 / 血脉 abilityCatalog
- 境界 / 武技 / 兵刃 / 月华 / 血脉 progressionSystems
- 12 节点路线骨架（只批准 Node 1–3 进入当前竖切）
- 通用 `weapon_stance_cycle` modifier

### C. 暂不新增

- 白猿专属 runtime：先不写 IP 硬编码；后续若验证需要，新增通用 `overdrive_transformation`。
- 新 core contract：当前没有必要。
- 大规模美术资产：战斗手感通过后再生产。

## 5. 每轮协作格式

后续每一轮默认使用下面的节奏：

1. **讨论**：明确一个设计问题。
2. **决策**：给出推荐方案与被舍弃方案。
3. **实现**：直接修改当前分支上的文档、manifest、玩法卡或代码。
4. **验证**：检查 schema、build、runtime contract、测试或审计影响。
5. **汇报**：说明本轮改了什么、还缺什么、下一轮最值得讨论什么。

## 6. 第一里程碑完成条件

- [x] 确定同人 IP 与当前个人非商业原型边界。
- [x] 确定核心玩家幻想。
- [x] 确定第一核心玩法卡：`survivor_horde`。
- [x] 产出项目 Design Seed / GDD v0.1。
- [x] 产出首版 preset / manifest seed。
- [x] 新增刀弓双态的可复用 runtime modifier。
- [ ] 首个核心节点在 Emulator 中完成实际运行验证。
- [ ] NodeResult 正常结算并回写成长。
- [ ] 角色能力至少有一次可感知的跨局成长。
- [ ] 通过基础 build/runtime gate。
- [ ] 完成 Node 1–3 第一轮可玩复盘。

## 7. 暂不做

- 不在第一轮铺满 12 个高完成度关卡。
- 不先做完整商业化 UI。
- 不为单个 IP 大规模改 core。
- 不在玩法尚未验证时批量生成美术资产。
- 不把 Agent 生成结果未经审核直接写入稳定 runtime。
- 不照搬原作章节对白与长篇剧情文本。
