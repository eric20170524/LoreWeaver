# 观形捕捉 Card Lab

第十张 `observe_capture` 使用共享 RuntimeKernel / core Adapter；试验场 URL 参数 `?card=observe_capture`。默认在 0.7 秒蓝环窗口内捕捉，五次有效捕捉达到 100 进度；移动时误点扣 12。错过窗口可继续等待。本卡既有设计只有撤退失败，没有生命耗尽/限时失败，不虚构此类验收。

修复：Phaser 目标与场景重复处理同一 pointerdown；挂机被动通关；暂停误点；退出遗留监听器与反馈 timer；同步销毁后的 UI 操作；非法参数与零方向。宿主读取的 score 和 goal 分别为实际进度与目标进度。捕捉进度只来自真实输入，读快照不能改变状态。

目标及蓝环放大，标题/进度条移到宿主标题下方，运动区域避开上下 HUD。配置提供目标进度、单次增益、误点惩罚、窗口时长及数值范围。

验证命令：

```sh
node --test productize/jobs/check-observe-capture-runtime.mjs
node productize/jobs/run-observe-card-lab-e2e.mjs
npx tsc --noEmit
```

八项状态机回归覆盖单击判定、80 秒无人输入不通关、惩罚与规范进度、暂停冻结、同步销毁、清理、参数归一化及禁用暂停/撤退。Mock 验证不等同浏览器验收。

浏览器套件六场景：默认五次捕捉获胜、误点/错过窗口、暂停/恢复/三次重开、自定义目标、390px 触控默认获胜、`file://` 离线默认获胜。全程使用真实鼠标/触控和真实时间，不写 adapter 状态、不加速时钟、不调用强制胜利。完整报告与截图保存在 `workflow/reports/card-lab/observe_capture/`（忽略生成物）。工程验收 `synthetic:true, releaseEligible:false`，不提升原卡的发布认证等级。

最终六场景全部通过，八项单测、TypeScript 和目录策略检查通过。构建及断言摘要见 [验收 JSON](../reports/card_lab_10_2026-09-21.json)。
