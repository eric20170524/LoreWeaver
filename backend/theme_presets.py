import os
import json

def get_procedural_preset(theme: str) -> dict:
    normalized = theme.strip()
    
    # 1. 检查是否是特定预设的路径或别名
    presets_dir = "/Users/lm/pyProj/hungry-for-knowledge/LoreWeaver/data/presets"
    
    # 支持加载物理路径上的 JSON 文件
    if normalized.endswith(".json") and os.path.exists(normalized):
        try:
            with open(normalized, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading preset path {normalized}: {e}")
            
    # 支持通过简称/别名映射加载特定 Preset Seed JSON
    preset_alias_map = {
        "xianxia": "xianxia_preset.json",
        "仙侠": "xianxia_preset.json",
        "凡人": "xianxia_preset.json",
        "guimi": "guimi_preset.json",
        "诡秘": "guimi_preset.json",
        "克苏鲁": "guimi_preset.json"
    }
    
    lower_normalized = normalized.lower()
    if lower_normalized in preset_alias_map:
        preset_file = preset_alias_map[lower_normalized]
        preset_path = os.path.join(presets_dir, preset_file)
        if os.path.exists(preset_path):
            try:
                with open(preset_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading preset alias {normalized}: {e}")

    # 2. 默认返回完全去题材化、通用的默认模板（以防止泄露任何特定 IP）
    return {
        "title": f"{theme}幻想域：十二重境",
        "themeColor": "#3b82f6", # Blue
        "economy": {
            "currencyName": f"{theme}精魂/Energy",
            "resources": [
                f"{theme}晶石/Crystals",
                f"{theme}残屑/Shards",
                "信用点/Credits"
            ],
            "realms": [
                "初生星徒/Novice",
                "破晓卫士/Guardian",
                "逐月贤者/Sage",
                "曜日星王/Lord",
                "寰宇至尊/Archon",
                "至高意志/Genesis"
            ]
        },
        "progressionSystems": [
            {
                "id": "main_idle_growth",
                "title": "主干积累",
                "resource": f"{theme}精魂",
                "action": "在主界面挂机或点击积累核心能量",
                "unlocks": ["realm_breakthrough", "node_entry"],
                "nodePayloadEffect": "提高节点进入资格、通关收益倍率和基础容错。"
            },
            {
                "id": "realm_breakthrough",
                "title": "境界跃迁",
                "resource": f"{theme}精魂",
                "action": "达到阈值后突破至下一阶段",
                "unlocks": ["higher_nodes", "stronger_base_stats"],
                "nodePayloadEffect": "转化为节点内生命、目标效率或难度容错。"
            },
            {
                "id": "ability_mastery",
                "title": "能力参悟",
                "resource": f"{theme}残屑",
                "action": "消耗稀有材料解锁或强化局内能力",
                "unlocks": ["ability_catalog", "run_skill_pool"],
                "nodePayloadEffect": "决定每个节点可携带或可抽取的能力池。"
            }
        ],
        "abilityCatalog": [
            {
                "id": "starter_art",
                "name": "入门本命术",
                "description": "默认起手能力，保证每个节点都有清晰的局内行动方式。",
                "unlockSource": "initial",
                "unlockCondition": "创建项目时自动获得",
                "gameplayTags": ["starter", "output"],
                "runtimeSkillIds": ["starter_projectile", "tap_focus", "collect_magnet"],
                "affectedNodeIds": [1, 2, 3, 4]
            },
            {
                "id": "guard_art",
                "name": "护身秘法",
                "description": "主干参悟所得的防御/回复能力，将长期养成转化为节点内生存容错。",
                "unlockSource": "mainline",
                "unlockCondition": f"消耗 {theme}残屑 在主干能力系统中参悟",
                "gameplayTags": ["defense", "recovery", "survival"],
                "runtimeSkillIds": ["shield_refresh", "passive_heal", "defense_aura"],
                "affectedNodeIds": [3, 4, 5, 6, 7, 8, 9]
            },
            {
                "id": "breakthrough_art",
                "name": "破境秘术",
                "description": "由关键节点首通打开的爆发能力，用于 Boss、终局或高压割草关卡。",
                "unlockSource": "node_reward",
                "unlockCondition": "中后期节点首通奖励",
                "gameplayTags": ["burst", "boss", "ultimate"],
                "runtimeSkillIds": ["burst_clear", "boss_break", "ultimate_form"],
                "affectedNodeIds": [7, 8, 9, 10, 11, 12]
            }
        ],
        "nodes": [
            {
                "id": i + 1,
                "title": f"{theme}幻境第 {i + 1} 重：{['星域启航', '极地收集', '矩阵重构', '虚空比武', '幽林采集', '雷劫突围', '碎石聚能', '风暴渡越', '妖古镇封', '天火净化', '魔宫夺宝', '乾坤造化'][i]}",
                "intro": f"在此区域探寻未知边界，进入第 {i + 1} 阶段，通过 {'快速点击交互' if i % 3 == 0 else '敏捷路线避障' if i % 3 == 1 else '规律记忆重组'} 收集古神留下的稀有元力。",
                "taunts": [
                    f"「{theme}幻影已经显现，静心吐纳！」",
                    "「幻境空间无情，心神不宁者必受反噬！」"
                ],
                "mechanics": "tap_reaction" if i % 3 == 0 else "collect_dodge" if i % 3 == 1 else "memory_sequence",
                "rewards": f"能量结晶 +{(i + 1) * 3}, 产出效率提升",
                "goalValue": 5 + i // 2 if i % 3 == 2 else 15 + i * 5,
                "resourceMultiplier": float(f"{1.8 ** (i + 1):.1f}"),
                "difficulty": i // 2 + 1,
                "durationLimit": 30 + (i % 3) * 10,
                "planning": {
                    "mainlineHooks": ["main_idle_growth", "realm_breakthrough"] + (["ability_mastery"] if i >= 2 else []),
                    "rewardUnlocks": ["breakthrough_art"] if i in [6, 9, 11] else [],
                    "runSkillPool": ["starter_art"] + (["guard_art"] if i >= 2 else []) + (["breakthrough_art"] if i >= 6 else []),
                    "notes": "主干养成决定局内起手能力与首通奖励。"
                }
            } for i in range(12)
        ]
    }
