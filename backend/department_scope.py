"""Trunk vs node scope for department prep.

Public node identity is nodes[].id. Patch paths use the array index only after
that id has been resolved. card/export stay reserved until a later slice.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

SCHEMA_V2 = "loreweaver.department-state.v2"

DEFAULT_LAYER = {
    "director": "director",
    "world": "trunk",
    "narrative": "node",
    "gameplay": "node",
    "ability": "mixed",
    "architecture": "trunk",
    "art": "mixed",
    "audio": "mixed",
    "code": "node",
    "qa": "mixed",
    "compliance": "trunk",
}

# v1 campaign-level notes for these departments stay on the trunk.
TRUNK_PRESERVE_IDS = {"world", "architecture", "director", "compliance"}

NODE_PATH_RE = re.compile(r"^nodes\[(\d+)\]")

ACTIVE_STATUSES = {"confirmed", "ready_for_review", "drafting"}
UPSTREAM_READY = {"confirmed", "ready_for_review", "drafting", "stale"}


class ScopeError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Scope:
    kind: str
    node_ids: List[int] = field(default_factory=list)
    job: Optional[str] = None

    def as_dict(self) -> dict:
        payload: Dict[str, Any] = {"kind": self.kind}
        if self.kind == "nodes":
            payload["nodeIds"] = list(self.node_ids)
        if self.job:
            payload["job"] = self.job
        return payload


def layer_of(dept: Any) -> str:
    if isinstance(dept, dict):
        layer = str(dept.get("scopeLayer") or "").strip()
        if layer in ("trunk", "node", "mixed", "director"):
            return layer
        return DEFAULT_LAYER.get(str(dept.get("id") or ""), "mixed")
    return DEFAULT_LAYER.get(str(dept), "mixed")


def department_meta(registry: Optional[dict], dept_id: str) -> dict:
    for dept in (registry or {}).get("departments") or []:
        if isinstance(dept, dict) and dept.get("id") == dept_id:
            return dept
    return {"id": dept_id, "scopeLayer": DEFAULT_LAYER.get(dept_id, "mixed")}


def job_for(dept_id: str, scope: Scope, registry: Optional[dict] = None) -> str:
    layer = layer_of(department_meta(registry, dept_id))
    if dept_id == "director" or layer == "director":
        if scope.kind == "trunk":
            return "summary"
        if scope.kind == "nodes" and scope.node_ids:
            return "summary"
        raise ScopeError("department_not_on_scope", "director needs trunk or a node id")
    if layer == "trunk":
        if scope.kind != "trunk":
            raise ScopeError("department_not_on_scope", f"{dept_id} runs on trunk only")
        return "catalog"
    if layer == "node":
        if scope.kind != "nodes" or not scope.node_ids:
            raise ScopeError("department_not_on_scope", f"{dept_id} runs on nodes only")
        return "binding"
    if scope.kind == "trunk":
        return "catalog"
    if scope.kind == "nodes" and scope.node_ids:
        return "binding"
    raise ScopeError("department_not_on_scope", f"{dept_id} has no job for this scope")


def required_department_ids(registry: Optional[dict], mode: str) -> List[str]:
    """mode is 'trunk' or 'node'. Director is never required."""
    ids: List[str] = []
    for dept in (registry or {}).get("departments") or []:
        if not isinstance(dept, dict):
            continue
        did = str(dept.get("id") or "")
        if not did or did == "director":
            continue
        layer = layer_of(dept)
        if mode == "trunk" and layer in ("trunk", "mixed"):
            ids.append(did)
        elif mode == "node" and layer in ("node", "mixed"):
            ids.append(did)
    return ids


def _as_int(value: Any, *, code: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ScopeError(code, f"invalid node id: {value}") from exc


def node_indexes(gdd: Optional[dict]) -> Dict[int, int]:
    """Map node id -> array index. Duplicate ids are an error."""
    positions: Dict[int, int] = {}
    nodes = (gdd or {}).get("nodes") if isinstance(gdd, dict) else None
    if not isinstance(nodes, list):
        return positions
    for index, node in enumerate(nodes):
        if not isinstance(node, dict) or node.get("id") is None:
            continue
        nid = _as_int(node.get("id"), code="node_id_invalid")
        if nid in positions:
            raise ScopeError("duplicate_node_id", f"duplicate node id {nid}")
        positions[nid] = index
    return positions


def node_ids_of(gdd: Optional[dict]) -> List[int]:
    return list(node_indexes(gdd).keys())


def resolve_node_indexes(gdd: Optional[dict], requested: Sequence[Any]) -> Dict[int, int]:
    positions = node_indexes(gdd)
    resolved: Dict[int, int] = {}
    for raw in requested:
        nid = _as_int(raw, code="node_id_invalid")
        if nid not in positions:
            raise ScopeError("unknown_node_id", f"unknown node id {nid}")
        resolved[nid] = positions[nid]
    return resolved


def parse_scope(raw: Any, gdd: Optional[dict], *, allow_all: bool = False) -> Scope:
    if raw is None:
        if allow_all:
            return Scope("all", node_ids_of(gdd))
        raise ScopeError("scope_required", "scope is required")
    if isinstance(raw, str):
        if raw == "trunk":
            return Scope("trunk", [])
        if raw == "all" and allow_all:
            return Scope("all", node_ids_of(gdd))
        raise ScopeError("scope_invalid", f"unknown scope: {raw}")
    if not isinstance(raw, dict):
        raise ScopeError("scope_invalid", "scope must be an object")
    kind = str(raw.get("kind") or "").strip()
    if kind == "trunk":
        return Scope("trunk", [])
    if kind == "all":
        if not allow_all:
            raise ScopeError("scope_invalid", "all is only valid for auto-prep")
        return Scope("all", node_ids_of(gdd))
    if kind in ("card", "export"):
        raise ScopeError("scope_reserved", f"{kind} scope is reserved and not runnable yet")
    if kind == "nodes":
        requested = raw.get("nodeIds")
        if requested == "all":
            requested = node_ids_of(gdd)
        if not isinstance(requested, list) or not requested:
            raise ScopeError("node_ids_required", "nodeIds must list at least one node id")
        resolved = resolve_node_indexes(gdd, requested)
        return Scope("nodes", list(resolved.keys()))
    raise ScopeError("scope_invalid", f"unknown scope kind: {kind}")


def scope_unit_id(scope: Scope) -> str:
    if scope.kind == "trunk":
        return "trunk"
    if scope.kind == "all":
        return "campaign"
    if len(scope.node_ids) == 1:
        return f"node:{scope.node_ids[0]}"
    if scope.node_ids:
        return "node:" + ",".join(str(nid) for nid in scope.node_ids)
    return "trunk"


def unit_id_from_scope_dict(raw: Optional[dict]) -> str:
    if not isinstance(raw, dict):
        return "trunk"
    kind = str(raw.get("kind") or "trunk")
    if kind == "trunk":
        return "trunk"
    if kind == "all":
        return "campaign"
    ids = raw.get("nodeIds") or []
    if isinstance(ids, list) and len(ids) == 1:
        return f"node:{ids[0]}"
    if isinstance(ids, list) and ids:
        return "node:" + ",".join(str(i) for i in ids)
    return "trunk"


def scope_instruction(dept_id: str, job: str, scope: Scope) -> str:
    if job == "summary":
        where = "主干" if scope.kind == "trunk" else "关卡 " + ", ".join(str(n) for n in scope.node_ids)
        return f"只汇总{where}上已有的部门状态。不改写设计字段。"
    if job == "catalog" or scope.kind == "trunk":
        return "只写本部门的作品级字段。节点仅提供 id 与标题索引。"
    ids = ", ".join(str(n) for n in scope.node_ids) or "(none)"
    return (
        f"只处理这些 nodeId：{ids}。缺省只填本关尚不存在的字段。"
        "其他关与经济、目录根字段保持原样。"
    )


def path_node_index(path: str) -> Optional[int]:
    match = NODE_PATH_RE.match(str(path or ""))
    if not match:
        return None
    return int(match.group(1))


def path_allowed_for_job(path: str, job: str, node_indexes_allowed: Optional[Iterable[int]]) -> bool:
    index = path_node_index(path)
    if job == "summary":
        return False
    if job == "catalog":
        return index is None
    if job != "binding":
        return False
    if index is None:
        return False
    if node_indexes_allowed is None:
        return True
    return index in set(node_indexes_allowed)


def split_patches(
    patches: Sequence[dict],
    job: str,
    node_indexes_allowed: Optional[Iterable[int]],
) -> Tuple[List[dict], List[dict]]:
    kept: List[dict] = []
    rejected: List[dict] = []
    allowed = None if node_indexes_allowed is None else set(node_indexes_allowed)
    for patch in patches or []:
        if not isinstance(patch, dict) or not patch.get("path"):
            continue
        if path_allowed_for_job(str(patch["path"]), job, allowed):
            kept.append(patch)
        else:
            rejected.append(patch)
    return kept, rejected


def summarize_gdd(gdd: Optional[dict], scope: Scope, *, brief: str = "", job: str = "") -> dict:
    gdd = gdd or {}
    nodes = gdd.get("nodes") if isinstance(gdd.get("nodes"), list) else []
    index = []
    for node in nodes:
        if isinstance(node, dict):
            index.append({"id": node.get("id"), "title": node.get("title")})
    summary: Dict[str, Any] = {
        "title": gdd.get("title"),
        "nodeCount": len([n for n in nodes if isinstance(n, dict)]),
        "nodeIndex": index,
        "scope": scope.as_dict(),
        "scopeInstruction": scope_instruction("department", job or scope.job or "", scope),
        "brief": brief or "",
    }
    if scope.kind == "trunk" or job == "catalog":
        summary.update({
            "themeColor": gdd.get("themeColor"),
            "economy": gdd.get("economy"),
            "progressionSystems": gdd.get("progressionSystems"),
            "pipeline_dna": gdd.get("pipeline_dna"),
            "abilityCount": len(gdd.get("abilityCatalog") or []),
            "progressionCount": len(gdd.get("progressionSystems") or []),
        })
        return summary

    resolved = resolve_node_indexes(gdd, scope.node_ids) if scope.node_ids else {}
    full_nodes = []
    titles = []
    for nid, idx in resolved.items():
        node = nodes[idx]
        full_nodes.append(node)
        gameplay = node.get("gameplay") if isinstance(node.get("gameplay"), dict) else {}
        titles.append({
            "id": node.get("id"),
            "title": node.get("title"),
            "mechanics": node.get("mechanics"),
            "gameplay": gameplay,
        })
    economy = gdd.get("economy") if isinstance(gdd.get("economy"), dict) else {}
    ability_ids = []
    for ability in gdd.get("abilityCatalog") or []:
        if isinstance(ability, dict) and ability.get("id"):
            ability_ids.append(ability.get("id"))
    summary.update({
        "nodes": full_nodes,
        "nodeTitles": titles,
        "trunk": {
            "currencyName": economy.get("currencyName"),
            "realms": economy.get("realms") or [],
            "abilityIds": ability_ids,
        },
    })
    return summary


def blank_runtime(dept_id: str) -> dict:
    return {
        "id": dept_id,
        "status": "idle",
        "version": 0,
        "qaScore": None,
        "prepNotes": "",
        "brief": "",
        "artifacts": [],
        "openHandoffCount": 0,
        "updatedAt": None,
        "confirmedAt": None,
    }


def _copy_runtime(dept_id: str, prev: Optional[dict]) -> dict:
    runtime = copy.deepcopy(prev) if isinstance(prev, dict) else blank_runtime(dept_id)
    runtime["id"] = dept_id
    runtime.setdefault("status", "idle")
    runtime.setdefault("version", 0)
    runtime.setdefault("qaScore", None)
    runtime.setdefault("prepNotes", "")
    runtime.setdefault("brief", "")
    runtime.setdefault("artifacts", [])
    runtime.setdefault("openHandoffCount", 0)
    runtime.setdefault("updatedAt", None)
    runtime.setdefault("confirmedAt", None)
    return runtime


def migrate_department_state(state: Optional[dict], registry: Optional[dict]) -> dict:
    state = state or {}
    if state.get("schemaVersion") == SCHEMA_V2 and isinstance(state.get("scopes"), dict):
        return state
    old = state.get("departments") if isinstance(state.get("departments"), dict) else {}
    departments = (registry or {}).get("departments") or []
    if not departments:
        departments = [{"id": did, "scopeLayer": layer} for did, layer in DEFAULT_LAYER.items()]
    trunk: Dict[str, dict] = {}
    legacy: Dict[str, dict] = {}
    for dept in departments:
        if not isinstance(dept, dict) or not dept.get("id"):
            continue
        did = str(dept["id"])
        prev = old.get(did) if isinstance(old.get(did), dict) else None
        layer = layer_of(dept)
        preserve = did in TRUNK_PRESERVE_IDS or layer == "trunk" or layer == "director"
        if preserve and prev:
            trunk[did] = _copy_runtime(did, prev)
        else:
            if prev and (prev.get("prepNotes") or prev.get("status") not in (None, "", "idle")):
                legacy[did] = {
                    "status": prev.get("status"),
                    "version": prev.get("version") or 0,
                    "qaScore": prev.get("qaScore"),
                    "prepNotes": prev.get("prepNotes") or "",
                }
            trunk[did] = blank_runtime(did)
        if did not in trunk:
            trunk[did] = blank_runtime(did)
    migrated = {
        "schemaVersion": SCHEMA_V2,
        "stageId": state.get("stageId") or "production_prep",
        "activeScope": {"kind": "trunk"},
        "scopes": {"trunk": {"departments": trunk}, "nodes": {}},
        "legacyCampaignNotes": legacy,
        "legacyUnitId": state.get("unitId"),
        "stageHistory": list(state.get("stageHistory") or []),
    }
    if state.get("stageAdvancedAt"):
        migrated["stageAdvancedAt"] = state.get("stageAdvancedAt")
    return migrated


def _registry_ids(registry: Optional[dict]) -> List[str]:
    ids = []
    departments = (registry or {}).get("departments") or []
    if not departments:
        return list(DEFAULT_LAYER.keys())
    for dept in departments:
        if isinstance(dept, dict) and dept.get("id"):
            ids.append(str(dept["id"]))
    return ids


def ensure_department_slots(bucket: dict, registry: Optional[dict]) -> dict:
    departments = bucket.setdefault("departments", {})
    for did in _registry_ids(registry):
        if did not in departments or not isinstance(departments.get(did), dict):
            departments[did] = blank_runtime(did)
        else:
            departments[did].setdefault("id", did)
            departments[did].setdefault("brief", "")
            departments[did].setdefault("prepNotes", "")
    return departments


def ensure_node_buckets(state: dict, registry: Optional[dict], node_ids: Sequence[Any]) -> dict:
    scopes = state.setdefault("scopes", {})
    nodes = scopes.setdefault("nodes", {})
    for raw in node_ids:
        try:
            nid = str(int(raw))
        except (TypeError, ValueError):
            continue
        bucket = nodes.setdefault(nid, {})
        ensure_department_slots(bucket, registry)
    return state


def normalize_department_state(state: Optional[dict], registry: Optional[dict]) -> dict:
    state = migrate_department_state(state, registry)
    scopes = state.setdefault("scopes", {})
    trunk_bucket = scopes.setdefault("trunk", {})
    scopes.setdefault("nodes", {})
    ensure_department_slots(trunk_bucket, registry)
    active = state.get("activeScope")
    if not isinstance(active, dict) or active.get("kind") not in ("trunk", "nodes"):
        active = {"kind": "trunk"}
        state["activeScope"] = active
    if active.get("kind") == "nodes":
        ids = active.get("nodeIds") or []
        if not isinstance(ids, list) or not ids:
            active = {"kind": "trunk"}
            state["activeScope"] = active
        else:
            nid = str(int(ids[0]))
            active["nodeIds"] = [int(ids[0])]
            bucket = scopes["nodes"].setdefault(nid, {})
            state["departments"] = ensure_department_slots(bucket, registry)
            mode = "node"
    if state.get("activeScope", {}).get("kind") != "nodes":
        state["departments"] = trunk_bucket["departments"]
        mode = "trunk"
    required = required_department_ids(registry, mode)
    confirmed = 0
    for did in required:
        dept = (state.get("departments") or {}).get(did) or {}
        if dept.get("status") == "confirmed":
            confirmed += 1
    state["requiredDepartmentIds"] = required
    state["requiredCount"] = len(required)
    state["confirmedCount"] = confirmed
    state["schemaVersion"] = SCHEMA_V2
    return state


def set_active_scope(state: dict, scope: Scope) -> dict:
    if scope.kind == "nodes" and scope.node_ids:
        state["activeScope"] = {"kind": "nodes", "nodeIds": [int(scope.node_ids[0])]}
    else:
        state["activeScope"] = {"kind": "trunk"}
    return state


def bucket_for(state: dict, scope: Scope, registry: Optional[dict]) -> dict:
    scopes = state.setdefault("scopes", {})
    if scope.kind == "nodes" and scope.node_ids:
        nid = str(int(scope.node_ids[0]))
        bucket = scopes.setdefault("nodes", {}).setdefault(nid, {})
    else:
        bucket = scopes.setdefault("trunk", {})
    return ensure_department_slots(bucket, registry)


def get_runtime(state: dict, scope: Scope, dept_id: str) -> Optional[dict]:
    scopes = state.get("scopes") or {}
    if scope.kind == "nodes" and scope.node_ids:
        nid = str(int(scope.node_ids[0]))
        return (((scopes.get("nodes") or {}).get(nid) or {}).get("departments") or {}).get(dept_id)
    return (((scopes.get("trunk") or {}).get("departments") or {}).get(dept_id))


def put_runtime(state: dict, scope: Scope, registry: Optional[dict], dept_id: str, runtime: dict) -> dict:
    departments = bucket_for(state, scope, registry)
    runtime["id"] = dept_id
    departments[dept_id] = runtime
    return runtime


def collect_upstream(state: dict, depends_on: Sequence[str], scope: Scope) -> dict:
    upstream = {}
    for dep_id in depends_on or []:
        record = None
        origin = None
        if scope.kind == "nodes" and scope.node_ids:
            node_scope = Scope("nodes", [int(scope.node_ids[0])])
            node_rec = get_runtime(state, node_scope, dep_id)
            if node_rec and (
                node_rec.get("prepNotes") or node_rec.get("status") in UPSTREAM_READY
            ):
                record = node_rec
                origin = f"node:{node_scope.node_ids[0]}"
        if record is None:
            trunk_rec = get_runtime(state, Scope("trunk"), dep_id)
            if trunk_rec:
                record = trunk_rec
                origin = "trunk"
        if record is None:
            continue
        upstream[dep_id] = {
            "status": record.get("status"),
            "version": record.get("version"),
            "qaScore": record.get("qaScore"),
            "prepNotes": (record.get("prepNotes") or "")[:800],
            "scope": origin,
        }
    return upstream


def _mark_one(runtime: dict, reason: str, stamp: str) -> bool:
    if not runtime:
        return False
    if runtime.get("status") not in ACTIVE_STATUSES:
        return False
    runtime["status"] = "stale"
    runtime["staleReason"] = reason
    runtime["updatedAt"] = stamp
    return True


def downstream_ids(registry: Optional[dict], origin: str) -> List[str]:
    graph: Dict[str, List[str]] = {}
    for dept in (registry or {}).get("departments") or []:
        if not isinstance(dept, dict) or not dept.get("id"):
            continue
        did = str(dept["id"])
        graph.setdefault(did, [])
        for up in dept.get("dependsOn") or []:
            graph.setdefault(str(up), []).append(did)
    seen = set()
    stack = list(graph.get(origin) or [])
    ordered: List[str] = []
    while stack:
        did = stack.pop()
        if did in seen or did == "director":
            continue
        seen.add(did)
        ordered.append(did)
        for nxt in graph.get(did) or []:
            if nxt not in seen:
                stack.append(nxt)
    return ordered


def direct_downstream_ids(registry: Optional[dict], origin: str) -> List[str]:
    found = []
    for dept in (registry or {}).get("departments") or []:
        if not isinstance(dept, dict) or not dept.get("id"):
            continue
        did = str(dept["id"])
        if did == "director":
            continue
        if origin in (dept.get("dependsOn") or []):
            found.append(did)
    return found


def mark_downstream_stale_scoped(
    state: dict,
    registry: Optional[dict],
    changed_dept_id: str,
    scope: Scope,
    *,
    reason: str = "upstream_confirmed",
    stamp: str,
) -> List[str]:
    """Return labels like trunk:ability or node:3:gameplay."""
    stale: List[str] = []
    reason_text = f"{reason}:{changed_dept_id}"
    downs = downstream_ids(registry, changed_dept_id)
    if scope.kind == "trunk":
        trunk_deps = ((state.get("scopes") or {}).get("trunk") or {}).get("departments") or {}
        node_map = (state.get("scopes") or {}).get("nodes") or {}
        for did in downs:
            layer = layer_of(department_meta(registry, did))
            if layer in ("trunk", "mixed", "director") and did != "director":
                if _mark_one(trunk_deps.get(did) or {}, reason_text, stamp):
                    stale.append(f"trunk:{did}")
            if layer in ("node", "mixed"):
                for nid, bucket in node_map.items():
                    departments = (bucket or {}).get("departments") or {}
                    if _mark_one(departments.get(did) or {}, reason_text, stamp):
                        stale.append(f"node:{nid}:{did}")
        return stale

    node_map = (state.get("scopes") or {}).get("nodes") or {}
    for nid in scope.node_ids:
        departments = ((node_map.get(str(int(nid))) or {}).get("departments") or {})
        for did in downs:
            layer = layer_of(department_meta(registry, did))
            if layer not in ("node", "mixed"):
                continue
            if _mark_one(departments.get(did) or {}, reason_text, stamp):
                stale.append(f"node:{int(nid)}:{did}")
    return stale


def campaign_confirmation_blockers(
    state: dict,
    registry: Optional[dict],
    gdd: Optional[dict],
) -> List[str]:
    blockers: List[str] = []
    if state.get("schemaVersion") != SCHEMA_V2:
        return blockers
    trunk = (((state.get("scopes") or {}).get("trunk") or {}).get("departments") or {})
    for did in required_department_ids(registry, "trunk"):
        status = (trunk.get(did) or {}).get("status")
        if status != "confirmed":
            blockers.append(f"trunk:{did}:status={status or 'missing'}")
    if not isinstance(gdd, dict):
        blockers.append("nodes:manifest_unavailable")
        return blockers
    try:
        ids = node_ids_of(gdd)
    except ScopeError as exc:
        blockers.append(f"nodes:{exc.code}")
        return blockers
    node_map = (state.get("scopes") or {}).get("nodes") or {}
    node_required = required_department_ids(registry, "node")
    for nid in ids:
        departments = ((node_map.get(str(nid)) or {}).get("departments") or {})
        for did in node_required:
            status = (departments.get(did) or {}).get("status")
            if status == "deferred":
                continue
            if status != "confirmed":
                blockers.append(f"node:{nid}:{did}:status={status or 'missing'}")
    return blockers


def experimental_card_risks(
    gdd: Optional[dict],
    allowed_indexes: Optional[Iterable[int]],
    resolve_card,
) -> List[str]:
    """Report experimental cards outside the patched indexes. Does not write."""
    risks: List[str] = []
    allowed = set(allowed_indexes or [])
    nodes = (gdd or {}).get("nodes") if isinstance(gdd, dict) else None
    if not isinstance(nodes, list):
        return risks
    for index, node in enumerate(nodes):
        if index in allowed or not isinstance(node, dict):
            continue
        gameplay = node.get("gameplay") if isinstance(node.get("gameplay"), dict) else {}
        card = gameplay.get("cardId")
        if not card:
            continue
        knobs = gameplay.get("knobs") if isinstance(gameplay.get("knobs"), dict) else {}
        if knobs.get("allowExperimentalCard"):
            continue
        resolved = resolve_card(preferred=str(card), allow_experimental=False) or {}
        replacement = resolved.get("cardId")
        if replacement and replacement != card:
            risks.append(
                f"node {node.get('id')} experimental card {card} left unchanged"
            )
    return risks


def clamp_manifest(before: dict, after: dict, scope: Scope, job: str) -> dict:
    """Drop model edits that sit outside the department job."""
    if not isinstance(after, dict):
        return copy.deepcopy(before or {})
    if job == "summary":
        return copy.deepcopy(before or {})
    if job == "catalog" or scope.kind == "trunk":
        cloned = copy.deepcopy(after)
        cloned["nodes"] = copy.deepcopy((before or {}).get("nodes") or [])
        return cloned
    allowed = set(int(nid) for nid in scope.node_ids)
    merged = copy.deepcopy(before or {})
    after_nodes = after.get("nodes") if isinstance(after.get("nodes"), list) else []
    after_by_id: Dict[int, dict] = {}
    for node in after_nodes:
        if isinstance(node, dict) and node.get("id") is not None:
            try:
                after_by_id[int(node["id"])] = node
            except (TypeError, ValueError):
                continue
    rebuilt = []
    for node in (before or {}).get("nodes") or []:
        if not isinstance(node, dict) or node.get("id") is None:
            rebuilt.append(copy.deepcopy(node))
            continue
        try:
            nid = int(node["id"])
        except (TypeError, ValueError):
            rebuilt.append(copy.deepcopy(node))
            continue
        if nid in allowed and nid in after_by_id:
            rebuilt.append(copy.deepcopy(after_by_id[nid]))
        else:
            rebuilt.append(copy.deepcopy(node))
    merged["nodes"] = rebuilt
    return merged
