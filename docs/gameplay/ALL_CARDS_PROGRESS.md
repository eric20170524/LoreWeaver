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

## 全库范围与后续验收

范围为 cards 目录中的 23 张顶层卡（含 iframe 容器卡），不凭卡片 `status` 标签认定本轮完成。前六张有 Card Lab 真实输入套件；Survivor 有 Golden Candidate、独立 demo 和 replay 套件。其余卡逐一核对参数、真实操作、胜败/退出、暂停/重开、移动输入和离线构建；不把只启动成功当完整验收。

已有 Card Lab：`dodge_counter_boss`、`rhythm_timing`、`drag_collect_grid`、`sequence_synthesis`、`turn_based_skill_battle`、`side_scrolling_brawler`。本轮 92 项状态机回归通过，浏览器复验结果以 workflow/reports/card-lab 下当前报告为准。

本轮前六张卡浏览器套件最终共 42 个场景通过（6 / 8 / 7 / 8 / 8 / 5）。顺序合成首次复验的 `maximum-recipe` 失败揭示真实输入问题：Phaser 在 POST_STEP 清空队列之前会重新遍历 DOM 键盘事件，导致同一 keydown 重复投料。Adapter 按 DOM 事件对象去重，不节流不同事件、不修改配方、不放慢浏览器输入。新增重复事件交错单测后该卡 22 项单测及完整八场景均通过（最后报告时间 2026-09-21T10:35:47.795Z）。各报告含各自构建哈希；本轮本地套件跨修复构建执行，不能当成远端单一最终 revision 的 CI 证明。

继续推进：`survivor_horde` 的 CI 复验及试验场入口；随后 `reaction_pick`、`energy_balance`、`observe_capture`、`drag_to_core`、`pressure_survival`、`rune_connect_sequence`、`branching_dialogue_check`、`shooter_duel`、`maze_exploration_choice`、`platform_escape`、`hazard_collect_waves`、`sequence_puzzle_combo`、`rhythm_then_pickup`、`qix_area_capture`、`point_drag_progression`、`node_iframe_microgame`。这些尚未在本轮逐卡验收，不标记为完成。
