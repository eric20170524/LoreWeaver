# 09_DEVELOPMENT_AND_POLISH_PLAN.md: 开发与完善实施计划

制定日期：[YYYY-MM-DD]

## 1. 计划定位

本计划用于把 `[项目名]` 从“当前可运行状态”推进到“12 个 Node 稳定、主干成长闭环清晰、IP 能力可感知、文档与代码一致、测试可验证”的版本。

实施时必须继续遵守：
- `00_TASK_HISTORY.md` 的执行记录、历史完成项、自测闭环与技术备注。
- `07_RULES_AND_BUGS.md` 的 Phaser API、防穿透、Scene 生命周期、移动端优先规范。
- `08_SCENE_LIFECYCLE.md` 的 `scene.start(payload)` 单向传递结果和 `shutdown` 清理规范。
- `minigame_master/core/lib` 的复用策略和 Vite build 可解析的 import 路径。
- `minigame_master/workflow/scripts/run_e2e_test.py --game [slug]` 作为最低 E2E 验证入口。
- Playwright 视觉截图验收作为 UI/布局/响应式/弹窗任务的强制完成条件，必须覆盖桌面宽屏、移动端真机/设备模拟和关键弹窗/玩法说明/结算界面。

## 2. 当前状态判断

### 已具备资产

- [列出已完成的主干、Store、Node、注册表、UI、E2E、Vite 构建能力。]
- [必须基于当前代码事实，不得沿用历史计划中的旧判断。]

### 主要缺口

- [列出当前代码中仍存在的字段、机制、生命周期、文档、测试缺口。]
- [特别检查：Node 是否只是占位、技能是否只是文案、E2E 是否只测页面加载。]
- [特别检查：有没有跨项目通用经验应同步到 master prompts/templates。]

## 3. 版本目标

### v0.9 稳定版目标

- 文档与代码事实一致。
- 主干成长线和前中期 Node 形成稳定闭环。
- Node 基类、结算载荷、资源奖励和失败规则字段稳定。
- E2E 可验证主干、Node 进入、撤退、结算返回。
- 视觉验收截图能证明主干、局内 HUD、玩法说明/战前动员和结算面板在桌面与移动端模拟下不溢出、不遮挡、不越界。

### v1.0 完整版目标

- Node1-Node12 都有可见机制、失败条件、奖励落点、IP 演出锚点和可测断言。
- 核心 IP 能力都有可见特效、数值效果、解锁来源和战斗定位。
- 文档、代码、测试、master prompt 沉淀全部闭环。
- Runtime Feature Pack checker 已通过，证明能力、被动、角色敌人、VFX/SFX、首关技能循环与 workbench 状态一致。

## 4. 实施路线

### Phase A：文档与规范收口

**Task A1：同步计划到当前代码事实**

- 更新本计划的已具备资产、主要缺口和执行顺序。
- AC：本文件不再描述已被代码完成或已废弃的旧状态。

**Task A2：同步架构与状态协议**

- 检查 `02_ARCHITECTURE.md`、`04_STATE_STORAGE.md`、`08_SCENE_LIFECYCLE.md` 是否与实际通信链路一致。
- AC：Main -> Node、Node -> Main、Store 写回、核心库 import 路径和 GameOver/结算路径没有互相矛盾描述。

**Task A3：记录 master 沉淀候选**

- 列出本项目中可复用到下一个项目的 prompt/template 经验。
- 若本项目新增了角色、敌人、主动技能、被动树、VFX、SFX、局内技能循环或模拟器预览能力，必须同步到 `10_RUNTIME_FEATURE_PACK.md`、Runtime Feature Pack schema、相关 prompts/scripts。
- AC：若有通用经验，后续 Phase 必须同步到 `minigame_master/workflow/prompts/` 或 `minigame_master/workflow/templates/`。

### Phase B：Node 基类与结算硬化

**Task B1：标准化 Node 输入和运行字段**

- 标准输入：`nodeConfig`、`playerStats`、`playerPerks`、`skillTier` 或项目等价字段。
- 标准运行：`kills`、`surviveTime`、`isGameOver`、`isPaused`、`isTransitioning`、`rewards`、`activeSkills`。
- AC：子类不访问未初始化字段。

**Task B2：数据化结算载荷**

```javascript
{
  nodeId,
  success,
  duration,
  kills,
  rewards,
  unlockNextNode,
  flags
}
```

- AC：Store 可统一处理奖励、通关记录、解锁和剧情 flag。

### Phase C：主干成长与解锁闭环

- 资源用途、境界/等级、Node 解锁、被动树或法宝系统必须互相连通。
- 解锁策略优先由 registry/flag 驱动，不只依赖 `id + 1`。
- AC：玩家从零存档能自然推进到目标中期节点，开发者也能通过测试注入快速验证后期节点。

### Phase D：Node 分批稳定化

| Node 范围 | 目标 |
| --- | --- |
| Node1-Node6 | 做成前中期质量模板，HUD、失败条件、Boss/高潮、奖励都清楚 |
| Node7-Node12 | 强化后期差异，避免只改刷怪参数 |

AC：
- 每个 Node 至少有一个核心机制、一个失败条件、一个奖励字段、一个 IP 演出锚点、一个可观测断言。

### Phase E：局内技能与 IP 能力深化

- 整理本 IP 的高辨识度能力谱系。
- 每个核心能力必须绑定：
  - 可见特效。
  - 数值效果。
  - 解锁来源。
  - 战斗定位。
  - 测试断言。
- AC：技能选择或能力解锁能明显改变局内打法，而不是只改变文案。

### Phase F：战斗手感与表现统一

- 程序化材质、飘字、震屏、Web Audio、Boss 登场、资源不足、胜利/失败反馈。
- 移动端触控和 HUD 不遮挡核心操作。
- AC：关键操作不依赖 console 或原生弹窗反馈。

### Phase G：测试闭环升级

- E2E 支持 `--node`、状态注入、冒烟时长、console/page error 收集。
- `npm run build` 必须证明核心库 import 路径可解析；构建失败不能只靠浏览器肉眼检查跳过。
- 至少覆盖主干启动、资源操作、Node 进入/撤退/失败/胜利、机制 HUD 断言。
- 视觉验收必须保存并人工查看桌面宽屏、移动端真机/设备模拟、玩法说明/战前动员、结算面板截图。
- AC：失败日志包含 console error、当前 Scene、最后操作和截图路径；UI 相关任务记录截图路径、查看结论和修复结果。

### Phase H：master prompt/template 反哺

- 检查本项目经验是否应上提到：
  - `minigame_master/workflow/prompts/HOW_TO_START.md`
  - `minigame_master/workflow/prompts/step 1_IP_Deconstruction_Prompt.md`
  - `minigame_master/workflow/prompts/step 2_GDD_Prompt.md`
  - `minigame_master/workflow/prompts/step 3_Atmosphere_Programming.md`
  - `minigame_master/workflow/templates/`
- 对 LoreWeaver 工作区，还必须检查是否应上提到：
  - `LoreWeaver/docs/contracts/runtime_feature_pack_contract.md`
  - `LoreWeaver/docs/contracts/runtime_feature_pack.schema.json`
  - `LoreWeaver/workflow/templates/10_RUNTIME_FEATURE_PACK.md`
  - `LoreWeaver/workflow/prompts/step 2.3_Runtime_Feature_Pack_Prompt.md`
  - `LoreWeaver/workflow/scripts/check_runtime_feature_pack.mjs`
- AC：通用经验已同步；若无可同步项，最终回复明确说明没有跨项目沉淀。

## 5. 执行顺序建议

1. 先收口文档和代码事实。
2. 再硬化 Node 基类、结算载荷和主干解锁。
3. 按前中期、后期分批提升 Node 质量。
4. 深化 IP 能力和战斗手感。
5. 每完成一个阶段立即补测试和 master 沉淀检查。

## 6. 风险与规避

- 风险：计划文档落后于代码事实。  
  规避：每个 Phase 结束都同步本文件。

- 风险：IP 能力停留在名字和文案。  
  规避：每个核心能力绑定特效、数值、解锁来源和测试断言。

- 风险：E2E 只验证页面打开。  
  规避：读取 Scene、Store、HUD 和 console error。

- 风险：构建和断言通过，但真实布局存在文字溢出、遮挡或移动端安全区问题。
  规避：用 Playwright 截取桌面宽屏、移动端真机/设备模拟和关键弹窗/玩法说明/结算截图，并人工查看后再验收。

- 风险：项目经验只留在单个项目 docs 中。  
  规避：每轮开发都检查 master prompts/templates 是否需要同步。

## 7. 完成定义

本计划完成时，应满足：
- 文档与代码事实一致。
- Node1-Node12 有机制、失败、奖励、演出和可测断言。
- 主干资源、成长、解锁、技能/IP 能力形成闭环。
- E2E 能 smoke test 全部核心路径。
- Playwright 视觉截图验收已覆盖桌面和移动端模拟，关键 UI 无文字溢出、遮挡、按钮越界或安全区问题。
- 跨项目通用经验已同步到 `minigame_master/workflow/prompts/` 或 `minigame_master/workflow/templates/`。
