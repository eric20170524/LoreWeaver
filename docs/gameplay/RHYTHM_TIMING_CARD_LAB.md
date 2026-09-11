# 第二张玩法卡：rhythm_timing

沿用 `feat/fangame-co-development`，跳过 survivor_horde，不合入 main。

## 修复的规则缺口

旧 rhythm 卡声明 Perfect/Good 窗口和连击目标，但 TapReactionAdapter 的球体点击为随机加 1–5 分；没有执行这些判定。卡片同时声称 iframe/html_canvas 和 production_ready，不能用这些旧标签证明当前实现。

本轮仍走 `compileRuntimeSpec → LoreWeaverRuntimeKernel → TapReactionAdapter`。新增纯规则模块 `RhythmTimingRound`，不是演示专用替代游戏。纯节奏默认 `skipBoss=true`；显式 `skipBoss=false` 保留旧反应/Boss兼容分支，该分支不包含在本轮节奏验收中。

每拍一个目标时刻。Perfect 为 ±80ms、固定10分；Good 为 ±160ms、固定5分。窗口含边界。过早或漏拍只结算一次 Miss、扣生命并清空当前连击；历史最佳连击保留。连续点击与键盘自动重复不能重复获益。时钟来自适配器运行帧 delta，不使用墙钟或 tween 完成回调结算；暂停冻结规则和输入。长帧按时间顺序补记漏拍，死亡后立即停止。

胜利同时要求 `score >= targetProgress` 与 `bestCombo >= requiredBestCombo`。TapReactionAdapter 在 finish 入口拒绝未满足真实条件的 success 请求，防止宿主历史分数捷径越过连击条件。正常完成、退出和失败仍使用同一 NodeResult。默认为45秒、100生命、目标100、最佳连击8，可由10次Perfect或20次Good完成。自定义不合理参数可能无法取胜，届时按时限失败，不放松规则。

规范参数覆盖同义参数：beatIntervalMs/spawnIntervalMs、targetProgress/goalValue、durationSec/duration。非法数值使用有界默认值，窗口不得重叠。旧 orbLifetimeMs/difficulty 仅供旧反应模式，不再作为纯节奏生效参数展示。卡片降为 runtime_ready / productionReady=false，历史认证单列保留。

## 试玩和检查

```bash
node productize/jobs/build-card-lab.mjs
# 打开 dist/card-lab/index.html，在下拉菜单选「02 · 节奏点击」
# HTTP 子路径或 file:// 均支持；亦可使用 ?card=rhythm_timing
node --test productize/jobs/check-rhythm-timing-runtime.mjs
npx playwright install chromium
node productize/jobs/run-rhythm-card-lab-e2e.mjs
```

仍保留第一张闪避反击卡及其六项浏览器回归；两张卡共享静态入口，可切换，不访问工作区存档和模型API。可编辑生命、时限、进度、连击要求；修改仅在新一局应用。

23项规则/适配器测试覆盖：窗口边界、默认Perfect/Good通关、唯一判定、漏拍补偿、组合目标、非法参数、状态快照、真实适配器输入、暂停、宿主同步销毁、监听清理和奖励唯一结算。使用Phaser替身，不代表图形验收。

八项浏览器场景：默认真实输入通关；Good/Perfect/过早/漏拍；默认漏拍死亡；配置超时；低进度高连击目标不能被宿主绕过；暂停/恢复/退出/三次重开/切卡；390px触控模拟；file://启动。只读运行态，没有修改血量/分数/阶段、加速时钟或强制通关。

报告：`workflow/reports/card-lab/rhythm_timing/browser-latest.json`。CI `Gameplay Card Lab` 顺序复跑闪避反击和节奏卡；只有两者通过才上传可玩包。源码修订与构建文件SHA256写入报告。测试计划/入口不等于已通过，结论以该提交实际报告为准。

## 当前证据与边界

本地模型/适配器23项通过；与既有闪避反击9项和survivor战斗16项合跑48项通过。本地系统浏览器阻止导航（ERR_BLOCKED_BY_ADMINISTRATOR），没有改变该限制，浏览器验收交由仓库既有授权的 GitHub Actions 路径执行。云端结论须绑定本轮提交，不沿用第一张卡的绿色结果。

正式音乐节拍同步/音频延迟校准、历史Boss分支、实体手机、多浏览器、600秒长测、共享标题显示异常、完整导出发布认证均未纳入本轮。公开站点尚未部署，CI可玩包不等于公网网址。下一张为 drag_collect_grid。

## 首轮云端证据及测试时序修正

`5edda20` / Actions `34609264057`：闪避反击6/6通过；节奏5/8通过。节奏三项失败记录为真实输入延迟造成的期望等级不符：实际+82.82ms正确判Good，实际-63.48ms正确判Perfect，触控+123.28ms正确判Good。没有更改游戏80/160ms窗口或胜负要求。

脚本现在预先计算输入坐标、提前发出驱动指令，并逐次核对实际接受offset与Perfect/Good/Miss、固定分数的对应关系；默认通关验证真实目标条件，不要求自动化驱动每次都Perfect。各类判定测试仍必须实际取得至少一次Good和Perfect；重复输入紧接首次输入而不是在耗时快照/截图后发送。每次尝试保留观测与实际命中记录；中间截图移至专门观察漏拍的场景，避免截屏阻塞下一个节拍。该修正只改变测试控制器，核心规则未放宽。
