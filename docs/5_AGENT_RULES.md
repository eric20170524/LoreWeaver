# 5_AGENT_RULES.md: 本轮 Agent 准则

## 1. 编码信条

- 当前推进的是 12 节点同人原型，不是再开一轮只修前三关。每完成一段，就更新 `docs/0_TASKLIST.md` 到 `docs/5_AGENT_RULES.md`，让下一次还能从任务单接着做。
- 用户确认本项目为《玄界之门》石牧个人非商业同人衍生原型。技术候选验收不索要商业 IP 授权材料；对外说明应如实标注同人、非官方、免费，公开平台上传另按实际政策与风险审视。
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
- `arena_wave_boss` 会接管定时刷怪，若与 `horde_intensity` 同用，必须把密度倍率应用到有限波次的小怪包。竞技波次只在全部清场时胜利，并保留已写时限作为超时失败；普通 `survivor_horde` 的计时存活胜利不改。合成 E2E 应清完竞技波次，不能用计时结束代替胜利。
- 竞技波次合成清场只证明结算路径；`check-standalone-arena-reachability.mjs` 用真实攻击、掉落和局内成长给出理想路线下界，仍忽略受伤、障碍和失误。有限敌包需在世界边界内可见位置刷出；普通生存关保持场外刷怪。上一精确包节点 8 理想路线约 88/110 秒；调整黑刀范围后的新包未重跑该专项，不能沿用旧数据作平衡签收。
- 普通生存节点 3/6/11 用 `check-standalone-survivor-survival.mjs` 对精确 ZIP 的实际刷怪、攻击、物理碰撞、毒圈位移、预警伤害、Boss 阶段和白猿窗口跑完整战斗。旧包节点 6/11 在 19/100 与 24/125 秒阵亡，失败证据先冻结；仅节点 6 将攻击间隔改为 350ms、基础 HP 改为 140，节点 11 将攻击间隔改为 500ms、基础 HP 改为 210，预设与工作区节点同步。新包三组随机分布中节点 3 均击败 Boss，节点 6 均存活到 100 秒，节点 11 均在 125 秒内胜利；50ms 程序控位只证明理想路线可达，不代替真人长局、实体设备帧率或主观难度验收。
- 归档长局多种子证据时，默认 seed 0 写 `standalone_survivor_survival_latest.json`；设置 `LW_SURVIVOR_SEED_SALT` 的非零种子写 `standalone_survivor_survival_experiment.json`。每跑完一个 seed，核对报告内 `seedSalt` 和精确 ZIP SHA 后再复制归档，不能把 `latest` 复制三遍。六项 build gate 属于执行时工作树证据，不自带 ZIP 身份；精确包专项须逐份核对 `artifactSha256`。
- 节点 4 的 `check-standalone-brawler-reachability.mjs` 以精确包运行时的移动、追击、重击与波次触发给出三段清场理想路线；不要把直接设 `waveIndex` 的单测当作真实可达性，也不要把自动保持距离的路线当真人触控试玩。
- 节点 4 视觉倍率同时写在仓库 preset 与 gitignore 的本地 `loreweaver/nodes/node-04.json`；发布器读取后者。只改 preset 会导出旧倍率。当前普通敌人/Boss 倍率 15/10.5，精确包三段截图显示宽 210/294；碰撞半径不随显示宽增加。
- 生存关节点 1/3/6/8/9/11/12 的 `enemyVisualMultiplier` 当前均为 3，仓库 preset 与本地节点数据必须同步。Phaser Arcade body 会随 sprite 缩放；扩大显示时按倍率反向调整 body 的源尺寸，精确包浏览器报告仍应同时核对显示宽与世界碰撞宽。黑刀 `meleeRadius` 当前依次为 112/160/126/132/135/150/155；节点 4 独立使用 `player.attackRange=72`，其敌人倍率 15/10.5 保持。HP、速度、伤害和刷怪密度不随显示放大。
- 节点 5 的 `check-standalone-shooter-reachability.mjs` 用精确包的发射、敌方射击和真实弹体碰撞给出提前量瞄准的理想路线；不得通过挪弹体、改 HP 或直接调用 `finish` 冒充击破。理想化预判瞄准不代替玩家手感或持弓美术验收。
- 节点 2/10 的 `check-standalone-counter-reachability.mjs` 用语义移动和逐个反击窗口证明破势胜利可达；`boss_defeated` 是破势满格的现有结算 reason，不要求 Boss HP 归零。安全角落与精确时机不代替真人反应测试。
- 节点 7 的 `check-standalone-rhythm-reachability.mjs` 用精确包运行时节拍与主操作验证进度和最佳连击双目标。浏览器进关可能带部分帧，探针须按下一目标拍对齐，不能假设 elapsed 从 10ms 整数倍起步；自动 Perfect 不代表真人点击命中率。
- 节点 9 的 `defend_line` 必须让来敌从防线右侧出生，并沿自身通道朝防线前进；普通生存关仍用场外围刷。工作区 `loreweaver/nodes/node-09.json` 与预设需同步：700ms 刷怪、三倍敌潮及递增保留，守线局部走廊 `laneWidthRatio=0.34`、刀势间隔 500ms，城防 160、穿线扣 8、120 秒未变。`check-standalone-defend-line-routing.mjs` 查真实行军，`check-standalone-defend-line-survival.mjs` 用精确包战斗与碰撞模拟完整 120 秒；不把入关/撤退合成测试当作守线可胜证据。两者均不能代替真人长局手感或实体设备帧率。
- 角色 sprite：Imagine 定妆 → sprite-gen `--face-plus-x` → **pack** 多角色，禁止第二次 `promote`。图集任一边 > 4096 会在 WebGL 上丢掉后半人物。spawn id 必须 alias 到 `enemy_<id>_*`。`pack` 会重写 `character-pack` 快照；半透明特效贴到空白格时直接拷贝像素。细则见 `docs/guides/sprite_gen_integration.md`。
- 本机仓库没有 Smart Asset Kit CLI；原创程序音频的当前来源是 `scripts/build_fangame_audio.py`。改动五条母题或 cue 后要重生成、对照 `assets/audio/procedural/provenance.json` 哈希和 `CREDITS.md`、重打精确候选包并重跑桌面/手机浏览器。响度与文件请求只证明技术接线，不代替实听混音。
- 石牧契约检查读 `productize/fixtures/xuanjie-shimu-contract.json`，不读 gitignore 里的 `data/workspaces/`。本机 workspace manifest 没有 `nodes`；组装后的节点在 `loreweaver/nodes/`。
- 对石牧工作区跑部门玩法组之前，节点 2、4、5、7、10 必须已有 `allowExperimentalCard: true`。筹备不得改写已有 `cardId`、modifier、首通奖励和已经写上的战斗数值。部门状态停在 `ready_for_review`，不自动确认。
- 运行就绪门禁没有阻断项才前进，不用 `force`。构建门报告缺失是警告，禁止补一份假通过。风格板和 VLM 取证没有做成就保持交接开放。
