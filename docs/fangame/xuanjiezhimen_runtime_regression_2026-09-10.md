# 石牧同人原型：战斗运行时回归修复（2026-09-10）

## 范围

沿用 `feat/fangame-co-development` / Draft PR #4 的 Gameplay Card + Phaser 架构。
前三节点仍是：丰城夜战、四馆较技、破庙尸潮。本轮修复通用 survivor 运行时，不新增石牧专属 core contract，也不扩展其余九节点。

## 已修复

### 1. 自动攻击绕过架势修改器

`SurvivorHordeAdapter.create()` 先调用 `startTimers()`，再安装 modifiers。原计时器保存 `this.fireAtNearestEnemy` 当时的函数引用，后续替换不能影响已登记回调。

刷怪、自动攻击、秒计时统一改为在 tick 时读取当前方法；保留原创建顺序和生命周期追踪。这样安装、运行中替换及卸载均作用于已存在的计时器。

### 2. 死亡动画窗口重复击杀、重复奖励

原敌人死亡后延迟 120ms 销毁，期间仍 active，额外子弹或扫击可以再次结算死亡。

现在致死时立即标记 `defeated`、停止并禁用物理 body；精灵保持 active 播放死亡动画。目标选择、追击、子弹碰撞、接触伤害和近战筛选共用存活判定。死亡结算在发送运行时事件前完成，避免监听器重入再次发奖，也保证关卡结束监听器看到已结算状态。

旧的受伤延迟回调不会再把死亡动画切回行走。近战 `hitCount` 仅统计实际接受的伤害，不把被拒绝的攻击算作命中。

### 3. 边界保护

暂停、结束、销毁和关卡切换锁定期间拒绝战斗伤害与拾取回调；同一已销毁拾取物不可重复计分。出生时间为 0 的子弹使用空值判断，仍可正常超时清理；已销毁子弹不重复处理。

## 自动化验证

新增：`productize/jobs/check-survivor-combat-runtime.mjs`。

```bash
python productize/jobs/check-xuanjiezhimen-fangame-preset.py
node productize/jobs/check-weapon-stance-cycle.mjs
node --test productize/jobs/check-survivor-combat-runtime.mjs
```

新增 16 项行为测试覆盖：计时器驱动的近战与远程、切换及卸载、动态计时回调、实际扣血、死亡唯一结算、事件重入、拾取唯一结算、尸体退出战斗、受伤/死亡动画回调竞态、暂停与结束保护、切换锁、零时刻子弹清理、近战目标上限、真实命中计数、远程异常恢复、非法伤害。

本地针对源代码方法的隔离运行结果：修复前 3/16 通过、13 项失败；修复后 16/16 通过。原始源文件的 Git blob SHA 已核对：adapter `c7c1329d3472accbec2409e2b679f49c6e0b005c`，stance modifier `50b8a601b34df13ff900e0436bafb0512f45fe78`。

本地验证隔离了场景启动和父层依赖；仓库内测试直接导入真实模块，由更新后的 `Fangame Xuanjiezhimen Contracts` 工作流复验。CI 结果以对应提交的 Actions 记录为准，不将已配置检查写成已通过检查。

## 仍未验收

- 真实浏览器中的前三节点连续游玩、Phaser 物理碰撞和视觉回放。
- Boss 读招、闪避反击、弹幕压力和高密度性能的完整验收。
- 角色养成的跨局持久化；本轮仅防止战斗与拾取结算重复记账。
- 白猿血脉变身和正式美术资产。本轮不宣称已实现。

下一验收入口应是丰城夜战真实回放：先确认黑刀实际扫中近敌、紫钢弓实际发射并命中，再验证四馆较技与破庙尸潮。单元测试通过不替代通关或手感验收。
