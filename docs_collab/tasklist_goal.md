# Current Task

@guide.md

## Request

把 `LoreWeaver/data/workspaces/20260611-060754-719406` 从“能跑的 12 节点工程样板”推进为一款接近 `minigame/Path_to_Immortality` 与 `minigame/three_kingdoms_brawl` 成熟度的 H5 游戏。

目标成熟度参考：两款参考游戏约 8/10。本 workspace 当前约 5.5-6/10；LoreWeaver 作为自动/半自动生产工具，当前约 4.5-5/10。

核心判断：当前构建和合同检查能过，但过的是工程一致性，不是玩家体验强度。下一阶段目标不是“继续补文档”，而是补齐手感、移动端输入、关卡设计、资产密度、长期成长、验证闭环和公开导出风险。

## Critical Gaps

- 核心循环太薄：Node 结算基本只是加资源、加击杀、解锁下一关。缺少构筑历史、最佳成绩、掉落追求、装备、关卡评分、失败学习和重复刷理由。
- 12 个 Node 多数是机制标签，不是成熟关卡。Node2 宝箱、Node5 阵眼、Node9 护送、Node10 城墙、Node12 Boss 都有雏形，但缺少波次设计、空间压力、敌人组合、风险收益和高潮演出。
- 移动端输入是硬伤。当前 Node1 主要读键盘/WASD，而 PRD 目标是移动端 H5 的摇杆/拖拽体验。
- 美术资产密度严重不足。当前 imagegen atlas 只有少量 64x64 帧，且仍有 `move-placeholder`、`death-placeholder`。参考 `three_kingdoms_brawl` 已有大量切片、动画帧、sheet、道具、场景件和音频。
- Boss 不够 Boss。Node12 安澜战是硬编码血量和简单弹幕，缺少前摇教学、阶段机制、破防窗口、专属资产、专属音频和终局情绪兑现。
- 成长没有质变。至尊骨、重瞳、鲲鹏法、柳神赐福、雷帝宝术、他化自在等能力已经进入数据，但仍偏“名字 + 通用技能效果”，没有形成构筑路线和打法变化。
- 验证体系不测快乐。现有检查证明 manifest、runtime id、VFX/SFX 引用一致，但不证明关卡好玩、移动端可玩、死亡原因清晰或玩家愿意再开一局。
- 版权/公开发布风险高。当前大量使用《完美世界》具体角色、地点、台词和设定。公开导出前必须原创化或完成授权/清理。

## Priority Roadmap

### P0: Make The First 3 Nodes Actually Good

- Node1 做成 8 分样板：移动端拖拽/摇杆、明确敌人三角关系、前 30 秒技能成长、Boss/精英小高潮、结算反馈。
- Node2 重做宝箱机制：宝箱需要驻守读条、受击/离开会打断、开箱奖励可观测、宝箱周围刷怪形成风险收益。
- Node3 重做宿敌压力：Boss Rush 不只是刷更硬的怪，要有重瞳预警、破防窗口、阶段台词、失败原因和胜利奖励落点。

### P1: Fix Mobile Playability

- 增加虚拟摇杆或全屏拖拽移动。
- 增加触屏技能按钮/自动技能设置/暂停/重试/返回。
- 校验 720x1280 竖屏下 HUD、技能选择、撤退确认、Boss 提示不遮挡操作区。

### P2: Upgrade Assets And Audio

- 为主角、常规敌人、精英、Boss 建立 `idle/walk/attack/hurt/death` 基础动画帧。
- 为 Node1-3 的 Boss 和关键技能补专属 bitmap 资产。
- 高价值资源、Boss 登场、技能觉醒、失败、胜利加入更强音频/视觉反馈。
- 程序化 fallback 只能兜底，不能成为主要视觉来源。

### P3: Make Progression Change Gameplay

- 洞天不只加数值，要改变技能形态或局内初始状态。
- 被动树要形成流派：清屏流、控制流、回复流、机动流、Boss 爆发流。
- Node 奖励不只给资源，要解锁或强化对应能力，例如 Node4 鲲鹏法、Node6 真凰火、Node8 至尊骨、Node12 他化自在。
- 主界面展示最佳成绩、星级、最高击杀、首通奖励、可刷资源和下一目标。

### P4: Harden Runtime Contracts

- 结算结构数据化：`flags`、`bestResult`、`failRewardPolicy`、`unlockOnSuccess`、`firstClearRewards`。
- 解锁不要只靠 `nodeConfig.id + 1`，改为 registry/flag 驱动。
- 子类 Node 不访问未初始化临时字段；Node 基类字段和方法形成稳定 API。
- 移除或严格限制 `IdleEngine` 无 Scene 的 `setInterval` fallback。

### P5: Build Real QA Gates

- 每个 Node 至少有一个机制断言：目标出现、危险预警、失败原因、奖励字段、返回主线、二次进入无残留。
- 增加移动端 Playwright/E2E：拖拽移动、点技能、撤退、升级三选一、返回主界面。
- 增加视觉检查：非空画面、主要角色可见、Boss 可见、HUD 不遮挡、文本不溢出。
- 失败日志必须包含当前 Scene、节点、截图、console error、最后一次操作。

### P6: Improve LoreWeaver Itself

- 不再只生成/保存 manifest，要能合成完整 workspace 源码、资产 manifest、E2E 脚本和导出包。
- Gameplay Card 需要从“机制选择器”升级为“可运行玩法模板 + 参数 + 验证方案 + 资产需求”。
- Agent 不能只改 JSON，要能提出并应用代码级 patch，且标记 L3/L4 风险。
- 导出不能只是 preview shell + core source，要能导出一款真正可玩的独立游戏包。

## Acceptance Criteria

- 从零存档到通关 Node1-3 的流程可自然推进，并且不需要开发者注入状态。
- Node1-3 每关都有：核心机制、失败条件、奖励落点、Boss/高潮演出、可观测测试断言。
- 移动端竖屏可玩：拖拽/摇杆、升级选择、撤退、结算、返回主界面都可触屏完成。
- 主干成长会改变局内打法，而不是只增加 HP/ATK。
- 至少补齐一批真实 bitmap 动画资产，主角、前三关敌人、前三关 Boss 不再主要依赖简单几何图形。
- E2E 能验证 Node1-3 的完整关键路径，并能 smoke test Node1-12 进入/退出无 console error。
- `npm run manifest:check`、`npm run loreweaver:check`、`npm run ability:check`、`npm run build` 继续通过。
- 若计划公开分享或导出，先完成 IP 名称、台词、地点、角色和设定的原创化清理。

## Notes

- 不要平均打磨 12 个弱关卡。先把 Node1-3 做成可复用质量模板。
- 不要把“文档完整”误判为“游戏成熟”。成熟度以实玩、复玩、反馈、资产、移动端和验证为准。
- 不要让程序化 fallback 掩盖资产缺口。fallback 是保险，不是主美术。
- `three_kingdoms_brawl` 的成熟感来自输入、关卡、敌人、分数、生命、道具、路线、音频、素材、验证等系统互相咬合；LoreWeaver 的目标也应向这种系统咬合靠拢。
