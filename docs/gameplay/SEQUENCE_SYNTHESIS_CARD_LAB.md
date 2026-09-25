# 第四张玩法卡：sequence_synthesis

沿用 `feat/fangame-co-development` / Draft PR #4；跳过 survivor_horde，不合并 main。

## 当前范围

试验场新增「04 · 顺序合成」，仍走 compileRuntimeSpec → RuntimeKernel → SequenceSynthesisAdapter，不复制游戏规则。默认45秒、4步配方、6种材料、种子0。支持鼠标/触摸点选与对应数字键1～8；长按键重复事件不投入材料。样例使用内存状态，不覆盖用户工作区或存档。

## 规则与修复

- 原实现只累计elapsedSeconds，没有执行总时限；现按运行delta倒计时，超时失败，暂停冻结。
- 原seed=0会因 `||` 回退到当前时间，随机比较器sort也不保证跨环境一致；现0是合法确定种子，使用Fisher–Yates，池和配方可重复。
- recipeLength限定1～20，materialPoolSize限定2～8（实际可用素材8种，不再宣称30种），所有数值有界处理。
- 原错误仅扣进度条、不撤销步骤，完成最后一步时直接跳100%。现进度代表已正确完成的配方前缀：错料回退 `ceil(penalty * recipeLength / 100)` 步，需重做；默认4步/30%回退2步。0惩罚保留。这个语义变化已写入卡和操作说明，不能沿用旧手感认证。
- 连错达到阈值时默认重置配方并继续；explodeFails=true则失败。一次正确投入会清除连错计数，总错误数仍保留。
- 未完成整份配方时拒绝外层强制成功；成功/失败允许宿主同步销毁，不再访问已释放UI；输入重入和终局重复输入不能额外推进。
- 输入监听交给生命周期清理，保留宿主监听；pause/retreat尊重显式禁用配置。
- 老demo `forceComplete()` 仅显式context.allowTestCommands=true时可用。本试验场无此开关、无可写状态API，也不会在浏览器测试中调用它。依赖旧强制完成helper的历史demo脚本需另行迁移，不能作为本版真实通关证据。
- 卡描述改为phaser_scene而非iframe；历史production_ready说明保留在historicalCertification，不继承为本版认证。

## 复验入口

```bash
node --test productize/jobs/check-sequence-synthesis-runtime.mjs
node productize/jobs/build-card-lab.mjs
# 打开 dist/card-lab/index.html 并选择顺序合成，或 ?card=sequence_synthesis
npx playwright install chromium
node productize/jobs/run-sequence-card-lab-e2e.mjs
```

本地规则回归21项通过；合并前三卡和survivor既有回归88项通过；TypeScript与静态试验场构建通过。Phaser对象为单元替身，不等于浏览器验收。本地系统Chromium的file导航被管理员策略拦截，未尝试绕过；浏览器验收交给已授权GitHub Actions。

云端设计8个独立场景：默认真实鼠标/数字键通关、惩罚回退/过热重置后恢复、过热失败、真实5秒超时、暂停/重开/seed0/切卡、20步8材料边界、390px触摸通关、file离线启动。只读snapshot读取与画面相同的配方和按钮坐标；不改血量/分数、不加速时钟、不直接调用adapter操作或finish。报告为 `workflow/reports/card-lab/sequence_synthesis/browser-latest.json`。配置检查不等于通过，结果绑定对应Actions提交。

## 前三张卡的基线

`82ac34a` 的 Actions `34658747087`，闪避反击、节奏点击、拖拽收集三个独立matrix任务均通过。其通过不能自动继承给本轮修改后的共享试玩包，CI会在同一新提交上重跑四张卡。

## 未验收

公开站点部署、实体手机/设备FPS、长期压力、任意主题文本溢出、音乐/正式美术、完整工作台→导出发布流程。共享标题渲染异常仍需跟进。旧Golden Candidate回放仍有失败，与本卡通过范围分开记录。下一张 turn_based_skill_battle。
