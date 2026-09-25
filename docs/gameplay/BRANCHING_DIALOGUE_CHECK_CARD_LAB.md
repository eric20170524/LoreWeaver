# 分支对话检定 Card Lab

第十四张 `branching_dialogue_check` 通过共享 RuntimeKernel / core Adapter 接入，入口 `?card=branching_dialogue_check`。默认图包括好、普通、坏结局，以及物品/阶段条件与替代路径。提供初始好感、检定阶段覆盖（0 跟随玩家）、关键物品条件配置；布尔参数使用复选框。

修复坏结局正分数触发宿主提前胜利：`goalValue=0`，最终胜败只能由图的 ending/fail 决定。修复过期/伪造选项、条件绕过、零档位奖励被当成一档、非法好感/阶段、无效图引用、重复标记和结算后的 UI/计时器引用。条件检查在实际选择时执行，未满足且有 fallback 时改道，没有 fallback 则保持当前节点。保留既有替代路径的好感变化规则。

结局画面保留 900ms 后结算，暂停会冻结这段时间。退出取消结局计时器。无效图以 condition_failed 结束，不崩溃或静默挂起。参数 `dialogueGraph` 的自定义图仍由 core 接收；试验场表单当前展示默认图和它的条件参数，自定义图结构与零奖励档位由单元测试覆盖，不声称浏览器已遍历任意用户图。

```sh
node --test productize/jobs/check-dialogue-runtime.mjs
node productize/jobs/run-dialogue-card-lab-e2e.mjs
npx tsc --noEmit
```

八项状态机回归：好/坏结局、条件改道/解锁、旧选项/伪造选项、暂停及无替代锁定、零档位及退出计时器、无效图、控制开关、默认跟随实际玩家阶段。

八个真实 Chromium 场景：默认好结局、无物品改道普通结局、持物品解锁好结局、低阶段改道、高阶段坏结局（正分数仍失败）、暂停选择/结局计时器/三次重开、390px 触屏好结局、`file://` 离线普通结局。仅读取可见选项坐标并发送真实点击，不修改运行中状态或调用强制结算。

工程报告/截图在 `workflow/reports/card-lab/branching_dialogue_check/`；标记 synthetic:true、releaseEligible:false，保持 runtime_ready。构建含未提交代码和并行工作区变更，revision 为基点，实际 bundle SHA-256 标识测试对象。

最终八项单测、八个浏览器场景和 TypeScript 全部通过。Phaser 中文逐字符换行修复后，390px 正文边界断言及实际画面均已检查。[验收摘要](../reports/card_lab_14_2026-09-21.json)。
