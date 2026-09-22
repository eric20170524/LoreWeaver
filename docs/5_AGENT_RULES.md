# 5_AGENT_RULES.md: 本轮 Agent 准则

## 1. 编码信条

- 用最少代码打通 Icebox E。真机试玩仍不做。爆发变身必须是通用 modifier，IP 名只出现在 preset。
- 降级门禁时必须同步 catalog 政策测试：自动选卡集合缩小后，禁止再断言轻量批为 production_ready。
- 改公共函数前检索调用方、夹具、CI。
- 禁止 `TODO` 占位和半截签名。
- 游戏画布用 semantic / TestHooks，不用脆弱 i18n 选择器。

## 2. HITL

破坏性 `rm`/`kill`/`drop`、密钥落盘必须停下来问人。本轮不涉及。

## 3. 验证

按 `docs/2_ARCHITECTURE.md` 的命令跑一次。失败先读日志再修，最多两轮；再失败升级停手。

## 4. 拒绝假成功

未跑通命令的任务不得打勾。E2E 脚本不得把“规划中且不能买”当成养成闭环的成功条件。

## 6. 环境陷阱

- Phaser `scene.start` 必须从**当前活动**场景发出；MainScene 被 LevelActiveScene 停掉后不能再当 host。
- survivor 物理组在 shutdown 时 `children` 可能已空，cleanup 必须容错，否则 console.error 会打爆 Playwright pageerror 断言。
- `weapon_stance_cycle` 默认定时是给既有夹具用的；石牧身份必须在 preset knobs 里写 `controlMode: "manual"`。
- 多个 modifier 包装 `handleSemanticInput` / `damagePlayer` 时，uninstall 必须倒序，否则会把已拆掉的包装装回去。
