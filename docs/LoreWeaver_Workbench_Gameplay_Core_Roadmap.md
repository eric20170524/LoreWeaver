# LoreWeaver: AI 辅助个人游戏工作台路线文档

> 本文记录当前产品定位与下一阶段架构路线。版权与同人合规问题暂时后置，最后集中处理；当前优先解决玩法沉淀、稳定引擎壳与局部 patch 工作流。

---

## 1. 当前定位

LoreWeaver 的定位不是一次性游戏生成器，而是：

**AI 辅助的个人游戏工作台。**

它面向个人开发者，用来把已有小游戏案例、稳定运行时能力、玩法库、Agent 辅助设计与局部修订流程组织起来。核心目标不是让 AI 凭空吐出完整游戏，而是让 AI 在可控的工程资产上做组合、参数化、审计和局部 patch。

### 1.1 三个已确认原则

1. **给自己用**
   - 优先工程可控性、可追踪性、可回滚性。
   - 不急于做大众化产品体验。

2. **允许多玩法**
   - 不能把引擎锁死成单一的 12 节点放置或卡牌微游。
   - 不同关卡可以映射到不同玩法 adapter，或在同一基础玩法上挂载不同 modifier。

3. **尽量局部 patch**
   - Agent 默认不应整包重写代码。
   - 修改应尽量落在 spec、参数、玩法组合、文案或小型机制 hook 上。
   - 只有明确授权时，才修改玩法 adapter 或 core。

---

## 2. 三层资产边界

当前仓库中已有三个关键资产区，应明确分工。

### 2.1 `minigame`: 案例库

`minigame` 是真实项目案例库。它的价值在于：

- 已经跑通过的玩法经验。
- 已经踩过的 Phaser、Scene 生命周期、E2E、UI、状态流转坑。
- 可被抽取的关卡机制与参数结构。

案例库不应被直接复制成 core。它更像经验矿场，需要经过盘点、抽象、验证后，才能进入稳定玩法库。

### 2.2 `minigame_master/core`: 稳定引擎壳

`minigame_master/core` 是稳定运行时与工具箱。它应沉淀：

- Scene 生命周期规范。
- Store 与状态持久化。
- NodeBridge 主干与关卡通信协议。
- UI 控件、弹窗、按钮、防穿透。
- VFX、音频、输入、交互工具。
- 测试 hook 与可观测接口。
- 通用 GameplayAdapter 与 Modifier 基类。

core 不应包含具体 IP 文案、某一款游戏的剧情、专属关卡名称，或未经验证的 Agent 生成代码。

### 2.3 `LoreWeaver`: 工作台

LoreWeaver 是上层工作台，负责：

- 从案例库盘点玩法。
- 生成和维护玩法卡。
- 选择玩法卡并组合新项目。
- 管理 manifest、revision、patch、gate。
- 调用 Agent 进行设计、修改、解释与审计。
- 将稳定机制沉淀回 `minigame_master/core`。

一句话：

**LoreWeaver 是工作台，core 是工具箱，minigame 是案例库，Gameplay Card 是二者之间的知识货币。**

---

## 3. 关键抽象：Gameplay Card

玩法不应只是一段源码或一个名字，而应沉淀为一张可复用的玩法卡。

示例：

```json
{
  "id": "survivor_horde",
  "title": "限时割草生存",
  "category": "action_survival",
  "runtimeAdapter": "SurvivorHordeScene",
  "inputs": ["pointer_move", "keyboard_move"],
  "objectives": ["survive_duration", "kill_count", "boss_defeat"],
  "failure": ["player_hp_zero", "escort_dead", "timer_expired"],
  "knobs": {
    "duration": "number",
    "enemySpawnRate": "number",
    "boss": "object",
    "hazards": "array",
    "rewardTable": "object"
  },
  "requiredCoreSystems": ["Store", "NodeBridge", "VFX", "WebAudioSynth"],
  "testFixture": "e2e/survivor_horde.spec",
  "sourceProvenance": ["minigame/xianni", "minigame/perfectworld_dahuang"]
}
```

Gameplay Card 的作用：

- 告诉 Agent 可以选择什么玩法。
- 告诉编译器如何实例化玩法。
- 告诉测试系统如何验证玩法。
- 告诉开发者哪些参数可以安全 patch。
- 告诉 core 需要稳定哪些底层能力。

---

## 4. 玩法抽取策略

下一阶段不应先凭空设计完整 core，也不应直接复制旧项目代码。更好的策略是：

**从案例库抽玩法时，反推 core 应该稳定什么。**

### 4.1 先盘点，再抽象

对 `minigame` 中每个可复用关卡建立玩法盘点表：

```text
来源文件：
玩法类型：
核心行为：
胜利条件：
失败条件：
可调参数：
依赖的 core 能力：
能否抽成 modifier：
当前已知坑：
适合题材：
不适合题材：
```

### 4.2 优先抽取路径

当前采用双轨优先级：

1. **工作台协议优先：`node_iframe_microgame`**
   - 来源：`minigame/Path_to_Immortality`。
   - 价值：它已经真实跑通“主干 -> iframe 节点 -> postMessage 结果回传 -> 奖励写入 -> 解锁刷新”的多玩法工作台雏形。
   - 作用：先定义 LoreWeaver 如何承载多玩法节点，而不是急着把所有玩法改成 Phaser Scene。

2. **Phaser core adapter 优先：`survivor_horde`**
   - 来源：`minigame/xianni` 与 `minigame/perfectworld_dahuang`。
   - 价值：它适合作为第一条进入 `minigame_master/core/gameplay` 的 Phaser adapter。
   - 作用：验证 `NodePayload`、`NodeResult`、`GameplayAdapter`、`GameplayModifier`、`SceneLifecycle`、`TestHooks` 等稳定合同。

因此，第一个进入 LoreWeaver 工作台的玩法协议是：

**`node_iframe_microgame`: iframe 单页节点容器**

第一个进入 Phaser core 的基础玩法 adapter 是：

**`survivor_horde`: 限时割草生存**

`survivor_horde` 的理由：

- `minigame/xianni` 与 `minigame/perfectworld_dahuang` 都已有类似样本。
- 覆盖面广，适合修仙、玄幻、末世、动作同人等题材。
- 容易承载多种 modifier。
- 很适合验证 NodePayload、NodeResult、Store、VFX、E2E 等 core 合同。

### 4.3 基础玩法 + modifier

不要把每个差异都做成独立大玩法。更好的结构是：

```text
survivor_horde
  + poison_fog
  + laser_warning
  + defend_core
  + escort_npc
  + boss_phases
  + thunder_hazard
```

这样 LoreWeaver 能自然做局部 patch：

```text
把 node_4 从普通割草改成 survivor_horde + defend_core
把 node_6 加上 thunder_hazard
把最终关加 boss_phases
```

---

## 5. Core 应稳定的合同

core 要稳定的不是某一个具体关卡，而是以下合同。

### 5.1 `NodePayload`

主干进入关卡时传入的数据。

```js
{
  nodeId: 1,
  nodeConfig: {},
  playerStats: {},
  playerPerks: [],
  inventory: {},
  runSeed: "optional-seed"
}
```

### 5.2 `NodeResult`

关卡结束时回传给主干的数据。

```js
{
  success: true,
  reason: "boss_defeated",
  rewards: {},
  penalties: {},
  flags: ["node_1_completed"],
  telemetry: {
    durationSec: 120,
    kills: 83,
    damageTaken: 42
  }
}
```

### 5.3 `GameplayAdapter`

玩法 adapter 的最小接口。

```js
class GameplayAdapter {
  init(payload) {}
  create(scene) {}
  update(time, delta) {}
  pause() {}
  resume() {}
  destroy() {}
  end(result) {}
}
```

### 5.4 `GameplayModifier`

modifier 负责向基础玩法挂载机制。

```js
class GameplayModifier {
  install(context) {}
  update(context, time, delta) {}
  uninstall(context) {}
}
```

### 5.5 `SceneLifecycle`

必须统一处理：

- 场景启动。
- UI Scene 启动与停止。
- 暂停与恢复。
- 撤退确认。
- 计时器清理。
- 物理碰撞清理。
- 切场景转场锁。

### 5.6 `TestHooks`

Canvas 游戏不容易直接观测，因此 core 需要稳定测试 hook：

- 当前 scene key。
- 当前 node id。
- 玩家生命值。
- 倒计时。
- 击杀数。
- 结算状态。
- console error 捕获。
- 最近一次 NodeResult。

---

## 6. Patch 分级

为了保证“尽量局部 patch”，Agent 修改应分级授权。

### L0: 文案 patch

- 标题。
- intro。
- taunt。
- 按钮文本。
- 结算文本。

默认允许。

### L1: 参数 patch

- 时长。
- 血量。
- 掉落。
- 刷怪频率。
- 难度曲线。
- Boss 数值。

默认允许，但需要 schema 校验。

### L2: 玩法组合 patch

- 添加 `poison_fog`。
- 添加 `laser_warning`。
- 添加 `defend_core`。
- 添加 `escort_npc`。
- 添加 `boss_phases`。

默认允许，但需要重新跑受影响关卡的测试。

### L3: adapter patch

- 修改某个玩法 adapter 的实现。
- 新增 adapter hook。
- 新增 modifier 类型。

需要人工确认。

### L4: core patch

- 修改 Store、NodeBridge、SceneLifecycle、UI 基础组件、输入系统等。

必须人工授权，并要求回归测试。

---

## 7. LoreWeaver 工作流

目标工作流：

```text
1. 从 minigame 案例库扫描玩法候选
2. 生成玩法盘点表
3. 人工确认哪些机制值得沉淀
4. 形成 Gameplay Card
5. 将通用能力抽入 minigame_master/core
6. LoreWeaver 在新项目中选择玩法卡
7. Agent 对 spec 提出 patch
8. 用户 review diff
9. approve 后局部重编译
10. 跑 Build/E2E Gate
11. 通过后形成新 revision
```

---

## 8. 第一阶段建议任务

### Phase A: 玩法盘点

- [ ] 盘点 `minigame/xianni/nodes` 中 Node1-Node12 的玩法机制。
- [ ] 盘点 `minigame/perfectworld_dahuang/nodes` 中可复用机制。
- [ ] 输出 `Gameplay Inventory` 表。

### Phase B: 第一张玩法卡

- [ ] 建立 `survivor_horde` Gameplay Card。
- [ ] 标注来源样本、可调参数、胜负条件、测试要求。
- [ ] 明确哪些功能属于 adapter，哪些属于 modifier。

### Phase C: core 合同落地

- [ ] 定义 `NodePayload` 与 `NodeResult`。
- [ ] 定义 `GameplayAdapter` 基类。
- [ ] 定义 `GameplayModifier` 基类。
- [ ] 建立最小 `TestHooks`。

### Phase D: 最小可运行验证

- [ ] 用 `survivor_horde` + 2 个 modifier 生成一个新关卡。
- [ ] 跑通构建。
- [ ] 跑通最小 E2E。
- [ ] 记录问题到规则文档。

---

## 9. 当前批判性提醒

1. **不要把 Agent 当核心资产。**
   - Agent 是协作者，不是系统真相源。
   - 真相源应是 manifest、Gameplay Card、revision 与测试报告。

2. **不要把旧项目代码原样搬进 core。**
   - 旧代码先作为样本。
   - 抽象前必须识别 IP 内容、项目特例、历史补丁与通用机制。

3. **不要过早设计万能玩法引擎。**
   - 先从 `survivor_horde` 一个基础玩法打穿。
   - 通过真实关卡反推抽象。

4. **不要让局部 patch 变成局部失控。**
   - Agent patch 必须有 target、operation、before、after、reason、invalidates。
   - 所有 patch 都应可 diff、可回滚、可重新测试。

---

## 10. 暂定结论

下一阶段主线不是继续扩写多 Agent 愿景，而是建立一条硬闭环：

**从 `minigame` 抽玩法卡 -> 人工确认 -> 放入 `minigame_master/core/gameplay` -> LoreWeaver 可选择/组合/patch -> 编译回新游戏。**

这条线一旦跑通，LoreWeaver 才真正从“GDD 生成器”进化为“AI 辅助的个人游戏工作台”。
