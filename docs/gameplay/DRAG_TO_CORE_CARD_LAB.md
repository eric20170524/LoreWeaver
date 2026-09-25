# 碎片归核 Card Lab

第十一张 `drag_to_core` 通过共享 RuntimeKernel / core Adapter 接入，URL 参数为 `?card=drag_to_core`。拖动金色碎片，在蓝色核心松手；红色干扰区会扣除进度，保留碎片供重试。

保留既有容错规则：每次投入获得 `110 / fragCount` 进度，达到 100 获胜，默认无误点投入 13/14 个碎片即可通关；投入全部碎片也会完成目标，避免扣分后剩余物资不足形成死局。这不是强制胜利测试钩子。本卡自然失败条件只有撤退，没有限时或生命耗尽失败。

修复暂停中拖动/投放、画布外释放后残留拖动、无按键悬停移动、未清理输入监听、销毁后的对象引用、宿主以原始分数提前结算。`score/goalValue` 现在分别为真实汇聚进度/100。碎片数、干扰数、速度、扣分均进行有限范围校验；旧版无限碎片配置在基线回归中触发内存耗尽，修复后会归一化为默认值。碎片放大且初始分布更均匀，HUD 和干扰运动范围避开宿主标题/底栏。

验证命令：

```sh
node --test productize/jobs/check-drag-core-runtime.mjs
node productize/jobs/run-drag-core-card-lab-e2e.mjs
npx tsc --noEmit
```

六项状态机回归覆盖真实输入事件判定、同步宿主销毁、暂停/悬停/画布外释放、干扰扣分与重试、清理、参数与权限。Mock 不代表浏览器。

六场景 Chromium 浏览器套件覆盖默认 14 碎片/3 干扰获胜、真实干扰落点与撤退、暂停恢复与三次重开、核心外放置后重试、390px 默认触控获胜、`file://` 默认离线获胜。操作只读取坐标快照，然后发送真实鼠标/CDP 触摸，不修改 gameplay 状态、不调用强制获胜、不加速时钟。

工程证据标记 `synthetic:true, releaseEligible:false`，不提升发布认证。报告/截图在忽略生成目录 `workflow/reports/card-lab/drag_to_core/`。构建时含本轮与并行未提交代码，因此 checkout revision 只是基点，实际 bundle 以报告 SHA-256 为准。

最终六个浏览器场景、六项单测及 TypeScript 全部通过；390px 活跃画面已检查。无倒计时字段显示“—”，不显示虚假的 0 秒。[验收摘要](../reports/card_lab_11_2026-09-21.json) 保存最终构建哈希和各场景结果。
