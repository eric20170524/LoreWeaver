# 十二关候选包氛围板：陨铁冷黑、紫钢冷光、月华银白

当前精确包：`productize/exports/standalone-xuanjie-shimu-local-20260924211606.zip`，SHA-256 `98424174998a3fa35457a5b36a2f39ab7616120d526672c731a6b02418156779`。桌面/手机各 12 张首帧、节点 4 三波横屏图和专项截图收录于 `evidence/standalone_bow_action_candidate_evidence_20260924211606.json`，索引 SHA-256 `96a93cd3027217d8c6ae06c1a558826b83a0817310564abaf07eb40ed4929e33`。

本轮仅给节点 8/9 的 atlas 敌人扩大显示，图集、关卡数值与其他节点布局未改；当前 ZIP 已重新捕获表中每张静帧并完成节点 2/4/5 的图键与降级预检。逐关视觉解读沿用上一包本地目检；本轮直接复看当前包节点 8 第五波、节点 9 守线实战图：普通敌人轮廓均已接近主角，前者八人包围清楚，后者右侧来敌方向可辨。尚未进行新的独立 VLM 审计。

| 范围 | 当前包静帧与运行时证据 | 剩余视觉问题 |
| --- | --- | --- |
| 石牧全动作 | `evidence/standalone_cold_blade_20260924211606.json` 逐像素验证包内 4 待机、6 行走、4 攻击、2 受击、4 倒地共 20 帧与源 atlas 一致；每帧亮橙区域少于 150 像素。`cold_blade_base_integration` 与 `cold_blade_integration` 记录两张源表和 atlas SHA。 | 生成动作之间的真人主观连贯性与独立视觉审计。 |
| 节点 1 夜市 | `evidence/candidate_node1_cold_blade_390x844_20260924211606.png` 呈冷钢短扫；`standalone_latent_blood` 验证无烈炎声效且仅被动武装后出现血色异血印记。`evidence/candidate_node1_ranged_bow_390x844_20260924211606.png` 可见紫钢弓；近战实际命中追加 0.25 秒骨响，精确包专项记录敌人 HP 8→3 与文件请求。 | 夜市长局角色尺寸、特效重叠与实体设备读感。 |
| 节点 2 四馆高台 | `evidence/candidate_stage_02_390x844_20260924211606.png` 可见灯火、环形擂台与侧方大鼓；`standalone_counter_reachability` 证实金圈 alpha 脉动和图集预警标记，六次闪避反击完成。 | 独立整关视觉审计、实体设备触控节奏。 |
| 节点 3 破庙守夜 | `evidence/candidate_stage_03_390x844_20260924211606.png` 的灰石圆台、血红落叶与暗色敌群让黑刀主体可辨；跨关切弓专项确认 `player_bow` 可射并切回。 | 高密度尸潮的动态遮挡与真人读感待审。 |
| 节点 4 横屏 | `evidence/node4_live_wave_1_844x390_20260924211606.png` 显示未点燃的黑刀，`evidence/node4_fire_combo_844x390_20260924211606.png` 显示独立烈炎刀弧；精确包横屏专项 15/15，普通敌人/Boss 显示宽 210/294；触控连招专项还确认黑刀基础刀鸣、烈炎与疾风三个音频文件请求。 | 跨三波动态层级、真机横屏操作。 |
| 节点 5 紫钢弓试炼 | `evidence/candidate_stage_05_390x844_20260924211606.png` 可见蓝紫灯柱与持弓石牧；`candidate_node5_bow_390x844_20260924211606.png` 显示紫钢冷光弓身及放箭动作，Boss/玩家显示宽 192/168。 | 动态弓弦、射击长局与独立 VLM 仍待审。 |
| 节点 6 绿毒围杀 | `evidence/candidate_stage_06_390x844_20260924211606.png` 的深绿毒景中角色仍可辨；`candidate_node6_cold_sweep_390x844_20260924211606.png` 的灰蓝刀弧与毒圈分层，专项验证 atlas tint `#596c7b`、alpha 0.55、刀弧 depth 1.5 < 玩家 2，毒圈命中透明度 0.448。 | 长局密度、实体设备帧率与毒雾动态读感待审。 |
| 节点 7 月下参悟 | `evidence/candidate_node7_moon_silver_390x844_20260924211606.png` 显示浅银半透明判定圆、银白外环与月夜地面纹样，月华脉冲来自 atlas；`standalone_rhythm_reachability` 验证 #cbd5e1/alpha 0.14、原卡和原环境键以及 12 次原节奏窗口判定通关。 | 真人节奏手感、实体设备输入延迟与独立整关视觉审计。 |
| 节点 8 夜色遗迹 | `evidence/candidate_node8_siege_wave5_390x844_20260924211606.png` 可见夜色血火、八名图集人形围住玩家；`standalone_node8_siege` 逐波确认 4/5/6/7/8 名角色均来自 atlas，第五波为 7 精英 + 1 Boss，原卡、环境、modifier 与 110 秒不变。 | 普通敌人显示宽 80.64、Boss 174.45，主角 89.6 游戏像素；碰撞体宽 16.8/36.34 保持旧值。长局动态辨识度、实体设备与独立整关视觉审计待复核。 |
| 节点 9 蛮族守线 | `evidence/candidate_stage_09_390x844_20260924211606.png` 可见赭石战道、左侧蓝色城防线与血红旗火；`candidate_node9_field_direction_390x844_20260924211606.png` 记录从右向左冲阵方向。 | 普通来敌显示宽 61.6–78.4，主角 89.6 游戏像素；碰撞体宽 15.4–19.6 保持旧值。高密度动态和真机读感待审。 |
| 节点 10 异血初醒 | `evidence/candidate_node10_awakening_390x844_20260924211606.png` 显示血火墙影及反击后的血色印记；`standalone_awakening_vfx` 验证图集印记和心跳请求，节点 2 不提前出现白猿。 | 真人动态辨识度、实体设备与主干独立视觉审计。 |
| 节点 11 白猿血战 | `evidence/candidate_stage_11_390x844_20260924211606.png` 的玄黑裂地与血红裂纹呼应主色；`standalone_overdrive_audio` 验证白猿能力窗口，终局兽形不提前出现在节点 2。 | 白猿与敌群叠层的动态辨识度、真人及实体设备读感待审。 |
| 节点 12 夜色终局 | `evidence/candidate_node12_black_blade_390x844_20260924211606.png`、`candidate_node12_purple_bow_390x844_20260924211606.png`、`candidate_node12_white_ape_390x844_20260924211606.png` 分别显示冷黑刀、紫钢弓与银白白猿在血火终局底图上；`standalone_final_triad` 验证原 150 秒与图集 aura。 | 跨关动态层级、真人和实体设备读感。 |

共用视觉语言以血赭 `#b83a2d` 为异血和火影强调色，石牧普通刀身与刀弧维持冷黑/灰蓝，紫钢弓用冷紫箭光，月下与白猿叠层用银白；节点 2/4/5/7/10 的标题、卡牌和原数值保持。以上十二行均有当前精确包的手机开场帧，节点 4 另有横屏三波；静帧范围与尚待的动态审计分列。

完整基础动作源表 `assets/imagegen/cold-blade/shi_mu_cold_blade_base_4x4.png` SHA-256 `d96b0e72c22b9d6d103112165678935cc920f24a3f6b91ccc02a80c9308ec82e`；攻击源表 `assets/imagegen/cold-blade/shi_mu_cold_blade_attack_2x2.png` SHA-256 `b2261ea59742f288d7facf4dc5a4a4dea41468b534b3585698994819010be37b`。两份确定性切片脚本同步更新 runtime 与 character-pack atlas，最终尺寸 4095×3411。此页是本地静帧复核，独立 VLM、真人操作和实体设备帧率仍无证据。
