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
- [x] A5 定义并收紧 `human_playtest` / `device_verification` Evidence schema：正式证据必须带 exact Candidate `specHash + payloadHash + artifact + artifactSha256`，fixture/synthetic/headless/emulated 明确不可满足发布认证。

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
- [x] D4 Certified Export 只允许 evidence-derived `release_certified`；Browser、real-VLM、Human、Device 必须绑定同一 exact Candidate，底层 Promoter 会重新读取/验证证据，不能靠手改 card status、Release Decision 或旧 Candidate Evidence 绕过。
- [x] D5 Candidate Export 在 ZIP 内写入 `RELEASE_STATUS.json`、`UNVERIFIED_CANDIDATE`、missing evidence/waiver 决策；`releaseEligible` 永远为 false。

## P2：黄金链路

- [x] E1 冻结新增 Gameplay Card，黄金主玩法固定为 `survivor_horde`；本阶段只纵向补闭环与证据。
- [x] E2 建立 `survivor_vertical_slice_3`：Setup -> Escalation -> Climax，全部复用 `survivor_horde`，只通过已实现 Modifier/knobs 增压。
- [x] E3 黄金链路复用两套已存在 production Theme Content Pack：wasteland / cyber_pulse；二者共享同一 runtime asset/audio source，不复制玩法代码。
- [ ] E4 Browser/static/offline 子链已完成：统一 Candidate Compiler -> standalone ZIP/static host -> Chromium 三段真实启动 -> Modifier 对齐 -> zero `/api` -> zero console/page/request error，并绑定 `specHash + runtimeVersion + payloadHash + artifactSha256 + screenshotSha256`。真实 VLM 已接入同一 Candidate identity，但 GitHub Actions 当前未配置 `XAI_API_KEY`，因此报告正确为 `unavailable/releaseEligible=false`；只有 `grok/codex` real provider completed 且无 FAIL 才可通过。
- [ ] E5 完成真实设备 FPS / interaction Evidence。工程链路已完成：`productize:evidence` 会重新校验当前 Workspace、Browser Report、Candidate ZIP SHA 与 executable `payloadHash`，只接受 `physicalDevice=true / headless=false / emulated=false` 的观测并按显式 FPS budget 判定；仍缺真实物理设备运行数据，因此本项不打勾。
- [ ] E6 完成真人试玩 Evidence。工程链路已完成：同一 recorder 只接受 `humanObserved=true / fixture=false / synthetic=false` 的真实 session，并要求记录理解耗时、完成情况、失败原因、blocking issue、重玩意愿与修改建议；仍缺真实试玩 session，因此本项不打勾。
- [x] E7 Recipe/Content/Asset/Runtime identity 变化统一 stale：共享自动化 Gate + Workspace human/device + browser + generic/card-scoped VLM + release decision + artifact metadata；Human/Device 正式证据只允许 workspace-local，不再回退 shared reports。
- [x] E8 通过 Agent Repair Loop 自动修复一个真实 `golden_slice_gate` 失败：Climax 缺 `boss_phases` -> gameplay L2 patch -> targeted revalidate -> pass。
- [ ] E9 无 waiver 达到 `release_certified` 并导出 Certified H5；Certified 使用“已验证 Candidate 原地晋升”：Browser + real-VLM + Human + Device 必须绑定同一 executable payload / artifact，VLM 额外绑定 screenshot；晋升只能改变认证 metadata，payloadHash 不得变化。当前仍受 E4 VLM、E5、E6 真实 Evidence 阻塞，不能伪造。

## P3：产品层收敛

- [x] F1 默认用户路径已收敛为：创意 -> 设计 -> 试玩 -> 修改 -> 发布；新增 `CreatorJourneyBar` 与 `CreatorApp`，旧 `App.tsx` 仅保留入口转发，便于回滚。
- [x] F2 Departments / Manifest / VLM / Pipeline / Logs 已移入持久化 `Expert Mode`；简单模式不展示部门或内部 Gate 术语。
- [x] F3 默认首页改为 creator-first：Header 只保留创意输入、生成蓝图、Workspace 与基础设置；发布移动到独立 Publish Step；UI 文案和试玩计数不再固定“修仙 / 12 关 / 6 境界”，节点与成长阶段按当前 Spec 动态显示。Convergence Core + Golden Candidate E2E 已通过。
- [ ] F4 增加“一句话修改 -> 自动验证 -> 最终 Diff”交互。实现约束已确定：不能直接复用旧 `/refine` 的“LLM 后立即覆盖”语义；必须做旧 Spec 快照、受控修改、targeted node-smoke、失败回滚、成功 Diff，并同步 Manifest/Job 状态。

## 当前执行顺序

1. [x] **P0 + P1**：成熟度、Repair Loop、RecipeGraph、统一 Release Compiler/UI、Observed Evidence exact-Candidate 防伪链已闭环。
2. [x] **E1-E3 + E7-E8/B9**：黄金三段 Recipe、双主题复用、完整证据失效、真实 Gate Repair 已通过自动回归。
3. [x] **E4 Browser/static/offline**：exact Candidate Chromium 三段运行与 payload/artifact/screenshot identity 已闭环。
4. [x] **P3 F1-F3**：默认产品壳已变为五步 Creator Flow，工程流水线全部进入 Expert Mode。
5. [ ] **F4**：实现事务式 Creator Revision（自然语言 -> 受控 Diff -> targeted validation -> commit/rollback）。
6. [ ] **E4 VLM**：配置真实 `XAI_API_KEY`（或可用 Codex CLI provider）后，对 exact Candidate climax screenshot 取得 fresh `passed` Evidence；当前 CI 明确为 `unavailable`，不降级。
7. [ ] **E5-E6 真实观测**：工程 recorder / policy / promoter 已完成；下一步仅收集 exact Candidate 的物理设备数据与真人试玩 session，禁止 synthetic/headless/emulated 替代。
8. [ ] **E9**：仅在 Browser + real-VLM + human + device 全部 fresh/matched、无 waiver 后原地晋升 Candidate 为 Certified H5。
