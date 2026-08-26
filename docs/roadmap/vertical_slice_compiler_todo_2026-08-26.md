# LoreWeaver Vertical-Slice Compiler Convergence TODO

> Branch: `feat/vertical-slice-compiler-convergence`
> Plan: `docs/roadmap/vertical_slice_compiler_convergence_plan_2026-08-26.md`
> 约束：先完成黄金链路和验证闭环，再新增 Gameplay Card。

## P0-A：成熟度与 Evidence 模型

- [x] A0 建立最佳实践与迁移方案文档。
- [x] A1 新增 evidence-derived release maturity evaluator；保留 legacy `production_ready` 兼容。
- [x] A2 将 maturity evaluator 接入 `production-export-gate` 输出，明确区分 `legacyProductionReady` 与 `certificationTier`。
- [x] A3 新增 maturity 单测：缺证据、自动证据齐全但无人测/真机、完整认证、waiver、stale/mismatch；并增加 production gate 集成测试。
- [x] A4 导出 UI 不再把旧 `production_ready`/`export-release` 表述为正式认证；旧入口明确降级为 `Candidate H5`。
- [x] A5 定义 `human_playtest` / `device_verification` Evidence schema 与示例报告；fixture 明确不可充当真实发布证据。

## P0-B：Agent Repair Loop

- [x] B1 新增纯函数 `classifyBlockerOwner(blocker)`，统一 schema/gameplay/runtime/art/audio/qa/compliance/director ownership。
- [x] B2 新增 Retry Policy：L0/L1 <= 3，L2 <= 2，L3/L4 自动升级人工。
- [x] B3 新增 blocker -> targeted validators 映射，避免每次修正重跑全量 Gate。
- [x] B4 新增 Repair Decision 数据合同：owner、attempt、budget、allowedPatchLevels、validators、escalationReason。
- [x] B5 新增 `repair_orchestrator.py`，复用现有 `WorldBuilderAgent`、`LEGACY_ROLE`、department allowlist 与 `apply_controlled_patches`，未引入第二套 Agent framework。
- [x] B6 Gate blocker 可形成 repair context，并由负责角色生成候选修改；候选结果会缩减为 ownership 内的 structured patch。
- [x] B7 `run_repair_loop` 支持注入 targeted validator runner；验证失败继续消耗同一 blocker 的 retry budget。
- [x] B8 L3/L4、未知跨域 blocker、预算耗尽、无安全 patch 均 fail-closed 并返回 escalation，不无限循环。
- [x] B9 使用真实 shipped `golden_slice_gate` 完成 fail -> Repair Orchestrator -> controlled L2 patch -> 同一 Gate revalidate -> pass；CI 的 Agent 响应使用确定性替身，Gate/ownership/patch/retry 均为真实生产代码。

## P0-C：RecipeGraph 与去固定 12 节点

- [x] C1 新增 `loreweaver.recipe-graph.v1` schema。
- [x] C2 新增 `legacy nodes[] -> linear RecipeGraph` normalizer，保证旧 Manifest 无损兼容。
- [x] C3 增加 RecipeGraph validator：entry、edge refs、reachability、completion rules、cycle policy。
- [x] C4 将固定“12 节点修仙”迁移为 `cultivation_journey_12` Recipe fixture；明确它是 authoring recipe，不是 core constraint。
- [x] C5 WorldBuilder Agent 改为 recipe-aware：支持 `vertical_slice_3`、`adaptive_linear`、`cultivation_journey_12`，不再全局强制修仙/12 节点；默认仍保持 legacy recipe 兼容。
- [x] C6 保持 RuntimeKernel 第一阶段仍消费 resolved linear runtime nodes，不在本轮重写执行器。
- [x] C7 增加 legacy -> RecipeGraph -> legacy round-trip 回归，确保旧线性节点 payload 无损。

## P1：统一 Release Compiler

- [x] D1 抽取共享 `release-policy.mjs` / Evidence identity；Workspace 级按实际使用到的所有 Gameplay Card 聚合，并以最弱卡成熟度作为整体成熟度。
- [x] D2 Workbench H5 export 与 CLI productize export 均走 `release-compiler.mjs`；原 `/api/workspaces/{id}/export` 仅保留为源码备份，不再承担 release 语义。
- [x] D3 UI 收敛为 Source Backup / Candidate H5 / Certified H5；`release-status` dry-run 展示 certificationTier 与缺失 Evidence，只有 `release_certified` 才启用 Certified 按钮。
- [x] D4 Certified Export 只允许 evidence-derived `release_certified`，并在底层 exporter 再次校验 Release Decision + spec/runtime identity，不能靠手改 card status 或绕过上层入口。
- [x] D5 Candidate Export 在 ZIP 内写入 `RELEASE_STATUS.json`、`UNVERIFIED_CANDIDATE`、missing evidence/waiver 决策；`releaseEligible` 永远为 false。

## P2：黄金链路

- [x] E1 冻结新增 Gameplay Card，黄金主玩法固定为 `survivor_horde`；本阶段只纵向补闭环与证据。
- [x] E2 建立 `survivor_vertical_slice_3`：Setup -> Escalation -> Climax，全部复用 `survivor_horde`，只通过已实现 Modifier/knobs 增压。
- [x] E3 黄金链路复用两套已存在 production Theme Content Pack：wasteland / cyber_pulse；二者共享同一 runtime asset/audio source，不复制玩法代码。
- [ ] E4 完成 browser E2E、VLM、standalone ZIP host E2E、offline/static boot，并把浏览器证据绑定可执行 Payload identity。
- [ ] E5 完成真实设备 FPS / interaction Evidence；禁止用 headless proxy 冒充真机。
- [ ] E6 完成真人试玩 Evidence，至少记录可玩性、理解成本、失败原因和修改建议。
- [ ] E7 修改 Recipe/Asset/Runtime identity 后自动 stale 旧 Evidence；现有 Level Recipe apply 已支持 stale，需扩到黄金 RecipeGraph / release evidence identity。
- [x] E8 通过 Agent Repair Loop 自动修复一个真实 `golden_slice_gate` 失败：Climax 缺 `boss_phases` -> gameplay L2 patch -> targeted revalidate -> pass。
- [ ] E9 无 waiver 达到 `release_certified` 并导出 Certified H5；受 E4/E5/E6 真实 Evidence 阻塞，不能伪造。

## P3：产品层收敛

- [ ] F1 默认用户路径收敛为：创意 -> 设计 -> 试玩 -> 修改 -> 发布。
- [ ] F2 Departments / Manifest / Gate Reports / Patch Trace 放入 Expert Mode。
- [ ] F3 默认首页不再把内部流水线复杂度暴露给普通创作者。
- [ ] F4 增加“一句话修改 -> 自动验证 -> 最终 Diff”交互。

## 当前执行顺序

1. [x] **P0 + P1**：成熟度、Repair Loop、RecipeGraph、统一 Release Compiler/UI 已闭环。
2. [x] **E1-E3 + E8/B9**：黄金 `survivor_horde` 三段 Recipe、双主题复用、真实 Gate Repair 已通过 CI。
3. [ ] **E4**：把 Candidate 包的 browser/VLM/offline 证据绑定 executable payload identity，避免认证另一个未测 payload。
4. [ ] **E7**：黄金 RecipeGraph / asset/runtime identity 改动统一 stale release evidence。
5. [ ] **E5-E6**：收集真机与真人 Evidence。
6. [ ] **E9**：仅在无 waiver 且所有 Evidence fresh/matched 后导出 Certified H5。
