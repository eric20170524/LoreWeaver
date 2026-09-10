# 本地试玩修复：节点 2 与修炼面板

范围：`feat/fangame-co-development` / Draft PR #4。未合入 main。

## 已确认的源码缺陷

### 节点 2

- `tryCounter()` 调用 `finish()` 后继续刷新 HUD；`finish()` 已销毁 Graphics/Text，胜利点击可能访问已释放对象。
- 每次反击加 20 score，但破势只加 18。GameRunner 用 score>=goalValue 判断通关，导致破势未满即可由外壳提前通关。
- 同一 0.55 秒反击窗口允许无限重复点击；没有一窗一次的判定。
- 场景级移动监听未交给生命周期管理，退出与重进存在残留。
- 原适配器未使用关卡配置的 70 秒总时限；同一 active 攻击在无敌帧结束后还可再次扣血。

修复保持 `dodge_counter_boss` 卡与既有核心合同：完成后立即返回，score/goalValue 对齐破势，反击窗口唯一消费，攻击唯一伤害，监听与延迟反馈可清理，倒计时耗尽按失败结算。增加空格反击并把适配器 UI 移出外壳标题/底栏位置。语义移动保留暂停逐帧观测兼容性。

用户只报告“节点2试玩有问题”，没有提供该次浏览器错误。上述是源码中确认并针对性覆盖的缺陷，不宣称它们解释所有本地异常。

### 修炼面板

旧 `CultivationUIPlugin` 写死洞天、骨文、宝术及另一主题的默认目录；同时无条件在境界>=1时显示所有能力解锁。被动购买只处理 clickPower/activeMultiplier 加法，却仍对尚未接入的战斗效果扣费。

现在是通用主题外壳：角色、资源、境界、颜色和目录来自当前 manifest；没有目录时展示空态，不注入其他 IP。`uiConfig.cultivation.labels` 可覆盖 panel/practice/train/breakthrough/passives/abilities/income。已有石牧 manifest 不需要重建就能使用中性文案和自己的目录。

能力图鉴仅认初始能力或真实 unlockedAbilities 记录，不根据境界一键全解锁，也不把图鉴收录伪装成效果已实现。planned 或不支持的被动效果禁用购买；支持的点击/自动积累效果验证整个事务、前置条件和资源后一次性结算，正确区分 add/multiply/set。目录分页，不再把越界条目默默隐藏。HUD 通过主场景 onIncomeTick 刷新。

## 验证入口

```bash
node --test productize/jobs/check-dodge-counter-runtime.mjs
npx tsx --test productize/jobs/check-cultivation-model.ts
npx playwright install chromium
node productize/jobs/run-xuanjie-local-play-e2e.mjs
```

- 战斗回归使用真实适配器和合同，Phaser 对象/时钟为替身，覆盖9项行为。
- 修炼模型回归覆盖7项主题、解锁、交易行为。
- 浏览器脚本用真实 RuntimeKernel、真实石牧预设和 Chromium，检查修炼界面、规划中技能与节点2六次独立反击的胜利/完成回写。它直接进入节点2，绕过选关资格，不代表前三关自然连续通关、真人手感或导出包认证。
- 报告 `workflow/reports/xuanjie_local_play_browser.json`；CI `Fangame Local Play Regression`。配置测试入口不等于通过，结果以实际运行记录为准。

## 本地更新

保存未提交修改后执行 `git pull --ff-only origin feat/fangame-co-development`，重启开发服务并刷新页面，重新选石牧工作区。不要为更新运行时代码重新生成蓝图、覆盖工作区 manifest 或清除全部浏览器存档。

## 未纳入本轮

前三关自然连续流程、旧 Golden Candidate loading 阻塞、白猿变身、跨局战斗被动落地及完整长期养成仍不在本轮验收声明内。

store.tsx 仍使用全局 `loreweaver_player_state` 存储键；本轮不删除或迁移已有进度。跨工作区状态隔离仍是独立风险，不能把 UI 去旧主题误报为存档隔离已完成。
