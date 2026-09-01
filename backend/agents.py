import os
import json
import asyncio
from .theme_presets import get_procedural_preset
from .design_recipe import recipe_prompt_contract, resolve_design_recipe
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


def _apply_recipe_shape(gdd: dict, recipe: dict) -> dict:
    """Attach authoring recipe metadata and keep legacy fallbacks shape-compatible."""
    if not isinstance(gdd, dict):
        return gdd
    result = json.loads(json.dumps(gdd))
    result["designRecipe"] = {
        "id": recipe.get("id"),
        "sessionTargetMinutes": recipe.get("sessionTargetMinutes"),
    }
    nodes = result.get("nodes")
    if isinstance(nodes, list) and nodes:
        minimum = max(1, int(recipe.get("nodeCountMin") or len(nodes)))
        maximum = max(minimum, int(recipe.get("nodeCountMax") or len(nodes)))
        if len(nodes) > maximum:
            result["nodes"] = nodes[:maximum]
        # We do not synthesize missing fallback nodes here. The legacy procedural
        # preset is already large enough for current built-in recipes; fail-safe
        # callers still receive a valid existing manifest rather than fake nodes.
    return result


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
    async def generate_gdd(theme: str, recipe_id: str | None = None) -> dict:
        log_ollama_deferred_notice()
        recipe = resolve_design_recipe(recipe_id)
        recipe_contract = recipe_prompt_contract(recipe)

        if not resolve_provider():
            print("No LLM API key found (XAI_API_KEY / GEMINI_API_KEY), using procedural fallback.")
            await asyncio.sleep(1.0)
            return _apply_recipe_shape(get_procedural_preset(theme), recipe)

        try:
            prompt = f"""You are LoreWeaver Game Orchestrator, an AI game spec designer.
The user wants to build a playable H5 game prototype from this theme: "{theme}".
Do not assume cultivation, anime, fan-fiction, or a fixed 12-stage structure unless the selected design recipe explicitly requires it.

AUTHORING RECIPE:
{recipe_contract}

Your task is to deconstruct the theme into a fully usable GDD JSON for LoreWeaver.
Progression systems, abilityCatalog, node planning, wording, and pacing are project-authored design content. Generate them from the requested experience. Do not rely on the runtime engine to invent generic theme content later.
Gameplay execution must stay inside reusable Gameplay Cards / modifiers / knobs; do not invent runtime source code in this document.

CRITICAL SCHEMA REQUIREMENTS (Return one valid JSON object, no markdown):
{{
  "title": "A short title incorporating the theme's essence",
  "themeColor": "A hex HUD highlight color",
  "designRecipe": {{
    "id": "{recipe.get('id')}",
    "sessionTargetMinutes": {recipe.get('sessionTargetMinutes')}
  }},
  "economy": {{
    "currencyName": "Core progression currency appropriate to this theme",
    "resources": ["3 secondary resources/materials appropriate to this theme"],
    "realms": ["Exactly 6 ascending progression-tier names appropriate to this theme; they do not need to be cultivation realms"]
  }},
  "progressionSystems": [
    {{
      "id": "stable_snake_case_id",
      "title": "Long-term progression system name",
      "resource": "Resource consumed or produced",
      "action": "What the player does in the main shell",
      "unlocks": ["What this system unlocks"],
      "nodePayloadEffect": "How this system affects a runtime node payload"
    }}
  ],
  "abilityCatalog": [
    {{
      "id": "stable_snake_case_id",
      "name": "Ability / tool / technique name",
      "description": "What this ability does in gameplay terms",
      "unlockSource": "Must be one of: initial, mainline, node_reward, hybrid",
      "unlockCondition": "Readable requirement or first-clear source",
      "gameplayTags": ["output", "defense", "mobility", "control", "burst"],
      "runtimeSkillIds": ["stable runtime skill ids or planned ids"]
    }}
  ],
  "nodes": [
    {{
      "id": 1,
      "title": "Stage title",
      "intro": "Concise story/setup introduction (1-2 sentences)",
      "taunts": ["Optional encounter line 1", "Optional encounter line 2"],
      "mechanics": "Prefer a known gameplay intent such as tap_reaction, collect_dodge, memory_sequence, or survivor_horde; do not invent adapter source code",
      "rewards": "First-clear reward description",
      "goalValue": 15,
      "resourceMultiplier": 1.2,
      "difficulty": 1,
      "durationLimit": 30,
      "planning": {{
        "mainlineHooks": ["progression system ids that affect this node"],
        "rewardUnlocks": ["ability ids unlocked by first clear"],
        "runSkillPool": ["ability ids that may appear or be carried in this node"],
        "notes": "Short design note explaining progression -> node connection"
      }}
    }}
  ]
}}

The number and dramatic function of nodes MUST follow the AUTHORING RECIPE, not a global LoreWeaver assumption."""
            data, provider = await _generate_json_async(prompt)
            if not isinstance(data, dict):
                raise RuntimeError(f"Expected JSON object, got {type(data)}")
            data = _apply_recipe_shape(data, recipe)
            print(f"[WorldBuilderAgent] GDD generated via {provider} recipe={recipe.get('id')}")
            return data
        except Exception as e:
            print(f"WorldBuilderAgent python error: {e}, falling back.")
            return _apply_recipe_shape(get_procedural_preset(theme), recipe)

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
                role_instructions = """You are the World Builder Agent (世界编制官). Your specialty is core IP DNA, theme language, progression naming, economy, progressionSystems, and abilityCatalog.
Verify and adapt fields like 'title', 'themeColor', 'economy', 'progressionSystems', and 'abilityCatalog' based on user suggestions. Do not assume cultivation terminology unless the current project uses it. Retain node content as intact as possible."""
            elif agent_role == "narrative":
                role_instructions = """You are the Narrative / Gameplay Planning Agent (剧本与玩法规划). Your specialty is the CURRENT project's node arc, introductions, taunts, mechanics mappings, node planning hooks, difficulties, duration limits, and goal values.
Respect the existing designRecipe and node count. Do not force a 12-stage cultivation structure. Update nodes and node.planning based on the requested change while preserving unrelated economy fields."""
            elif agent_role == "sandbox":
                role_instructions = """You are the Sandbox Architect Agent (沙盒架构师). Your specialty is resolution rules (720x1280 scaling checks), static data contracts, recipe formulas, and manifest-safe structural configuration.
Analyze and tweak sandbox/config variables if the feedback concerns bounds, layout setup, persistence keys, schema shape, or authoring recipe metadata."""
            elif agent_role == "code_foundry":
                role_instructions = """You are the Code Foundry Agent (代码铸造厂). You may propose only manifest-level runtime knobs and existing Gameplay Card/modifier composition in this JSON.
Do not claim to rewrite runtime source code. Any adapter/core implementation request is L3/L4 and must be escalated instead of encoded as an unrelated spec change."""
            elif agent_role == "auditor":
                role_instructions = """You are the Quality Auditor Agent (多模审计官). Your specialty is diagnosing contract, layout, content-safety, evidence and E2E risks.
Only refine fields inside the existing JSON ownership boundary. Never lower pass bars or fabricate validation evidence."""
            else:
                role_instructions = "You are the general LoreWeaver Orchestrator Agent. Intelligently edit the design specs with the smallest relevant change."

            prompt = f"""{role_instructions}
Here is the current Game Design Document (JSON specification):
{json.dumps(current_gdd, ensure_ascii=False)}

The user provided the following design adjustment directive:
"{feedback}"

Apply only the necessary modifications to the existing specification layout and return ONLY the fully refined valid JSON payload. Keep everything else intact. Do not output anything other than JSON.

CRITICAL INSTRUCTION: Always separate theme narrative styling from gameplay numerical parameters. When adjusting gameplay, pacing, balance, long-term progression, or abilities, prioritize progressionSystems, abilityCatalog, nodes.planning, and nodes' gameplay knobs (e.g. knobs, goalValue, durationLimit, resourceMultiplier) rather than modifying or recommending modifications to external runtime codebase/adapter files."""

            data, provider = await _generate_json_async(prompt)
            if not isinstance(data, dict):
                raise RuntimeError(f"Expected JSON object, got {type(data)}")
            print(f"[WorldBuilderAgent] GDD adjusted via {provider} ({agent_role})")
            return data
        except Exception as e:
            print(f"WorldBuilderAgent python adjust error: {e}")
            return current_gdd
