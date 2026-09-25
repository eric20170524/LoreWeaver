# 个人非商业同人原型 · 公开试玩候选包复核

当前可审阅的本地技术候选包：`productize/exports/standalone-xuanjie-shimu-local-20260924211606.zip`，SHA-256 `98424174998a3fa35457a5b36a2f39ab7616120d526672c731a6b02418156779`。它标为 `UNVERIFIED_CANDIDATE`。桌面及手机模拟视口各一轮 12/12、节点 4 横屏操作 15/15 与三波清场、试玩页同人说明 12/12、共 23 项精确包专项与两组额外长局种子真实通过（`seedSalt=1/2`）。ZIP 883 项且无损坏；当前工作树石牧 atlas 18 个关键帧、场景卫生 53/53、TypeScript 与六项 build gate 通过。本轮延续石牧 20 帧冷黑铁刀与节点 4 独立烈炎，并将节点 7 判定圆为浅银半透明，节点 8 五波敌人均为图集角色；节点 4 火/风连招有黑刀基础刀鸣音层；此前节点 1 的近战实际命中追加短骨响，节点 3/11、6/8、9 分别混入尸潮、围杀、蛮族战场低声量环境层；本轮放大节点 8/9 的敌人图集显示。77 件带范围标记的报告和截图哈希见 `evidence/standalone_bow_action_candidate_evidence_20260924211606.json`。Safari 桌面说明弹窗目检记录 `evidence/safari_fan_notice_smoke_20260924160508.md` 绑定前包，未对当前包跑 Safari 全关。节点 4 普通敌人与 Boss 的显示宽度为 210/294，节点 5 玩家/Boss 为 168/192 游戏像素。包内 `FAN_NOTICE.md`、README 和试玩页弹窗均说明个人非商业、非官方、免费及素材来源。历史额外种子误标更正见 `evidence/seed_evidence_correction_20260925.md`；本包两份新报告已逐项核对 `seedSalt=1/2`。这些是技术与说明证据，不构成公开传播权或真人体验验收。

当前包画面复核见 `visual_style_board_20260924211606.md`；节点 2/4/5 精确 ZIP 图键和两视口降级预检见 `evidence/art_preflight_node245_20260924211606.json`，三关通过但独立 VLM 仍缺；工作树六项构建门报告 `evidence/build_gate_20260924211606.json` SHA-256 `1f9b3994903e513bf03b930078b9e643cc5cce0fab6c8a3ac64aa7b2516d11a0`，场景卫生报告 `evidence/scene_hygiene_20260924211606.json` SHA-256 `1f2ee02c6de6c56bc2c8ad6d0bea75d22b9e0b39a00f1ba710b0161c45ef`。新增音频的源层和精确包哈希报告见 `evidence/audio_ambience_source_20260924211606.json`；音频试听台已重生为当前 ZIP，真人实听与混音仍待完成。节点 1/4 冷黑底材与烈炎分层已从普通和连招实战截图复核；包内 20 帧石牧动作与源 atlas 相同，各帧亮橙区域少于 150 像素，限定材质交接已签收。节点 1/3/6/8/9/11 持弓切态与节点 6 毒圈层级已复核；节点 12 冷钢刀弧、持弓远射与银白白猿三层已静帧目检。节点 6 近战刀弧已换灰蓝并减轻透明度；节点 7 月华银白判定圆在当前包可见；节点 8 五波图集围杀与夜色血火实战图已复核，普通敌人显示宽 80.64、Boss 174.45、主角 89.6 游戏像素；节点 9 来敌显示宽 61.6–78.4，碰撞体仍为原宽；跨关长局动态层级仍待审，独立精确包 VLM 尚未完成。Safari 上一包说明弹窗目检结论只作历史补充。

精确包说明及素材来源复核见 `evidence/candidate_source_review_20260924211606.json`（SHA-256 `071c43ca55daeee543e606d1f16ebd5bd7b11718bf08c4d14d5b139e51387e19`）：`FAN_NOTICE.md`、README、12 项说明入口检查、34 个音频文件与来源记录、角色/环境图集哈希、12 张环境来源记录和节点 4 三张侧视图来源均通过。本地候选说明与来源清单已完成；具体平台上传、原作衍生权利和画面相似性仍属另行判断的范围。

节点 9 敌人放大前后的绘制对照见 `evidence/enemy_visual_performance_20260924211606.json`（SHA-256 `1af81f4e60959f1d35eb7c7e6858130256e4902de7ba501f41adecb7a2cb0838`）。同一 headless Chromium 中每包两轮，约 106–110 名可见敌人时各 14 个一秒样本均达到 60 FPS 上限；4 倍 CPU 降速复测也触及上限，报告 `evidence/enemy_visual_performance_20260924211606_cpu4x.json` SHA-256 `3082a303840bc9db36be513c9f5923dd15d90aaaed61d665565434b0b6f76e2a`。这些采样未发现本机合成压力回退，但因帧率封顶而难以分辨渲染成本，不外推为手机设备帧率或真实 120 秒手玩表现。

## 素材来源清点

| 范围 | 可核查的本地来源 | 仍需确认 |
| --- | --- | --- |
| 12 张环境底图 | `assets/imagegen/environments/PROMPTS.md` 和 `provenance.json` 记录 ImageGen 生成与逐图 SHA | 对外使用条款、与既有官方画面的相似性人工复核 |
| 节点 4 三张侧视横版图 | `assets/imagegen/environments/landscape/PROMPTS.md` 和 `provenance.json` 记录 ImageGen 生成与逐图 SHA；构建脚本核验后把图片及来源记录写入包内，锻口、风廊、炉心三段运行时截图均已目检 | 对外使用条款和相似性复核；真人操作与实体设备表现 |
| 角色、敌人、特效图集 | 工作区 `assets/imagegen/provenance.json`、`character-pack/provenance.json` 及逐项 sprite-gen provenance；`player_bow` 有单独来源记录 | 各生成输入的使用权、原作角色造型与官方素材相似性复核 |
| 12 段 BGM、22 个短音 | `assets/audio/procedural/provenance.json`、`CREDITS.md` 和 `scripts/build_fangame_audio.py`；34 个包内 MP3 哈希全吻合 | 实听混音与播放情境；来源记录不证明原作衍生权利 |
| 关卡文案、角色与世界观 | 工作区 12 关数据和主干 manifest；包内 `FAN_NOTICE.md`、README 与试玩页弹窗明确个人非商业、非官方、免费及原作归属 | 公开平台传播风险单独复核 |

## 同人定位与发布边界

本项目是用户确认的**个人非商业同人衍生原型**，不是商业授权产品。技术候选验收不要求用户提供商业 IP 授权材料，也不要求改成原创题材。包内及试玩页弹窗已标明“同人创作、非官方、免费、无商业授权声明”及自制音画素材来源。

国家版权局公布的现行[《中华人民共和国著作权法》](https://www.ncac.gov.cn/xxfb/flfg/flfg_532/202103/t20210309_50530.html)第十条列有改编权和信息网络传播权；第二十四条的个人学习、研究或欣赏等例外不能直接推定覆盖向公众上传同人游戏。因此，非商业定位和署名说明是准确表述项目性质，**不是已获原作授权的证明**。这是对后续公开传播的风险说明，不阻止继续制作和交付本地技术候选。当前任务不擅自把 ZIP 上传公开平台。

若日后选择公开平台，届时核对权利人公开同人政策、平台规则和实际使用的素材条款；对外说明如实呈现上述定位。实体设备和真人长局试玩仍需另行记录，不使用自动脚本代签。
