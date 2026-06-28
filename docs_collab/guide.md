# LoreWeaver Codex / Antigravity 协作指南

本文是 LoreWeaver 专用的本地双 Agent 协作规约。它不是通用 Prompt 模板；所有任务必须先读取仓库现状，再围绕现有架构、patch/revision 流程、runtime gates 和视觉审计限制推进。

## 协作目标

Codex 和 Antigravity 的协作目标是稳定推进 LoreWeaver 工作台，而不是并行生成互相冲突的方案。

- Codex 默认担任架构维护者、任务拆解者、代码审查者和 gate 解释者。
- Antigravity 默认担任实现工程师、局部重构者和第一轮自测者。
- 人类拥有最终决策权，尤其是 L3/L4 代码结构变更、核心 contract 变更、导出合规和视觉审计结果采信。

## 固定协作目录

所有双 Agent 交接文档都放在 `LoreWeaver/docs_collab/`。不要把新的协作文档散落到 `docs/`、`workflow/` 或项目根目录。

推荐文件：

- `guide.md`：本指南，只描述协作规则。
- `state.md`：当前协作状态、正在处理的任务、阻塞点。
- `design.md`：Codex 输出或维护的技术方案、架构约束、验收路径。
- `feedback.md`：Antigravity 对方案的可行性评审、风险和修改建议。
- `tasks.md`：原子任务清单和验收标准。
- `handoff.md`：当前 Agent 给另一个 Agent 的交接说明。
- `review_request.md`：Antigravity 完成实现后提交的修改摘要、diff 摘要和本地验证结果。
- `review.md`：Codex 对 Antigravity 修改的审查记录。

这些文件是协作的 source of truth。对话窗口只用于调度和摘要，不用于长期保存大段方案、任务清单、代码片段或测试日志。如果某个文件不存在，先在回复中说明将创建哪个文件；如果某一端暂时只能用纯聊天界面，也必须在交接消息里使用同样的字段结构。

## 进入任务前必须读取

每个 Agent 开始工作前，至少读取：

- `LoreWeaver/docs_collab/guide.md`
- `LoreWeaver/docs_collab/state.md`（如果存在）
- `LoreWeaver/docs_collab/design.md`（如果存在且当前任务涉及方案）
- `LoreWeaver/docs_collab/feedback.md`（如果存在且当前任务涉及评审回流）
- `LoreWeaver/docs_collab/tasks.md`（如果存在）
- `LoreWeaver/docs_collab/review_request.md`（如果当前任务是 review）
- `LoreWeaver/docs/workflow/agent_roles_artifact_ownership.md`
- `LoreWeaver/docs/workflow/patch_revision_workflow.md`
- 与当前任务直接相关的 `docs/architecture/`、`docs/gameplay/`、`docs/contracts/` 或 `workflow/templates/` 文件

实现任务前还必须检查工作区状态：

```bash
git status --short
```

发现已有未提交改动时，默认认为是人类或另一个 Agent 的工作。不要回滚；如果会影响当前任务，先在交接或回复中标明冲突。

## 角色边界

角色以 artifact ownership 为核心，而不是以头衔为核心。

| 角色 | 默认负责 | 可直接改动 | 需要人工确认 |
| --- | --- | --- | --- |
| Codex | 方案、任务拆解、review、gate 解释、跨模块风险判断 | `docs_collab/`、任务文档、局部修复 | L3/L4 结构性变更、核心 contract 变更 |
| Antigravity | 单任务实现、局部测试、自测报告 | 当前任务声明范围内的代码与文档 | 越过任务边界、修改 gate 标准、删除用户改动 |
| 人类 | 优先级、产品判断、最终合并 | 任意 | 无 |

任务必须声明 owning role、target artifact、patch level、expected invalidation 和 required gate。

## Patch Level 规则

沿用 `LoreWeaver/docs/workflow/patch_revision_workflow.md`：

- L0：文字、说明、注释级改动。通常可直接处理。
- L1：数值 knob、轻量配置。需要说明影响面。
- L2：gameplay card、modifier composition、manifest/workbench 行为。需要确认 gate。
- L3：adapter 实现、runtime loader、工作台核心路径。必须人工或 Codex review。
- L4：core/runtime contract、schema、导出协议。必须人工确认并做广泛回归。

Antigravity 不应自行把 L1/L2 任务扩展成 L3/L4。Codex reviewer 发现 patch level 上浮时，必须打回或请求人工确认。

## 状态机

`tasks.md` 中每个任务使用以下状态之一：

- `todo`：未开始。
- `claimed`：某个 Agent 已领取，必须写明领取者和时间。
- `in_progress`：正在修改。
- `needs_review`：实现完成，等待 review。
- `changes_requested`：review 未通过，等待返工。
- `verified`：代码和必要 gate 已通过。
- `blocked`：需要人类决策或外部条件。

任务格式：

```markdown
## LW-001: 任务名

- status: todo
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `src/...`
- invalidates: `gate:build`, `gate:e2e`
- requiredGate: `npm run build`, `npm run lint`
- doneCriteria:
  - ...
```

每次只允许一个 Agent 领取一个 `claimed` / `in_progress` 任务。领取前必须确认没有同一文件的进行中任务。

## 文件写入与交接协议

为了避免两个 Agent 同时覆盖同一个文档：

1. 写入前先重新读取目标文件。
2. 写入时只改自己负责的章节或当前任务块。
3. 实现完成后优先写 `review_request.md`，而不是在对话框粘贴大段代码。
4. 交接时在 `handoff.md` 或回复中列出：
   - changed files
   - git diff summary
   - commands run
   - gates passed / failed
   - known risks
   - next recommended action
5. 不要把大段模型对话原文粘进长期文档；只保留决策、任务、结果。
6. 不要把完整代码复制到对话框作为 review 输入；Codex 应读取实际文件和 diff。

如果发现文件在读取后被别人改过，停止覆盖，先重新读取并合并。

## Agentic 标准工作流

### 1. Codex 写方案

Codex 把人类需求转为 LoreWeaver 方案，不重新设计整个项目。方案写入 `docs_collab/design.md`，不要只输出在对话框里。

`design.md` 必须包含：

- 当前仓库事实。
- 涉及 artifact。
- patch level。
- 推荐任务拆分。
- 需要读取或更新的既有文档。
- 验证命令。

### 2. Antigravity 读方案并评审

Antigravity 自行读取 `docs_collab/design.md` 和相关源码/文档，输出评审到 `docs_collab/feedback.md`。

`feedback.md` 必须包含：

- 不可行或成本过高之处。
- 漏掉的边界条件。
- 数据结构、接口或 runtime contract 风险。
- 建议修改方案。
- 是否允许进入任务拆解。

### 3. Codex 回流反馈并写任务

Codex 读取 `feedback.md`，修订 `design.md`，然后生成或更新 `docs_collab/tasks.md`。

`tasks.md` 必须使用本指南的状态机，且每个任务有明确 done criteria 和 required gate。不要只在对话里输出任务清单。

### 4. Antigravity 本地实现

Antigravity 每次只执行 `tasks.md` 中最前面的可执行任务。

实现前必须确认：

- 任务状态是 `todo` 或 `changes_requested`。
- 没有另一个 Agent 正在改同一文件。
- 任务的 patch level 没有被实现方案扩大。

Antigravity 应直接修改工作区实际文件，并在提交 review 前运行必要的本地命令。实现后写 `docs_collab/review_request.md`，内容包括：

- task id。
- changed files。
- `git diff --stat` 或等价 diff 摘要。
- 关键实现说明。
- commands run。
- terminal result summary。
- 未跑的 gate 及原因。
- known risks。

不要把完整代码块粘进 `review_request.md`；Codex reviewer 会读取实际文件和 diff。

### 5. Codex Review

Codex review 必须先读 `review_request.md`，再看实际 diff、被修改文件和测试结果。不要只依赖 Antigravity 摘要。

审查输出按优先级列出：

- P0：会导致项目不可运行、数据损坏、严重错误。
- P1：主要功能错误、gate 缺失、明显回归。
- P2：边界条件、可维护性、局部体验问题。
- P3：命名、文档、轻微一致性问题。

如果没有问题，明确写“通过”，把 `tasks.md` 中对应任务状态更新为 `verified`，并在 `review.md` 记录本次 review。必要时更新 `state.md` 指向下一个任务。

如果有问题，把任务状态改为 `changes_requested`，并在 `review.md` 给出文件路径、行号、原因和期望修复。Antigravity 返工时必须读取最新 `review.md`。

## LoreWeaver 必跑验证

根据改动范围选择验证，不要机械全跑，也不要跳过受影响 gate。

基础命令：

```bash
cd LoreWeaver
npm run lint
npm run build
npm run check:runtime-feature-pack
```

综合 gate：

```bash
cd LoreWeaver
node workflow/scripts/run_build_gate.mjs
```

专项脚本：

```bash
cd LoreWeaver
node workflow/scripts/check_scene_hygiene.mjs
node workflow/scripts/content_safety_scan.mjs
python3 workflow/scripts/run_e2e_test.py --game loreweaver
python3 workflow/scripts/run_e2e_test.py --game survivor_horde
```

报告位置：

- `LoreWeaver/workflow/reports/build_gate_latest.json`
- `LoreWeaver/workflow/reports/runtime_e2e_loreweaver_latest.json`
- `LoreWeaver/workflow/reports/runtime_e2e_survivor_horde_latest.json`
- `LoreWeaver/workflow/reports/scene_hygiene_latest.json`
- `LoreWeaver/workflow/reports/runtime_feature_pack_latest.json`
- `LoreWeaver/workflow/reports/content_safety_scan_latest.json`
- `LoreWeaver/workflow/reports/visual_audit_latest.json`

## 视觉审计注意事项

视觉审计不是稳定的默认通过条件。

- `LOREWEAVER_ENABLE_CODEX_AUDIT=0` 或未设置时，只运行 deterministic checks；Codex VLM 结果会是 `available_disabled` 或 `unavailable`。
- `LOREWEAVER_ENABLE_CODEX_AUDIT=1` 时，后端会调用 Codex CLI 做视觉检查，但仍可能超时或失败。
- 最近的 `visual_audit_latest.json` 可能记录历史失败，不代表当前代码必然失败；review 时要看 `createdAt` 和本次命令输出。
- 如果 screenshot 是 `1x1`、极小 PNG、`hasMeaningfulPixels=false`，先修截图/渲染链路，不要采信 VLM 视觉判断。
- VLM 建议只能生成 proposed patches。L1/L2 可进入 workbench patch flow；L3/L4 只能作为人工审查建议。

## 禁止事项

- 不要把 `docs_collab/guide.md` 当作任务状态文件反复追加日志。
- 不要在未读取现有架构文档的情况下重写技术栈。
- 不要用 `[技术方案]`、`[任务清单]`、`[Antigravity提交的代码]` 这类手动粘贴占位符作为默认协作方式；默认读写 `docs_collab/` 文件。
- 不要在 review 请求里粘贴完整代码；提交修改文件列表、diff 摘要和命令结果。
- 不要为了通过 review 修改 gate 标准。
- 不要删除或回滚自己无法解释来源的改动。
- 不要一次实现多个未领取任务。
- 不要把 mock screenshot、空 canvas 或历史 report 当作真实验收通过。
- 不要把具体 IP / 同人示例重新引入 export surface，除非人类明确要求并完成合规处理。

## 交接模板

```markdown
## Handoff

- agent:
- task:
- status:
- patchLevel:
- changedFiles:
- commandsRun:
- gates:
- risks:
- nextAction:
```

## Review Request 模板

```markdown
## Review Request

- agent: Antigravity
- task:
- status: needs_review
- patchLevel:
- changedFiles:
- diffSummary:
- implementationNotes:
- commandsRun:
- gates:
- skippedGates:
- knownRisks:
- reviewer: Codex
```

## Review 模板

```markdown
## Review

- task:
- verdict: pass | changes_requested | blocked
- filesReviewed:
- commandsChecked:

### Findings

- P1 `path:line` 问题描述与期望修复

### Notes

- ...
```

## 默认下一步

当人类只说“继续”时：

1. Codex 读取 `state.md` 和 `tasks.md`。
2. 如果有 `needs_review`，先 review。
3. 如果没有待 review 任务，选择最前面的 `todo` 任务并写清执行计划。
4. 如果状态文件缺失，先基于当前人类目标创建最小 `state.md` / `tasks.md` 草案，再等人类确认或继续执行低风险 L0/L1 文档任务。
