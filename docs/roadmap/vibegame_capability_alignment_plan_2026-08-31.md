# LoreWeaver × VibeGame 核心能力对齐方案

> 日期：2026-08-31  
> 分支：`feat/vertical-slice-compiler-convergence`  
> 目标：吸收 VibeGame 中已经被真实工程验证的生产方法，但保持 LoreWeaver 的唯一 RuntimeKernel、Gameplay Card/Modifier、RecipeGraph、Evidence 与 L0–L4 权限边界不分叉。

## 1. 结论

VibeGame 最值得引入的不是第二套 Phaser 引擎，而是四类生产能力：

1. **任务合同化**：GDD → PRD → Plan → Programmer → Auditor → Player → Reviewer，角色所有权明确，交接与证据可追溯。
2. **可复用先验分层**：Skeleton、Module、Contract 分开沉淀，避免把完整旧项目直接复制成新项目。
3. **运行态可观测与可验证**：运行状态、输入、截图、日志、回放和 bot 证据来自同一执行会话。
4. **证据驱动的自演进**：只有在真实项目中使用并验证过的能力，经过显式批准后才能晋升为公共先验。

LoreWeaver 应将它们映射为：

```text
VibeGame                         LoreWeaver
────────────────────────────────────────────────────────────
GDD                              DesignSpec / RecipeGraph
prd.md + plan.md                 TaskContract
log.md + evidence/               append-only HandoffRounds + EvidenceRefs
Skeleton                         VerticalSliceBlueprint
Module                           CapabilityModule Descriptor
Cross-role Contract              ProductionContract
Self-Evolve                      CapabilityPromotion
Auditor                          Static Verification Stage
Player                           Runtime Verification Stage
Reviewer                         Independent Final Acceptance
Runtime API / Bot                Runtime Observation Port（后续）
Art Pack                         AssetRecipe + Provenance（后续）
```

核心原则：

> **对齐生产合同，不复制执行内核；对齐可复用能力，不复制项目特例；对齐证据闭环，不降低自动修改权限门槛。**

---

## 2. VibeGame 核心能力拆解

### 2.1 任务生产流水线

VibeGame 把非平凡开发任务固化为：

```text
Orchestrator
  └─ prd.md：产品结果与验收边界
       ↓
Architect
  └─ plan.md：技术方案、Runtime State Contract、验证计划
       ↓
Programmer
  └─ 实现
       ↓
Auditor
  └─ 静态审查与规范/代码一致性
       ↓
Player
  └─ 真实运行、状态断言、截图和手感验证
       ↓
Reviewer
  └─ 独立最终验收
```

其关键价值不是角色数量，而是：

- 产品意图、技术方案、代码审查和运行验证各自有唯一所有者；
- 静态审查与运行态验证不由同一角色自证；
- 每个任务有独立上下文清单、依赖关系、append-only 日志和证据目录；
- Final Reviewer 独立于实现链，并且只在最终状态做完整验收。

### 2.2 Skeleton / Module / Contract 三层先验

VibeGame 将复用物拆成三种不同语义：

- **Skeleton**：可启动的子类型基线，保留场景流、比例、碰撞、HUD 与基础手感；
- **Module**：参数化、可独立运行、接口清晰的行为单元；
- **Contract**：资产、代码、运行验证等跨角色协作规则。

这比复制完整项目或无限增加模板更健康，因为“项目结构”“可复用行为”“生产方法”不会混成一个对象。

### 2.3 Runtime Observation

VibeGame 的 Runtime API 支持：

- activate / pause / continue exact frames；
- semantic input；
- structured snapshot；
- screenshot；
- console/network capture；
- runtime property inspection；
- bot trace、video、result；
- record/replay。

最重要的理念是：

> 状态证据、视觉证据和交互轨迹应来自同一真实运行会话，而不是由多个测试入口各自拼接推断。

### 2.4 Evidence-gated Self-Evolve

VibeGame 的自演进只允许把真实使用过的项目经验晋升为 Skeleton / Module / Contract，并设置：

- 显式用户批准；
- dry-run；
- 静态检查；
- 真实启动 smoke；
- 私有路径与项目专有语义清理；
- 已存在目标冲突时 fail-closed；
- 资产只从 Manifest 实际引用集合中选取；
- 不能凭“理论上可复用”直接晋升。

这与 LoreWeaver 当前 Evidence-derived Maturity 方向高度一致。

### 2.5 资产生产链

VibeGame 将资产生成延伸为：

```text
Prompt / Reference
→ Analyze
→ Remove Background / Decompose
→ Cut / Concatenate / Atlas
→ Edge & Transparency Cleanup
→ Label / Preview
→ VLM Verify
→ Manifest Registration
→ Provenance / Art Recipe
```

值得引入的是合同与可追溯性；具体 OpenCV、Qwen 分层或供应商工具不是第一阶段依赖。

---

## 3. 与 LoreWeaver 的能力对齐

### 3.1 TaskContract：吸收任务合同与角色所有权

新增 `loreweaver.task-contract.v1`：

```text
Product Intent
→ Architecture Plan
→ Implementation
→ Static Verification
→ Runtime Verification
→ Independent Review
→ Accepted / Escalated
```

TaskContract 必须包含：

- `sourceSpecHash`：绑定发起任务时的 DesignSpec；
- `productIntent`：用户可见结果、边界和非目标；
- `acceptanceCriteria`：每条声明 state / visual / feel / static 所需证据；
- `dependencies`：任务依赖；
- `context`：按角色声明 `{file, reason}`，禁止全仓库无差别注入；
- `runtimeStateContract`：运行验证所需的明确状态字段；
- `patchAuthority`：最高自动权限不得超过 L2；
- `handoffRounds`：append-only 交接记录；
- `evidenceRefs`：静态、运行、视觉和最终审核证据；
- `status`：严格状态机，不允许跳过阶段。

角色边界：

| 角色 | 所有权 | 禁止行为 |
|---|---|---|
| orchestrator | 产品意图、任务切片、最终接受 | 不替代静态/运行验收 |
| architect | 技术计划、上下文、Runtime State Contract | 不直接宣布运行通过 |
| programmer | 实现与实现交接 | 不自证审核通过 |
| auditor | 静态审查、合同/代码一致性 | 不声明运行结果 |
| player | 运行态状态、视觉、交互和手感证据 | 不替代静态代码审查 |
| reviewer | 独立最终验收 | 不实现新功能 |

第一阶段 TaskContract 是 provider-neutral 的纯状态与合同层，不复制 tmux、Claude/Codex 会话管理。

### 3.2 VerticalSliceBlueprint：将 Skeleton 编译进现有架构

VibeGame Skeleton 不直接进入 LoreWeaver Runtime。它映射为 `VerticalSliceBlueprint`：

```text
VerticalSliceBlueprint
  ├─ whenToUse / whenNotToUse
  ├─ Design Recipe
  ├─ Stage Contract
  ├─ Gameplay Card
  ├─ Modifier Set
  ├─ Knobs
  ├─ Required Capabilities
  ├─ Missing Capabilities
  └─ Acceptance Gates
            ↓ compile
RecipeGraph + existing Card/Modifier composition
            ↓
compileRuntimeSpec
            ↓
LoreWeaverRuntimeKernel
```

Blueprint 不能携带任意可执行脚本，也不能创建第二套 SceneTree。第一阶段只支持线性 Blueprint；分支 Blueprint 在 RecipeGraph 编译器真正支持分支运行前 fail-closed。

首个已验证 Blueprint：

- `survivor_vertical_slice_3`：Setup → Escalation → Climax；
- 复用 `survivor_horde` 与现有 Modifier；
- 作为当前 Golden Slice 的正式 Blueprint 合同。

从 VibeGame 提取但暂不宣称已支持的 Alignment Candidates：

- 2D action boss fight；
- roguelike deckbuilder；
- room-based dungeon shooter；
- swipe slice arcade；
- bounce parkour。

这些只进入候选目录，并明确列出缺失 Gameplay Card / Capability；不能因为 VibeGame 已实现就自动变成 LoreWeaver 的 `runtime_supported`。

### 3.3 CapabilityModule：复用已有 Card / Modifier，而非新增第二套模块系统

LoreWeaver 已经拥有：

- Gameplay Card；
- Gameplay Modifier；
- RuntimeFeaturePack；
- Adapter Registry；
- Patch Policy；
- Test Fixture；
- Provenance / Risks / Performance Budget。

因此 `CapabilityModule` 不新增可执行格式，而是一个**规范化描述视图**：

```text
CapabilityModule Descriptor
  ├─ kind: gameplay_card | modifier | runtime_feature | presentation
  ├─ sourceRef
  ├─ publicInterface
  ├─ config / knobs
  ├─ requiredSystems
  ├─ patchAuthority
  ├─ checks
  ├─ provenance
  └─ maturity
```

VibeGame 的 Module 只有经过适配，成为现有 Card、Modifier、RuntimeFeaturePack 或 Presentation capability 后，才可参与 LoreWeaver 编译。禁止在 Blueprint 内直接引用任意 JS 文件。

### 3.4 ProductionContract：吸收跨角色合同

ProductionContract 负责“怎么生产和验证”，不负责运行逻辑。建议后续逐步建立：

- `runtime-observation`；
- `asset-atlas`；
- `sprite-collider-alignment`；
- `boss-encounter`；
- `hud-readability`；
- `prototype-to-polish`；
- `candidate-certification`。

每个 Contract 必须包含：

```text
When to use
Inputs
Architect/Implementation responsibilities
Art responsibilities（若适用）
Static verification
Runtime verification
Final review
Evidence contract
Common failure modes
```

Contract 只能引用真实存在的 LoreWeaver validator / runtime capability；未验证部分必须标记 `planned`，不能写成生产事实。

### 3.5 CapabilityPromotion：证据驱动自演进

新增 `loreweaver.capability-promotion.v1`，支持：

- `blueprint`；
- `capability_module`；
- `production_contract`；
- `asset_recipe`。

晋升策略：

```text
observed
→ candidate
→ verified
→ approved
→ promoted
```

必须满足：

- 来自真实 Workspace 与 source revision；
- 有真实使用证据，不接受 fixture / synthetic / stale；
- Blueprint/Module 至少有 runtime evidence；
- Module 所有可调参数外置且有接口/静态检查；
- Blueprint 有编译、静态和启动证据；
- 无私有绝对路径、项目专属人物/世界观泄漏；
- 明确来源与许可证；
- 用户显式批准；
- L3/L4 永远不能自动晋升；
- 目标已存在时 fail-closed，人工比较合并；
- 第一阶段只做 policy + dry-run，不自动复制文件。

### 3.6 Runtime Observation Port：后续吸收运行态控制

LoreWeaver 已有 Browser E2E、TestHooks 和 exact Candidate Evidence，但还缺一个统一的 semantic runtime observation contract。

后续目标：

```text
RuntimeObservationPort
  activate()
  pause()
  advanceFrames(n)
  input(action)
  snapshot()
  screenshot()
  console()
  network()
  recordTrace()
```

它必须包在唯一 `LoreWeaverRuntimeKernel` / TestHooks 之上。Playwright 只作为 Host 驱动，不成为玩法语义本身。

### 3.7 AssetRecipe：后续吸收资产链

后续新增：

```text
AssetRecipe
  ├─ rawPrompt / reference
  ├─ provider / model
  ├─ rawArtifact hash
  ├─ operations[]
  ├─ finalManifestKeys[]
  ├─ verification[]
  ├─ actuallyUsed
  └─ evidenceRefs[]
```

规则：

- 只记录最终 Manifest 真正使用的资产；
- 原始提示与每步变换可追溯；
- 生成、加工、验证三阶段分离；
- 具体工具是可替换 Port，不写死 Qwen/OpenCV；
- 只有真实验证过的 Recipe 才能晋升为公共资产先验。

---

## 4. 明确分歧与决策

### 分歧 1：是否引入 VibeGame SceneTree / Node Runtime

**决策：不引入。**

原因：

- LoreWeaver 已收敛为 `RuntimeSpec → LoreWeaverRuntimeKernel → Adapter Registry`；
- VibeGame SceneTree 是完整的第二套对象、生命周期、视觉、碰撞和脚本运行时；
- 并存会导致 IDE、Standalone、Evidence、Patch 和资产绑定出现双重权威；
- 会直接破坏当前“唯一 RuntimeKernel”原则。

只吸收其声明式对象、运行状态和验证理念，不复制执行内核。

### 分歧 2：`node` 术语

**决策：不复用 VibeGame 的 node 术语。**

LoreWeaver 的 `NodeSpec` 已表示叙事/关卡进度节点；VibeGame 的 node 表示场景对象。后者在 LoreWeaver 中统一称：

```text
SceneObject / RuntimeObject
```

避免一个词同时表示关卡节点和场景实体。

### 分歧 3：任意脚本生成与自动修改权限

**决策：继续严格 L0–L4。**

- L0/L1：自动；
- L2：受控组合与 targeted validation；
- L3 Adapter：人工批准与独立任务；
- L4 Runtime Core：人工架构审查；
- CapabilityPromotion 不得绕过此边界。

VibeGame 的 Programmer 可以修改任意项目 JS，这适合代码代理开发框架；LoreWeaver 的普通创作者模式强调确定性编译和低风险修改，两者不能直接等价。

### 分歧 4：多智能体运行后端

**决策：不复制 tmux / provider-specific team harness。**

LoreWeaver 保持 Web/API 驱动、provider-neutral 的任务状态机。Claude Code、Codex、Grok 或本地模型都可以成为角色执行器，但 TaskContract 与 Evidence 不依赖某个终端进程管理方式。

### 分歧 5：Skeleton 的使用方式

**决策：Skeleton 不作为代码拷贝模板，而作为 Blueprint 编译输入。**

只有缺失 Capability 确实需要 L3 Adapter 时，才建立单独人工批准任务。否则优先组合已有 Card/Modifier。

### 分歧 6：Placeholder 策略

**决策：Candidate 可显式允许，Certified 禁止。**

原型期允许 placeholder 以并行开发，但必须：

- Manifest 明确标注；
- Visual Gate 报告 remaining placeholders；
- `release_certified` 要求 0 visible placeholder；
- 不能用程序化形状冒充最终美术。

### 分歧 7：设计真相源

**决策：DesignSpec / RecipeGraph 为唯一结构化真相源。**

GDD/PRD 可以作为人类可读投影和任务切片，但不能在 TaskContract 中创造 DesignSpec 未声明的新玩法。若需求改变，先修改 DesignSpec，再派生 TaskContract。

### 分歧 8：Self-Evolve 是否自动写全局目录

**决策：第一阶段只输出 Promotion Decision，不自动写目录。**

原因：公共先验会影响后续所有作品，必须经过显式批准、冲突检查、许可证检查和可回滚提交。

### 分歧 9：许可证

VibeGame 为 Apache-2.0；LoreWeaver 当前为 Personal Use License。第一阶段只实现独立设计的合同与策略，不复制其实现代码。后续若直接移植 VibeGame 源码，必须保留适用的版权/许可证声明，并将其作为第三方 Apache-2.0 组件管理；不能把第三方代码的许可声明吞入 LoreWeaver 自有许可证。

---

## 5. 分阶段实施

### Phase A：合同与编译基础（本轮）

- 新增 TaskContract schema + 状态机；
- 新增 VerticalSliceBlueprint schema + 编译器；
- 新增 CapabilityModule descriptor schema；
- 新增 CapabilityPromotion schema + policy；
- 把 `survivor_vertical_slice_3` 固化为首个可编译 Blueprint；
- 建立 VibeGame 五类 Skeleton 的 Alignment Candidate 目录；
- 加入 `check:convergence-core`。

### Phase B：任务工作台

- Expert Mode 增加 Tasks / Capabilities；
- 可视化产品意图、Plan、角色 Context、handoff rounds、证据与 blockers；
- Department Agent 映射到 TaskContract 角色，而不是继续依赖模糊 prep 状态；
- Repair Loop 作为 TaskContract 的受控 rework round。

### Phase C：Runtime Observation

- 在 RuntimeKernel/TestHooks 上建立 semantic snapshot；
- 输入 action、exact-frame advance、console/network 和 screenshot 同一会话；
- 测试场景可以输出 trace + result + video；
- Candidate Browser Evidence 改为 Runtime Observation Evidence Bundle 的一种派生物。

### Phase D：AssetRecipe

- 统一 raw → operations → final manifest keys → verification；
- 接入透明度、边缘、帧切分、Atlas 完整性和 VLM；
- 记录实际使用与来源；
- 只晋升真实使用过的 Recipe。

### Phase E：Evidence-gated Promotion

- UI 展示 Promotion Candidate；
- dry-run 生成文件列表、冲突、许可证、隐私和 Evidence 报告；
- 用户批准后才产生受控提交；
- 晋升后重新运行 Blueprint/Module/Contract 对应 Gate。

---

## 6. 验收标准

Phase A 完成需要同时满足：

1. TaskContract 正常路径可从 draft 走到 accepted；非法角色跳步、缺失证据、L3/L4 自动修改必须失败。
2. `survivor_vertical_slice_3.blueprint.json` 可无损编译为现有 RecipeGraph/NodeSpec，并通过 Card/Modifier composition validation。
3. Alignment Candidate 只能表达“映射计划与缺失能力”，不能被当作 runtime-supported Blueprint 编译。
4. CapabilityModule descriptor 只引用现有 Card/Modifier/RuntimeFeaturePack，不接受任意脚本路径作为运行入口。
5. CapabilityPromotion 对缺少真实 runtime evidence、fixture/synthetic/stale、无批准、私有路径、项目专属内容、L3/L4 自动晋升全部 fail-closed。
6. 新检查进入 `check:convergence-core`，TypeScript 和 Golden Candidate E2E 继续全绿。
7. 不修改 `LoreWeaverRuntimeKernel` 的玩法执行路径，不引入第二套 Phaser SceneTree。

---

## 7. 最终产品效果

完成全阶段后，LoreWeaver 的生产路径将从：

```text
创意 → 生成 Spec → 试玩 → 修改 → 发布
```

增强为：

```text
创意
→ 选择/生成 VerticalSliceBlueprint
→ DesignSpec / RecipeGraph
→ TaskContract 分解
→ Architect Plan
→ 受控 Implementation / Repair
→ Static Auditor
→ Runtime Player
→ Independent Reviewer
→ exact Candidate Evidence
→ Human / Device / VLM
→ Certified Release
→ 经批准的 Capability Promotion
```

这会保留 LoreWeaver “低代码、受控编译、可认证发布”的核心优势，同时补上 VibeGame 最强的任务治理、运行态证据、可复用先验和自演进闭环。