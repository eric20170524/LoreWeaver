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
| `production_prep` | 制作筹备 | 主干部门确认作品级字段；每个 `node.id` 的关卡部门确认该关，或明确延后 |
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
minigame_master/skills/department_agents.registry.json
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
  "unitId": "node:4",
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

## 6. 调度范围：主干与关卡

运行时的边界是：主干 Scene 管持久化、成长、资源和关卡入口；关卡 Scene 只跑这一局，结束用 `NodeResult` 回到主干。部门筹备沿用这条边界。一次调度只有一个 `scope`。公开标识用 `nodes[].id`。patch 路径里的数组下标只在运行时由 id 解析，id 重复或对不上就拒绝写入。

`NodePayload` / `NodeResult` 的字段形状不在任何部门的可写集合里。成长进关卡只走 modifier 和 `progressionSystems.nodePayloadEffect`。

产品模板里的「12 个 Node」只约束新战役的主界面预览，不约束调度器。节点数以当前 manifest 为准。`campaign_12` 不再作为调度输入。

| scope.kind | 含义 | 谁可以跑 |
| --- | --- | --- |
| `trunk` | 作品级字段：经济、成长、目录、shell | 下表「主干」列 |
| `nodes` | `nodeIds: number[]`，一关或显式多关。多关在服务端拆成一关一次调用 | 下表「关卡」列 |
| `card` | 一张玩法卡本身 | 保留，当前接口返回 `scope_reserved` |
| `export` | 一次公开导出 | 保留，当前接口返回 `scope_reserved` |
| `all` | 仅一键自动筹备：先主干，再按 `node.id` 升序逐关 | 导演编排，不作为单部门默认 |

注册表字段 `scopeLayer`：`trunk`、`node`、`mixed`、`director`。混合部门一次按钮只跑当前 scope 对应的那一次任务。

| 部门 | scopeLayer | 主干任务 `job=catalog` | 关卡任务 `job=binding` |
| --- | --- | --- | --- |
| 导演 | `director` | 只写本 scope 汇总，不改 manifest | 同左 |
| 世界观 | `trunk` | `title` `themeColor` `economy` `progressionSystems` `pipeline_dna` | 不可调度 |
| 架构 | `trunk` | shell、registry、Runtime Feature Pack 清单 | 不可调度 |
| 合规 | `trunk` | 内容安全、导出清单、去题材化 | 不可调度。关卡正文只作扫描证据 |
| 叙事 | `node` | 不可调度。提示词只放全关 `{id, title}` 索引 | `title` `intro` `taunts` `planning.notes` |
| 玩法 | `node` | 不可调度 | `gameplay` 与 `mechanics` |
| 代码 | `node` | 不可调度。shell 接线走 L3 交接 | `knobs.runtimeCardId`。`shellRetreat` 仅在该关尚无此键时补一次 |
| 能力 | `mixed` | `abilityCatalog` `passiveSkillCatalog` | 该关 `planning.runSkillPool`（缺省补 `[]`，不发明技能 id） |
| 美术 | `mixed` | `asset-pipeline` 美术清单、图集计划、共享语义键 | 该关 `knobs.envKey` `knobs.artAtlasFirst` |
| 音频 | `mixed` | `audioCueCatalog`、credits、菜单/主干 cue | 该关 `bgmKey` `sfxVictory` `sfxDefeat` `bossBgmKey` |
| 质检 | `mixed` | build、scene hygiene、聚合报告 | 选中关的 node smoke 阅读 |

同一 scope 下统计：`已确认部门数 / 本 scope 应确认部门数`。导演不计入应确认数。

---

## 7. 「调度本部门 Agent」的请求

单部门接口 `POST /api/workspaces/{id}/departments/{deptId}/run-prep`。缺少 `scope` 返回 400 `scope_required`。部门与 scope 不匹配返回 400 `department_not_on_scope`。未知或重复的 `node.id` 返回 400。

```json
{
  "scope": { "kind": "nodes", "nodeIds": [3] },
  "activeScope": { "kind": "nodes", "nodeIds": [3] },
  "brief": "",
  "force": false,
  "applyPatches": true
}
```

| 字段 | 默认 |
| --- | --- |
| `scope` | 无默认。主干部门用 `{ "kind": "trunk" }`。关卡部门用筹备台当前选中的关。未选关时按钮不可用 |
| `activeScope` | 筹备台正在查看的范围。多关运行时，详情仍停在这一关上 |
| `brief` | 空字符串。人写的本次约束，单独存在部门记录的 `brief` 上。不从筹备意见文本框带入，生成结果只写 `prepNotes` |
| `force` | `false`。该 scope 上已是 `confirmed` 的部门跳过 |
| `applyPatches` | `true`，但路径必须先过 scope。出现范围外路径时，该部门本次不写 manifest |

系统始终在提示词里附上固定范围句。`brief` 非空时再追加「本次约束」。

范围句：

- 主干：「只写本部门的作品级字段。节点仅提供 id 与标题索引。」
- 关卡：「只处理这些 nodeId。缺省只填本关尚不存在的字段。其他关与经济、目录根字段保持原样。」

导演组只写本 scope 的汇总，不把 `only` 置空，不顺带跑其他部门。全体部门只走「一键自动筹备」。

一键自动筹备 `POST .../departments/auto-prep` 接受 `scope.kind = "all"`（缺省也是 all）：按拓扑先跑主干，再按 `node.id` 升序一关一次跑关卡部门。每步停在 `ready_for_review`。每个 scope 各写一条导演汇总。已确认且 `force` 不为 true 的记录跳过。

提示词材料：

- 主干调用携带本部门根字段、全关索引 `{id, title}`、上游主干筹备意见、主干门禁报告。不携带各关 `intro` / `taunts` / `gameplay`。
- 关卡调用一关一次，携带该关完整 `NodeSpec`，外加已确认主干切片（标题、货币名、境界名、能力 id）。其他关只出现在索引里。上游意见只取同一 `nodeId` 的记录；关卡部门依赖世界观时，读主干上的世界观记录。

无 LLM 时走同一 scope 的程序化草案，文案点名本次 `nodeIds`。

---

## 8. 写入、确认与过期

`build_controlled_patches` 只为本次下标生成关卡路径。`catalog` 任务丢弃任何 `nodes[...]` 路径。`binding` 任务丢弃根字段，以及不属于本次 id 的下标。

补缺规则：

- 玩法组只在本次关内，于缺少 `cardId` 时用生产目录 `catalog_resolve_card_id` 填入。
- 范围内实验卡、且该关未设 `knobs.allowExperimentalCard` 时，才替换为生产卡。
- 范围外的实验卡写入 `risks`，不改 manifest。
- 已有 `cardId`、`victoryMode`、`envKey`、`bgmKey` 不覆盖。
- `shellRetreat: true` 只在该关还没有这个键时写一次。
- 美术 `ENV_BY_NODE`、音频 `BGM_BY_NODE` 按 `node.id` 取模，不按数组位置。

交接 `unitId` 写成 `trunk` 或 `node:3`。下游只读同一 scope 的已确认产物；关卡任务另外可以读已确认的主干。

确认只提升这一对 `(部门, scope)` 的版本。确认请求默认 `reprepDownstream: false`。勾选后，只重跑**同一 scope** 的直接下游。

过期：

- 确认主干部门后，主干上依赖它的部门标为 `stale`；关卡上依赖它的叙事、玩法、能力绑定、美术、音频、代码、质检也标为 `stale`。
- 确认关卡 3 的叙事后，只把关卡 3 的下游标为 `stale`。其他关与主干记录不动。
- 只把已经是 `confirmed` / `ready_for_review` / `drafting` 的记录改为 `stale`。`idle` 保持 `idle`。

关卡部门可以标为 `deferred`（延后）。战役门禁里，延后的关卡部门不阻断进入资产确认。主干部门不能靠延后放行。

资产确认门禁：每个主干应确认部门都是 `confirmed`，且每个 `node.id` 的关卡应确认部门都是 `confirmed` 或 `deferred`。质检分读取主干上的质检记录。node smoke 仍是这条门禁的运行时证据。

神识对话携带同一个 `scope`。模型返回后，服务端按 scope 把范围外的 manifest 改动收回：主干任务恢复全部 `nodes[]`，关卡任务恢复根字段和其他关。导演汇总任务不写 manifest。

---

## 9. 状态落盘（v2）

```text
data/workspaces/<id>/loreweaver/departments/
  state.json
  handoffs/<handoff_id>.json
  prep/
  qa/
```

```json
{
  "schemaVersion": "loreweaver.department-state.v2",
  "stageId": "production_prep",
  "activeScope": { "kind": "nodes", "nodeIds": [3] },
  "scopes": {
    "trunk": {
      "departments": {
        "world": {
          "status": "confirmed",
          "version": 2,
          "qaScore": 86,
          "prepNotes": "",
          "brief": ""
        }
      }
    },
    "nodes": {
      "3": {
        "departments": {
          "gameplay": {
            "status": "ready_for_review",
            "version": 1,
            "qaScore": 80,
            "prepNotes": "",
            "brief": ""
          }
        }
      }
    }
  },
  "legacyCampaignNotes": {},
  "departments": {},
  "confirmedCount": 0,
  "requiredCount": 0
}
```

`state.departments` 是 `activeScope` 的投影，给仍按部门 id 读取的调用方使用。确认数按这个投影里「当前 scope 应确认的部门」计算。

从 v1 读入时自动迁移，并写回 v2：

- 世界观、架构、导演、合规：原状态进入 `scopes.trunk`。
- 叙事、玩法、代码、能力、美术、音频、质检：原意见进入 `legacyCampaignNotes`，主干与各关记录回到 `idle`。
- 不因为迁移再跑一遍全关补缺。已在 manifest 里的字段保持原样。
- 旧 `unitId` 挪到 `legacyUnitId`，调度不再读取它。

筹备台在部门列表上方提供 scope 条：主干、每个关的 `id · title`、以及需要显式勾选的「全关」。全关不是打开页面时的默认值。按钮文案带上范围，例如「调度本部门 · 主干」或「调度本部门 · Node 3」。

---

## 10. 与五部 Agent 的映射，以及阶段记录

| 现有 AgentChatPanel | 部门 id | 备注 |
| --- | --- | --- |
| world_builder | `world` | 主干 |
| narrative | `narrative` | 关卡文案 |
| sandbox | `architecture` | 主干 shell / RFP |
| code_foundry | `code`，以及美术/音频的关卡绑定通道 | 关卡 knobs |
| auditor | `qa` + `compliance` | 质检可主干可关卡；合规只在主干 |

1. **Phase A** ✅：部门注册表 + handoff 落盘  
2. **Phase B** ✅：部门筹备台  
3. **Phase C** ✅：拓扑调度、部门 system prompt、单部门调度  
4. **Phase D** ✅：下游 `stale`、阶段门禁、受控 L1/L2 patch  
5. **Phase E** ✅：`chatAgentId` 绑定神识通道。确认后自动重跑下游已取消，默认改为不重跑  
6. **Phase F** ✅：主干 / 关卡 scope。见 `backend/department_scope.py`

---

## 11. 一句话产品定义

> **LoreWeaver = 游戏制片筹备台**：每个制作环节是独立部门 Agent；主干与关卡分开调度，产物有主，确认有态，质检有分，交接有单；导演只编排当前范围，人在关键门确认。

## 12. 验收

1. 调度世界观：落盘 patch 没有 `nodes[...]`。
2. 调度玩法且 `nodeIds: [3]`：只出现该 id 对应下标；其他关的 `cardId` 与 knobs 不变。
3. 关卡在范围内时，提示词含它的完整 `NodeSpec`；不在范围内时只有 id 和标题。
4. 点导演组不改变其他部门的 `updatedAt`。
5. 范围外的实验卡保持原值，并出现在 `risks`。
6. 确认关 3 叙事后，关 3 玩法变为 `stale`，关 4 玩法仍为 `confirmed`。确认主干世界观后，各关已确认的叙事变为 `stale`。
7. 无 LLM 时，程序化草案点名本次 `nodeIds`，且不给范围外的关写 `envKey` 或 `bgmKey`。
8. 关卡部门缺少 `scope`，或主干部门被套上关卡 scope：接口 400，manifest 无变化。
9. v1 `state.json` 读入后变成 v2；世界观确认状态还在，玩法确认不复制到每一关。
