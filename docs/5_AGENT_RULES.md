# 5_AGENT_RULES.md: 本轮 Agent 准则

## 1. 编码信条

- 当前推进的是 12 节点同人原型，不是再开一轮只修前三关。每完成一段，就更新 `docs/0_TASKLIST.md` 到 `docs/5_AGENT_RULES.md`，让下一次还能从任务单接着做。
- 真机试玩仍不做。Icebox D 保持未勾，Chromium 试玩不能写成手机验收。
- 爆发变身必须是通用 modifier。IP 名只出现在 preset。`requiresAbility` 只比较存档里的能力 id。
- 降级门禁时必须同步 catalog 政策测试：自动选卡集合缩小后，禁止再断言轻量批为 production_ready。
- 改公共函数前检索调用方、夹具、CI。
- 禁止 `TODO` 占位和半截签名。
- 游戏画布用 semantic / TestHooks，不用脆弱 i18n 选择器。

## 2. HITL

破坏性 `rm`/`kill`/`drop`、密钥落盘必须停下来问人。本轮不涉及。

## 3. 验证

按 `docs/2_ARCHITECTURE.md` 的命令跑一次。失败先读日志再修，最多两轮；再失败升级停手。

## 4. 拒绝假成功

未跑通命令的任务不得打勾。E2E 脚本不得把“规划中且不能买”当成养成闭环的成功条件。目录里有一行能力但没有数值效果，不算首通成长。没有密钥时不得伪造 provider `grok`。

## 6. 环境陷阱

- Phaser `scene.start` 必须从**当前活动**场景发出；MainScene 被 LevelActiveScene 停掉后不能再当 host。进关卡时再 `scene.stop('MainScene')` 一次，避免挂机计时器用旧存档覆盖通关列表。
- survivor 物理组在 shutdown 时 `children` 可能已空，cleanup 必须容错，否则 console.error 会打爆 Playwright pageerror 断言。
- `weapon_stance_cycle` 默认定时是给既有夹具用的；石牧身份必须在 preset knobs 里写 `controlMode: "manual"`。
- 多个 modifier 包装 `handleSemanticInput` / `damagePlayer` 时，uninstall 必须倒序，否则会把已拆掉的包装装回去。
- 角色 sprite：Imagine 定妆 → sprite-gen `--face-plus-x` → **pack** 多角色，禁止第二次 `promote`。图集任一边 > 4096 会在 WebGL 上丢掉后半人物。spawn id 必须 alias 到 `enemy_<id>_*`。`pack` 会重写 `character-pack` 快照；半透明特效贴到空白格时直接拷贝像素。细则见 `docs/guides/sprite_gen_integration.md`。
- 石牧契约检查读 `productize/fixtures/xuanjie-shimu-contract.json`，不读 gitignore 里的 `data/workspaces/`。本机 workspace manifest 没有 `nodes`；组装后的节点在 `loreweaver/nodes/`。
- 对石牧工作区跑部门玩法组之前，节点 2、4、5、7、10 必须已有 `allowExperimentalCard: true`。筹备不得改写已有 `cardId`、modifier、首通奖励和已经写上的战斗数值。部门状态停在 `ready_for_review`，不自动确认。
- 运行就绪门禁没有阻断项才前进，不用 `force`。构建门报告缺失是警告，禁止补一份假通过。风格板和 VLM 取证没有做成就保持交接开放。
