# 玩法卡试验场：按卡验证，不扩展 survivor_horde

## 顺序与边界

第一张：`dodge_counter_boss`；下一张：`rhythm_timing`，随后 `drag_collect_grid`、`sequence_synthesis`、`turn_based_skill_battle`，再逐项推进其余非 survivor 卡。这里只把第一张接入，不宣称全库已验收。

已有卡定义保留在 `minigame_master/gameplay/cards`；执行仍来自 `compileRuntimeSpec → LoreWeaverRuntimeKernel → GameRunner → core adapter`。试验场不复制战斗逻辑，不提供强制胜利、改血量或改分数的接口。页面 `window.__CARD_LAB__.snapshot()` 仅用于读取诊断快照。

第一张卡补齐实际支持的12个数值参数、拖拽/点击/空格操作、破势或HP胜利规则、超时失败以及测试入口。卡的 min/max 为作者编辑范围，不声称运行时对所有外部 manifest 都执行该范围钳制。保持 runtime_ready / productionReady=false，不靠修改标签获得认证。

## 本地构建与试玩

```bash
npm ci
node productize/jobs/build-card-lab.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist/card-lab
```

浏览器打开 `http://127.0.0.1:4173/`。无需后端、大模型 Key、石牧工作区或修炼解锁。样例使用独立内存状态，不读取/删除浏览器原有存档。按开始按钮进入实际关卡，页面可调整总时限和初始生命，修改只影响下一局。

## 云端验证

```bash
node --test productize/jobs/check-dodge-counter-runtime.mjs
npx playwright install chromium
node productize/jobs/run-card-lab-e2e.mjs
```

GitHub Actions `Gameplay Card Lab` 在 PR 更新时运行。浏览器脚本用实际静态构建、HTTP 子路径、真实鼠标/键盘/触控输入；不编辑状态、不加速时钟、不调用 finish(true)。六个场景分别是：默认六次反击胜利、实际拖入攻击区导致HP归零、公开十秒配置超时、暂停/恢复/退出/三次重开、390px移动触控模拟，以及同一构建包的 file:// 离线启动。

成功才上传可玩包 `gameplay-card-lab-playable`；证据包 `gameplay-card-lab-evidence` 保留每项结果与截图，失败时附 trace。报告 `workflow/reports/card-lab/browser-latest.json` 包含实际构建revision、文件哈希、浏览器版本和各项结果。报告标记 synthetic=true、releaseEligible=false：不是自然连续闯关、真人体验、物理手机或全设备性能认证。

构建产物：`dist/card-lab/`，相对路径可用于静态托管；包含原项目许可证及第三方声明。`build-manifest.json` 记录所测文件哈希。诊断代码来自同一个运行时，而不是演示专用替代实现。

## 公开网址

构建包与云端浏览器验证不等于公开托管。仓库需要单独启用 Pages（或连接已授权的静态部署服务）后才能交付真实可访问的网址。当前脚本不会请求管理员Token、不会修改站点设置、不会把本地工作区或密钥打包发布。

## 尚待验收

其他卡与 modifier 组合；正式角色动画与音效；长期压力、设备FPS；工作台到导出完整发布流程；大幅自定义参数组合。每张卡只有对应提交的报告可证明已测范围，计划和工作流配置本身不是通过证据。

## 首轮云端回归修复

`a2c572d` 的 Actions 34588436890 实测四项通过、一项失败：暂停按钮保留 DOM 焦点，按空格会触发按钮点击、意外恢复游戏。修复把开始/暂停操作后的焦点交给可聚焦 canvas，保留空格作为游戏输入；继续验证原暂停断言，不放宽计时条件。截图写入失败也必须将该场景标记为失败，不能留下提前设置的 passed=true。

人工检查首轮截图还发现 GameRunner 外壳的标题文字绘制异常（只显示首字）；外层网页提供完整标题与操作说明，但这不能算视觉验收通过。该共用外壳问题单独跟进，不通过演示专用战斗实现掩盖。
