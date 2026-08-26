# LoreWeaver Vertical-Slice Compiler Convergence TODO

> Branch: `feat/vertical-slice-compiler-convergence`
> Plan: `docs/roadmap/vertical_slice_compiler_convergence_plan_2026-08-26.md`
> 约束：先完成黄金链路和验证闭环，再新增 Gameplay Card。

## P0-A：成熟度与 Evidence 模型

- [x] A0 建立最佳实践与迁移方案文档。
- [x] A1 新增 evidence-derived release maturity evaluator；保留 legacy `production_ready` 兼容。
- [x] A2 将 maturity evaluator 接入 `production-export-gate` 输出，明确区分 `legacyProductionReady` 与 `certificationTier`。
- [x] A3 新增 maturity 单测：缺证据、自动证据齐全但无人测/真机、完整认证、waiver、stale/mismatch；并增加 production gate 集成测试。
- [ ] A4 在发布/导出 UI 中禁止把 legacy `production_ready` 展示为“正式认证”。
- [ ] A5 定义 `human_playtest` / `device_verification` Evidence schema 与示例报告。

## P0-B：Agent Repair Loop

- [x] B1 新增纯函数 `classifyBlockerOwner(blocker)`，统一 schema/gameplay/runtime/art/audio/qa/compliance/director ownership。
- [x] B2 新增 Retry Policy：L0/L1 <= 3，L2 <= 2，L3/L4 自动升级人工。
- [x] B3 新增 blocker -> targeted validators 映射，避免每次修正重跑全量 Gate。
- [x] B4 新增 Repair Decision 数据合同：owner、attempt、budget、allowedPatchLevels、validators、escalationReason。
- [ ] B5 将 Repair Decision 接入现有 department agent，不引入第二套 Agent framework。
- [ ] B6 Gate 失败后自动形成 repair context，并触发负责部门生成 structured patch。
- [ ] B7 Patch 后重跑 targeted validators；通过后继续流程，失败则在预算内下一轮。
- [ ] B8 达到预算或需要 L3/L4 时 fail-closed + HITL，不无限循环。
- [ ] B9 至少用一个真实 Gate failure 做 E2E：fail -> repair -> revalidate -> pass。

## P0-C：RecipeGraph 与去固定 12 节点

- [x] C1 新增 `loreweaver.recipe-graph.v1` schema。
- [x] C2 新增 `legacy nodes[] -> linear RecipeGraph` normalizer，保证旧 Manifest 无损兼容。
- [x] C3 增加 RecipeGraph validator：entry、edge refs、reachability、completion rules、cycle policy。
- [ ] C4 将固定“12 节点修仙”迁移为 `cultivation_journey_12` Recipe 示例。
- [ ] C5 修改 WorldBuilder Agent：不再强制 12 节点/修仙；根据 recipe intent 生成可变结构。
- [x] C6 保持 RuntimeKernel 第一阶段仍消费 resolved linear runtime nodes，不在本轮重写执行器。
- [x] C7 增加 legacy -> RecipeGraph -> legacy round-trip 回归，确保旧线性节点 payload 无损。

## P1：统一 Release Compiler

- [ ] D1 抽取共享 Release Policy / Evidence identity 模块。
- [ ] D2 普通 Workspace export 与 Productize standalone export 共享同一 policy。
- [ ] D3 UI 收敛为 Candidate Export / Certified Export 两种产品语义。
- [ ] D4 Certified Export 默认只允许 `release_certified`，不能靠手改 card status 绕过。
- [ ] D5 Candidate Export 清晰写入 missing evidence / waivers / non-release marker。

## P2：黄金链路

- [ ] E1 冻结新增 Gameplay Card，选 `survivor_horde` 为黄金主玩法。
- [ ] E2 建立 3-stage vertical-slice Recipe。
- [ ] E3 准备两套完整 Theme Content Pack。
- [ ] E4 完成 browser E2E、VLM、standalone ZIP host E2E、offline/static boot。
- [ ] E5 完成真机 FPS / interaction Evidence。
- [ ] E6 完成真人试玩 Evidence，至少记录可玩性、理解成本、失败原因和修改建议。
- [ ] E7 修改 Recipe/Asset/Runtime identity 后自动 stale 旧 Evidence。
- [ ] E8 通过 Agent Repair Loop 自动修复至少一个真实失败。
- [ ] E9 无 waiver 达到 `release_certified` 并导出 Certified H5。

## P3：产品层收敛

- [ ] F1 默认用户路径收敛为：创意 -> 设计 -> 试玩 -> 修改 -> 发布。
- [ ] F2 Departments / Manifest / Gate Reports / Patch Trace 放入 Expert Mode。
- [ ] F3 默认首页不再把内部流水线复杂度暴露给普通创作者。
- [ ] F4 增加“一句话修改 -> 自动验证 -> 最终 Diff”交互。

## 当前执行顺序

1. [x] **A1-A3**：建立不破坏兼容的 evidence-derived maturity。
2. [x] **B1-B4**：实现纯函数 Repair Loop 骨架并测试。
3. [x] **C1-C3/C6-C7**：实现 RecipeGraph 合同、legacy normalizer 与 round-trip 回归。
4. [ ] **A5 + B5-B8**：定义真人/真机 evidence 并把 Repair Decision 接入现有 department pipeline。
5. [ ] **C4-C5**：把修仙 12 节点迁移为 Recipe，并解除 WorldBuilder 固定结构。
6. [ ] 运行现有 build / productize gate 回归，再接 UI 和发布路径。
