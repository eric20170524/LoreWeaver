import os
import json
import asyncio
from .theme_presets import get_procedural_preset

class WorldBuilderAgent:
    @staticmethod
    async def generate_gdd(theme: str) -> dict:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("No GEMINI_API_KEY found, using procedural fallback.")
            await asyncio.sleep(1.0)
            return get_procedural_preset(theme)

        try:
            # Try importing the modern google-genai SDK
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            prompt = f"""You are LoreWeaver Game Orchestrator, an AI game spec designer. The user wants to build a complete 12-stage Fan-Fiction / Cultivation / Anime game called "LoreWeaver" based on the following theme: "{theme}".
Your task is to deconstruct this theme into a fully fleshed GDD (Game Design Document) and produce a high-fidelity JSON payload matching this specification exactly.

CRITICAL SCHEMA REQUIREMENTS (Return EXACTLY this JSON structure, no markdown outside of the JSON object itself):
{{
  "title": "A short elegant Chinese or English title incorporating the theme's essence",
  "themeColor": "A hex color code suitable for the theme's core HUD energy highlight (e.g., #10b981)",
  "economy": {{
    "currencyName": "The core main currency accumulated passively",
    "resources": ["A list of 3 secondary resources/materials generated in game, formatted as 'Chinese/English' pairs"],
    "realms": ["A list of exactly 6 ascending player level/realm titles matching this IP's lore hierarchy"]
  }},
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
      "durationLimit": 30 // integer 30-60
    }}
  ]
}}"""
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            text_result = response.text.strip()
            return json.loads(text_result)
        except Exception as e:
            print(f"WorldBuilderAgent python error: {e}, falling back.")
            return get_procedural_preset(theme)

    @staticmethod
    async def adjust_gdd(current_gdd: dict, feedback: str) -> dict:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("No GEMINI_API_KEY for adjust prompt, applying mock tweak.")
            current_gdd = current_gdd.copy()
            current_gdd["title"] = current_gdd.get("title", "Custom Game") + " (Modified)"
            return current_gdd

        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            prompt = f"""You are LoreWeaver Game Orchestrator. 
Here is the current Game Design Document (JSON):
{json.dumps(current_gdd, ensure_ascii=False)}

The user provided the following feedback/request for changes:
"{feedback}"

Apply the requested changes to the JSON structure while maintaining the EXACT schema requirements.
Return ONLY valid JSON."""

            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                ),
            )
            text_result = response.text.strip()
            return json.loads(text_result)
        except Exception as e:
            print(f"WorldBuilderAgent python adjust error: {e}")
            return current_gdd
