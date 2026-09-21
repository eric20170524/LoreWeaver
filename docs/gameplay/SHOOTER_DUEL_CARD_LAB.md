# 对决射击 Card Lab

第十五张 `shooter_duel` 通过共享 RuntimeKernel / core Adapter 接入，入口 `?card=shooter_duel`。默认玩家 100 HP、Boss 300 HP、60 秒。A/D 或方向键移动，按住 J/空格连续射击；鼠标/触屏按住拖动同时移动和开火，每发仍受默认 220ms 冷却限制。击败 Boss 获胜，玩家死亡或超时失败。

修复宿主命中分数提前结束对决、退出遗留监听/显示引用、命中反馈 timer 注册不断增长，以及非法参数；补齐按住射击让移动触控能同时操作。`goalValue=0` 禁用宿主分数胜利，结果由 Boss HP、玩家 HP 与计时决定。卡定义同步 `boss_defeated` 成功原因和 timeout 失败。Keyboard Key、弹丸、输入、反馈 timer 均随场景清理。

共享适配器移除硬编码 IP 敌人名，素材通过配置 bossId 或通用 boss 解析，保留既有 runtime art 接口。HUD 和 Boss/玩家位置避开宿主标题与底栏。试验场为程序图形工程验收，不新增或冒称正式美术。

```sh
node --test productize/jobs/check-shooter-runtime.mjs
node productize/jobs/run-shooter-card-lab-e2e.mjs
npx tsc --noEmit
```

六项状态机回归：冷却与暂停、按住射击、实际弹丸命中与完整击杀、自然死亡/超时、清理、参数与控制权限。Mock 与真实浏览器证据分开。

六个 Chromium 真实输入场景：默认键盘击杀、默认无人操作被弹丸击杀、3 秒配置自然超时、暂停后恢复击杀并三次重开、390px 默认触屏击杀、`file://` 默认鼠标击杀。浏览器读取坐标/巡逻速度以预测弹道，只发送真实键盘/鼠标/CDP 触控，不写游戏状态、不直接调用伤害或胜利、不加速时钟。默认胜利三场都保持 100/300 HP 和 60 秒配置。

工程证据 `synthetic:true, releaseEligible:false`，保留 runtime_ready/productionReady:false。完整报告/截图在 `workflow/reports/card-lab/shooter_duel/`。构建含未提交及并行变更，revision 为 checkout 基点，实际文件以 SHA-256 标识。未把此验收扩大成设备性能、全素材或发布认证。

最终六项单测、六个真实浏览器场景及 TypeScript 全部通过，390px 活跃画面已核对。[验收 JSON](../reports/card_lab_15_2026-09-21.json)。
