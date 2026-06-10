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
                "durationLimit": 30 + (i % 3) * 10
            } for i in range(12)
        ]
    }
