# VibeGame 核心能力对齐 · 实现收口记录

> 日期：2026-08-31  
> 分支：`feat/vertical-slice-compiler-convergence`  
> PR：`#3`  
> 来源：`https://github.com/tettethu/VibeGame`（Apache-2.0）  
> 本项目许可证：LoreWeaver Personal Use License 1.0

## 1. 最终对齐结论

本轮不把 VibeGame 当作第二套游戏引擎或可执行模板仓库引入，而是提取其可复用的生产方法：

```text
VibeGame Skeleton     → LoreWeaver VerticalSliceBlueprint
VibeGame Module       → LoreWeaver CapabilityModule
VibeGame Contract     → LoreWeaver ProductionContract
VibeGame Task/Agents  → LoreWeaver TaskContract + Handoff
VibeGame Runtime API  → LoreWeaver RuntimeObservationPort
VibeGame Art workflow → LoreWeaver AssetRecipe
VibeGame Self-evolve  → Evidence-gated CapabilityPromotion
```

唯一执行权威继续是：

```text
DesignSpec / Blueprint
        ↓ compile
RecipeGraph + NodeSpec + Gameplay Card + Modifier
        ↓
RuntimeSpec
        ↓
LoreWeaverRuntimeKernel
```

不存在 `VibeGameSceneTree`、第二套 Node runtime 或 Skeleton 内嵌脚本旁路。

## 2. 已完成能力

### 2.1 VerticalSliceBlueprint

已实现：

- `loreweaver.vertical-slice-blueprint.v1` schema；
- Blueprint → 现有 RecipeGraph / NodeSpec 编译；
- 首个 `runtime_verified` Blueprint：`survivor_vertical_slice_3`；
- Gameplay Composition 真验证；
- 禁止嵌入脚本、未知 Card/Modifier、重复 Stage、缺能力却声称 runtime support；
- 5 个 VibeGame 子类型仅登记为 `alignment_candidate`，并明确 missing capabilities。

候选类型：

1. 2D Action Boss Fight；
2. Roguelike Deckbuilder；
3. Dungeon Shooter；
4. Swipe Slice Arcade；
5. Bounce Parkour。

这些候选**不是已支持玩法**，在缺失 Card/Runtime capability/Evidence 前不能编译或宣传为可运行。

### 2.2 CapabilityModule

已把 Gameplay Card 与 Modifier 规范化为统一只读 Module descriptor，暴露：

- 公共输入/输出；
- Knob；
- Adapter 引用；
- Compatible base cards；
- 测试与 Evidence；
- Provenance；
- Patch authority。

自动修改上限仍为 L2；L3/L4 必须人工审查。

### 2.3 ProductionContract

已将现有 exact-Candidate 发布链固化为首个 verified ProductionContract：

```text
Compile Candidate
→ Browser / Runtime
→ Real VLM
→ Human Playtest
→ Physical Device
→ Independent Release Review
→ Metadata-only Certified Promotion
```

合同要求：

- exact `specHash / runtimeVersion / payloadHash / artifact / artifactSha256 / screenshot / screenshotSha256`；
- fresh；
- real-only；
- no waiver；
- Candidate reselection 精确 stale；
- Certified promotion 不能改变 executable payloadHash。

### 2.4 TaskContract

已实现 provider-neutral TaskContract：

```text
Product Intent
→ Acceptance Criteria
→ Dependencies
→ Role Context
→ Runtime State Contract
→ Patch Authority
→ Append-only Handoff Chain
```

角色顺序：

```text
Architect
→ Programmer
→ Auditor
→ Player
→ Reviewer
→ Orchestrator
```

边界：

- Auditor 只能证明 static；
- Player 负责 runtime / visual / feel；
- Reviewer 独立评审；
- Orchestrator 只能在 Criteria Evidence 覆盖完整后验收；
- 旧 Handoff 使用 SHA-256 链防篡改；
- L3/L4 立即 escalated；
- rework 后必须重新走验证链。

已提供：

- Workspace TaskRepository；
- 原子写入；
- History journal；
- Optimistic concurrency；
- CLI：`list/show/create/handoff/evaluate`；
- Express API；
- Expert Mode 只读审计台。

### 2.5 Department → Task bridge

现有 Department Agent 输出现在有受控桥接器：

```text
architecture dept → Architect handoff
implementation dept → Programmer handoff
QA / compliance → Auditor handoff
```

明确禁止：

```text
department/director → Player
                    → Reviewer
                    → final Orchestrator acceptance
```

因此“部门确认”不能冒充运行试玩、手感证据或独立最终验收。

桥接仍受：

- 当前 Task next role；
- Evidence kind allowlist；
- L0-L2 authority；
- fresh / non-fixture / non-synthetic Evidence；
- current lastRoundHash；
- 失败零写入。

### 2.6 RuntimeObservationPort

在现有 TestHooks 上增加：

- immutable snapshot；
- bounded monotonic trace；
- same-session identity；
- unique runtime authority；
- Browser Report v3 中的 state/trace/screenshot 绑定。

控制能力默认 fail-closed：

```text
activate / pause / resume / semanticInput / advanceFrames
```

只有注册真实 handler 后才声明支持。当前没有正确推进 Phaser update/timer/tween/physics 的统一时序，因此：

```text
exactFrameAdvance = false
```

不会用 `setTimeout` 或普通等待冒充确定性逐帧。

### 2.7 AssetRecipe

已建立：

```text
Raw Prompt / Reference / Raw Artifact
→ Tool-neutral Operations
→ Final Manifest Assets
→ Integrity / Runtime Usage / License / VLM / Edge / Atlas Evidence
→ Explicit Promotion
```

约束：

- Operation 只引用逻辑 Port，不嵌入 `.py/.js/.sh` 或 shell command；
- verified Recipe 只保留实际进入 Runtime Manifest 的最终资产；
- 每个最终资产绑定 SHA-256、bytes、usage refs；
- fixture/synthetic/stale/wrong hash/private path/unresolved input 失败关闭；
- 旧 Atlas 迁移器计算真实 source/atlas hashes；
- 加工历史缺失时只能生成 `candidate`，不能自动 verified/promoted。

### 2.8 Evidence-gated CapabilityPromotion

Promotion 决策器要求：

- 真实使用；
- 按类型真实 Evidence；
- 来源 revision / license；
- 参数化；
- 公共接口；
- 无项目私有路径或专有词；
- 目标冲突检查；
- 显式用户批准。

当前只能得到：

```text
approved_for_dry_run
```

尚未允许自动复制或覆盖公共能力文件。

## 3. Expert Mode 产品效果

```text
Expert Pipeline
├─ Department production status
├─ Capability Library
│  ├─ Blueprint
│  ├─ CapabilityModule
│  ├─ ProductionContract
│  └─ Alignment Candidate + missing capabilities
└─ Workspace TaskContract
   ├─ Product Intent
   ├─ Acceptance Coverage
   ├─ Runtime State Contract
   ├─ Role Context
   ├─ Handoff SHA chain
   ├─ Evidence refs
   └─ Blockers / next owner
```

Simple Mode 仍保持：

```text
创意 → 设计 → 试玩 → 一句话修改 → 发布
```

不会向普通创作者暴露 Agent 角色、Hash、Runtime Contract 或 Promotion 细节。

## 4. 与 VibeGame 的明确分歧

### 4.1 不引入第二运行时

VibeGame 的 SceneTree/Node/CurrentScene 适合其独立运行时，但 LoreWeaver 已有 RuntimeSpec/RuntimeKernel。因此仅吸收语义和验证合同，不吸收执行内核。

### 4.2 不复用 `Node` 术语

LoreWeaver `NodeSpec` 已代表关卡/剧情流程节点。未来场景实体必须使用 `SceneObjectSpec / RuntimeObjectSpec`，避免概念冲突。

### 4.3 不允许 Agent 自动升级核心架构

VibeGame Self-evolve 中可复用的部分是 evidence、dry-run、approval 和 externalized tunables；LoreWeaver 不接受无审批 L3/L4、自修改 RuntimeKernel 或静默覆盖公共能力。

### 4.4 不把 tmux/供应商进程当产品数据模型

TaskContract 是产品级状态和证据合同；tmux、Claude CLI、Codex CLI 或其它进程只是可替换执行器，不进入持久化核心模型。

### 4.5 不复制可执行 Skeleton/Module

Blueprint 和 CapabilityModule 引用现有 LoreWeaver Card/Modifier/Adapter。VibeGame 子类型只登记意图和缺口；未来直接复用 Apache-2.0 代码时另行保留 Attribution/Notice。

### 4.6 不降低 Evidence 标准

fixture、synthetic、headless、emulated 不能冒充真实发布 Evidence；部门状态也不能冒充 Player/Reviewer。

## 5. 尚未完成

1. Department 生产管线内部自动调用 bridge；当前 bridge/CLI/API 已具备，但原 Department runner 尚未在每次完成后自动写 Task。
2. 真正 semantic input、pause/resume 的 Adapter 统一注册。
3. 同时推进 Phaser update、timer、tween、physics 的 exact-frame advance。
4. Bot flow、trace replay 与跨构建确定性 Evidence。
5. AssetRecipe 各 operation Port 的真实可替换执行器。
6. 现有 Asset Job 全面改写为 AssetRecipe operation/evidence 输出。
7. Capability/Asset Promotion 的 diff → validate → user confirm → write 执行器与审批 UI。
8. 5 个 VibeGame 子类型所需的新 Gameplay Card/Runtime capability 与真实运行 Evidence。
9. 真实 VLM、真人试玩、物理设备 Evidence；这些仍是 `release_certified` 的外部硬门禁。

## 6. 合并门禁

必须至少通过：

```text
Convergence Core
VibeGame Alignment Core
Golden Candidate E2E
TypeScript
Creator Revision Transaction
```

任何以下情况必须阻止合并：

- 第二 Runtime authority；
- Blueprint 嵌入脚本；
- alignment_candidate 伪装成 runtime_supported；
- Department 自证 Player/Reviewer/Acceptance；
- fixture/synthetic/stale Evidence Promotion；
- L3/L4 自动写入；
- AssetRecipe 无原始来源或加工历史却声称 verified；
- Runtime Observation 虚报 exact-frame；
- 本轮变更放宽 exact-Candidate Certified Gate。
