# 全玩法卡推进记录

## 2026-09-21：Survivor replay 修复

交接中的 CI 根因结论需要纠正。[run 35214292156](https://github.com/eric20170524/LoreWeaver/actions/runs/35214292156/job/105178952633) 的 step 10 实际是 `page.waitForFunction: Timeout 30000ms exceeded`，位置为 `executeBuild:268`，尚未比较 gameplay projection；没有 expected/actual assertion diff。该次启动超时在本地未复现，不据此宣称根因已修复。

本地真实双浏览器执行另外复现了 replay 不一致，并逐层定位：

1. 轮询后才暂停，允许不同数量的 gameplay 帧先运行。显式 verification host 现在可要求 adapter 创建完成后立即暂停；正常玩家会话不启用该选项。
2. 精确帧通过绝对 RAF 时间戳相减得到 delta，其浮点误差依赖页面运行时间；累计到秒计时器边界时会影响 spawn/PRNG 调用数。保留真实 TimeStep → Game.step 链路，但向 Game.step 传递精确固定 delta，并在结束后恢复原 callback。
3. 开场遮罩连点、自动结束能创建多段结束动画，多次调用 adapter.create，留下重复计时器。结束入口现在只接受一次。

最终本地 Golden Candidate 与双 build × Chromium/Firefox 已通过；四格 initial/final projection 完全一致，initial/final diff 为空。每格要求三个循环 gameplay timer、初始 elapsed=0；实际初始 timer=90、PRNG calls=0、enemies=0。120 帧后 timer=89、calls=2、enemies=1，保留 Phaser Clock 的浮点边界语义，未抹除或放宽字段比较。证据摘要见 [replay JSON](../reports/survivor_replay_2026-09-21.json)。这是工程浏览器 replay 验证，不是发布认证。

新增诊断覆盖启动失败的浏览器错误、请求失败、页面文本和 observation snapshot；比较报告保存 initial/final projection、字段级 expected/actual diff 与计时器现场。

TypeScript、RuntimeObservation、RuntimeDeterminism、16 项 Survivor combat 单测、通用 current-workspace Candidate 浏览器验证均通过。Action Boss alignment 原脚本在暂停状态发送反击，被正确拒绝；改为同一同步 evaluate 内先 resume 再输入，未改变暂停时禁止攻击的运行时规则，两次独立浏览器会话回归通过。

云端 run `35589426870` 的新增失败现场确认原启动故障：Firefox/build-a 页面明确显示 `Cannot create WebGL context, aborting.`，gamePresent=false、specPresent=true，无网络错误。CI 改用 Xvfb + Mesa 软件 GL 的有显示 Firefox/Chromium，会在报告中如实记录 headless=false；没有更换 gameplay runtime 或缩减浏览器矩阵。该配置已在 run `35590056668` 通过云端验证。

## 全库范围与后续验收

范围为 cards 目录中的 23 张顶层卡（含 iframe 容器卡），不凭卡片 `status` 标签认定本轮完成。前六张有 Card Lab 真实输入套件；Survivor 有 Golden Candidate、独立 demo 和 replay 套件。其余卡逐一核对参数、真实操作、胜败/退出、暂停/重开、移动输入和离线构建；不把只启动成功当完整验收。

已有 Card Lab：`dodge_counter_boss`、`rhythm_timing`、`drag_collect_grid`、`sequence_synthesis`、`turn_based_skill_battle`、`side_scrolling_brawler`。本轮 92 项状态机回归通过，浏览器复验结果以 workflow/reports/card-lab 下当前报告为准。

本轮前六张卡浏览器套件最终共 42 个场景通过（6 / 8 / 7 / 8 / 8 / 5）。顺序合成首次复验的 `maximum-recipe` 失败揭示真实输入问题：Phaser 在 POST_STEP 清空队列之前会重新遍历 DOM 键盘事件，导致同一 keydown 重复投料。Adapter 按 DOM 事件对象去重，不节流不同事件、不修改配方、不放慢浏览器输入。新增重复事件交错单测后该卡 22 项单测及完整八场景均通过（最后报告时间 2026-09-21T10:35:47.795Z）。各报告含各自构建哈希；本轮本地套件跨修复构建执行，不能当成远端单一最终 revision 的 CI 证明。

Survivor replay 的云端验收已通过：[run 35590056668](https://github.com/eric20170524/LoreWeaver/actions/runs/35590056668) 在 `9c3d6bb` 上 Golden 全绿。第七张独立试验场入口也已补齐，本地 17 项单测与六个真实输入场景通过，详细范围见 [Survivor Card Lab](SURVIVOR_HORDE_CARD_LAB.md)。共享标题只显示首字的问题已定位为字符串 letterSpacing，改为数值。

第七张最终提交 `946a9fb` 的八项远端 workflow 均已通过，包括 Golden Candidate E2E run `35599776730` 和 Gameplay Card Lab run `35599776714`。

第八张 [reaction_pick](REACTION_PICK_CARD_LAB.md) 已接入：修复跨轮旧计时器扣机会、重复/过期选择、宿主提前结算风险，九项单测及八项真实输入场景通过。新卡参数表单复用独立 metadata，执行仍来自共享 core Adapter。

第九张 [energy_balance](ENERGY_BALANCE_CARD_LAB.md) 已接入：修复默认静止平衡点自动通关、暂停输入、监听/文字泄漏及无限元素增长；八项单测、六项真实输入场景通过，包括鼠标和移动触控分别完成默认 20 秒目标。证据范围以各卡文档为准。

第八、九张最后视觉调整后再次完整回归：17 项单测、14 个真实浏览器场景及 TypeScript 全部通过，390px 活跃游戏截图已核对。辨宝选项与目标文字、能量元素与拖拽命中范围放大，未改为自动作答。验收摘要及实际构建文件哈希见 [08/09 JSON](../reports/card_lab_08_09_2026-09-21.json)。本地报告的 revision 是构建时 checkout 基点，测试时包含未提交代码；报告文件哈希标识实际 payload，不能将基点 SHA 单独当成完全相同源树证明。

继续推进其余 13 张：`drag_to_core`、`pressure_survival`、`rune_connect_sequence`、`branching_dialogue_check`、`shooter_duel`、`maze_exploration_choice`、`platform_escape`、`hazard_collect_waves`、`sequence_puzzle_combo`、`rhythm_then_pickup`、`qix_area_capture`、`point_drag_progression`、`node_iframe_microgame`。这些尚未在本轮逐卡验收，不标记为完成。Card Lab 新卡暂未进入六卡 workflow matrix（现有 GitHub OAuth 无 workflow 写权限）；本地验收脚本已提供，不能宣称该矩阵覆盖第七至十张。


第十张 [observe_capture](OBSERVE_CAPTURE_CARD_LAB.md) 已通过八项状态机回归及六场景真实浏览器验收：默认五次捕捉获胜、误点/错过窗口、暂停/恢复/三次重开、自定义目标、移动触屏和离线通关。修复重复点击判定、挂机通关、暂停误点和结算清理；TypeScript 通过，390px 活跃画面已核对。[证据摘要](../reports/card_lab_10_2026-09-21.json) 保存实际构建哈希。其失败设计只有撤退，不宣称验证了不存在的自然死亡。本次构建包含工作区并行养成改动，不将基点 revision 当成干净提交的证明。

`935878f` 八项云端 workflow 均已通过，包括 Golden Candidate E2E `35602510709` 和 Gameplay Card Lab `35602510765`。目录策略回归发现旧脚本仍要求 `rhythm_timing`、`drag_collect_grid`、`sequence_synthesis` 为生产卡，但 HEAD 三卡都已明确 `runtime_ready / productionReady:false`。已将断言改为验证默认回退和显式实验选择两个分支，脚本通过；未改变任何认证标签或开放自动选择。
