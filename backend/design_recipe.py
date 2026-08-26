"""Authoring recipe intents for GDD generation.

Recipes control project shape. They are intentionally separate from runtime
Gameplay Cards so a narrative structure never becomes an engine constraint.
"""

from __future__ import annotations

import os
from typing import Optional


DESIGN_RECIPES = {
    "vertical_slice_3": {
        "id": "vertical_slice_3",
        "nodeCountMin": 3,
        "nodeCountMax": 3,
        "structure": "setup -> pressure/escalation -> climax/boss",
        "sessionTargetMinutes": 8,
        "genreConstraint": None,
    },
    "cultivation_journey_12": {
        "id": "cultivation_journey_12",
        "nodeCountMin": 12,
        "nodeCountMax": 12,
        "structure": "legacy linear 12-stage cultivation journey",
        "sessionTargetMinutes": 30,
        "genreConstraint": "cultivation",
    },
    "adaptive_linear": {
        "id": "adaptive_linear",
        "nodeCountMin": 3,
        "nodeCountMax": 8,
        "structure": "choose the smallest linear arc that expresses the requested experience",
        "sessionTargetMinutes": 12,
        "genreConstraint": None,
    },
}


def resolve_design_recipe(recipe_id: Optional[str] = None) -> dict:
    """Resolve generation shape while keeping legacy default compatible."""
    requested = (
        recipe_id
        or os.getenv("LOREWEAVER_DEFAULT_DESIGN_RECIPE")
        or "cultivation_journey_12"
    )
    recipe = DESIGN_RECIPES.get(requested)
    if recipe is None:
        recipe = DESIGN_RECIPES["adaptive_linear"]
    return dict(recipe)


def recipe_prompt_contract(recipe: dict) -> str:
    minimum = int(recipe.get("nodeCountMin") or 1)
    maximum = int(recipe.get("nodeCountMax") or minimum)
    if minimum == maximum:
        count_text = f"exactly {minimum} nodes"
    else:
        count_text = f"between {minimum} and {maximum} nodes"
    genre = recipe.get("genreConstraint")
    genre_text = (
        f"Genre constraint: {genre}."
        if genre
        else "No genre constraint: infer genre and progression language from the user's theme."
    )
    return (
        f"Design recipe id: {recipe.get('id')}.\n"
        f"Generate {count_text}.\n"
        f"Structure intent: {recipe.get('structure')}.\n"
        f"Target total session length: about {recipe.get('sessionTargetMinutes')} minutes.\n"
        f"{genre_text}\n"
        "The recipe defines authoring shape only; it must not create new runtime behavior."
    )
