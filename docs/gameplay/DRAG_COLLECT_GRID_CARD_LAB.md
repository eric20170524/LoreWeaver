# 第三张玩法卡：drag_collect_grid

沿用 `feat/fangame-co-development` / Draft PR #4。跳过 survivor_horde，不合并 main。

## 本轮范围

试验场新增「03 · 拖拽收集」，继续走 compileRuntimeSpec → RuntimeKernel → CollectDodgeAdapter。
默认40秒、100生命、目标16颗绿珠、危险物35%、每次受击15。支持鼠标/触摸按住横向拖动，悬停不移动。新增目标、危险物比例和伤害的新局配置；没有生成模型请求，也不读写用户工作区存档。

旧卡默认 skipBoss=false，会在配额中段切走收集玩法，而历史 production_ready 的示例实际上跳过Boss。现将卡和适配器默认改为纯收集 skipBoss=true，旧Boss路径仍可显式启用；历史认证单列保留，新修改不是历史认证覆盖范围。纯生存目标未实现，不再在该卡的 victoryMode 枚举宣称支持。

## 运行时修复

- 公开参数规范化、合法0危险比例、200ms生成间隔/80px每秒速度等边界与卡一致；非法数值有界回退。
- 每颗珠子唯一消费；伤害/拾取/刷物/计时拒绝暂停或结束后调用；初始化重置elapsed与旧结果。
- 按住拖动才移动；横向边界限制；不把空格宣称为该卡操作。
- 按真实delta推进并使用线段扫掠碰撞，修复长帧越过玩家的漏判；已越出侧边的弹幕回收。
- 场上掉落物和玩家弹道有上限；浮动文字及其tween由当前适配器持有并清理。
- 最后一颗珠子、致命红珠、最后一发Boss弹道都允许宿主同步销毁场景；不在结算后访问已销毁对象。
- 未达真实目标时拒绝宿主强制成功。显式Boss分支保留单元回归，不冒充已完成Boss浏览器验收。

## 验证

```bash
node --test productize/jobs/check-collect-dodge-runtime.mjs
node productize/jobs/build-card-lab.mjs
# 打开 dist/card-lab/index.html 并选择拖拽收集，或 ?card=drag_collect_grid
npx playwright install chromium
node productize/jobs/run-collect-card-lab-e2e.mjs
```

本地新增16项适配器回归通过；合并既有节奏23、闪避9、survivor16，共64项通过，TypeScript检查与试验场静态构建通过。单元测试用Phaser替身，不是浏览器验收。本地系统浏览器拒绝导航，未改变管理策略；真实浏览器验证使用授权GitHub Actions。

浏览器计划7项：默认配额真实操作通关、配置100伤害的实际碰撞失败、5秒200配额超时且0危险生效、1配额/新局参数、暂停/悬停/重开/切卡、390px触控、file://启动。只读snapshot用于操控定位，不改血量/分数、不加速时钟、不直接调用finish。计划不是通过声明，结果看对应提交的 `workflow/reports/card-lab/drag_collect_grid/browser-latest.json`。

## CI与已有卡

3912195的总任务先在闪避受击测试失败，节奏脚本因此未执行。本轮改成三个独立matrix任务，fail-fast=false；每张卡分别上传证据与通过后可玩包。一张卡的产物不代表包内其他卡通过。

闪避驱动预先缓存画布几何，单次真实pointermove代替5步往返；trace关闭连续截屏编码但保留操作记录/DOM快照和显式截图。未改闪避伤害、警告窗口或节奏80/160ms规则。

待办：默认交互手感人工验收、共享标题绘制异常、可选Boss真实浏览器通关、modifier组合、长期压力/设备性能、公开站点部署与完整发布认证。下一张 sequence_synthesis。
