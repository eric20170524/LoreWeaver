# 顺序连线 Card Lab

第十三张 `rune_connect_sequence` 经共享 RuntimeKernel / core Adapter 接入，入口 `?card=rune_connect_sequence`。按可见提示从蓝色起点拖到黄色终点，默认八个符文完成七条连线获胜。起点/终点错误消耗容错，默认六次失败；空白释放取消拖动，可暂停和撤退。

修复暂停后的松手仍推进、画布外释放残留拖动、监听器/对象引用泄漏、结算后继续刷新已销毁 UI、配置范围缺失和宿主目标可能提前结算。规范 goal 为 `(runeCount - 1) * 10`，score 仍为已完成连线数乘十。内部 `wrongLinkPenalty` 原先被忽略，现在计入失误预算；公共默认仍为一次错误消耗一次。错误提示独立显示，不被进度刷新立即覆盖。

seed 0 不再替换成时间戳，使用明确的 32 位 PRNG 状态；相同 seed 的布局稳定。吸附范围重叠时选择最近符文，保证最大 16 符文/60px 吸附半径仍可选择每个节点。符文和数字放大，HUD 避开宿主标题/底栏。

```sh
node --test productize/jobs/check-rune-runtime.mjs
node productize/jobs/run-rune-card-lab-e2e.mjs
npx tsc --noEmit
```

七项状态机回归：完整连线目标、暂停中释放、画布外释放、错误权重与单次结算、清理、seed 0 稳定且区别于 seed 1、参数与控制开关。Mock 验证不等同浏览器。

六场景 Chromium 真实输入：默认七连胜利、错误起点/终点失败、空白释放/暂停恢复/三次重开、最大 16 符文与 60px 吸附、390px 默认触控胜利、`file://` 默认离线胜利。测试仅读取当前可见提示对应的坐标并发送鼠标/CDP 触摸，不写状态、不直接调用玩法动作或强制通关。

生成报告/截图在 `workflow/reports/card-lab/rune_connect_sequence/`。`synthetic:true, releaseEligible:false`；保留原 `runtime_ready / productionReady:false`。构建包含未提交卡片及并行工作区代码，revision 只是 checkout 基点，实际测试 payload 由 SHA-256 标识。seed 回归是本卡单元级验证，不能代替 Survivor 双构建双浏览器 replay gate。

最终七项单测、六场景真实浏览器及 TypeScript 全部通过；390px 活跃画面已核对。[验收摘要](../reports/card_lab_13_2026-09-21.json)。
