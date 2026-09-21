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

继续推进最后 1 张：`node_iframe_microgame`。这些尚未在本轮逐卡验收，不标记为完成。Card Lab 新卡暂未进入六卡 workflow matrix（现有 GitHub OAuth 无 workflow 写权限）；本地验收脚本已提供，不能宣称该矩阵覆盖第七至二十二张。


第十张 [observe_capture](OBSERVE_CAPTURE_CARD_LAB.md) 已通过八项状态机回归及六场景真实浏览器验收：默认五次捕捉获胜、误点/错过窗口、暂停/恢复/三次重开、自定义目标、移动触屏和离线通关。修复重复点击判定、挂机通关、暂停误点和结算清理；TypeScript 通过，390px 活跃画面已核对。[证据摘要](../reports/card_lab_10_2026-09-21.json) 保存实际构建哈希。其失败设计只有撤退，不宣称验证了不存在的自然死亡。本次构建包含工作区并行养成改动，不将基点 revision 当成干净提交的证明。

`935878f` 八项云端 workflow 均已通过，包括 Golden Candidate E2E `35602510709` 和 Gameplay Card Lab `35602510765`。目录策略回归发现旧脚本仍要求 `rhythm_timing`、`drag_collect_grid`、`sequence_synthesis` 为生产卡，但 HEAD 三卡都已明确 `runtime_ready / productionReady:false`。已将断言改为验证默认回退和显式实验选择两个分支，脚本通过；未改变任何认证标签或开放自动选择。


第十一张 [drag_to_core](DRAG_TO_CORE_CARD_LAB.md) 已接入。六项状态机回归验证暂停/释放、干扰扣分重试、清理、有限参数与规范进度。浏览器六场景验证默认鼠标/触屏/离线胜利、真实干扰、核心外放置、暂停和三次重开。保留原本 `110/fragCount` 增益和全碎片收齐完成的容错规则，默认无误点 13/14 次投放获胜；不宣称本卡存在自然死亡。未提供 timer 的玩法在试验场显示“—”，避免错误显示倒计时归零。

`4d51c4d` 八项远端 workflow 全部通过，包括 Golden Candidate `35604084113` 和 Card Lab `35604084187`；既有 workflow matrix 的覆盖范围仍是前六张。第十一张最终证据见 [11 JSON](../reports/card_lab_11_2026-09-21.json)。

第十二张 [pressure_survival](PRESSURE_SURVIVAL_CARD_LAB.md) 已完成：修复暂停目标点击、输入监听清理、累计点击导致宿主提前胜利、真实压力峰值与成功原因合同。七项单测、六个真实浏览器场景及 TypeScript 通过，包含鼠标/触屏/离线各自完成默认 30 秒目标、默认无人操作自然失败、技能冷却与 40 次点击不提前通关、暂停与三次重开。[验收 JSON](../reports/card_lab_12_2026-09-21.json) 保存实际构建哈希。

`969d10f` 八项远端 workflow 全绿，包括 Golden Candidate `35604940230` 和 Card Lab `35604940125`。新卡的本地工程验证与既有云端六卡矩阵覆盖范围继续分别记录。

第十三张 [rune_connect_sequence](RUNE_CONNECT_SEQUENCE_CARD_LAB.md) 已完成：修复暂停/画布外释放残留、监听器清理、错误惩罚、目标进度与 seed 0。七项单测、六个真实浏览器场景和 TypeScript 通过，包括默认七连胜利、错误起点/终点失败、暂停/三次重开、16 符文及最大吸附半径、390px 触控和离线通关。移动画面已核对。[验收 JSON](../reports/card_lab_13_2026-09-21.json) 保存实际构建哈希，保留 runtime_ready 标记。

`e67719f` 八项远端 workflow 全部通过，包括 Golden Candidate `35605746649` 和 Card Lab `35605746792`。第十四张 [branching_dialogue_check](BRANCHING_DIALOGUE_CHECK_CARD_LAB.md) 完成：八项单测、八个真实浏览器场景、TypeScript 通过，覆盖好/普通/坏结局、物品与阶段条件、暂停结算、三次重开、触屏和离线。修复正分数坏结局被宿主误判成功、过期选项、条件绕过、零奖励、计时器清理及中文正文溢出。390px 画面和正文边界已核对；[验收 JSON](../reports/card_lab_14_2026-09-21.json) 保存最终构建哈希。自定义图验证范围在卡文档中单独说明。

远端推送尚未完成：`4f7a6be` 的父提交包含并行工作 `5606c4c`，修改了 workflow，GitHub 明确拒绝当前缺少 workflow scope 的 OAuth 推送。2026-09-21 再次 fetch 确认远端仍为 `e67719f`；未重写并行提交，也不把本地验收当远端 CI。继续本地推进。

第十五张 [shooter_duel](SHOOTER_DUEL_CARD_LAB.md) 已完成本地工程验收：六项单测、六个真实浏览器场景、TypeScript 通过。默认 100/300 HP、60 秒配置下，键盘、触屏、离线鼠标分别完成 Boss 击杀；另有默认自然死亡、配置超时、暂停和三次重开。修复宿主分数提前结束、输入/对象/反馈 timer 清理，补齐按住射击并移除共享适配器硬编码 IP 敌人名。390px 活跃画面已检查。[验收 JSON](../reports/card_lab_15_2026-09-21.json) 保存构建哈希与各场景配置。第十六张 [maze_exploration_choice](MAZE_EXPLORATION_CHOICE_CARD_LAB.md) 已完成本地工程验收：九项单测、六个真实浏览器场景、TypeScript 通过。修复零能量默认值、重复/暂停救援、按钮冒泡额外移动、分数提前通关、地图救援点位置与资源清理；真实浏览器发现并修复连续短按被 JustDown 轮询漏掉。默认键盘/触屏/离线均实际走到出口，零能量与零成本分支、暂停重开、尺寸/种子可达性均有证据。390px 弹窗已核对，[验收 JSON](../reports/card_lab_16_2026-09-21.json) 保存构建哈希。没有自然死亡或限时失败，不虚构此类结果。

第十七张 [platform_escape](PLATFORM_ESCAPE_CARD_LAB.md) 已完成本地工程验收：八项单测、六个真实浏览器场景和 TypeScript 通过。修复死亡过程中清理后继续访问对象、短按跳跃漏输入、监听器和键盘清理、暂停/退出开关以及宿主规范目标。随机速度会造成障碍追越，统一为原范围中值 240 保留随机类型和默认路程；100 组种子的默认跳跃间隔验证无伤通过。默认约 22.5 秒键盘、触屏、离线通关，默认自然死亡、暂停/三次重开与连续短按都有真实浏览器证据。390px 画面已核对，[验收 JSON](../reports/card_lab_17_2026-09-21.json) 保存构建哈希。当前累计 17/23 张本地工程验收；发布认证和远端推送限制仍未解决。

第十八张 [hazard_collect_waves](HAZARD_COLLECT_WAVES_CARD_LAB.md) 已完成本地工程验收：九项单测、七个真实浏览器场景、TypeScript 和通用适配器烟测通过。修复暂停/过期拾取、致死迭代清理、零生命默认值、输入和资源清理、采集分数提前判胜；补齐键盘移动、场地边界和参数供给校验，保留最高 10 波/首波 20 颗的既有配置范围。默认完整 45 秒三波在鼠标、触屏、离线均通关，缺额失败、默认六次落雷致死、暂停拾取拦截及三次重开都有证据。最大配置仅验证启动/撤退，不冒称最长配置通关。390px 画面已核对，[验收 JSON](../reports/card_lab_18_2026-09-21.json) 保存最终构建哈希；缺少正式环境/音乐的警告保留。当前累计 18/23 张本地工程验收。

第十九张 [sequence_puzzle_combo](SEQUENCE_PUZZLE_COMBO_CARD_LAB.md) 已完成本地工程验收：八项单测、六个真实浏览器场景、TypeScript 与通用烟测通过。修复演示/切换阶段输入竞态、重复创建拼图、暂停/画布外拖拽、随机碎片重叠、六块以上颜色复用及结算清理；数字键可完成两阶段，进度与分数一致。浏览器逐次观察可见亮灯而非读取隐藏答案，默认鼠标/触屏/离线均通关；错误顺序和错槽重试、暂停/三次重开及最大八灯八块键盘通关均通过。390px 拼图画面已核对，[验收 JSON](../reports/card_lab_19_2026-09-21.json) 保存最终构建哈希和亮灯/输入记录。没有死亡或超时失败，不虚构此类结果。累计 19/23 张本地工程验收。

第二十张 [rhythm_then_pickup](RHYTHM_THEN_PICKUP_CARD_LAB.md) 已完成本地工程验收：八项单测、七个真实浏览器场景、TypeScript 与通用烟测通过。修复圆环双重点击判定、同拍刷命中、最亮时刻与判定错半拍、暂停后节拍漂移、拾取暂停/过期回调、分数提前胜利及结算/timer清理。默认 12 拍加 5 次拾取在键盘、触屏、离线鼠标均实际通关；单拍去重、离拍失误、拾取超时、两阶段暂停与三次重开均通过。原目录最高 40 拍/20 目标配置保留，最大配置仅验证启动与撤退。390px 画面已核对，[验收 JSON](../reports/card_lab_20_2026-09-21.json) 保存最终构建和真实输入记录。累计 20/23 张本地工程验收；远端推送与发布认证仍未完成。

第二十一张 [qix_area_capture](QIX_AREA_CAPTURE_CARD_LAB.md) 已完成本地工程验收：九项单测、七个真实浏览器场景、TypeScript 与通用烟测通过。修复安全边框洪水填充、45% 猜测阈值、敌人反弹滞留占领区、回撤/过短路径、暂停目的地、零敌人参数、同帧结算清理和宿主分数目标。默认两敌人、90 秒、70% 目标在键盘、触屏、离线均实际通关；默认五次断线致死、20 秒配置自然超时、暂停与三次重开、48×36 零敌人填充均通过。浏览器按可见状态规划路线后发送真实输入，未降低默认目标或改写状态。390px 画面已核对，[验收 JSON](../reports/card_lab_21_2026-09-21.json) 保存实际路线和构建哈希。累计 21/23 张本地工程验收。

第二十二张 [point_drag_progression](POINT_DRAG_PROGRESSION_CARD_LAB.md) 已完成本地工程验收：十项单测、七个真实浏览器场景、TypeScript 和通用烟测通过。修复落空满失稳不失败、同次满失稳先判胜、隐藏点位匹配、初始阶段和供给不一致、球体重叠、暂停/画布外拖拽、错误分支默认值及输入/资源清理。阶段按目标比例缩放，保留顺滑增益和错配少量进度，键盘可完整操作。默认匹配通关、错配和落空自然失败、暂停与三次重开、200 目标键盘完整通关、触屏与离线均通过。390px 画面已核对，[验收 JSON](../reports/card_lab_22_2026-09-21.json) 保存构建哈希。累计 22/23 张本地工程验收。

第二十三张 [node_iframe_microgame](NODE_IFRAME_MICROGAME_CARD_LAB.md) 已通过九项状态机测试、八个真实浏览器场景与 TypeScript。真实 H5 子游戏覆盖编码、标准/旧结果、奖励去重、来源校验、退出/重开、双倒计时暂停、自然/宿主超时、触控和离线。修复 file:// URL 与 MessageEvent 来源序列化差异，同时保留发送窗口校验。390px 画面已核对，[验收 JSON](../reports/card_lab_23_2026-09-21.json) 保存构建哈希。累计 23/23 张已有逐卡本地工程验收；这不等于最终同源码全库验收，也不等于远端 CI 或发布认证。

接下来检查共享合同（零种子、终局玩法 HUD、iframe 源配置），再执行当前工作区全库汇总验证和双构建双浏览器 replay。远端 OAuth 缺少 workflow scope 的推送限制仍需解决；不重写并行提交。
