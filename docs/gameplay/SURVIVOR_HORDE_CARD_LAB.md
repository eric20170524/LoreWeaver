# 第七张玩法卡：survivor_horde

独立入口：构建 Card Lab 后打开 `?card=survivor_horde`。复用 RuntimeKernel → GameRunner → SurvivorHordeAdapter；默认 120 秒、100 HP，用户可在开局前设置 10～600 秒生存时间和初始生命。点击或拖动选择移动目标，自动攻击敌人；生存至零秒胜利，生命耗尽失败。

```sh
node --test productize/jobs/check-survivor-combat-runtime.mjs
node productize/jobs/run-survivor-card-lab-e2e.mjs
```

本轮 17 项 combat/lifecycle 单测及六个真实 Chromium 输入场景通过：公开十秒配置自然胜利、默认配置鼠标移动及退出、真实追敌碰撞导致一 HP 耗尽、暂停/恢复/重开、移动触控生存、file:// 离线启动及退出。没有编辑战斗状态、强制结算或加速时钟。报告在 `workflow/reports/card-lab/survivor_horde/browser-latest.json`。

退出测试发现 Phaser 销毁 Group 后 observation 仍引用其 children。Adapter 销毁时现在释放 groups/player 引用，保留可读的 ended/destroyed 状态和结果。共享标题字间距改为数字，避免文本绘制将字符偏移量拼接成字符串而只显示首字。

Golden replay 的 Linux Firefox WebGL 启动问题已通过 Xvfb/Mesa 解决，[CI run 35590056668](https://github.com/eric20170524/LoreWeaver/actions/runs/35590056668) 全绿，包含同 seed、双 build、Chromium/Firefox 矩阵。该 run 对应 `9c3d6bb`，不冒充后续 Card Lab 改动的云端结果。

范围限制：原型美术、自动化浏览器工程验收；没有宣称真人体验、实体手机性能、全部 modifier 组合或发布认证。十秒场景验证公开参数及完整结算，默认 120 秒场景本轮验证移动和退出，未将其描述为完整默认时长存活验收。
