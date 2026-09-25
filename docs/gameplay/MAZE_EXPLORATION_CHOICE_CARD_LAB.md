# 迷宫抉择 Card Lab

第十六张 `maze_exploration_choice` 使用共享 RuntimeKernel / core Adapter，入口 `?card=maze_exploration_choice`。默认 15×11 迷宫，初始能量 80，救援消耗 60。按方向键/WASD或点击角色周围逐格移动，黄色格触发救援选择，绿色格出口通关。救援是可选奖励，跳过或能量不足仍可到达出口；本卡没有死亡或超时失败，只有撤退。

修复零能量回退成 80、救援重复扣费/暂停生效、选择按钮事件继续冒泡导致额外移动、输入/键盘/图形引用泄漏、宿主移动分数提前通关。只有出口决定成功，goalValue=0。救援点放在生成迷宫的出口路径内部，并明确绘制；避免部分地图中先经过出口而无法触发救援。初始移动锁重置、位移限定单个相邻格。

真实浏览器复现 JustDown 逐帧轮询漏掉连续短按；改为实际 keydown 事件驱动，并按 DOM 事件对象去重，仍受移动冷却限制。独立按键事件可重复移动，同一个事件不会重复推进。没有通过延长按键或放松路径断言隐藏问题。

公开参数包括宽/高 5–31、初始能量/救援消耗 0–1000、uint32 地图种子。偶数尺寸向上归一为奇数。seed 包括 0 可复现；不同尺寸与 24 个种子的状态机检查验证可达出口和中途救援点。迷宫和弹窗避开宿主 HUD，中文文字支持逐字符换行。

```sh
node --test productize/jobs/check-maze-runtime.mjs
node productize/jobs/run-maze-card-lab-e2e.mjs
npx tsc --noEmit
```

九项状态机回归覆盖墙体/冷却/宿主目标、零能量、扣费一次、暂停、同 seed、清理、参数/权限、尺寸/种子路径不变量、独立短按与重复事件。

六个真实 Chromium 场景：默认键盘救援并出口通关、零能量救援不成功但走出迷宫、暂停选择与三次重开、偶数尺寸归一/零成本救援、390px 默认触屏救援通关、`file://` 默认拒绝救援通关。浏览器根据完整可见地图寻路，逐步发送真实键盘/鼠标/触屏输入并确认坐标，不修改位置、不瞬移、不调用胜利。

报告和截图在 `workflow/reports/card-lab/maze_exploration_choice/`。工程证据 synthetic:true、releaseEligible:false，保持 runtime_ready。revision 只标识构建基点，实际 bundle 的 SHA-256 标识包含未提交/并行变更的测试对象；单元 seed 验证不冒称双浏览器跨构建认证。

最终九项单测、六个真实浏览器场景及 TypeScript 全部通过。390px 救援弹窗画面已核对。[验收摘要](../reports/card_lab_16_2026-09-21.json)。
