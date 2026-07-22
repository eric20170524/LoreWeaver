import os
import json
import asyncio
from .theme_presets import get_procedural_preset
from .llm_client import (
    generate_json,
    log_ollama_deferred_notice,
    llm_status,
    OLLAMA_SUPPORT_STATUS,
    resolve_provider,
)

async def _generate_json_async(prompt: str):
    """Offload blocking HTTP LLM call so the event loop stays responsive."""
    return await asyncio.to_thread(generate_json, prompt)


# Re-export for callers that imported from agents
__all__ = [
    "WorldBuilderAgent",
    "log_ollama_deferred_notice",
    "OLLAMA_SUPPORT_STATUS",
    "llm_status",
    "resolve_provider",
]


class WorldBuilderAgent:
    @staticmethod
    async def generate_gdd(theme: str) -> dict:
        log_ollama_deferred_notice()
        if not resolve_provider():
            print("No LLM API key found (XAI_API_KEY / GEMINI_API_KEY), using procedural fallback.")
            await asyncio.sleep(1.0)
            return get_procedural_preset(theme)

        try:
            prompt = f"""You are LoreWeaver Game Orchestrator, an AI game spec designer. The user wants to build a complete 12-stage Fan-Fiction / Cultivation / Anime game called "LoreWeaver" based on the following theme: "{theme}".
Your task is to deconstruct this theme into a fully fleshed GDD (Game Design Document) and produce a high-fidelity JSON payload matching this specification exactly.
Progression systems, abilityCatalog, and node planning are project-authored design content: generate them from the requested theme and gameplay needs. Do not rely on the runtime engine to invent generic default abilities or progression systems later.

CRITICAL SCHEMA REQUIREMENTS (Return EXACTLY this JSON structure, no markdown outside of the JSON object itself):
{{
  "title": "A short elegant Chinese or English title incorporating the theme's essence",
  "themeColor": "A hex color code suitable for the theme's core HUD energy highlight (e.g., #10b981)",
  "economy": {{
    "currencyName": "The core main currency accumulated passively",
    "resources": ["A list of 3 secondary resources/materials generated in game, formatted as 'Chinese/English' pairs"],
    "realms": ["A list of exactly 6 ascending player level/realm titles matching this IP's lore hierarchy"]
  }},
  "progressionSystems": [
    {{
      "id": "main_idle_growth",
      "title": "Long-term mainline system name",
      "resource": "Resource consumed or produced",
      "action": "What the player does in the main shell",
      "unlocks": ["What this system unlocks"],
      "nodePayloadEffect": "How this long-term system affects a runtime node payload"
    }}
  ],
  "abilityCatalog": [
    {{
      "id": "stable_snake_case_id",
      "name": "Ability / spell / technique name",
      "description": "What this ability does in gameplay terms",
      "unlockSource": "Must be one of: initial, mainline, node_reward, hybrid",
      "unlockCondition": "Readable requirement or first-clear source",
      "gameplayTags": ["output", "defense", "mobility", "control", "burst"],
      "runtimeSkillIds": ["stable runtime skill ids or planned ids"]
    }}
  ],
  "nodes": [
    // Exactly 12 chronological narrative battle/stage nodes
    {{
      "id": 1, 
      "title": "Name of stage node",
      "intro": "Poetic rich story introduction (1-2 sentences)",
      "taunts": ["Classic taunt quote 1", "Classic quote 2"],
      "mechanics": "Must be exactly one of: 'tap_reaction', 'collect_dodge', or 'memory_sequence'",
      "rewards": "Description of the first clear rewards",
      "goalValue": 15, // integer 15-80 for tap_reaction/collect_dodge, or 5-12 for memory_sequence
      "resourceMultiplier": 1.2, // float
      "difficulty": 1, // integer 1-6
      "durationLimit": 30, // integer 30-60
      "planning": {{
        "mainlineHooks": ["progression system ids that affect this node"],
        "rewardUnlocks": ["ability ids unlocked by first clear"],
        "runSkillPool": ["ability ids that may appear or be carried in this node"],
        "notes": "Short design note explaining the mainline -> node connection"
      }}
    }}
  ]
}}"""
            data, provider = await _generate_json_async(prompt)
            if not isinstance(data, dict):
                raise RuntimeError(f"Expected JSON object, got {type(data)}")
            print(f"[WorldBuilderAgent] GDD generated via {provider}")
            return data
        except Exception as e:
            print(f"WorldBuilderAgent python error: {e}, falling back.")
            return get_procedural_preset(theme)

    @staticmethod
    async def adjust_gdd(current_gdd: dict, feedback: str, agent_role: str = "world_builder") -> dict:
        log_ollama_deferred_notice()
        if not resolve_provider():
            print("No LLM API key for adjust prompt, applying mock tweak.")
            current_gdd = current_gdd.copy()
            current_gdd["title"] = current_gdd.get("title", "Custom Game") + " (Modified)"
            return current_gdd

        try:
            # Formulate the targeted sub-agent specialized role instructions
            role_instructions = ""
            if agent_role == "world_builder":
                role_instructions = """You are the World Builder Agent (世界编制官). Your specialty is the core IP DNA, color themes, currency name, the 6 ascending cultivation realms, progressionSystems, and abilityCatalog.
Verify and adapt fields like 'title', 'themeColor', 'economy', 'progressionSystems', and 'abilityCatalog' based on user suggestions. Retain everything in the node narrative stages as intact as possible."""
            elif agent_role == "narrative":
                role_instructions = """You are the Narrative Architect Agent (剧本大纲师). Your specialty is the 12 cultivation milestones storyline tree, chronological introductions, taunts, mechanics mappings, node planning hooks, difficulties, duration limits, and goal values.
Update the 'nodes' element objects and each node.planning mapping based on the narrative or difficulty values requested, ensuring you preserve the overall economic parameters in the root document."""
            elif agent_role == "sandbox":
                role_instructions = """You are the Sandbox Architect Agent (沙盒架构师). Your specialty is resolution rules (720x1280 scaling checks), 'store.js' and 'data.js' static assets indices integration, and recipe formulas.
Analyze and tweak sandbox variables if the feedback concerns screen bounds, layout setups, or persistent memory keys."""
            elif agent_role == "code_foundry":
                role_instructions = """You are the Code Foundry Agent (代码铸造厂). Your specialty is Phaser 3 card logic, Web Audio synthesizers, wind/thunder pitch values, particle flow overlays, and word-wrapping tolerances for Chinese typography.
Incorporate physical code configurations, thresholds, sound levels, and timing metrics into the JSON."""
            elif agent_role == "auditor":
                role_instructions = """You are the Quality Auditor Agent (多模审计官). Your specialty is diagnosing overlapping coordinates, HUD collision rules, sanitizing trademark or copyright names, and injecting E2E robust safety rules.
Refine text wraps or validation flags inside the JSON schema to ensure maximum quality."""
            else:
                role_instructions = "You are the general LoreWeaver Orchestrator Agent. Intelligently edit the design specs."

            prompt = f"""{role_instructions}
Here is the current Game Design Document (JSON specification):
{json.dumps(current_gdd, ensure_ascii=False)}

The user provided the following design adjustment directive:
"{feedback}"

Apply the modifications perfectly to the specification layout. Maintain the EXACT schema requirements and return ONLY the fully refined valid JSON payload. Keep everything else intact. Do not output anything other than JSON.

CRITICAL INSTRUCTION: Always separate theme narrative styling from gameplay numerical parameters. When adjusting gameplay, pacing, balance, long-term progression, or abilities, prioritize updating progressionSystems, abilityCatalog, nodes.planning, and nodes' gameplay knobs (e.g. knobs, goalValue, durationLimit, resourceMultiplier) inside the JSON rather than modifying or recommending modifications to external runtime codebase/adapter files."""

            data, provider = await _generate_json_async(prompt)
            if not isinstance(data, dict):
                raise RuntimeError(f"Expected JSON object, got {type(data)}")
            print(f"[WorldBuilderAgent] GDD adjusted via {provider} ({agent_role})")
            return data
        except Exception as e:
            print(f"WorldBuilderAgent python adjust error: {e}")
            return current_gdd
