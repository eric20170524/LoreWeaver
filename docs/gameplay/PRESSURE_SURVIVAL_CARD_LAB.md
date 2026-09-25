# 极限抗压 Card Lab

第十二张 `pressure_survival` 使用共享 RuntimeKernel / core Adapter，入口 `?card=pressure_survival`。默认坚持 30 秒，压力每秒增长 8，普通点击减压 6；紫色目标额外减压 10。强压技能立即减压 28，持续 2 秒降低压力增长并增强点击，冷却 5 秒。压力达到 100 失败，计时完成获胜，可撤退。

修复：宿主用累计点击分数提前通关；暂停时目标点击仍生效；场景输入监听未清理；结束后仍引用 UI；非法参数；pressurePeak 错误记录最终压力。规范 score/goal 现在为实际生存秒数/配置时长，点击数单独记录。目标与技能统一通过场景输入判定，一次触控只消费一个目标；目标命中仍获得既有普通点击加额外奖励。卡定义的成功原因改为实际运行时 `timer_expired`，未将计时成功改成强制目标结算。

界面避开宿主标题和底栏，放大紫色目标、技能按钮和文字。公开参数为生存秒数、压力增长、点击减压与技能冷却，均有有限范围。

验证命令：

```sh
node --test productize/jobs/check-pressure-runtime.mjs
node productize/jobs/run-pressure-card-lab-e2e.mjs
npx tsc --noEmit
```

七项状态机测试包含点击不代替生存时间、自然胜败单次结算、暂停目标、技能冷却与真实峰值、资源清理、过期目标与参数、禁用暂停/撤退。Mock 只验证状态机，浏览器验证独立进行。

六场景真实 Chromium 套件：默认 30 秒鼠标胜利、默认无人操作自然失败、技能冷却与 40 次点击不提前结算、暂停目标/技能后恢复及三次重开、390px 默认 30 秒触屏胜利、`file://` 默认 30 秒离线胜利。只读取坐标和可见状态并发送真实输入，未写入 gameplay 状态或加速时间。

完整报告和截图位于 `workflow/reports/card-lab/pressure_survival/`。工程证据标记 `synthetic:true, releaseEligible:false`；并非设备性能、美术或发布认证。构建包含未提交代码及并行工作区改动，revision 为 checkout 基点，实际 payload 用报告的 SHA-256 标识。

最终七项单测、六个真实浏览器场景及 TypeScript 全部通过。390px 活跃 HUD 已检查。[验收摘要](../reports/card_lab_12_2026-09-21.json) 保存构建哈希和场景结果。
