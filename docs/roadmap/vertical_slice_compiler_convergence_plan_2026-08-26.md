# LoreWeaver 竖切片编译器收敛方案

> 日期：2026-08-26
> 状态：实施中
> 目标：在不破坏现有 Workbench / Gameplay Card / RuntimeKernel / Productize 链路的前提下，将 LoreWeaver 收敛为“可控、可验证、可修正、可认证”的 AI Game Vertical-Slice Compiler。

## 1. 产品与工程结论

LoreWeaver 不应继续向“一句话生成任意完整游戏”扩张。最佳实践是把 AI 限定在**设计决策和受控 Patch**，把确定性编译、运行、验证和发布交给稳定代码。

推荐主链路：

```text
Idea / Theme
  -> DesignSpec
  -> RecipeGraph
  -> Gameplay Card Instances + Level Recipes
  -> RuntimeSpec
  -> One RuntimeKernel
  -> Evidence Bundle
  -> Agent Repair Loop
  -> Candidate / Certified Release
```

核心原则：

1. **一个权威运行时**：Workbench、Standalone、测试 Host 只能通过 Host Port 差异接入，不能复制玩法执行逻辑。
2. **AI 不直接拥有运行时权威**：Agent 默认仅产生结构化 Patch；L3/L4 变更继续需要明确升级与人工确认。
3. **证据驱动成熟度**：成熟度不是人工标签，而是由 fresh、identity-matched 的自动/人工证据派生。
4. **失败闭环**：验证失败必须路由给拥有该失败类型的部门 Agent，允许在预算内自动修正并重跑最小影响 Gate。
5. **模板不是核心模型**：12 节点修仙只是 Recipe；核心应支持 1/3/5/N 节点和有向图。
6. **先纵向收敛，再横向扩玩法**：暂停继续扩张 Gameplay Card 数量，先完成一条无豁免黄金链路。

## 2. 推荐的数据分层

### 2.1 DesignSpec

只表达“用户想做什么”：

- title / theme / audience / sessionTarget
- progression intent
- ability / character / enemy design catalogs
- RecipeGraph
- gameplay intent

不包含 Gate 报告、运行时内部字段和历史 Patch 执行细节。

### 2.2 RuntimeSpec

只表达“这个版本实际怎样运行”：

- resolved gameplay card / adapter / modifiers / knobs
- resolved assets / audio / runtime version
- seed / patch ids / spec hash
- host-independent runtime payload

RuntimeSpec 是运行时唯一输入。

### 2.3 EvidenceBundle

只表达“为什么这个版本可以发布”：

- build / smoke / browser e2e
- visual / performance / soak
- device verification
- human playtest
- identity hashes
- freshness / stale reasons
- waivers

发布状态由 EvidenceBundle 派生，不允许仅修改卡片 JSON 标签绕过证据。

## 3. 成熟度最佳实践

现有 `production_ready` 继续保留作为兼容字段，但新增派生成熟度模型：

```text
experimental
runtime_supported
runtime_verified
browser_verified
visual_verified
human_playtested
device_verified
release_certified
conditionally_certified
```

规则：

- `release_certified`：所有 hard evidence 齐全、通过、fresh、identity 匹配，且无 waiver。
- `conditionally_certified`：核心自动证据通过，但存在显式 waiver 或缺少真人/真机类证据。
- `production_ready` 在过渡期只代表“legacy catalog 可自动选择”，不能等价为最终发布认证。

## 4. Agent Loop 最小闭环

不要引入新的重型 Agent 框架。复用现有 department ownership、PATCH_ALLOWLIST、gate evaluator 与 stale cascade，增加一个最小 repair orchestrator：

```text
Produce Patch
  -> Apply in sandbox/workspace
  -> Compile RuntimeSpec
  -> Run impacted validators
  -> Classify blockers by owner
  -> Build repair context
  -> Owner Agent proposes next Patch
  -> Apply + rerun impacted validators
  -> pass | retry budget exhausted | authority escalation
```

### 4.1 默认重试预算

- L0/L1：最多 3 次
- L2：最多 2 次
- L3/L4：不自动执行，直接升级人工确认

### 4.2 Failure Ownership

- schema / contract：architecture
- gameplay objective / impossible goal：gameplay
- runtime exception / lifecycle / cleanup：code
- visual overflow / atlas / asset binding：art
- audio missing / cue mismatch：audio
- test evidence / stale / report invalid：qa
- copyright / safety / export policy：compliance
- unresolved cross-domain conflict：director

### 4.3 Targeted validation

修复后只重跑受影响 Gate，最终认证前再跑一次完整 Release Gate。避免每次小 Patch 都执行全部 E2E/Soak。

## 5. RecipeGraph 去固定 12 节点

第一阶段不删除 `nodes[]`，而是在 DesignSpec 增加可选 `recipeGraph`，并提供兼容编译：

```text
legacy nodes[] -> linear RecipeGraph
RecipeGraph -> ordered runtime nodes when graph is linear
```

建议合同：

```json
{
  "schemaVersion": "loreweaver.recipe-graph.v1",
  "entryNodeId": "intro",
  "nodes": [
    {"id": "intro", "kind": "gameplay", "recipeRef": "..."}
  ],
  "edges": [
    {"from": "intro", "to": "boss", "when": "success"}
  ],
  "completionRules": {"type": "reach_any", "nodeIds": ["boss"]},
  "sessionTargetMinutes": 8
}
```

修仙 12 节点应迁移为 `cultivation_journey_12` Recipe，而不是硬编码进 WorldBuilder Agent 核心 prompt。

## 6. 发布路径统一

最终只保留一个 Release Compiler，两种策略：

- **Candidate Export**：允许部分软证据缺失，但必须明确标记不可正式发布。
- **Certified Export**：必须达到 evidence-derived `release_certified`；默认 fail-closed。

旧 `/api/workspaces/{id}/export` 和 `productize/export-standalone.mjs` 暂时兼容，但应逐步共同调用同一 policy/evidence 模块。

## 7. 黄金链路 DoD

在新增 Gameplay Card 前，至少完成一条无豁免黄金链路：

- 1 个主玩法：`survivor_horde`
- 2 个主题皮肤
- 1 个 3-stage vertical slice Recipe
- 完整 RuntimeSpec
- browser E2E
- VLM visual audit
- device FPS / interaction check
- human playtest evidence
- standalone ZIP host E2E
- offline/static server boot
- 修改后 evidence 自动 stale
- 至少一次真实 Gate failure -> Agent repair -> revalidate -> pass

## 8. 实施顺序

### P0-A：成熟度与证据模型

先增加派生 maturity evaluator，不立即删除 legacy `production_ready`。Productize Gate 输出同时提供 legacy allowed 与 certification tier。

### P0-B：Agent Repair Loop 骨架

先实现纯函数：blocker -> owner、retry budget、target validators、repair decision；随后接现有 department agent。

### P0-C：RecipeGraph 合同与 legacy adapter

先增加 schema/normalizer，不改运行时节点执行；确保原 12 节点 Manifest 100% 可继续运行。

### P1：统一 Release Compiler

让 Workspace Export 与 Productize Export 共享 evidence policy、identity 和 release manifest。

### P2：黄金链路实证

停止扩新玩法，补齐真机、人测、VLM、完整 standalone host，并用真实失败验证 Agent Loop。

## 9. 非目标

本轮不做：

- 大规模 UI 重写；
- 新增大量 Gameplay Card；
- 用新的 Agent 框架替换现有部门系统；
- 一次性迁移所有历史 Manifest；
- 自动允许 L3/L4 runtime/core 修改；
- 为追求“更智能”而取消 deterministic gate。

## 10. 验收标准

本轮收敛完成时应满足：

1. `production_ready` 不再被 UI/导出语义误认为最终发布认证；
2. Release Gate 能返回 evidence-derived maturity tier 与缺失证据；
3. Agent repair loop 能针对 blocker 生成 owner/预算/targeted-validation 决策；
4. legacy 12-node Manifest 可无损转换为 RecipeGraph；
5. 新 WorldBuilder 路径不再要求“必须 12 节点修仙”；
6. 完整现有构建与核心 Gate 不回归。
