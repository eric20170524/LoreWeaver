# 《玄界之门》石牧同人游戏 Design v0.1

> 分支：`feat/fangame-co-development`
>
> 当前阶段：个人非商业同人原型 / Golden Vertical Slice
>
> 核心体验：**割草 + 弹幕 + 闯关 + 角色养成**

## 1. 一句话定位

玩家扮演石牧，在俯视角高密度战场中以**陨铁黑刀近战扫荡、紫钢弓远程压制**应对敌潮与弹幕，通过武技、兵刃、境界、月华和白猿血脉的长期成长，把一个“能打”的武者逐步养成“能破万敌”的石牧。

这不是单纯的修仙题材 Vampire Survivors 换皮。第一优先级是让玩家在 30 秒内感受到石牧的战斗身份：

```text
近身被围 -> 黑刀扫群 -> 拉开距离 -> 紫钢弓连射 ->
观察危险区/精英 -> 再切近战破围 -> 击杀/收集 -> 成长 ->
Boss/波次压力 -> 结算 -> 主干强化
```

## 2. 设计支柱

### P1. 刀弓双态，而非单一自动武器

第一版采用通用 `weapon_stance_cycle` modifier：

- Melee：黑刀范围扫击，解决近身包围。
- Ranged：紫钢弓自动弹道，解决远端精英和走位期输出。
- 两种武器不是 UI 装饰，而是形成“贴身清场 / 拉扯射击”的节奏差异。
- 第一版自动轮换是为了快速验证战斗闭环；验证后再决定是否升级为手动切换、条件切换或技能驱动切换。

### P2. 弹幕不是独立小游戏，而是割草战场的空间压力

弹幕/危险区用于迫使玩家改变站位：

- `hazard_telegraph`：地面圆形/直线预警。
- `boss_phases`：Boss 阶段切换与弹幕变化。
- `debuff_zone`：限制移动和自动攻击区域。

目标不是做纯 STG，而是形成“敌潮密度 + 弹幕空间控制”的双重压力。

### P3. 闯关必须改变任务，不只是提高 HP

主玩法保持 `survivor_horde`，关卡差异优先通过 modifier 表达：

- 普通清场：`horde_intensity`
- 波次闯关：`arena_wave_boss`
- 战场守线：`defend_line`
- Boss 弹幕：`boss_phases` + `hazard_telegraph`

少量节点使用 `dodge_counter_boss`、`side_scrolling_brawler`、`shooter_duel`、`rhythm_timing` 作为节奏变化，但不能抢走主循环。

### P4. 养成必须回到局内可感知参数

长期成长分为五条：

1. `realm_breakthrough`：境界 -> HP / 基础伤害 / 关卡资格。
2. `martial_mastery`：武技熟练 -> 黑刀范围、伤害、连斩效率。
3. `weapon_forging`：兵刃炼化 -> 黑刀烈炎、弓箭连射与弹道预算。
4. `bloodline_awakening`：白猿血脉 -> 后期爆发、抗压、终局形态。
5. `moon_insight`：吞月参悟 -> 成长效率与血脉/高阶能力解锁条件。

禁止只增加“战力 +1234”但局内没有反馈的成长。

## 3. 石牧战斗能力分层

| 层级 | 能力 | 当前实现状态 | 玩法作用 |
| --- | --- | --- | --- |
| 起手 | 风驰十三式 | 部分运行时映射 | 黑刀范围清群 |
| 起手 | 紫钢弓 | 部分运行时映射 | 自动远程弹道/精英点杀 |
| 中期 | 陨铁黑刀·烈炎 | 设计 + 参数路线 | 黑刀火属性质变 |
| 成长 | 吞月式 | 设计层 | 月华/熟练度/血脉成长加速 |
| 后期 | 白猿血脉·爆发 | 设计层 | 范围、伤害、抗压终局爆发 |

`white_ape_overdrive` 暂不伪装成已完成能力：Vertical Slice 通过后再新增通用 transformation/overdrive modifier。

## 4. Golden Vertical Slice：只做节点 1–3

### Node 1：丰城夜战：凶拳试锋

**目的：验证主循环是否好玩。**

- Base：`survivor_horde`
- Modifiers：
  - `weapon_stance_cycle`
  - `horde_intensity`
  - `arena_wave_boss`
- 体验：黑刀 4 秒近战期 / 紫钢弓 5 秒远程期交替。
- 目标：三波敌潮，75 秒内完成清场/结算。
- 验证点：
  - 双态切换是否明显；
  - 黑刀是否真的能解决包围；
  - 弓箭阶段是否自然形成拉扯；
  - 敌群密度是否足以产生爽感；
  - NodeResult 是否回写第一项成长。

### Node 2：四馆较技：破势夺魁

**目的：验证单体 Boss 节奏。**

- Base：`dodge_counter_boss`
- 体验：预警 -> 闪避 -> 反击 -> 累积破势。
- 不追求复杂技能树，只验证“割草之间插入硬派一对一”是否能改善节奏。

### Node 3：破庙尸潮：刀弓守夜

**目的：验证敌潮 + 弹幕组合。**

- Base：`survivor_horde`
- Modifiers：
  - `weapon_stance_cycle`
  - `hazard_telegraph`
  - `boss_phases`
- 首通解锁：`black_blade_flame`
- 验证点：地面危险是否增强走位，而不是让画面变乱；Boss 弹幕是否与敌潮共存。

## 5. 第一轮成功标准

### 战斗

- [ ] Node 1 黑刀与弓箭两种阶段均实际造成伤害。
- [ ] 玩家能在不读说明的情况下从反馈上区分两个阶段。
- [ ] 第一关至少出现一次“被围 -> 黑刀清开”的明显爽点。
- [ ] 远程阶段不是空窗，能持续处理目标。
- [ ] Node 3 弹幕/预警不会遮蔽核心可读性。

### 成长

- [ ] 首通 Node 1 后主干状态发生变化。
- [ ] 至少一个成长项能改变下一次战斗的真实参数。
- [ ] Node 3 的黑刀强化不是纯文案奖励。

### 工程

- [ ] `玄界之门` / `石牧` alias 可直接加载 preset。
- [ ] preset JSON 通过结构校验。
- [ ] `weapon_stance_cycle` 能通过 registry 创建。
- [ ] build / TypeScript / 现有 convergence checks 不被破坏。
- [ ] 不修改稳定 core contract。

## 6. 当前明确不做

- 不先制作 12 个正式关卡。
- 不先生成整套角色动画和场景美术。
- 不把白猿血脉写成石牧专属硬编码。
- 不照搬原作章节对白或长剧情文本。
- 不把所有原作能力都塞进第一版。
- 不把游戏做成纯放置修炼或纯 STG。

## 7. 下一里程碑

Vertical Slice v0.2 的优先顺序：

1. 让 `weapon_stance_cycle` 进入测试/观测合同，确认近战/远程攻击事件可回放。
2. 把 Node 1 的成长奖励真正映射到第二局参数，而不是只有 abilityCatalog。
3. 根据实测决定双态是继续自动循环，还是升级为玩家主动切换。
4. 只有 Node 1–3 战斗闭环通过后，才实现通用 `overdrive_transformation`，用于白猿血脉。
5. 战斗手感通过后，再进入石牧角色、黑刀、弓箭、敌人和环境的 RuntimeArtBinder 素材生产。
