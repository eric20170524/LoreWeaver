def get_procedural_preset(theme: str) -> dict:
    normalized = theme.lower()
    
    if any(k in normalized for k in ["仙", "修", "天劫", "凡人"]):
        return {
            "title": "逆天凡人修仙记",
            "themeColor": "#10b981", # Emerald
            "economy": {
                "currencyName": "修为何为/Spiritual Qi",
                "resources": ["灵石/Spirit Stones", "气血/Essence", "神识/Sanity"],
                "realms": ["炼气期/Gasp Gathering", "筑基期/Foundation Establishment", "金丹期/Golden Core", "元婴期/Nascent Soul", "化神期/Ascendant Deity", "返虚期/Void Return"]
            },
            "nodes": [
                { "id": 1, "title": "初入仙门：吐纳吸灵", "intro": "于凡俗之中感应周天星辰灵气，洗髓伐骨，迈出修仙第一步。", "taunts": ["「区区凡人，也妄图窥测天道？」", "「静心凝神，吸纳四面灵元！」"], "mechanics": "tap_reaction", "rewards": "洗髓丹 +1, 开启灵石聚拢", "goalValue": 15, "resourceMultiplier": 1.2, "difficulty": 1, "durationLimit": 30 },
                { "id": 2, "title": "后山灵兽：捕捉吞天兔", "intro": "宗门后山灵兔泛滥，捕捉它们可换取微薄真元，锻炼飞剑准度度。", "taunts": ["「嗖！那只兔子又跑没影了！」", "「别让这只捣蛋鬼撞翻了你的灵药！」"], "mechanics": "collect_dodge", "rewards": "兔耳骨 +3, 功法熟练度提纯", "goalValue": 20, "resourceMultiplier": 1.5, "difficulty": 1, "durationLimit": 40 },
                { "id": 3, "title": "炼气突破：神魄冥想", "intro": "识海演练修真玄法，根据脑中魂符顺序点击突破，破除魔念障障。", "taunts": ["「心魔骤起！快锁住你的灵官！」", "「乾、坤、巽、震，不可移位！」"], "mechanics": "memory_sequence", "rewards": "识海扩容, 领悟大招【真言咒】", "goalValue": 6, "resourceMultiplier": 2.0, "difficulty": 2, "durationLimit": 45 },
                { "id": 4, "title": "外门比武：战炼气巅峰", "intro": "挑战张师兄！他的开山剑极其凶悍，迅速在空中截取其剑气漏洞！", "taunts": ["「师弟，你的真元太虚了，看招！」", "「剑芒如雨，速速躲避！」"], "mechanics": "tap_reaction", "rewards": "破浪巨剑 +1, 灵石收益增幅", "goalValue": 30, "resourceMultiplier": 2.8, "difficulty": 2, "durationLimit": 35 },
                { "id": 5, "title": "妖兽幽林：荒草采药", "intro": "幽林中弥漫着血色雾霭，需要灵敏身法，在毒障和妖兽之爪中采集天青花。", "taunts": ["「吼！谁敢擅闯本王领地？」", "「四周毒雾浓郁，莫呆立在原地！」"], "mechanics": "collect_dodge", "rewards": "天青花 +5, 战力翻倍", "goalValue": 25, "resourceMultiplier": 3.5, "difficulty": 3, "durationLimit": 45 },
                { "id": 6, "title": "筑基天劫：法身抗雷", "intro": "九重雷劫凝聚！配合闪烁的心元真雷，顺序逆向点按天罡心引抗衡。", "taunts": ["「轰隆——雷劫见你，如见蝼蚁！」", "「逆天改命，就在今朝！」"], "mechanics": "memory_sequence", "rewards": "晋阶【筑基境界】, 自动修炼成倍增长", "goalValue": 8, "resourceMultiplier": 5.0, "difficulty": 3, "durationLimit": 40 },
                { "id": 7, "title": "荒古废墟：碎石聚灵", "intro": "古战场残存海量散失灵气，以肉身当引，速点吸聚天地洪荒碎片。", "taunts": ["「废墟里的阴风能吹散金丹！」", "「速速搜集，虚空风暴要来了！」"], "mechanics": "tap_reaction", "rewards": "断裂古戟 +2, 挂机收益飙升 200%", "goalValue": 50, "resourceMultiplier": 7.5, "difficulty": 4, "durationLimit": 30 },
                { "id": 8, "title": "虚空乱流：收集风暴晶石", "intro": "横渡虚空风暴！躲避掠过的黑色虚空刃，捕捉璀璨的虚空晶核。", "taunts": ["「风暴太烈了，法宝要撑不住了！」", "「看！是风暴核心，抓住它！」"], "mechanics": "collect_dodge", "rewards": "虚空尘埃 +20, 移速+30%", "goalValue": 30, "resourceMultiplier": 10.0, "difficulty": 4, "durationLimit": 50 },
                { "id": 9, "title": "九幽镇魂：妖皇封印", "intro": "金丹巅峰试炼！通过激活太古九极封印神符，震慑深渊妖皇。", "taunts": ["「桀桀！本圣脱困，寸草不生！」", "「封印锁链，依次扣紧！」"], "mechanics": "memory_sequence", "rewards": "妖皇内核 +1, 灵石收益突破 10 倍", "goalValue": 10, "resourceMultiplier": 15.0, "difficulty": 5, "durationLimit": 60 },
                { "id": 10, "title": "金丹破境界：九九真火劫", "intro": "突破金丹期！天火降临降临，屏幕上会出现海量红莲业火与极寒水滴，快速点击消灭业火！", "taunts": ["「天火噬魂，灰飞烟灭！」", "「点燃你的金丹法相！」"], "mechanics": "tap_reaction", "rewards": "进阶【金丹大师】, 战力增加 1000 万", "goalValue": 80, "resourceMultiplier": 30.0, "difficulty": 5, "durationLimit": 40 },
                { "id": 11, "title": "万宝魔境：掠夺魔王库", "intro": "闯入九幽魔王的真宝洞天！疯狂躲避坠落的烈炎球，顺手盗取无上传承魔兵。", "taunts": ["「谁在偷本座的太乙精金？死！」", "「宝物如雨，也是死期将至！」"], "mechanics": "collect_dodge", "rewards": "太乙精金 +5, 新招式【九天神雷】", "goalValue": 40, "resourceMultiplier": 50.0, "difficulty": 6, "durationLimit": 45 },
                { "id": 12, "title": "突破元婴：演法万域心灯", "intro": "终极天劫！点燃灵魂中的太古心灯。在极致混乱的诸天法则前，静心按序列敲击祖符。", "taunts": ["「一粒尘可填海，一根草斩尽日月星辰！」", "「天要灭你，我亦要逆天！」"], "mechanics": "memory_sequence", "rewards": "终步【元婴老祖】, 领悟万域法则", "goalValue": 12, "resourceMultiplier": 100.0, "difficulty": 6, "durationLimit": 50 }
            ]
        }
    elif any(k in normalized for k in ["诡", "克苏鲁", "扮演", "深渊", "魔"]):
        return {
            "title": "诡秘之主：扮演进阶",
            "themeColor": "#06b6d4", # Cyan
            "economy": {
                "currencyName": "灵性/Sanity",
                "resources": ["非凡特质/Characteristics", "神秘文献/Lore", "金镑/Pounds"],
                "realms": ["序列9 占卜家", "序列8 小丑", "序列7 魔术师", "序列6 无面人", "序列5 怨魂", "序列4 诡秘侍从"]
            },
            "nodes": [
                { "id": 1, "title": "窥秘人：占卜灵数", "intro": "感应星空深处的呓语，快速捕捉升起的星座灵数。千万切记，直视星空会让人发疯。", "taunts": ["「灵数在旋转，你在注视谁？」", "「听到了吗？那迷雾中的磨牙声。」"], "mechanics": "tap_reaction", "rewards": "魔药配方：学徒, 灵性汲取速度提升", "goalValue": 20, "resourceMultiplier": 1.3, "difficulty": 1, "durationLimit": 30 },
                { "id": 2, "title": "廷根噩梦：梦境猎犬", "intro": "协助值夜者，在狂暴坠落的疯狂记忆红斑中，穿行采集理智蓝钻。", "taunts": ["「别回头！梦境犬正在你影子里狂吸！」", "「快，理智所剩无几！」"], "mechanics": "collect_dodge", "rewards": "值夜者徽章 +1, 获得密文纸页", "goalValue": 22, "resourceMultiplier": 1.6, "difficulty": 1, "durationLimit": 40 },
                { "id": 3, "title": "配方合成：魔药调配", "intro": "精确的顺序是合成的关键！依次将拉瓦锡晶核、深海之血、迷雾尘埃注入熔杯。", "taunts": ["「咕嘟……调配失败会异变成怪物！」", "「记住顺序，不可有一克误差！」"], "mechanics": "memory_sequence", "rewards": "晋阶【序列8 小丑】, 灵性暴涨", "goalValue": 6, "resourceMultiplier": 2.2, "difficulty": 2, "durationLimit": 45 },
                { "id": 4, "title": "小丑剧场：狂热纸牌", "intro": "投掷纸牌作为致命武器！快速击打扑面而来的幻影纸面，训练面部肌肉控制。", "taunts": ["「这就是小丑的微笑，喜欢吗？」", "「魔术时间到了，抓得住我的牌吗？」"], "mechanics": "tap_reaction", "rewards": "诡辩面具 +1, 挂机金镑产出+50%", "goalValue": 40, "resourceMultiplier": 3.0, "difficulty": 2, "durationLimit": 35 },
                { "id": 5, "title": "贝克兰德的大雾霾：死神呼吸", "intro": "穿越有毒的黄褐色浓雾，躲避腐蚀性的灰烬，吸附圣光结晶以维持理智值。", "taunts": ["「雾霾深处，有枯萎的黑骨在笑。」", "「不要吸入！那些微尘是活的！」"], "mechanics": "collect_dodge", "rewards": "圣光尘埃 +5, 战力倍化", "goalValue": 28, "resourceMultiplier": 4.0, "difficulty": 3, "durationLimit": 45 },
                { "id": 6, "title": "密室审判：心灵穿透", "intro": "面对审判者军刀。在绝对缄默下点亮封印卢恩，击碎来自高阶非凡者的威压。", "taunts": ["「犯人，直视神律的大理石柱！」", "「灵魂的罪恶，不可隐藏！」"], "mechanics": "memory_sequence", "rewards": "晋阶【序列7 魔术师】, 智谋值+500", "goalValue": 8, "resourceMultiplier": 6.0, "difficulty": 3, "durationLimit": 40 },
                { "id": 7, "title": "鲁恩海盗：捕鲸港湾", "intro": "红发伊莲的伏击！在波涛起伏的惊涛骇浪上，快速戳击射来的淬毒鱼叉防卫。", "taunts": ["「谁是鲁恩最狂暴的海盗？」", "「风暴之主在上，将他们打沉！」"], "mechanics": "tap_reaction", "rewards": "黄金罗盘 +1, 离线收益金镑提升100%", "goalValue": 60, "resourceMultiplier": 9.0, "difficulty": 4, "durationLimit": 30 },
                { "id": 8, "title": "神战遗迹：诡秘尘埃", "intro": "在这片神灵陨落的废土，躲避虚空中滑落的雷霆之怒，收集散落的星砂特质。", "taunts": ["「神之叹息，会让金属发出哀鸣。」", "「那闪耀的，是古神神性的残屑！」"], "mechanics": "collect_dodge", "rewards": "星砂特质 +10, 闪避率+20%", "goalValue": 30, "resourceMultiplier": 12.0, "difficulty": 4, "durationLimit": 50 },
                { "id": 9, "title": "阿蒙之谋：单片眼镜的恐惧", "intro": "阿蒙的分身在虚空中闪烁，通过反转星图符印来破除宿命之门封印。", "taunts": ["「晚上好，你看见我的眼镜了吗？」", "「当心，你现在的影子可能姓阿蒙。」"], "mechanics": "memory_sequence", "rewards": "欺诈吊坠, 神秘学研究能力暴涨", "goalValue": 10, "resourceMultiplier": 18.0, "difficulty": 5, "durationLimit": 60 },
                { "id": 10, "title": "万门之门：无面扮演", "intro": "突破序列6！瞬间扮演上百种人脸。疯狂点击浮空的诡秘笑脸，重组自己的五官结构。", "taunts": ["「谁才是我？谁又是真正的你？」", "「千面万相，皆属于主！」"], "mechanics": "tap_reaction", "rewards": "晋阶【序列5 怨魂】, 伤害提升 800%", "goalValue": 70, "resourceMultiplier": 40.0, "difficulty": 5, "durationLimit": 40 },
                { "id": 11, "title": "狂暴海的迷雾船：幽灵侵蚀", "intro": "逃离幽灵船！大量幽魂撕裂舱门掠来。精妙翻滚躲避灰白怨念，收集不灭魂屑。", "taunts": ["「留下来吧，给这艘古老的船当桅杆……」", "「魂屑能修补你破损的以太体。」"], "mechanics": "collect_dodge", "rewards": "不灭魂屑 +8, 大招【怨魂咆哮】", "goalValue": 45, "resourceMultiplier": 70.0, "difficulty": 6, "durationLimit": 45 },
                { "id": 12, "title": "深渊边缘：叩问万门之王", "intro": "面对终极迷雾下的伟岸古神，以凡人之躯点亮十二重命格神火，拼凑愚者徽记。", "taunts": ["「世界是一场迷雾，我即是最初也是终结。」", "「诡秘侍从，迎接你的加冕！」"], "mechanics": "memory_sequence", "rewards": "终极主阶【序列4 诡秘侍从】, 虚无之卷解锁", "goalValue": 12, "resourceMultiplier": 150.0, "difficulty": 6, "durationLimit": 50 }
            ]
        }
    
    # Decouple to default
    return {
        "title": "星穹幻境：十二重劫",
        "themeColor": "#3b82f6", # Blue
        "economy": {
            "currencyName": "星屑/Stardust",
            "resources": ["星光结晶/Spark", "古代晶片/Relic", "信用点/Credits"],
            "realms": ["初生星徒/Novice", "破晓卫士/Guardian", "逐月贤者/Sage", "曜日星王/Lord", "寰宇至尊/Archon", "至高意志/Genesis"]
        },
        "nodes": [
            {
                "id": i + 1,
                "title": f"幻境第 {i + 1} 重：{['吐纳星云', '虚空搜灵', '神魂调律', '星光比武', '风暴搜获', '天罡突围', '洪荒吞噬', '乱流狂渡', '镇妖古印', '天火焚身', '魔库寻奇', '乾坤涅槃'][i]}",
                "intro": f"探寻极境，迈入第 {i + 1} 重，通过 {'快速点击' if i % 3 == 0 else '敏捷收集' if i % 3 == 1 else '记忆星律'} 夺取古神留下的造化。",
                "taunts": ["「星宿已经就位，你准备好接受审判了吗？」", "「幻境无情，心神不宁者必遭反噬！」"],
                "mechanics": "tap_reaction" if i % 3 == 0 else "collect_dodge" if i % 3 == 1 else "memory_sequence",
                "rewards": f"造化结晶 +{(i + 1) * 3}, 星屑产出扩大",
                "goalValue": 5 + i // 2 if i % 3 == 2 else 15 + i * 5,
                "resourceMultiplier": float(f"{1.8 ** (i + 1):.1f}"),
                "difficulty": i // 2 + 1,
                "durationLimit": 30 + (i % 3) * 10
            } for i in range(12)
        ]
    }
