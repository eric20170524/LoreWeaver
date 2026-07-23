"""
Director-scheduled department agents for film-style production prep.

Each department owns a slice of the GDD / artifacts. Auto-prep runs in
dependsOn topological order, produces prepNotes + qaScore, and never
auto-confirms (HITL).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from .llm_client import generate_json, log_ollama_deferred_notice, resolve_provider

# Map department id → legacy chat agent_role (for refine compatibility)
LEGACY_ROLE = {
    "world": "world_builder",
    "narrative": "narrative",
    "architecture": "sandbox",
    "code": "code_foundry",
    "qa": "auditor",
    "compliance": "auditor",
    "gameplay": "narrative",  # closest existing
    "ability": "world_builder",
    "art": "code_foundry",
    "audio": "code_foundry",
    "director": "world_builder",
}

DEPARTMENT_PROMPTS = {
    "director": """You are the Director / Orchestrator for LoreWeaver (导演组).
You do NOT invent design content. Summarize upstream readiness, risks, and the order departments should confirm.
Output JSON only.""",
    "world": """You are the World department (世界观组) for LoreWeaver.
Own: title, themeColor, economy, progressionSystems, pipeline_dna style seeds.
Propose prep notes for IP DNA, currency, realms, visual/audio style seeds.
Do not rewrite node prose or gameplay cards.
Output JSON only.""",
    "narrative": """You are the Narrative department (叙事组).
Own: nodes[].title, intro, taunts, planning.notes.
Propose prep notes for 12-node chronology and stakes. Do not change economy roots.
Output JSON only.""",
    "gameplay": """You are the Gameplay department (玩法组).
Own: gameplay card assignment, nodes[].gameplay (cardId, modifiers, knobs).
Prefer existing validated cards: survivor_horde, rhythm_timing, drag_collect_grid, turn_based_skill_battle,
sequence_synthesis, side_scrolling_brawler, energy_balance, etc.
Propose prep notes mapping nodes to cards/modifiers and L1 knobs only.
Output JSON only.""",
    "ability": """You are the Ability Runtime department (能力组).
Own: abilityCatalog, passiveSkillCatalog, runtimeSkillIds, VFX/voice binding intent.
Propose prep notes aligning abilities to nodes and tags (output/defense/mobility/control/burst).
Output JSON only.""",
    "architecture": """You are the Architecture department (架构组).
Own: shell contracts, registry shapes, runtime feature pack checklist.
Propose prep notes for 720x1280, store/save, RFP catalogs, TestHooks — no story content.
Output JSON only.""",
    "art": """You are the Art department (美术组).
Own: asset-pipeline artAssets, imagegen atlas plans, RuntimeArtBinder semantic keys
(player/enemy/projectile/pickup/env_bg_*/core_eye/escort_npc/portal_ring/wall_segment).
Supported imagegen provider: Antigravity generate_image tool (ImageName, Prompt, spriteClips, atlas specifications).
Propose prep notes for atlas coverage, Antigravity imagegen prompts, and node envKey mapping.
Output JSON only.""",
    "audio": """You are the Audio department (音频组).
Own: audio cue catalog, BGM/SFX/voice channels, credits/provenance.
Propose prep notes for coverage matrix: menu, node, boss, victory, defeat, ability, pickup, hazard.
Output JSON only.""",
    "code": """You are the Code Foundry department (代码组).
Own: adapter wiring, node runtime patches within L1-L2 knobs; escalate L3 adapters.
Propose prep notes for which adapters/modifiers are wired and residual L3 risks.
Output JSON only.""",
    "qa": """You are the QA / Auditor department (质检组).
Own: build/e2e/VLM/scene_hygiene/art coverage reports and reject handoffs.
Propose prep notes listing gates to run and pass/fail risks. Do not lower pass bars.
Output JSON only.""",
    "compliance": """You are the Compliance department (合规组).
Own: content safety scan, export checklist, de-theme review for public export.
Propose prep notes for copyright/sensitive text risks and export blockers.
Output JSON only.""",
}


def topological_departments(departments: List[dict]) -> List[dict]:
    """Return departments in dependsOn order (Kahn). Unknown deps ignored."""
    by_id = {d["id"]: d for d in departments}
    indeg = {d["id"]: 0 for d in departments}
    edges: Dict[str, List[str]] = {d["id"]: [] for d in departments}
    for d in departments:
        for dep in d.get("dependsOn") or []:
            if dep in by_id:
                edges[dep].append(d["id"])
                indeg[d["id"]] += 1
    queue = [did for did, n in indeg.items() if n == 0]
    queue.sort()
    ordered_ids: List[str] = []
    while queue:
        cur = queue.pop(0)
        ordered_ids.append(cur)
        for nxt in sorted(edges[cur]):
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                queue.append(nxt)
                queue.sort()
    # append any leftover cycles
    for did in by_id:
        if did not in ordered_ids:
            ordered_ids.append(did)
    return [by_id[i] for i in ordered_ids]


def _summarize_gdd(gdd: dict) -> dict:
    nodes = gdd.get("nodes") or []
    return {
        "title": gdd.get("title"),
        "themeColor": gdd.get("themeColor"),
        "economy": gdd.get("economy"),
        "nodeCount": len(nodes),
        "nodeTitles": [
            {"id": n.get("id"), "title": n.get("title"), "mechanics": n.get("mechanics"), "gameplay": n.get("gameplay")}
            for n in nodes[:12]
        ],
        "abilityCount": len(gdd.get("abilityCatalog") or []),
        "progressionCount": len(gdd.get("progressionSystems") or []),
    }


def collect_report_signals(reports_dir: str) -> dict:
    """Best-effort scores from capabilities/reports for QA department."""
    signals = {"files": [], "scores": {}, "notes": []}
    if not os.path.isdir(reports_dir):
        signals["notes"].append("reports_dir_missing")
        return signals

    interesting = [
        "build_gate_latest.json",
        "full_qa_latest.json",
        "runtime_e2e_loreweaver_latest.json",
        "runtime_e2e_survivor_horde_latest.json",
        "scene_hygiene_latest.json",
        "gameplay_card_validate_latest.json",
        "content_safety_scan_latest.json",
        "visual_audit_latest.json",
        # qa-owned per-node smoke (10s simulated / short wall) — hard gate input
        "node_smoke_latest.json",
    ]
    score_sum = 0
    score_n = 0
    for name in interesting:
        path = os.path.join(reports_dir, name)
        if not os.path.isfile(path):
            continue
        signals["files"].append(name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            signals["notes"].append(f"unreadable:{name}")
            continue
        status = str(data.get("status") or data.get("result") or "").lower()
        # Prefer explicit numeric score when present (node_smoke, etc.)
        if isinstance(data.get("score"), (int, float)):
            s = max(0, min(100, int(data["score"])))
            signals["scores"][name] = s
            score_sum += s
            score_n += 1
        elif name == "visual_audit_latest.json":
            # Score from per-check PASS/WARNING/FAIL rather than binary failed→40
            checks = []
            if isinstance(data.get("data"), dict):
                checks = data["data"].get("checks") or []
            if not checks:
                checks = data.get("checks") or []
            if checks:
                pts = 0
                for c in checks:
                    st = str((c or {}).get("status") or "").upper()
                    if st == "PASS":
                        pts += 100
                    elif st in ("WARNING", "NOTICE"):
                        pts += 70
                    elif st == "FAIL":
                        pts += 25
                    else:
                        pts += 60
                s = max(0, min(100, int(pts / max(1, len(checks)))))
            elif status in ("passed", "pass", "ok", "success"):
                s = 90
            elif status in ("failed", "fail", "error"):
                s = 55  # soft floor — not a hard production_prep killer by itself
            else:
                s = 70
            signals["scores"][name] = s
            score_sum += s
            score_n += 1
        elif status in ("passed", "pass", "ok", "success"):
            signals["scores"][name] = 95
            score_sum += 95
            score_n += 1
        elif status in ("failed", "fail", "error"):
            signals["scores"][name] = 40
            score_sum += 40
            score_n += 1
        elif status in ("partial_pass", "partial", "warning"):
            signals["scores"][name] = 75
            score_sum += 75
            score_n += 1
        elif "findings" in data and isinstance(data["findings"], list):
            n = len(data["findings"])
            s = max(50, 100 - n * 8)
            signals["scores"][name] = s
            score_sum += s
            score_n += 1
        else:
            signals["scores"][name] = 75
            score_sum += 75
            score_n += 1

        if name == "node_smoke_latest.json":
            signals["nodeSmoke"] = {
                "status": data.get("status"),
                "score": data.get("score"),
                "summary": data.get("summary"),
                "owners": data.get("owners"),
                "failedNodes": [
                    n
                    for n in (data.get("perNode") or [])
                    if isinstance(n, dict) and not n.get("ok")
                ],
                "suggestedHandoffs": data.get("suggestedHandoffs") or [],
            }
    signals["aggregate"] = int(score_sum / score_n) if score_n else None
    return signals


def _procedural_prep(dept: dict, gdd_summary: dict, upstream: dict, report_signals: dict) -> dict:
    did = dept["id"]
    title = dept.get("title") or did
    role = dept.get("systemPromptRole") or ""
    deps = dept.get("dependsOn") or []
    owns = dept.get("owns") or []
    lines = [
        f"【{title}筹备草案】",
        f"职责：{role}",
        f"拥有产物：{', '.join(owns[:6]) or '（调度/状态）'}",
        f"上游依赖：{', '.join(deps) or '无'}",
    ]
    if gdd_summary.get("title"):
        lines.append(f"当前作品：{gdd_summary.get('title')}（{gdd_summary.get('nodeCount', 0)} 节点）")
    if did == "gameplay" and gdd_summary.get("nodeTitles"):
        lines.append("节点玩法映射建议：")
        for n in gdd_summary["nodeTitles"][:6]:
            gp = n.get("gameplay") or {}
            card = gp.get("cardId") or n.get("mechanics") or "survivor_horde"
            lines.append(f"  - Node{n.get('id')}: {n.get('title')} → {card}")
    if did == "art":
        lines.append("美术接线：RuntimeArtBinder atlas-first；env_bg_* 按节点；modifier 道具 core/escort/portal/wall。")
    if did == "qa" and report_signals.get("aggregate") is not None:
        lines.append(f"现有 reports 聚合分：{report_signals['aggregate']}（文件 {len(report_signals.get('files') or [])}）")
        for k, v in list((report_signals.get("scores") or {}).items())[:5]:
            lines.append(f"  - {k}: {v}")
    if did == "director":
        ready = [k for k, v in upstream.items() if v.get("status") in ("ready_for_review", "confirmed")]
        lines.append(f"上游已就绪部门：{', '.join(ready) or '尚无'}。请按拓扑确认，禁止跳过 gate。")
    if upstream:
        lines.append("上游摘要：")
        for uid, u in list(upstream.items())[-4:]:
            note = (u.get("prepNotes") or "")[:120].replace("\n", " ")
            lines.append(f"  - {uid}[{u.get('status')}]: {note}…")
    lines.append("状态：草案 → ready_for_review（需人工确认，不会自动 confirmed）。")
    qa = 78
    if did == "qa" and report_signals.get("aggregate") is not None:
        qa = int(report_signals["aggregate"])
    elif did in ("compliance",) and report_signals.get("scores", {}).get("content_safety_scan_latest.json"):
        qa = int(report_signals["scores"]["content_safety_scan_latest.json"])
    return {
        "prepNotes": "\n".join(lines),
        "qaScore": qa,
        "risks": [],
        "suggestedHandoffs": [],
        "source": "procedural",
    }


async def _llm_prep(
    dept: dict,
    gdd: dict,
    gdd_summary: dict,
    upstream: dict,
    report_signals: dict,
) -> dict:
    log_ollama_deferred_notice()
    if not resolve_provider():
        return _procedural_prep(dept, gdd_summary, upstream, report_signals)

    try:
        did = dept["id"]
        system = DEPARTMENT_PROMPTS.get(did, DEPARTMENT_PROMPTS["director"])
        prompt = f"""{system}

Department metadata:
{json.dumps({k: dept.get(k) for k in ('id','title','owns','dependsOn','defaultPatchLevels','pipelineSteps')}, ensure_ascii=False)}

GDD summary (do not invent ids outside this unless proposing future work):
{json.dumps(gdd_summary, ensure_ascii=False)}

Upstream department prep (confirmed or ready):
{json.dumps(upstream, ensure_ascii=False)[:6000]}

Report signals (for QA/compliance):
{json.dumps(report_signals, ensure_ascii=False)[:3000]}

Return ONLY JSON with this shape:
{{
  "prepNotes": "markdown or plain text multi-paragraph prep opinion for this department",
  "qaScore": 0-100,
  "risks": ["short risk strings"],
  "suggestedHandoffs": [
    {{"to": "art", "summary": "what you need from them", "type": "request"}}
  ],
  "focusArtifacts": ["paths or field paths you will own"]
}}

Rules:
- Stay inside your ownership. Do not claim L3 adapter rewrites.
- prepNotes must be concrete for THIS project title and nodes.
- qaScore reflects readiness, not vanity (70-92 typical for draft).
- Chinese preferred for prepNotes if project title is Chinese.
"""
        # generate_json is blocking (urllib); never run it on the asyncio event loop
        # or the whole FastAPI process freezes (refresh / other APIs look dead).
        data, provider = await asyncio.to_thread(generate_json, prompt)
        if not isinstance(data, dict) or not data.get("prepNotes"):
            return _procedural_prep(dept, gdd_summary, upstream, report_signals)
        data["source"] = "llm"
        data["provider"] = provider
        try:
            data["qaScore"] = max(0, min(100, int(data.get("qaScore", 80))))
        except (TypeError, ValueError):
            data["qaScore"] = 80
        if not isinstance(data.get("suggestedHandoffs"), list):
            data["suggestedHandoffs"] = []
        if not isinstance(data.get("risks"), list):
            data["risks"] = []
        return data
    except Exception as exc:
        print(f"[department_agents] LLM prep failed for {dept.get('id')}: {exc}")
        out = _procedural_prep(dept, gdd_summary, upstream, report_signals)
        out["prepNotes"] = out["prepNotes"] + f"\n\n（LLM 不可用，已回退程序化草案：{exc}）"
        out["source"] = "procedural_fallback"
        return out


# ── Phase D: stale cascade, gate, controlled patches ─────────────────────────

# Prefer catalog-driven resolution (production_ready only for auto-select).
try:
    from backend.gameplay_catalog import (  # type: ignore
        MECHANICS_TO_CARD as _CATALOG_MECHANICS,
        resolve_card_id as catalog_resolve_card_id,
        default_production_card_id,
        catalog_summary as gameplay_catalog_summary,
    )
    MECHANICS_TO_CARD = dict(_CATALOG_MECHANICS)
except Exception:  # pragma: no cover
    MECHANICS_TO_CARD = {
        "tap_reaction": "rhythm_timing",
        "collect_dodge": "drag_collect_grid",
        "memory_sequence": "sequence_synthesis",
        "survivor_horde": "survivor_horde",
        "rhythm_timing": "rhythm_timing",
        "drag_collect_grid": "drag_collect_grid",
        "turn_based_skill_battle": "turn_based_skill_battle",
        "sequence_synthesis": "sequence_synthesis",
        "side_scrolling_brawler": "side_scrolling_brawler",
        "energy_balance": "energy_balance",
        "pressure_survival": "pressure_survival",
    }

    def catalog_resolve_card_id(mechanics=None, preferred=None, *, allow_experimental=False):
        mapped = MECHANICS_TO_CARD.get(str(mechanics or ""), "survivor_horde")
        return {
            "cardId": preferred or mapped or "survivor_horde",
            "experimental": False,
            "productionReady": (preferred or mapped) == "survivor_horde",
            "reason": "fallback mapping",
        }

    def default_production_card_id():
        return "survivor_horde"

    def gameplay_catalog_summary():
        return {"totals": {"productionReady": 1}, "autoSelectable": [{"id": "survivor_horde"}]}

# Simple path prefixes allowed per department for L1/L2 patches on GDD JSON
PATCH_ALLOWLIST = {
    "world": ["title", "themeColor", "economy.", "pipeline_dna."],
    "narrative": ["nodes["],  # only title/intro/taunts/planning.notes filtered further
    "gameplay": ["nodes["],  # only gameplay subtree
    "ability": ["abilityCatalog", "passiveSkillCatalog", "passiveCatalog"],
    "art": [],  # side-file only
    "audio": [],  # side-file only
    "architecture": ["pipeline_dna."],
    "code": ["nodes["],  # only gameplay.knobs
    "qa": [],
    "compliance": [],
    "director": [],
}

ENV_BY_NODE = [
    "env_bg_desert", "env_bg_cliff", "env_bg_arena", "env_bg_tide",
    "env_bg_city", "env_bg_poison", "env_bg_tournament", "env_bg_ruins",
    "env_bg_escort", "env_bg_wall", "env_bg_void", "env_bg_finale",
]

# Workspace audio manifest keys (data/workspaces/.../assets/audio)
BGM_BY_NODE = [
    "node1_battle",
    "node2_treasure",
    "node3_rival",
    "node4_tide",
    "node5_defense",
    "node6_poison",
    "node7_tournament",
    "node8_ruins",
    "node9_escort",
    "node10_siege",
    "node11_gauntlet",
    "node12_finale",
]

# Card → victory / timeout semantics for playability contracts
CARD_VICTORY_MODE = {
    "survivor_horde": "survive",
    "pressure_survival": "survive",
    "side_scrolling_brawler": "survive",
    "drag_collect_grid": "objective",
    "rhythm_timing": "objective",
    "tap_reaction": "objective",
    "sequence_synthesis": "objective",
    "sequence_puzzle_combo": "objective",
    "turn_based_skill_battle": "boss_only",
    "dodge_counter_boss": "boss_only",
    "node_iframe_microgame": "objective",
    "energy_balance": "objective",
    "qix_area_capture": "objective",
    "point_drag_progression": "objective",
}

PLAYABLE_CARD_IDS = set(CARD_VICTORY_MODE.keys()) | {
    "shooter_duel",
    "drag_to_core",
    "maze_exploration_choice",
    "platform_escape",
    "hazard_collect_waves",
    "rhythm_then_pickup",
    "observe_capture",
    "reaction_pick",
    "rune_connect_sequence",
    "branching_dialogue_check",
}


def build_downstream_map(registry: dict) -> Dict[str, List[str]]:
    """dept_id -> list of departments that depend on it (direct)."""
    deps: Dict[str, List[str]] = {}
    for d in registry.get("departments") or []:
        did = d["id"]
        deps.setdefault(did, [])
        for up in d.get("dependsOn") or []:
            deps.setdefault(up, []).append(did)
    return deps


def mark_downstream_stale(
    state: dict,
    registry: dict,
    changed_dept_id: str,
    reason: str = "upstream_confirmed",
) -> List[str]:
    """Mark all transitive downstream departments as stale (except director)."""
    graph = build_downstream_map(registry)
    seen = set()
    stack = list(graph.get(changed_dept_id) or [])
    stale_ids: List[str] = []
    while stack:
        did = stack.pop()
        if did in seen or did == "director":
            continue
        seen.add(did)
        dept = (state.get("departments") or {}).get(did)
        if not dept:
            continue
        if dept.get("status") in ("confirmed", "ready_for_review", "drafting"):
            dept["status"] = "stale"
            dept["staleReason"] = f"{reason}:{changed_dept_id}"
            dept["updatedAt"] = __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime())
            state["departments"][did] = dept
            stale_ids.append(did)
        for nxt in graph.get(did) or []:
            if nxt not in seen:
                stack.append(nxt)
    return stale_ids


# Canonical production stages (registry stages subset used for advance buttons).
# beat_board was removed as a ceremony-only stop: its checks fold into runtime_stage.
STAGE_CHAIN: List[str] = [
    "import_source",
    "production_prep",
    "asset_confirm",
    "runtime_stage",
]

# Legacy / alias stage ids map into the chain for ordering comparisons.
STAGE_ALIASES: Dict[str, str] = {
    # Former intermediate stage — treat as asset_confirm (next = runtime_stage)
    "beat_board": "asset_confirm",
    "build": "runtime_stage",
    "export": "runtime_stage",
    "shipped": "runtime_stage",
    "done": "runtime_stage",
}


def normalize_stage_id(stage_id: Optional[str]) -> str:
    sid = str(stage_id or "production_prep").strip() or "production_prep"
    return STAGE_ALIASES.get(sid, sid)


def stage_index(stage_id: Optional[str]) -> int:
    sid = normalize_stage_id(stage_id)
    try:
        return STAGE_CHAIN.index(sid)
    except ValueError:
        return STAGE_CHAIN.index("production_prep")


def next_stage_id(stage_id: Optional[str]) -> Optional[str]:
    i = stage_index(stage_id)
    if i < 0 or i >= len(STAGE_CHAIN) - 1:
        return None
    return STAGE_CHAIN[i + 1]


def _dedupe(items: List[str]) -> List[str]:
    return list(dict.fromkeys([x for x in items if x]))


def _append_soft_report_warnings(
    report_signals: dict, warnings: List[str], soft_names: Optional[set] = None
) -> None:
    soft_names = soft_names or {
        "visual_audit_latest.json",
        "scene_hygiene_latest.json",
    }
    for name, score in (report_signals.get("scores") or {}).items():
        if name in soft_names and score is not None and int(score) < 70:
            warnings.append(f"soft_report:{name}={score} (art/visual advisory)")


def _check_node_smoke(
    report_signals: dict,
    blockers: List[str],
    warnings: List[str],
    *,
    required: bool,
    state: dict,
) -> None:
    smoke = report_signals.get("nodeSmoke")
    smoke_score = (report_signals.get("scores") or {}).get("node_smoke_latest.json")
    code = (state.get("departments") or {}).get("code") or {}
    gameplay = (state.get("departments") or {}).get("gameplay") or {}
    if not required:
        if smoke_score is not None and int(smoke_score) < 50:
            warnings.append(f"qa:node_smoke_score={smoke_score}<50")
        return
    if not smoke and smoke_score is None:
        blockers.append("qa:node_smoke_missing — run minigame_master/capabilities/verification/run_node_smoke.mjs")
        warnings.append("director: schedule node smoke before advance")
        return
    status = str((smoke or {}).get("status") or "").lower()
    if smoke_score is not None and int(smoke_score) < 50:
        blockers.append(f"qa:node_smoke_score={smoke_score}<50")
    elif status in ("failed", "fail", "error"):
        blockers.append("qa:node_smoke_failed")
    failed_nodes = (smoke or {}).get("failedNodes") or []
    code_hits = 0
    gameplay_hits = 0
    for n in failed_nodes:
        owners = n.get("owners") or []
        label = f"N{n.get('id')}:{n.get('cardId') or '?'}"
        if "code" in owners:
            code_hits += 1
            blockers.append(f"code:smoke_runtime:{label}")
        if "gameplay" in owners:
            gameplay_hits += 1
            blockers.append(f"gameplay:smoke_contract:{label}")
        for w in n.get("warnings") or []:
            if isinstance(w, dict) and w.get("owner") in ("art", "audio"):
                warnings.append(f"{w.get('owner')}:{label}:{w.get('code')}")
    if code_hits and code.get("status") == "confirmed":
        warnings.append(
            f"code: {code_hits} node smoke runtime failure(s) — re-open code or accept handoff from qa"
        )
    if gameplay_hits and gameplay.get("status") == "confirmed":
        warnings.append(
            f"gameplay: {gameplay_hits} node smoke contract failure(s) — re-open gameplay"
        )
    for ho in (smoke or {}).get("suggestedHandoffs") or []:
        warnings.append(
            f"handoff:{ho.get('from')}→{ho.get('to')}:{(ho.get('summary') or '')[:120]}"
        )


def _node_duration(node: dict) -> Optional[float]:
    knobs = ((node.get("gameplay") or {}).get("knobs")) or {}
    for key in ("durationSec", "timeLimitSec", "duration"):
        v = knobs.get(key)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    dl = node.get("durationLimit")
    if isinstance(dl, (int, float)) and dl > 0:
        return float(dl)
    return None


def _node_goal(node: dict) -> Optional[float]:
    knobs = ((node.get("gameplay") or {}).get("knobs")) or {}
    for key in ("needAmount", "collectGoal", "goalValue", "collectTarget"):
        v = knobs.get(key)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    gv = node.get("goalValue")
    if isinstance(gv, (int, float)) and gv > 0:
        return float(gv)
    return None


def _node_beat_text(node: dict) -> bool:
    intro = str(node.get("intro") or "").strip()
    notes = str(((node.get("planning") or {}).get("notes")) or "").strip()
    return bool(intro or notes)


def evaluate_node_playability_gate(
    report_signals: Optional[dict] = None,
    gdd: Optional[dict] = None,
    state: Optional[dict] = None,
) -> dict:
    """
    Shared playability / beat contract checks (no longer a separate stage).
    Used when advancing asset_confirm → runtime_stage.
    Per-node: cardId, duration, beat text; node_smoke; card validate.
    """
    report_signals = report_signals or {}
    state = state or {}
    blockers: List[str] = []
    warnings: List[str] = []
    nodes = (gdd or {}).get("nodes") if isinstance(gdd, dict) else None
    if not nodes:
        blockers.append("playability:nodes_missing — load assembled manifest with nodes[]")
    else:
        missing_card = []
        missing_duration = []
        missing_goal = []
        missing_beat = []
        for n in nodes:
            if not isinstance(n, dict):
                continue
            nid = n.get("id", "?")
            gp = n.get("gameplay") or {}
            card = gp.get("cardId") or n.get("mechanics")
            if not card:
                missing_card.append(str(nid))
            if _node_duration(n) is None:
                missing_duration.append(str(nid))
            if _node_goal(n) is None:
                knobs = gp.get("knobs") or {}
                if not knobs.get("victoryMode") and not knobs.get("playable"):
                    missing_goal.append(str(nid))
            if not _node_beat_text(n):
                missing_beat.append(str(nid))
        if missing_card:
            blockers.append(f"playability:cardId_missing:N{','.join(missing_card[:6])}")
        if missing_duration:
            blockers.append(f"playability:duration_missing:N{','.join(missing_duration[:6])}")
        if missing_goal:
            warnings.append(
                f"playability:goal_soft_missing:N{','.join(missing_goal[:6])} (ok if victoryMode set)"
            )
        if missing_beat:
            blockers.append(f"playability:intro_or_planning_missing:N{','.join(missing_beat[:6])}")
        warnings.append(f"playability:nodes_checked={len(nodes)}")

    _check_node_smoke(report_signals, blockers, warnings, required=True, state=state)
    card_score = (report_signals.get("scores") or {}).get("gameplay_card_validate_latest.json")
    if card_score is not None and int(card_score) < 40:
        blockers.append(f"report:gameplay_card_validate_latest.json={card_score}")

    blockers = _dedupe(blockers)
    warnings = _dedupe(warnings)
    return {
        "allowed": len(blockers) == 0,
        "blockers": blockers,
        "warnings": warnings,
        "ownership": {"gate": "gameplay", "verify": "qa", "prose": "narrative"},
    }


# Back-compat alias for older imports / tests
evaluate_beat_board_gate = evaluate_node_playability_gate


def evaluate_runtime_stage_gate(
    report_signals: Optional[dict] = None,
    state: Optional[dict] = None,
    gdd: Optional[dict] = None,
) -> dict:
    """
    asset_confirm → runtime_stage.
    Includes former beat_board playability checks + build/e2e/export signals.
    """
    report_signals = report_signals or {}
    state = state or {}
    blockers: List[str] = []
    warnings: List[str] = []
    scores = report_signals.get("scores") or {}

    # Fold former beat_board contract into this gate (real checks, no extra click)
    play = evaluate_node_playability_gate(report_signals, gdd=gdd, state=state)
    blockers.extend(play.get("blockers") or [])
    warnings.extend(play.get("warnings") or [])

    build_s = scores.get("build_gate_latest.json")
    if build_s is None:
        warnings.append("runtime:build_gate_missing — export still possible; run build gate when ready")
    elif int(build_s) < 50:
        blockers.append(f"report:build_gate_latest.json={build_s}")

    e2e_scores = [
        scores.get("full_qa_latest.json"),
        scores.get("runtime_e2e_loreweaver_latest.json"),
        scores.get("runtime_e2e_survivor_horde_latest.json"),
    ]
    e2e_present = [int(s) for s in e2e_scores if s is not None]
    if not e2e_present:
        warnings.append("runtime:e2e_report_missing")
    elif max(e2e_present) < 50:
        blockers.append(f"runtime:e2e_score={max(e2e_present)}<50")

    safety = scores.get("content_safety_scan_latest.json")
    if safety is not None and int(safety) < 40:
        blockers.append(f"report:content_safety_scan_latest.json={safety}")
    elif safety is not None and int(safety) < 70:
        warnings.append(f"runtime:content_safety={safety} (export with compliance review)")

    _append_soft_report_warnings(report_signals, warnings)

    compliance = (state.get("departments") or {}).get("compliance") or {}
    if compliance.get("status") == "blocked":
        blockers.append("compliance:blocked")

    blockers = _dedupe(blockers)
    warnings = _dedupe(warnings)
    return {
        "allowed": len(blockers) == 0,
        "blockers": blockers,
        "warnings": warnings,
        "targetStageId": "runtime_stage",
        "fromStageId": "asset_confirm",
        "ownership": {
            "gate": "qa",
            "playability": "gameplay",
            "export": "compliance",
            "runtime": "code",
        },
    }


def evaluate_advance_gate(
    state: dict,
    registry: dict,
    report_signals: Optional[dict] = None,
    min_qa: int = 70,
    require_node_smoke: bool = True,
) -> dict:
    """
    Hard gate for production_prep → asset_confirm.

    Ownership for node smoke (see minigame_master/capabilities/verification/run_node_smoke.mjs):
      - qa: owns gate definition / report
      - code: runtime enter/spawn/retreat failures
      - gameplay: card/duration/goal contract failures
      - art/audio: soft warnings only
    """
    report_signals = report_signals or {}
    required = state.get("requiredDepartmentIds") or [
        d["id"] for d in registry.get("departments", []) if d["id"] != "director"
    ]
    blockers: List[str] = []
    warnings: List[str] = []

    for d_id in required:
        dept = (state.get("departments") or {}).get(d_id) or {}
        st = dept.get("status")
        if st != "confirmed":
            blockers.append(f"{d_id}:status={st or 'missing'}")
        if st == "blocked":
            blockers.append(f"{d_id}:blocked")
        if st == "stale":
            blockers.append(f"{d_id}:stale")

    qa = (state.get("departments") or {}).get("qa") or {}
    compliance = (state.get("departments") or {}).get("compliance") or {}
    qa_score = qa.get("qaScore")
    if qa_score is None and report_signals.get("aggregate") is not None:
        qa_score = report_signals["aggregate"]
    if qa_score is not None and int(qa_score) < min_qa:
        blockers.append(f"qa:score={qa_score}<{min_qa}")
    if qa.get("status") == "blocked":
        blockers.append("qa:blocked")
    if compliance.get("status") == "blocked":
        blockers.append("compliance:blocked")

    # Soft visual/art reports → warnings only (do not hard-block asset_confirm).
    SOFT_REPORTS = {
        "visual_audit_latest.json",
        "scene_hygiene_latest.json",
    }
    HARD_REPORT_MIN = {
        "build_gate_latest.json": 50,
        "full_qa_latest.json": 50,
        "content_safety_scan_latest.json": 50,
        "gameplay_card_validate_latest.json": 40,
    }
    for name, score in (report_signals.get("scores") or {}).items():
        if name == "node_smoke_latest.json":
            continue  # dedicated handling below
        if score is None:
            continue
        if name in SOFT_REPORTS:
            if int(score) < 70:
                warnings.append(f"soft_report:{name}={score} (art/visual advisory)")
            continue
        min_s = HARD_REPORT_MIN.get(name, 50)
        if int(score) < min_s:
            blockers.append(f"report:{name}={score}")

    _check_node_smoke(
        report_signals, blockers, warnings, required=require_node_smoke, state=state
    )

    open_rejects = 0  # filled by caller if needed
    blockers = _dedupe(blockers)
    warnings = _dedupe(warnings)
    allowed = len(blockers) == 0
    smoke = report_signals.get("nodeSmoke")
    return {
        "allowed": allowed,
        "blockers": blockers,
        "warnings": warnings,
        "confirmedCount": state.get("confirmedCount"),
        "requiredCount": state.get("requiredCount"),
        "qaScore": qa_score,
        "nextStageId": "asset_confirm" if allowed else state.get("stageId"),
        "minQa": min_qa,
        "openRejects": open_rejects,
        "nodeSmoke": smoke,
        "targetStageId": "asset_confirm",
        "fromStageId": "production_prep",
        "ownership": {
            "gate": "qa",
            "runtime": "code",
            "contract": "gameplay",
            "softWarnings": ["art", "audio"],
            "scheduler": "director",
        },
    }


def evaluate_transition_gate(
    state: dict,
    registry: dict,
    report_signals: Optional[dict] = None,
    target_stage: str = "asset_confirm",
    gdd: Optional[dict] = None,
    open_reject_ids: Optional[List[str]] = None,
) -> dict:
    """
    Evaluate gate for advancing INTO target_stage from the previous stage.
    """
    report_signals = report_signals or {}
    target = normalize_stage_id(target_stage)
    current = normalize_stage_id(state.get("stageId"))
    cur_i = stage_index(current)
    tgt_i = stage_index(target)

    base = {
        "targetStageId": target,
        "stageId": current,
        "confirmedCount": state.get("confirmedCount"),
        "requiredCount": state.get("requiredCount"),
        "qaScore": ((state.get("departments") or {}).get("qa") or {}).get("qaScore")
        or report_signals.get("aggregate"),
        "nodeSmoke": report_signals.get("nodeSmoke"),
    }

    # Already at or past target
    if cur_i >= tgt_i:
        return {
            **base,
            "allowed": True,
            "alreadyAtTarget": True,
            "blockers": [],
            "warnings": [],
            "fromStageId": STAGE_CHAIN[tgt_i - 1] if tgt_i > 0 else None,
        }

    # Cannot skip stages
    if tgt_i > cur_i + 1:
        prev = STAGE_CHAIN[tgt_i - 1]
        return {
            **base,
            "allowed": False,
            "alreadyAtTarget": False,
            "blockers": [f"stage:must_reach_{prev}_first (current={current})"],
            "warnings": [],
            "fromStageId": prev,
        }

    # Immediate next: run specific gate
    if target == "asset_confirm":
        gate = evaluate_advance_gate(state, registry, report_signals)
        # open rejects hard-block only this transition
        if open_reject_ids:
            gate["blockers"] = _dedupe(
                list(gate.get("blockers") or [])
                + [f"open_reject:{rid}" for rid in open_reject_ids]
            )
            gate["allowed"] = len(gate["blockers"]) == 0
            gate["openRejects"] = len(open_reject_ids)
    elif target == "runtime_stage":
        gate = evaluate_runtime_stage_gate(report_signals, state=state, gdd=gdd)
        if open_reject_ids:
            gate["warnings"] = _dedupe(
                list(gate.get("warnings") or [])
                + [f"open_reject:{rid} (soft after asset_confirm)" for rid in open_reject_ids]
            )
            gate["openRejects"] = len(open_reject_ids)
    elif target == "beat_board":
        # Removed stage — redirect clients to runtime_stage semantics
        gate = {
            "allowed": False,
            "blockers": [
                "stage:beat_board_removed — use runtime_stage (playability checks are included there)"
            ],
            "warnings": ["stage:beat_board_deprecated"],
        }
    else:
        gate = {
            "allowed": False,
            "blockers": [f"stage:unknown_target:{target}"],
            "warnings": [],
        }

    return {
        **base,
        **gate,
        "alreadyAtTarget": False,
        "allowed": bool(gate.get("allowed")),
        "blockers": list(gate.get("blockers") or []),
        "warnings": list(gate.get("warnings") or []),
    }


def evaluate_all_stage_gates(
    state: dict,
    registry: dict,
    report_signals: Optional[dict] = None,
    gdd: Optional[dict] = None,
    open_reject_ids: Optional[List[str]] = None,
) -> dict:
    """
    Multi-button advance snapshot: asset_confirm / runtime_stage.
    (beat_board removed — playability folded into runtime_stage gate)
    """
    report_signals = report_signals or {}
    current = normalize_stage_id(state.get("stageId"))
    nxt = next_stage_id(current)
    transitions: Dict[str, dict] = {}
    for target in ("asset_confirm", "runtime_stage"):
        transitions[target] = evaluate_transition_gate(
            state,
            registry,
            report_signals,
            target_stage=target,
            gdd=gdd,
            open_reject_ids=open_reject_ids,
        )

    next_gate = transitions.get(nxt) if nxt else None
    if next_gate is None and nxt is None:
        next_payload = {
            "allowed": False,
            "blockers": [],
            "warnings": ["stage:terminal — already at runtime_stage"],
            "alreadyAtTarget": True,
        }
    else:
        next_payload = next_gate or {
            "allowed": False,
            "blockers": ["stage:no_next"],
            "warnings": [],
        }

    qa_score = ((state.get("departments") or {}).get("qa") or {}).get("qaScore")
    if qa_score is None:
        qa_score = report_signals.get("aggregate")

    return {
        "allowed": bool(next_payload.get("allowed")) and nxt is not None,
        "allowedForAdvance": bool(next_payload.get("allowed")) and nxt is not None,
        "alreadyAtTarget": nxt is None,
        "terminal": nxt is None,
        "stageId": current,
        "nextStageId": nxt,
        "blockers": list(next_payload.get("blockers") or []),
        "warnings": list(next_payload.get("warnings") or []),
        "confirmedCount": state.get("confirmedCount"),
        "requiredCount": state.get("requiredCount"),
        "qaScore": qa_score,
        "openRejects": len(open_reject_ids or []),
        "nodeSmoke": report_signals.get("nodeSmoke"),
        "transitions": transitions,
        "stageChain": STAGE_CHAIN,
        "ownership": {
            "asset_confirm": "qa",
            "runtime_stage": "qa+gameplay+compliance",
        },
    }


def _set_path(obj: dict, path: str, value: Any) -> bool:
    """Set dotted/bracket path like nodes[0].gameplay.cardId"""
    if not path:
        return False
    # tokenize
    tokens: List[Any] = []
    buf = ""
    i = 0
    while i < len(path):
        ch = path[i]
        if ch == ".":
            if buf:
                tokens.append(buf)
                buf = ""
            i += 1
        elif ch == "[":
            if buf:
                tokens.append(buf)
                buf = ""
            j = path.find("]", i)
            if j < 0:
                return False
            tokens.append(int(path[i + 1 : j]))
            i = j + 1
        else:
            buf += ch
            i += 1
    if buf:
        tokens.append(buf)
    cur: Any = obj
    for t in tokens[:-1]:
        if isinstance(t, int):
            if not isinstance(cur, list) or t >= len(cur):
                return False
            cur = cur[t]
        else:
            if not isinstance(cur, dict):
                return False
            if t not in cur or cur[t] is None:
                cur[t] = {}
            cur = cur[t]
    last = tokens[-1]
    if isinstance(last, int):
        if not isinstance(cur, list) or last >= len(cur):
            return False
        cur[last] = value
    else:
        if not isinstance(cur, dict):
            return False
        cur[last] = value
    return True


def _path_allowed(dept_id: str, path: str) -> bool:
    prefixes = PATCH_ALLOWLIST.get(dept_id)
    if prefixes is None:
        return False
    if prefixes == []:
        return False
    if dept_id == "narrative":
        # only prose fields
        return bool(re.match(r"^nodes\[\d+\]\.(title|intro|taunts|planning\.notes)$", path))
    if dept_id == "gameplay":
        return bool(re.match(r"^nodes\[\d+\]\.gameplay(\.|$)", path)) or bool(
            re.match(r"^nodes\[\d+\]\.mechanics$", path)
        )
    if dept_id == "code":
        return bool(re.match(r"^nodes\[\d+\]\.gameplay\.knobs(\.|$)", path))
    for p in prefixes:
        if path == p.rstrip(".") or path.startswith(p):
            return True
    return False


def build_controlled_patches(dept_id: str, gdd: dict) -> List[dict]:
    """Deterministic safe L1/L2 patches inside ownership."""
    patches: List[dict] = []
    nodes = gdd.get("nodes") or []
    if not isinstance(nodes, list):
        return patches

    if dept_id == "gameplay":
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                continue
            gp = node.get("gameplay") if isinstance(node.get("gameplay"), dict) else {}
            card = gp.get("cardId")
            mechanics = node.get("mechanics") or ""
            if not card:
                resolved = catalog_resolve_card_id(mechanics=str(mechanics) if mechanics else None)
                mapped = resolved.get("cardId") or default_production_card_id()
                patches.append({
                    "path": f"nodes[{i}].gameplay.cardId",
                    "value": mapped,
                    "level": "L2",
                    "reason": resolved.get("reason")
                    or f"map mechanics={mechanics or 'empty'} → production catalog card",
                })
                card = mapped
            else:
                # If assigned card is experimental, re-route auto path to production default
                # unless node explicitly opts in via knobs.allowExperimentalCard
                knobs0 = gp.get("knobs") if isinstance(gp.get("knobs"), dict) else {}
                allow_exp = bool(knobs0.get("allowExperimentalCard"))
                resolved = catalog_resolve_card_id(
                    preferred=str(card),
                    allow_experimental=allow_exp,
                )
                if resolved.get("cardId") and resolved["cardId"] != card and not allow_exp:
                    patches.append({
                        "path": f"nodes[{i}].gameplay.cardId",
                        "value": resolved["cardId"],
                        "level": "L2",
                        "reason": resolved.get("reason") or "replace experimental card with production default",
                    })
                    card = resolved["cardId"]
            if not gp.get("adapter"):
                patches.append({
                    "path": f"nodes[{i}].gameplay.adapter",
                    "value": "iframe" if card == "node_iframe_microgame" else "phaser",
                    "level": "L2",
                    "reason": "default adapter by card",
                })
            if "modifiers" not in gp:
                patches.append({
                    "path": f"nodes[{i}].gameplay.modifiers",
                    "value": [],
                    "level": "L2",
                    "reason": "init modifiers",
                })
            # knobs duration from durationLimit
            knobs = gp.get("knobs") if isinstance(gp.get("knobs"), dict) else {}
            if node.get("durationLimit") and "durationSec" not in knobs and "duration" not in knobs:
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.durationSec",
                    "value": int(node.get("durationLimit") or 120),
                    "level": "L1",
                    "reason": "sync durationLimit → knobs.durationSec",
                })
            if knobs.get("goalValue") is None and node.get("goalValue") is not None:
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.goalValue",
                    "value": node.get("goalValue"),
                    "level": "L1",
                    "reason": "sync goalValue into knobs",
                })
            # Playability contract: can play / clear / exit / pause
            card_id = str(card or knobs.get("cardId") or mechanics or "survivor_horde")
            victory = CARD_VICTORY_MODE.get(card_id, "survive")
            if not knobs.get("victoryMode"):
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.victoryMode",
                    "value": victory,
                    "level": "L1",
                    "reason": f"default victoryMode for {card_id}",
                })
            # Align with PlayabilityContract / gameplay card knobs (timeLimitSec, needAmount)
            playability_defaults = {
                "playable": card_id in PLAYABLE_CARD_IDS,
                "allowQuit": True,
                "allowPause": True,
                "failOnTimeout": victory in ("survive", "objective"),
                "clearable": True,
                "retreatReturnsToShell": True,
                "shellRetreat": True,
            }
            for k, v in playability_defaults.items():
                if knobs.get(k) is None:
                    patches.append({
                        "path": f"nodes[{i}].gameplay.knobs.{k}",
                        "value": v,
                        "level": "L1",
                        "reason": f"playability contract:{k}",
                    })
            # Card-standard aliases (drag_collect_grid.json etc.)
            if knobs.get("timeLimitSec") is None and (
                knobs.get("durationSec") is not None or node.get("durationLimit") is not None
            ):
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.timeLimitSec",
                    "value": int(knobs.get("durationSec") or node.get("durationLimit") or 30),
                    "level": "L1",
                    "reason": "alias duration → timeLimitSec",
                })
            if knobs.get("needAmount") is None and knobs.get("goalValue") is not None:
                # collect-style: avoid needAmount == duration
                gv = int(knobs.get("goalValue"))
                dur = int(knobs.get("durationSec") or node.get("durationLimit") or 30)
                need = gv
                if card_id in (
                    "drag_collect_grid",
                    "collect_dodge",
                    "reaction_pick",
                    "observe_capture",
                    "drag_to_core",
                    "qix_area_capture",
                    "point_drag_progression",
                    "rhythm_then_pickup",
                ) and gv >= dur:
                    need = max(12, min(int(dur / 5), max(12, int(dur / 3))))
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.needAmount",
                    "value": need,
                    "level": "L1",
                    "reason": "alias goalValue → needAmount (card standard)",
                })
                if card_id in ("drag_collect_grid", "collect_dodge") and knobs.get("collectGoal") is None:
                    patches.append({
                        "path": f"nodes[{i}].gameplay.knobs.collectGoal",
                        "value": need,
                        "level": "L1",
                        "reason": "collectGoal mirror needAmount",
                    })

    if dept_id == "art":
        # side-channel: env keys suggested into gameplay knobs.envKey (L1)
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                continue
            gp = node.get("gameplay") if isinstance(node.get("gameplay"), dict) else {}
            knobs = gp.get("knobs") if isinstance(gp.get("knobs"), dict) else {}
            nid = int(node.get("id") or (i + 1))
            if not knobs.get("envKey"):
                env = ENV_BY_NODE[(max(nid, 1) - 1) % len(ENV_BY_NODE)]
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.envKey",
                    "value": env,
                    "level": "L1",
                    "reason": f"node {nid} env binding",
                })
            if knobs.get("artAtlasFirst") is None:
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.artAtlasFirst",
                    "value": True,
                    "level": "L1",
                    "reason": "RuntimeArtBinder atlas-first",
                })

    if dept_id == "audio":
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                continue
            gp = node.get("gameplay") if isinstance(node.get("gameplay"), dict) else {}
            knobs = gp.get("knobs") if isinstance(gp.get("knobs"), dict) else {}
            nid = int(node.get("id") or (i + 1))
            if not knobs.get("bgmKey"):
                bgm = BGM_BY_NODE[(max(nid, 1) - 1) % len(BGM_BY_NODE)]
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.bgmKey",
                    "value": bgm,
                    "level": "L1",
                    "reason": f"node {nid} BGM cue",
                })
            if not knobs.get("sfxVictory"):
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.sfxVictory",
                    "value": "victory_sting",
                    "level": "L1",
                    "reason": "victory sting",
                })
            if not knobs.get("sfxDefeat"):
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.sfxDefeat",
                    "value": "defeat_sting",
                    "level": "L1",
                    "reason": "defeat sting",
                })
            if knobs.get("bossBgmKey") is None and knobs.get("bossId"):
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.bossBgmKey",
                    "value": "boss_theme_late" if nid >= 10 else "boss_theme",
                    "level": "L1",
                    "reason": "boss BGM cue",
                })

    if dept_id == "world":
        if not gdd.get("themeColor"):
            patches.append({
                "path": "themeColor",
                "value": "#10b981",
                "level": "L1",
                "reason": "default theme color",
            })
        eco = gdd.get("economy") if isinstance(gdd.get("economy"), dict) else {}
        if eco and not eco.get("currencyName"):
            patches.append({
                "path": "economy.currencyName",
                "value": "灵石",
                "level": "L1",
                "reason": "default currency",
            })

    if dept_id == "ability":
        catalog = gdd.get("abilityCatalog")
        if not isinstance(catalog, list) or len(catalog) == 0:
            patches.append({
                "path": "abilityCatalog",
                "value": [{
                    "id": "starter_strike",
                    "name": "启灵击",
                    "description": "基础输出能力",
                    "unlockSource": "initial",
                    "unlockCondition": "初始",
                    "gameplayTags": ["output"],
                    "runtimeSkillIds": ["starter_projectile"],
                }],
                "level": "L2",
                "reason": "seed minimal ability catalog",
            })

    if dept_id == "code":
        # Ensure each node has a resolvable phaser card + retreat contract for GameRunner
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                continue
            gp = node.get("gameplay") if isinstance(node.get("gameplay"), dict) else {}
            knobs = gp.get("knobs") if isinstance(gp.get("knobs"), dict) else {}
            card = gp.get("cardId") or MECHANICS_TO_CARD.get(str(node.get("mechanics") or ""), "survivor_horde")
            if knobs.get("runtimeCardId") is None:
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.runtimeCardId",
                    "value": card,
                    "level": "L1",
                    "reason": "mirror cardId for runtime",
                })
            if knobs.get("shellRetreat") is None:
                patches.append({
                    "path": f"nodes[{i}].gameplay.knobs.shellRetreat",
                    "value": True,
                    "level": "L1",
                    "reason": "GameRunner ◀ 撤退 returns to shell",
                })

    return patches


def apply_controlled_patches(gdd: dict, dept_id: str, patches: List[dict]) -> Tuple[dict, List[dict]]:
    """Apply allowlisted patches; return (gdd, applied_list)."""
    applied = []
    if not isinstance(gdd, dict):
        return gdd, applied
    # Always include deterministic patches first
    all_patches = list(patches or []) + build_controlled_patches(dept_id, gdd)
    # de-dupe by path keeping last
    by_path = {}
    for p in all_patches:
        if isinstance(p, dict) and p.get("path") is not None:
            by_path[str(p["path"])] = p
    for path, p in by_path.items():
        level = str(p.get("level") or "L1")
        if level not in ("L0", "L1", "L2"):
            continue
        if not _path_allowed(dept_id, path):
            # art/audio side-channel knobs live under nodes[].gameplay.knobs
            art_ok = dept_id == "art" and re.match(
                r"^nodes\[\d+\]\.gameplay\.knobs\.(envKey|artAtlasFirst)$", path
            )
            audio_ok = dept_id == "audio" and re.match(
                r"^nodes\[\d+\]\.gameplay\.knobs\.(bgmKey|sfxVictory|sfxDefeat|bossBgmKey)$",
                path,
            )
            if not (art_ok or audio_ok):
                continue
        # ensure gameplay object exists when writing nested gameplay
        m = re.match(r"^nodes\[(\d+)\]\.gameplay", path)
        if m:
            idx = int(m.group(1))
            nodes = gdd.setdefault("nodes", [])
            if isinstance(nodes, list) and idx < len(nodes) and isinstance(nodes[idx], dict):
                if not isinstance(nodes[idx].get("gameplay"), dict):
                    nodes[idx]["gameplay"] = {}
                if "knobs" in path and not isinstance(nodes[idx]["gameplay"].get("knobs"), dict):
                    nodes[idx]["gameplay"]["knobs"] = {}
        ok = _set_path(gdd, path, p.get("value"))
        if ok:
            applied.append({
                "path": path,
                "value": p.get("value"),
                "level": level,
                "reason": p.get("reason") or "",
                "department": dept_id,
            })
    return gdd, applied


async def run_department_prep(
    dept: dict,
    gdd: dict,
    upstream_states: Dict[str, dict],
    report_signals: Optional[dict] = None,
) -> dict:
    report_signals = report_signals or {}
    gdd_summary = _summarize_gdd(gdd or {})
    # Only pass upstream prep slices
    upstream = {}
    for dep_id in dept.get("dependsOn") or []:
        if dep_id in upstream_states:
            u = upstream_states[dep_id]
            upstream[dep_id] = {
                "status": u.get("status"),
                "version": u.get("version"),
                "qaScore": u.get("qaScore"),
                "prepNotes": (u.get("prepNotes") or "")[:800],
            }
    result = await _llm_prep(dept, gdd or {}, gdd_summary, upstream, report_signals)
    # Always attach deterministic controlled patches for ownership
    det = build_controlled_patches(dept["id"], gdd or {})
    extra = result.get("patches") if isinstance(result.get("patches"), list) else []
    result["patches"] = det + [p for p in extra if isinstance(p, dict)]
    return result


async def run_auto_prep_pipeline(
    registry: dict,
    state: dict,
    gdd: dict,
    reports_dir: str,
    force: bool = False,
    only: Optional[List[str]] = None,
    apply_patches: bool = True,
) -> Tuple[dict, List[dict], List[dict], dict, List[dict]]:
    """
    Returns (new_state, run_log, suggested_handoffs, gdd, all_applied_patches).
    """
    departments = registry.get("departments") or []
    ordered = topological_departments(departments)
    report_signals = collect_report_signals(reports_dir)
    run_log: List[dict] = []
    suggested_handoffs: List[dict] = []
    all_applied: List[dict] = []
    only_set = set(only) if only else None
    working_gdd = json.loads(json.dumps(gdd or {}))  # deep copy

    for dept in ordered:
        did = dept["id"]
        if only_set is not None and did not in only_set:
            continue
        if did == "director":
            continue
        current = (state.get("departments") or {}).get(did) or {"id": did}
        if current.get("status") == "confirmed" and not force:
            run_log.append({"id": did, "skipped": True, "reason": "already_confirmed"})
            continue

        # Block if required upstream not ready (unless force)
        missing = []
        for dep_id in dept.get("dependsOn") or []:
            up = (state.get("departments") or {}).get(dep_id) or {}
            if up.get("status") not in ("ready_for_review", "confirmed", "drafting") and dep_id != "director":
                if not force and up.get("status") not in ("ready_for_review", "confirmed"):
                    missing.append(dep_id)

        result = await run_department_prep(dept, working_gdd, state.get("departments") or {}, report_signals)
        notes = str(result.get("prepNotes") or "")
        if missing:
            notes = notes + f"\n\n⚠ 上游尚未就绪：{', '.join(missing)}（草案仍生成，确认前请先确认上游）。"

        applied: List[dict] = []
        if apply_patches:
            working_gdd, applied = apply_controlled_patches(
                working_gdd, did, result.get("patches") or []
            )
            all_applied.extend(applied)
            if applied:
                notes = notes + "\n\n【已应用受控 patch】\n" + "\n".join(
                    f"- {p['path']} = {json.dumps(p['value'], ensure_ascii=False)} ({p['level']})"
                    for p in applied[:12]
                )

        current["prepNotes"] = notes
        current["qaScore"] = int(result.get("qaScore") or 78)
        current["status"] = "ready_for_review"
        current["source"] = result.get("source")
        current["provider"] = result.get("provider")
        current["artifacts"] = result.get("focusArtifacts") or dept.get("owns") or []
        current["lastPatches"] = applied
        current["updatedAt"] = __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime())
        # clearing stale flag when re-prepped
        current.pop("staleReason", None)
        state.setdefault("departments", {})[did] = current

        for ho in result.get("suggestedHandoffs") or []:
            if not isinstance(ho, dict) or not ho.get("to") or not ho.get("summary"):
                continue
            suggested_handoffs.append({
                "from": did,
                "to": ho["to"],
                "type": ho.get("type") or "request",
                "summary": ho["summary"],
                "source": "auto_prep",
            })

        run_log.append({
            "id": did,
            "skipped": False,
            "source": result.get("source"),
            "qaScore": current["qaScore"],
            "missingUpstream": missing,
            "risks": result.get("risks") or [],
            "patchesApplied": len(applied),
        })

    # Director summary last
    done = [x for x in run_log if not x.get("skipped")]
    gate = evaluate_advance_gate(state, registry, report_signals)
    dir_notes = [
        "【导演组汇总】",
        f"拓扑调度完成，生成草案部门：{len(done)}。",
        f"Reports 聚合分：{report_signals.get('aggregate')}",
        f"受控 patch 合计：{len(all_applied)}",
        "确认策略：各部门须人工确认；禁止自动 confirmed。",
        "建议确认顺序（拓扑）：" + " → ".join(d["id"] for d in ordered if d["id"] != "director"),
        f"资产确认门禁：{'可通过' if gate['allowed'] else '未通过'} · blockers={len(gate['blockers'])}",
    ]
    for entry in done[:8]:
        dir_notes.append(
            f"- {entry['id']}: qa={entry.get('qaScore')} source={entry.get('source')} patches={entry.get('patchesApplied', 0)}"
        )
    if len(done) > 8:
        dir_notes.append(f"…共 {len(done)} 项")
    director = (state.get("departments") or {}).get("director") or {"id": "director"}
    director["prepNotes"] = "\n".join(dir_notes)
    director["qaScore"] = report_signals.get("aggregate") or 80
    director["status"] = "ready_for_review"
    director["updatedAt"] = __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime())
    state.setdefault("departments", {})["director"] = director
    run_log.append({
        "id": "director",
        "skipped": False,
        "source": "orchestrator",
        "qaScore": director["qaScore"],
        "patchesApplied": 0,
    })

    return state, run_log, suggested_handoffs, working_gdd, all_applied
