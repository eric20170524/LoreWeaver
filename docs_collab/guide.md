# Codex / Antigravity 通用协作指南

本文是一份可复制到新项目中的双 Agent 协作规约。它不绑定任何具体项目、技术栈或目录结构；首次使用时，只需要把本文中的占位项替换成当前项目事实，并把项目特有的 gate、文档路径和验收标准补到对应章节。

核心原则：所有任务必须先读取仓库现状，再围绕现有架构、既有文档、真实 diff 和可复查证据推进。对话窗口只用于调度和摘要，长期事实写入 `docs_collab/`。

## @guide.md 自动启动协议

`@guide.md` 是给 Agent 的启动指令，不是文件系统级自动触发器。自动化效果来自本文定义的强制启动流程。

当 Agent 看到 `docs_collab/tasklist_goal.md` 并且其中引用 `@guide.md` 时，必须按以下顺序执行：

1. 先读取 `docs_collab/guide.md` 全文，并把本文作为协作规则、状态机、角色边界、gate 和 review 要求的 source of truth。
2. 再读取 `docs_collab/tasklist_goal.md` 的 `Request`、`Acceptance Criteria` 和 `Notes`，只把它当作人类本轮任务入口。
3. 读取现有 `state.md`、`tasks.md`、`design.md`、`feedback.md`、`review_request.md`、`review.md` 中与当前任务有关的内容，并检查 `git status --short`。
4. Codex 先把人类需求转成方案和原子任务；必要时创建或更新 `design.md`、`tasks.md`、`state.md`。
5. 非 L0 实现任务进入 Antigravity 实现与自测；如果 Antigravity 暂时不可用，任务必须停在 `waiting_for_antigravity`，并在交接文档中写清文件、gate 和验收点。
6. Antigravity 完成实现后写 `review_request.md`；Codex 读取实际 diff、证据和 gate 后 review，结论写入 `review.md`。
7. 任务状态、证据、review 结论和交接信息只写入 `tasks.md`、`state.md`、`review_request.md`、`review.md`、`handoff.md`，不要写回 `tasklist_goal.md`。

`tasklist_goal.md` 不承载协作规约、状态机、gate、角色分工、review 结论或执行日志；它只保存当前人类输入，下一轮任务可以直接覆盖。

## 协作目标

Codex 和 Antigravity 的协作目标是稳定推进同一个项目，而不是并行生成互相冲突的方案。

- Codex 默认担任架构维护者、任务拆解者、代码审查者和 gate 解释者。
- Antigravity 默认担任实现工程师、局部重构者和第一轮自测者。
- 人类拥有最终决策权，尤其是高风险架构变更、核心 contract 变更、生产发布和验收结果采信。

如果当前项目使用不同 Agent 名称，可以把 Codex / Antigravity 分别替换为 Reviewer / Implementer，规则不变。

## 执行层协作要求

协作不只停留在 `docs_collab/` 文档层。除 L0 纯文档、任务整理或人工明确授权的紧急修复外，任何会改变代码、contract、构建、运行时行为或交付产物的任务，都必须在执行层体现 Codex 和 Antigravity 的分工。

硬性要求：

- 非 L0 实现任务必须至少包含两个不同角色动作：Codex 负责方案/任务拆解/最终 review，Antigravity 负责实现/局部自测/提交 review request。
- 如果 Codex 在单 Agent 窗口中先做了探索、脚手架或临时代码修改，这些修改只能视为待交接草案；任务不得直接标为 `verified`，必须交给 Antigravity 继续实现、自测或确认可采信。
- 如果 Antigravity 暂时不可用，相关任务必须在 `state.md`、`tasks.md` 或 `handoff.md` 写明 `waiting_for_antigravity`，并列出需要 Antigravity 执行的具体文件、gate 和验收点。
- Antigravity 完成实现后必须写 `review_request.md`；Codex 必须读取实际 diff、gate 结果和 review request 后才能在 `review.md` 给出结论。
- Codex 可以直接完成 L0 文档维护、冲突说明、任务拆解和 review 修文；但只要进入 L1 及以上实现，必须留下 Antigravity 可接手、可复查、可自测的执行交接。
- 高风险 L3/L4 任务不得由单一 Agent 自行完成并自审通过；至少需要 Antigravity 的实现证据、Codex 的 review 证据，以及必要时的人类确认。

执行层协作的最小闭环：

```text
Codex design/tasks -> Antigravity implementation/self-test -> Codex review -> verified or changes_requested
```

如果中途由 Codex 先写了部分代码，闭环必须改为：

```text
Codex draft/partial implementation -> handoff waiting_for_antigravity -> Antigravity adopts or revises -> Codex review
```

## 固定协作目录

所有双 Agent 交接文档都放在 `docs_collab/`。不要把新的协作文档散落到项目根目录、临时聊天记录或多个不一致的目录中。

推荐文件：

- `guide.md`：本指南，只描述协作规则。
- `tasklist_goal.md`：人类写入本轮 `Request`、`Acceptance Criteria` 和 `Notes` 的任务入口；Agent 不把状态、证据或日志写回这里。
- `state.md`：当前协作状态、正在处理的任务、阻塞点。
- `design.md`：Codex 输出或维护的技术方案、架构约束、验收路径。
- `feedback.md`：Antigravity 对方案的可行性评审、风险和修改建议。
- `tasks.md`：原子任务清单和验收标准。
- `handoff.md`：当前 Agent 给另一个 Agent 的交接说明。
- `review_request.md`：实现完成后提交的修改摘要、diff 摘要和本地验证结果。
- `review.md`：审查记录、发现的问题和最终结论。

这些文件是协作的 source of truth。对话窗口只用于调度和摘要，不用于长期保存大段方案、任务清单、代码片段或测试日志。如果某个文件不存在，先在回复或交接中说明将创建哪个文件；如果某一端暂时只能用纯聊天界面，也必须在交接消息里使用同样的字段结构。

## 进入任务前必须读取

每个 Agent 开始工作前，至少读取：

- `docs_collab/guide.md`
- `docs_collab/tasklist_goal.md`（如果存在）
- `docs_collab/state.md`（如果存在）
- `docs_collab/design.md`（如果存在且当前任务涉及方案）
- `docs_collab/feedback.md`（如果存在且当前任务涉及评审回流）
- `docs_collab/tasks.md`（如果存在）
- `docs_collab/review_request.md`（如果当前任务是 review）
- 与当前任务直接相关的项目文档，例如 `docs/architecture/`、`docs/contracts/`、`docs/workflow/`、`README.md`、`CONTRIBUTING.md`
- 与当前任务直接相关的源码、测试、配置和最近 diff

实现任务前还必须检查工作区状态：

```bash
git status --short
```

发现已有未提交改动时，默认认为是人类或另一个 Agent 的工作。不要回滚；如果会影响当前任务，先在交接或回复中标明冲突。

## 角色边界

角色以 artifact ownership 为核心，而不是以头衔为核心。

| 角色 | 默认负责 | 可直接改动 | 需要人工确认 |
| --- | --- | --- | --- |
| Codex | 方案、任务拆解、review、gate 解释、跨模块风险判断 | `docs_collab/`、任务文档、低风险局部修复 | 高风险架构变更、核心 contract 变更、发布策略变更 |
| Antigravity | 单任务实现、局部测试、自测报告 | 当前任务声明范围内的代码与文档 | 越过任务边界、修改 gate 标准、删除用户或其他 Agent 改动 |
| 人类 | 优先级、产品判断、最终合并 | 任意 | 无 |

任务必须声明 owning role、target artifact、patch level、expected invalidation 和 required gate。

## Patch Level 规则

Patch Level 用来约束风险和 review 强度。项目可以扩展定义，但不要降低高风险变更的审查要求。

- L0：文字、说明、注释级改动。通常可直接处理。
- L1：轻量配置、文案、样式、参数或局部工具脚本。需要说明影响面。
- L2：用户可感知行为、业务规则、单模块功能、测试覆盖或非核心数据流。需要确认受影响 gate。
- L3：跨模块路径、运行时加载、adapter、权限、状态管理、持久化、构建/部署链路。必须 review。
- L4：核心 contract、schema、公开 API、数据迁移、导出协议、安全边界、生产发布流程。必须人工确认并做广泛回归。

实现 Agent 不应自行把 L1/L2 任务扩展成 L3/L4。Reviewer 发现 patch level 上浮时，必须打回或请求人工确认。

## 状态机

`tasks.md` 中每个任务使用以下状态之一：

- `todo`：未开始。
- `claimed`：某个 Agent 已领取，必须写明领取者和时间。
- `in_progress`：正在修改。
- `waiting_for_antigravity`：已有方案、草案或部分修改，等待 Antigravity 在执行层接手、实现、自测或确认。
- `needs_review`：实现完成，等待 review。
- `changes_requested`：review 未通过，等待返工。
- `verified`：代码和必要 gate 已通过。
- `blocked`：需要人类决策或外部条件。

`verified` 是强状态，不能只改状态字段。把任务标为 `verified` 前，必须同时满足：

- `requiredGate` 中每个 gate 都有对应的 `verificationEvidence` 记录；未运行的 gate 必须写明原因和替代证据。
- 有机器可复查的 report 时，必须记录 report 路径；没有 report 的命令要记录命令、结果摘要和运行日期。
- `review.md` 必须有对应任务的 review 记录，说明 reviewer 看过哪些证据。
- `state.md` / `handoff.md` 不能与 `tasks.md` 的任务状态冲突。
- 非 L0 实现任务必须有 Antigravity 的 `review_request.md` 或同结构执行反馈；如果没有，只能停在 `waiting_for_antigravity`、`needs_review` 或 `blocked`，不能标为 `verified`。
- 不能因为“实现看起来完成”就标 `verified`；必须先跑完或明确豁免受影响 gate。

任务格式：

```markdown
## TASK-001: 任务名

- status: todo
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `path/to/file-or-module`
- invalidates: `gate:build`, `gate:test`, `gate:e2e`
- requiredGate: `npm run build`, `npm test`
- doneCriteria:
  - ...
- verificationEvidence:
  - gate: `npm run build`
    result: passed
    report: n/a
    runAt: YYYY-MM-DD
    note: one-line terminal/result summary
- residualRisk:
  - ...
```

每次只允许一个 Agent 领取一个 `claimed` / `in_progress` 任务。领取前必须确认没有同一文件或同一模块的进行中任务。

如果任务因为 Codex 先行探索而进入 `waiting_for_antigravity`，Antigravity 接手前必须先读取最新 `handoff.md`、`review_request.md`、`git diff` 和相关文件；接手后再把任务状态改为 `claimed` 或 `in_progress`。

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
6. 不要把完整代码复制到对话框作为 review 输入；Reviewer 应读取实际文件和 diff。

如果发现文件在读取后被别人改过，停止覆盖，先重新读取并合并。

## 标准工作流

### 1. Codex 写方案

Codex 把人类需求转为当前项目方案，不重新设计整个项目。方案写入 `docs_collab/design.md`，不要只输出在对话框里。

`design.md` 必须包含：

- 当前仓库事实。
- 涉及 artifact。
- patch level。
- 推荐任务拆分。
- 需要读取或更新的既有文档。
- 验证命令。
- 未确认假设和需要人类决策的问题。

### 2. Antigravity 读方案并评审

Antigravity 自行读取 `docs_collab/design.md` 和相关源码/文档，输出评审到 `docs_collab/feedback.md`。

`feedback.md` 必须包含：

- 不可行或成本过高之处。
- 漏掉的边界条件。
- 数据结构、接口、运行时或发布风险。
- 建议修改方案。
- 是否允许进入任务拆解。

### 3. Codex 回流反馈并写任务

Codex 读取 `feedback.md`，修订 `design.md`，然后生成或更新 `docs_collab/tasks.md`。

`tasks.md` 必须使用本指南的状态机，且每个任务有明确 done criteria 和 required gate。不要只在对话里输出任务清单。

### 4. Antigravity 本地实现

Antigravity 每次只执行 `tasks.md` 中最前面的可执行任务。

实现前必须确认：

- 任务状态是 `todo`、`changes_requested` 或 `waiting_for_antigravity`。
- 如果任务状态是 `waiting_for_antigravity`，必须先读取 Codex 交接、现有 diff 和风险说明，再决定继续采用、修改或打回方案。
- 没有另一个 Agent 正在改同一文件或同一模块。
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

不要把完整代码块粘进 `review_request.md`；Reviewer 会读取实际文件和 diff。

如果 Antigravity 只是确认 Codex 的临时代码可采信，也必须写明自己实际复查了哪些文件、跑了哪些 gate、是否要求 Codex 修改。不能只写“看起来可以”。

### 5. Codex Review

Codex review 必须先读 `review_request.md`，再看实际 diff、被修改文件和测试结果。不要只依赖实现者摘要。

审查输出按优先级列出：

- P0：会导致项目不可运行、数据损坏、安全事故或严重生产故障。
- P1：主要功能错误、gate 缺失、明显回归。
- P2：边界条件、可维护性、局部体验或测试不足。
- P3：命名、文档、轻微一致性问题。

如果没有问题，明确写“通过”，把 `tasks.md` 中对应任务状态更新为 `verified`，并在 `review.md` 记录本次 review。必要时更新 `state.md` 指向下一个任务。

把任务改成 `verified` 的同一个 patch 必须同步更新 `verificationEvidence`。如果 review 只更新状态、不更新证据，后续 Agent 应视为状态不可信并重新验证。

如果有问题，把任务状态改为 `changes_requested`，并在 `review.md` 给出文件路径、行号、原因和期望修复。返工时必须读取最新 `review.md`。

## 验证与 Gate

根据改动范围选择验证，不要机械全跑，也不要跳过受影响 gate。新项目首次使用时，应把下面的占位命令替换成真实命令。

基础命令示例：

```bash
# JavaScript / TypeScript 项目示例
npm run lint
npm run build
npm test

# Python 项目示例
python -m pytest
python -m ruff check .
python -m mypy .
```

专项 gate 示例：

```bash
# 前端交互或视觉改动
npm run test:e2e
npm run test:visual

# API 或 contract 改动
npm run test:contract
python -m pytest tests/api

# 数据迁移或 schema 改动
npm run migrate:check
python scripts/validate_schema.py

# 打包、导出或发布改动
npm run build
npm run smoke:dist
```

报告位置应在项目内固定，例如：

- `reports/build_latest.json`
- `reports/test_latest.json`
- `reports/e2e_latest.json`
- `reports/visual_latest.json`
- `reports/release_smoke_latest.json`

如果某个 gate 由于环境限制不可运行，必须写清：

- 未运行的命令。
- 失败或跳过原因。
- 替代证据。
- 剩余风险。
- 需要谁补跑。

## 可选专项约束

以下章节按项目类型选择启用。未启用时，不要把它们当成硬 gate。

### 前端 / UI

- 交互改动必须验证关键用户路径，而不仅是 build 通过。
- 视觉审计要记录截图、视口尺寸、运行时间和报告路径。
- 如果截图为空、尺寸异常或没有有效像素，先修截图/渲染链路，不要采信视觉结论。
- 响应式、无障碍、文本溢出、加载/错误/空状态应纳入 done criteria。

### 后端 / API

- API contract 改动必须更新 schema、客户端调用、测试和迁移说明。
- 权限、认证、账务、数据删除、外部 webhook 属于高风险路径，默认 L3/L4。
- review 时必须检查错误处理、幂等性、日志、回滚路径和兼容性。

### 数据 / Schema

- schema 或迁移任务必须说明 forward / backward compatibility。
- destructive migration 必须人工确认。
- 验证证据应包含 migration dry-run、fixture 或回滚策略。

### 资产 / 内容流水线

- metadata 只能证明项目知道需要哪些资产或内容；runtime 使用证据必须单独验证。
- 生成或接入的图片、音频、文案、数据表必须有 provenance 或来源说明。
- runtime lookup、fallback、缺失资源提示和 loaded count 应可复查。
- 不能把占位资产、空画面、历史截图或静默 fallback 当作最终验收通过。

### 发布 / 交付

- 发布相关任务必须记录 artifact 路径、版本号、构建命令、smoke 结果和已知风险。
- 如果产物可离线运行，应验证解包、静态服务或目标平台启动。
- 发布文案、许可证、隐私、安全和合规检查应作为单独 gate，而不是藏在总结里。

## 禁止事项

- 不要把 `docs_collab/guide.md` 当作任务状态文件反复追加日志。
- 不要在未读取现有架构文档的情况下重写技术栈。
- 不要用 `[技术方案]`、`[任务清单]`、`[提交的代码]` 这类手动粘贴占位符作为默认协作方式；默认读写 `docs_collab/` 文件。
- 不要在 review 请求里粘贴完整代码；提交修改文件列表、diff 摘要和命令结果。
- 不要为了通过 review 修改 gate 标准。
- 不要删除或回滚自己无法解释来源的改动。
- 不要一次实现多个未领取任务。
- 不要把 mock screenshot、空输出、历史 report 或未复现的人工印象当作真实验收通过。
- 不要把项目特有名称、客户数据、密钥、未授权 IP 或内部路径写入可外发模板。

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
3. 如果有 `waiting_for_antigravity`，优先提醒或交接给 Antigravity 执行层接手，不直接由 Codex 标为完成。
4. 如果没有待 review 或待 Antigravity 接手任务，选择最前面的 `todo` 任务并写清执行计划。
5. 如果状态文件缺失，先基于当前人类目标创建最小 `state.md` / `tasks.md` 草案，再等人类确认或继续执行低风险 L0/L1 文档任务。
