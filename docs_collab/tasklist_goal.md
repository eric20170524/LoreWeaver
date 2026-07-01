# 通用项目达标任务清单

本文是目标级索引模板，用于把“新项目要做到什么程度才算可交付”拆成可协作、可验证、可 review 的任务链。它不绑定任何具体项目；复制到新项目后，请先替换占位信息，再把具体任务沉淀到 `docs_collab/tasks.md`。

具体状态、证据和 review 以 `tasks.md`、`review.md`、`state.md` 为准。本文只维护目标、里程碑和任务映射，不承载实时日志。

## 使用方式

本文分成三类区域：

- `[必填]`：用户在新项目或新需求开始前必须填写。Agent 会优先读取这些内容来理解目标。
- `[协作维护]`：由 Codex / Antigravity 在推进任务时更新。用户可以看，但通常不需要手动改。
- `[固定模板]`：可直接保留，不需要为每个项目改写。只有项目流程明显不同时才修改。

最小使用步骤：

1. 填写 `[必填] 项目信息`。
2. 填写 `[必填] 本轮新需求 / 新任务输入区`。
3. 填写或确认 `[必填] 达标定义`。
4. 让 Agent 先按 `docs_collab/guide.md` 完成协作前置流程，再基于这些内容生成或更新 `docs_collab/design.md`、`docs_collab/feedback.md`、`docs_collab/tasks.md` 和 `docs_collab/state.md`。

实现前强制要求：

- 任何 Agent 不得只读取本文就直接开始改代码；必须先读取 `docs_collab/guide.md`，并按其中的角色边界、状态机、Patch Level、领取和交接协议执行。
- 本项目要求执行层协作，而不只是文档层协作；非 L0 实现任务必须有 Codex 与 Antigravity 的实际分工和交接证据。
- 进入实现前，必须已有对应的 `docs_collab/tasks.md` 任务块，且任务至少包含 owner、reviewer、patchLevel、targetArtifact、doneCriteria、requiredGate。
- 实现任务必须先把对应任务更新为 `claimed` 或 `in_progress`，确认没有同文件或同模块的进行中任务，再修改实际代码。
- 如果 Codex 先行写了草案、脚手架、临时代码或部分实现，该任务不得由 Codex 单方标为完成；必须在 `tasks.md` / `state.md` / `handoff.md` 标记 `waiting_for_antigravity`，等待 Antigravity 接手实现、自测或确认。
- 实现完成后必须写入 `docs_collab/review_request.md` 或同结构交接摘要；Reviewer 必须读取实际 diff、证据和 gate 结果后，才能在 `docs_collab/review.md` 中记录结论并把任务标为 `verified`。
- L1 及以上任务标为 `verified` 前，必须同时具备 Antigravity 的执行反馈或 review request、Codex 的 review 记录、受影响 gate 证据；缺任何一项都只能停在 `waiting_for_antigravity`、`needs_review` 或 `blocked`。
- 如果 `guide.md`、`tasks.md`、`state.md` 或本文件之间存在冲突，以 `guide.md` 的协作流程和 `tasks.md` 的当前任务状态为准，先修正文档冲突再继续实现。


通常不需要修改：

- `推荐任务链`
- `tasks.md 初始任务模板`
- `注意`

## [必填] 项目信息

- projectName: `[ProjectName]`
- projectRoot: `[path/to/project]`
- primaryGoal: `[一句话说明项目最终要交付什么]`
- targetUsers: `[目标用户或使用场景]`
- deliveryForm: `[web app / CLI / API / desktop app / library / document / other]`
- primaryTechStack: `[主要技术栈]`
- owner: `[人类负责人]`
- collaborationDir: `docs_collab/`

填写说明：这一节描述“这是哪个项目”。如果只是给同一项目追加新需求，也建议检查这些字段是否仍准确。

## [必填] 本轮新需求 / 新任务输入区

把用户的新需求写在这里。不要把需求只留在聊天窗口里；Agent 后续拆任务、review 和交接都以本节为入口。

- requestTitle: `合并 MomentWeaver 与 video-background-board 的分层视频编辑渲染流程`
- requestBackground: `目标是合并 MomentWeaver 与 video-background-board，但两者不应简单互相拷贝，而应按职责分层集成：MomentWeaver 承担内容规划与最终渲染后端，video-background-board 的时间轴和舞台编辑能力承担可视编辑前端，最终输出统一落到后端 MP4 渲染和发布准备流程。`
- requestedChange:
  - `梳理 MomentWeaver 与 video-background-board 的能力边界，形成分层合并方案，而不是把两个项目代码直接互相复制。`
  - `将 MomentWeaver 定位为内容规划、渲染编排、后端 MP4 生成和发布准备流程的核心后端。`
  - `将 video-background-board 的时间轴编辑和舞台编辑能力定位为可视编辑前端，并对接后端内容规划与渲染流程。`
  - `建立前端编辑结果到后端渲染任务的统一数据 contract，确保最终输出进入 MomentWeaver 的 MP4 渲染和发布准备链路。`
- acceptanceCriteria:
  - `已有合并设计明确写清前端、后端、数据 contract、渲染流程和发布准备流程的职责边界。`
  - `用户可通过 video-background-board 风格的时间轴与舞台编辑体验完成可视化编辑，并把编辑结果提交给后端。`
  - `后端使用 MomentWeaver 的内容规划与最终渲染能力生成 MP4，而不是依赖前端直接导出最终视频。`
  - `输出产物统一进入后端 MP4 渲染和发布准备流程，包含可复查的任务状态、产物路径和失败反馈。`
- affectedAreas:
  - `MomentWeaver 内容规划、渲染编排、MP4 生成与发布准备模块`
  - `video-background-board 时间轴编辑、舞台编辑与前端交互模块`
  - `前后端编辑数据 contract、渲染任务 API、产物状态与错误反馈`
  - `docs_collab/design.md、docs_collab/tasks.md、docs_collab/state.md 等协作文档`
- constraints:
  - `不得采用简单互相拷贝代码的方式合并；必须先明确分层架构和模块边界。`
  - `最终 MP4 生成与发布准备应统一由后端流程承担。`
  - `前端重点保留并承接时间轴和舞台编辑体验，不应扩散成完整渲染后端。`
  - `执行层必须由 Codex 与 Antigravity 一起推进；非文档实现不得由 Codex 单人闭环并自审通过。`
- outOfScope:
  - `none`
- priority: `high`
- deadline: `none`
- requesterNotes:
  - `合并目标是能力分层与流程统一，不是两个项目互相覆盖。`
  - `后续拆任务时应优先建立架构设计、数据 contract 和端到端编辑到 MP4 输出闭环。`

填写说明：本节是最重要的用户输入区。占位符应替换为真实需求；不适用的字段写 `none`，不要留空。

## [必填] 达标定义

当前项目达到可交付状态时，至少应满足：

- 核心用户路径可运行，并有自动或手动复查证据。
- 项目结构、关键 contract、运行方式和限制已写入文档。
- 基础 gate 通过，例如 build、lint、unit test、smoke test。
- 所有高风险变更经过 review，且结论记录在 `docs_collab/review.md`。
- `docs_collab/tasks.md` 中本轮目标相关任务均为 `verified` 或明确 `blocked`。
- 未完成项、已知风险、后续计划和人工决策点清晰可见。

填写说明：这一节定义“怎样才算完成”。默认条目可以保留；如果本项目有特殊验收条件，请在下面追加。

项目特有验收条件：

- `前端编辑产物必须能通过统一 contract 触发 MomentWeaver 后端 MP4 渲染任务。`
- `最终交付链路必须包含从可视编辑、提交渲染、生成 MP4 到发布准备状态记录的端到端证据。`
- `非 L0 实现任务必须留下 Antigravity 的实现、自测、确认或反馈记录，并由 Codex review 后才能视为达标。`
- `如果当前只有 Codex 已做部分实现，任务状态必须明确等待 Antigravity 接手，不能直接标为 verified。`

## [协作维护] 与 `docs_collab/tasks.md` 的任务关联

本节由 Agent 在拆分任务后维护。用户通常只需要确认目标项是否完整，不需要手动更新状态。

| 目标项 | 对应任务 | 当前状态 |
| --- | --- | --- |
| 仓库事实盘点与 gate 基线 | `TASK-001` | verified |
| 核心用户路径或核心能力闭环 | `TASK-002` | verified |
| 数据 / contract / 配置一致性 | `TASK-003` | verified |
| 自动化 smoke 或回归矩阵 | `TASK-004` | verified |
| 打包、导出、部署或交付形态 | `TASK-005` | verified |
| 文档、合规和交接材料 | `TASK-006` | verified |

## 推荐任务链

以下是通用拆解思路。通常不需要改；Agent 会根据 `[必填] 本轮新需求 / 新任务输入区` 和仓库事实选择其中相关部分。

### 1. 定义交付验收口径

- 明确“可交付”的项目版本定义，例如功能范围、目标平台、支持环境、性能底线和不做事项。
- 写清用户从启动到完成核心目标的 happy path。
- 记录必须通过的基础 gate 和可接受的人工验证方式。
- 把不可量化的目标改写成可检查的 done criteria。
- 关联任务：`TASK-001`。

### 2. 盘点当前仓库事实

- 读取 README、架构文档、配置文件、测试脚本和核心入口。
- 确认项目真实启动方式、构建方式、测试方式和产物位置。
- 标出已有功能、缺失功能、疑似坏掉的路径和历史遗留风险。
- 记录未提交改动，避免覆盖人类或其他 Agent 的工作。
- 关联任务：`TASK-001`。

### 3. 打通核心能力闭环

- 找到项目最重要的一条端到端路径，优先让它真实可用。
- 核心闭环必须包含输入、处理、状态变化、用户反馈和结果持久化或交付。
- 不要只证明页面能打开、命令能启动或接口能返回 200；必须证明目标行为发生。
- 如果发现核心路径被 mock、fallback 或占位逻辑掩盖，应拆成单独修复任务。
- 关联任务：`TASK-002`。

### 4. 对齐数据、contract 和配置

- 检查 schema、API、配置、manifest、环境变量、权限和运行时读取路径是否一致。
- 修改 contract 时同步更新调用方、测试、文档和迁移说明。
- 对高风险数据变更记录兼容性、回滚策略和人工确认点。
- 如果项目依赖外部服务，记录本地替代方案和不可离线验证的风险。
- 关联任务：`TASK-003`。

### 5. 建立自动化验证矩阵

- 每个核心模块至少有一个可复查 gate。
- 每条关键用户路径至少有 smoke test、脚本验证、截图证据或明确手动步骤。
- 把 report 输出到稳定路径，便于 review 时复查。
- 未运行的 gate 必须记录原因、替代证据和剩余风险。
- 关联任务：`TASK-004`。

### 6. 修正交付形态

- 明确最终产物是源码包、构建目录、静态站点、容器镜像、桌面包、API 服务、文档还是其他形式。
- 验证产物能在目标环境启动，而不是只在开发环境运行。
- 发布前检查版本号、构建参数、环境变量、许可证、密钥泄漏和必要文档。
- 若需要部署或导出，增加 smoke test：启动产物、进入核心路径、完成一次关键操作。
- 关联任务：`TASK-005`。

### 7. 完善体验、性能和可维护性

- 检查错误处理、空状态、加载状态、日志、可观测性和边界输入。
- 对前端项目检查响应式、文本溢出、可访问性和视觉稳定性。
- 对后端项目检查幂等性、超时、重试、权限和数据一致性。
- 对库或 CLI 检查 API 友好度、错误信息、示例和兼容性。
- 关联任务：可拆为 `TASK-002`、`TASK-004` 或新增后续任务。

### 8. 整理文档与交接

- 更新 README 或使用说明，确保新人能启动、测试和理解核心限制。
- 在 `docs_collab/state.md` 写清当前状态、下个推荐任务和阻塞点。
- 在 `docs_collab/review.md` 记录已完成任务的 review 结论。
- 在 `docs_collab/handoff.md` 留下最后交接：changed files、commands run、known risks、next action。
- 关联任务：`TASK-006`。

## `tasks.md` 初始任务模板

复制以下内容到 `docs_collab/tasks.md` 后，再按真实项目修改。

```markdown
# Task List

## TASK-001: 建立仓库事实与 gate 基线

- status: todo
- owner: Codex
- reviewer: Human
- patchLevel: L0
- targetArtifact: `docs_collab/state.md`, `docs_collab/design.md`
- invalidates: none
- requiredGate: `git status --short`, `[project build/test discovery command]`
- doneCriteria:
  - 已记录项目入口、启动方式、构建方式和测试方式。
  - 已列出当前可用 gate、失败 gate 和不可运行原因。
  - 已标出本轮目标范围和不做事项。
- verificationEvidence:
  - gate:
    result:
    report:
    runAt:
    note:
- residualRisk:
  - 待补充。

## TASK-002: 打通核心用户路径

- status: todo
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `[core module / page / service / workflow]`
- invalidates: `gate:build`, `gate:smoke`
- requiredGate: `[project build command]`, `[project smoke command]`
- doneCriteria:
  - 用户或调用方可以完成一条核心路径。
  - 核心状态变化、结果反馈和错误路径可观察。
  - 没有被 mock、占位或静默 fallback 掩盖。
- verificationEvidence:
  - gate:
    result:
    report:
    runAt:
    note:
- residualRisk:
  - 待补充。

## TASK-003: 对齐数据、contract 和配置

- status: todo
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `[schema / config / API / manifest]`
- invalidates: `gate:test`, `gate:contract`
- requiredGate: `[contract or schema validation command]`
- doneCriteria:
  - contract、调用方、测试和文档一致。
  - 高风险变更已有兼容性或迁移说明。
  - 配置缺失时有明确错误或 fallback 策略。
- verificationEvidence:
  - gate:
    result:
    report:
    runAt:
    note:
- residualRisk:
  - 待补充。

## TASK-004: 建立自动化 smoke 或回归矩阵

- status: todo
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `[tests / scripts / reports]`
- invalidates: `gate:e2e`
- requiredGate: `[test command]`
- doneCriteria:
  - 核心路径有可复查测试或脚本。
  - 报告输出到稳定路径。
  - 失败时能定位到具体步骤。
- verificationEvidence:
  - gate:
    result:
    report:
    runAt:
    note:
- residualRisk:
  - 待补充。

## TASK-005: 验证交付产物

- status: todo
- owner: Antigravity
- reviewer: Codex
- patchLevel: L2
- targetArtifact: `[dist / package / deploy config / release artifact]`
- invalidates: `gate:release-smoke`
- requiredGate: `[build command]`, `[artifact smoke command]`
- doneCriteria:
  - 产物可在目标环境启动。
  - 产物包含必要资源、配置和文档。
  - 已记录版本、路径、运行方式和已知风险。
- verificationEvidence:
  - gate:
    result:
    report:
    runAt:
    note:
- residualRisk:
  - 待补充。

## TASK-006: 完成交接文档

- status: todo
- owner: Codex
- reviewer: Human
- patchLevel: L0
- targetArtifact: `docs_collab/state.md`, `docs_collab/handoff.md`, `README.md`
- invalidates: none
- requiredGate: manual review
- doneCriteria:
  - 新人可以按文档启动、测试和继续任务。
  - 已记录已完成项、未完成项、风险和下一步。
  - 协作文档状态互相一致。
- verificationEvidence:
  - gate:
    result:
    report:
    runAt:
    note:
- residualRisk:
  - 待补充。
```

## 注意

- docs_collab/guide.md` 是协作规约，也是任务实现的强制执行流程；实现前必须按其要求完成读取、任务领取、交接、证据和 review。
- `tasklist_goal.md` 是目标级索引，不替代 `tasks.md` 的逐任务状态和证据。
- 每个新项目都应先基于真实仓库事实修订本文件，再进入实现。
- 不要把客户名、内部路径、密钥、版权敏感内容或项目私有信息留在可外发版本中。
