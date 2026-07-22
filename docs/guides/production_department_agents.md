# LoreWeaver 制片式多部门 Agent 协作模型

> 参考交互：影视「制片筹备」工作台（分集部门筹备 · 部门确认 · 筹备意见 / 质检报告 / 交接与问题 · 一键自动筹备）。  
> 目标：把 **游戏制作每个环节** 拆成 **独立 Agent（部门）**，用统一交接合同协作，而不是一个全能聊天框包办全流程。

---

## 1. 核心类比

| 影视制片筹备 | LoreWeaver 游戏制作 |
| --- | --- |
| 导入剧本 | 导入主题 / IP DNA / 既有 workspace |
| 制片筹备 | 规格与玩法筹备（本模型主战场） |
| 项目资产 | 图集 / 音频 / 能力 / 玩法卡资产确认 |
| 分镜与故事板 | 节点大纲 + 关卡 beat + 验证场景 |
| 摄影棚 / 开拍 | 编译运行时 / 模拟器可玩 / 导出 |
| 导演组 / 表演 / 摄影 / 灯光 / 美术… | 世界 / 叙事 / 玩法 / 架构 / 美术 / 音频 / 代码 / 质检 / 合规 |
| 部门已确认 N/M | 部门 Agent `status: confirmed` |
| 筹备意见 · 质检报告 · 交接与问题 | `prepNotes` · `qaReport` · `handoffs[]` |
| 一键自动筹备 | Orchestrator 按 DAG 调度各部门自动跑完并停在待人审节点 |

**原则（与现有路线图一致）：**

1. **Agent 是协作者，不是真相源** — 真相在 manifest / gameplay_cards / core / reports。  
2. **按产物所有权拆部门**，不按花哨职称。  
3. **局部 patch 优先**，禁止默认整包重写。  
4. **交接可机读**，可回放，可挂 gate。

---

## 2. 流水线阶段（顶栏）

对应图中：`导入剧本 → 制片筹备 → 项目资产 → 分镜与故事板 → 摄影棚`。

| 阶段 id | 名称 | 完成判据 |
| --- | --- | --- |
| `import_source` | 导入题材 | 主题 / workspace / 语料路径就绪 |
| `production_prep` | 制作筹备 | 各部门对当前「单元」（如 N 节点战役或单节点）完成确认 |
| `asset_confirm` | 资产确认 | art/audio/ability/gameplay-card 清单与 provenance 齐；node smoke |
| `runtime_stage` | 运行与导出 | 每节点可玩合同（card/时长/文案）+ build/e2e 过线，可 export |

> 注：曾规划的 `beat_board`（节拍与验收板）已取消独立阶段——筹备阶段已做过 smoke/卡牌时，单独一跳会变成形式主义。其检查并入 `asset_confirm → runtime_stage` 门禁。

当前工作台已有 Step 1.1–3.3；本模型把它们 **映射为阶段内的部门任务**，而不是替换编号。

---

## 3. 部门 Agent 编制（左栏部门列表）

每个部门 = 一个 **独立 Agent 角色** + 固定 **产物所有权** + 允许的 **patch 级别** + 依赖的上游交接。

| 部门 id | 显示名 | 对应现有角色 / Step | 拥有产物 | 默认可写 | 需人审 |
| --- | --- | --- | --- | --- | --- |
| `world` | 世界观组 | World Builder · 1.1 | `title` `themeColor` `economy` `progressionSystems` `pipeline_dna` | L0–L2 | 经济推翻 |
| `narrative` | 叙事组 | Narrative · 1.2 | `nodes[]` 文案/intro/taunts/planning.notes | L0–L1 | 主线改写 |
| `gameplay` | 玩法组 | Gameplay Librarian / Designer | `gameplay_cards` 选用、`nodes[].gameplay`、knobs/modifiers | L0–L2 | 新 adapter 声明 |
| `architecture` | 架构组 | Sandbox · 2.1–2.3 | shell 合同、registry、Runtime Feature Pack 清单 | L0–L1 | L4 合同变更 |
| `art` | 美术组 | Asset Pipeline · art | `asset-pipeline.json.artAssets`、imagegen manifest 计划、`RuntimeArtBinder` 绑定表 | L0–L2 | 授权例外 |
| `audio` | 音频组 | Asset Pipeline · audio | audio manifest、cue catalog、credits | L0–L2 | 版权素材 |
| `ability` | 能力组 | Ability Runtime | `abilityCatalog` `passiveCatalog` runtimeSkillIds / VFX-voice 绑定 | L0–L2 | 战斗公式推翻 |
| `code` | 代码组 | Code Foundry · 3.1–3.2 | adapter 接线、节点实现、juice | L1–L2 knobs；L3 需任务 | L3/L4 实装 |
| `qa` | 质检组 | Auditor / Gate Runner · 3.3 | build/e2e/VLM/scene_hygiene/art coverage 报告 | 报告与建议 patch | 改 pass 标准 |
| `compliance` | 合规组 | Compliance Reviewer | 内容扫描、导出清单、去题材化 | L0–L1 | 公开导出放行 |
| `director` | 导演组（编排） | Orchestrator | 阶段进度、部门确认汇总、一键筹备调度 | 调度状态 | 跳过 gate |

`director` **不拥有** 设计内容，只拥有 **进度与调度状态**（类似图中「导演组」统筹戏剧目标与下游边界）。

机器可读注册表见：

```text
docs/workflow/department_agents.registry.json
```

---

## 4. 部门卡片状态机（中栏）

对齐图中：`已确认 · V4`、筹备意见、质检报告 100、交接与问题 3。

```text
idle → drafting → ready_for_review → confirmed
                 ↘ blocked（缺上游 / 质检失败）
confirmed → stale（上游变更导致失效）
```

| 字段 | 含义 |
| --- | --- |
| `status` | 上表状态 |
| `version` | 部门产出版本（V1…Vn），确认时 +1 |
| `prepNotes` | 筹备意见（人对 Agent 或 Agent 自述方案） |
| `qaScore` | 0–100，来自本部门自检或 qa 部门回写 |
| `handoffs` | 交接与问题列表（见 §5） |
| `artifacts` | 本部门写下的路径列表 |
| `dependsOn` | 上游部门 id[] |
| `confirmsRequiredFrom` | 可选：必须收到哪些部门的 ACK 才能 confirmed |

**全部部门 confirmed**（或导演指定的子集）→ 可点「进入资产确认 / 下一阶段」。

---

## 5. 交接合同（Agent 之间如何交流）

禁止靠自由闲聊传递关键状态。统一使用 `DepartmentHandoff`：

```json
{
  "id": "ho_20260717_gameplay_to_art_01",
  "from": "gameplay",
  "to": "art",
  "unitId": "campaign_12" ,
  "type": "request | ack | reject | escalate",
  "summary": "Node4 需要 laser_warning 预警圈 + 阵眼 core_eye 贴图",
  "payloadRef": "nodes[3].gameplay",
  "needs": ["art:env_bg_tide", "art:core_eye", "vfx:laser_telegraph"],
  "blockers": [],
  "patchLevelMax": "L2",
  "createdAt": "ISO-8601",
  "status": "open | resolved | wontfix"
}
```

交流规则：

1. **下游只读上游已 confirmed 的产物**（或明确标记的 draft 预览）。  
2. **上游变更 → 下游 `stale`**，必须重新确认。  
3. **跨部门改别人的产物** → 只能开 handoff `request`，由拥有方 patch。  
4. **质检组** 可对任何部门写 `qaScore` 与 `handoffs[].type=reject`。  
5. **合规组** 在 export 前拥有一票否决（`blocked`）。

这与现有 `ManifestPatch` / revision 体系兼容：handoff 可挂 `proposedPatch` 或 `revisionId`。

---

## 6. 单元粒度（左栏「分集 / 工作单元」）

图中「01 · 第七张相片」对应我们的 **工作单元 unit**：

| unit 类型 | 示例 | 部门筹备范围 |
| --- | --- | --- |
| `campaign` | 整局战役（主节点与 N 个子节点） | 全部门 |
| `node` | 单个子节点 Node_i | 玩法/美术/音频/代码/质检为主 |
| `card` | 单张 gameplay card | 玩法馆 + core + 质检 |
| `export` | 一次公开导出 | 合规 + 质检 + 导演 |

同一 unit 下统计：`已确认部门数 / 应确认部门数`（如图 `12/12 部门已确认`）。

---

## 7. 一键自动筹备（右上）

`director` Orchestrator 算法（简版）：

```text
1. 读取 unit + department_agents.registry
2. 拓扑排序 dependsOn
3. 对每个部门：
   a. 注入上游 confirmed artifacts
   b. 调用该 Agent 的 system prompt + 工具白名单
   c. 写 prepNotes + 产物 patch（限 patchLevel）
   d. 跑部门自检 → qaScore
   e. 若 score < 阈值 → status=blocked，写 handoff 给 qa/人工
   f. 否则 status=ready_for_review（默认不自动 confirmed，除非 policy 允许）
4. 汇总「可进入下一阶段」条件
```

**默认 HITL：** 自动筹备只到 `ready_for_review`，人点「确认」才 `confirmed`（对齐图中部门确认）。

---

## 8. 与现有五部 Agent / UI 的映射

| 现有 AgentChatPanel | 新部门 id | 备注 |
| --- | --- | --- |
| world_builder | `world` | 保留 |
| narrative | `narrative` | 保留 |
| sandbox | `architecture` | 扩职责到 RFP |
| code_foundry | `code` + 部分 `ability`/`audio` | 拆清所有权 |
| auditor | `qa` + `compliance` | 拆视觉质检与导出合规 |
| （新增） | `gameplay` `art` `audio` `ability` `director` | 补齐制片筹备缺的部门 |

前端演进建议：

1. **Phase A** ✅：部门注册表 + handoff JSON 落盘到 `workspace/loreweaver/departments/`（API 见 backend）  
2. **Phase B** ✅：工作台 Tab「部门筹备台」— 部门列表 + 筹备意见/质检/交接三栏 + 确认  
3. **Phase C** ✅：导演拓扑调度（`backend/department_agents.py`）+ 部门 system prompt + Gemini/程序化草案；质检分可读 `workflow/reports`；单部门「调度本部门 Agent」  
4. **Phase D** ✅：确认后下游 `stale`；`/departments/gate` + `advance-stage` 硬门禁；自动筹备在所有权内写 L1/L2 受控 patch（如 `gameplay.cardId`、`knobs.envKey`）并落盘 manifest  
5. **Phase E** ✅：确认后默认 `reprepDownstream=true` 自动重跑过期下游草案；部门注册表 `chatAgentId` 绑定 HITL 聊天角色

---

## 9. 工作区落盘约定

```text
data/workspaces/<id>/loreweaver/departments/
  state.json              # 全部门状态与确认计数
  handoffs/
    <handoff_id>.json
  prep/
    world.v4.md           # 可选：长文筹备意见
    gameplay.v2.json
  qa/
    art_coverage.json
    e2e_latest.json       # 可软链 reports/
```

`state.json` 最小形状：

```json
{
  "schemaVersion": "loreweaver.department-state.v1",
  "unitId": "campaign_12",
  "stageId": "production_prep",
  "departments": {
    "gameplay": {
      "status": "confirmed",
      "version": 2,
      "qaScore": 92,
      "prepNotes": "…",
      "artifacts": ["docs/gameplay_cards/…"],
      "openHandoffCount": 1
    }
  },
  "confirmedCount": 8,
  "requiredCount": 10
}
```

---

## 10. 一句话产品定义

> **LoreWeaver = 游戏制片筹备台**：每个制作环节是独立部门 Agent，产物有主，确认有态，质检有分，交接有单；导演编排调度，人在关键门确认，机器跑局部 patch 与 gate。

这与参考图「分集部门筹备」是同一交互范式，只是部门从摄影/灯光换成了玩法/美术/代码/质检。
