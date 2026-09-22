"""Trunk/node department scope. Run: PYTHONPATH=. python -m unittest backend.test_department_scope"""

from __future__ import annotations

import asyncio
import unittest

from backend.department_scope import (
    Scope,
    ScopeError,
    campaign_confirmation_blockers,
    clamp_manifest,
    experimental_card_risks,
    mark_downstream_stale_scoped,
    migrate_department_state,
    normalize_department_state,
    parse_scope,
    put_runtime,
    split_patches,
)
from backend.department_agents import build_controlled_patches, run_auto_prep_pipeline


REGISTRY = {
    "departments": [
        {"id": "director", "scopeLayer": "director", "dependsOn": [], "title": "导演", "owns": []},
        {"id": "world", "scopeLayer": "trunk", "dependsOn": [], "title": "世界观", "owns": ["title"]},
        {"id": "narrative", "scopeLayer": "node", "dependsOn": ["world"], "title": "叙事", "owns": ["nodes[].title"]},
        {"id": "gameplay", "scopeLayer": "node", "dependsOn": ["world", "narrative"], "title": "玩法", "owns": ["nodes[].gameplay"]},
    ]
}


def _gdd():
    return {
        "title": "界门",
        "nodes": [
            {
                "id": 1,
                "title": "边关",
                "mechanics": "survivor_horde",
                "gameplay": {"cardId": "survivor_horde", "knobs": {}},
            },
            {"id": 3, "title": "潮汐", "mechanics": "survivor_horde"},
        ],
    }


class ScopeParseTests(unittest.TestCase):
    def test_run_prep_requires_scope(self):
        with self.assertRaises(ScopeError) as caught:
            parse_scope(None, _gdd(), allow_all=False)
        self.assertEqual(caught.exception.code, "scope_required")

    def test_unknown_node_and_duplicate(self):
        with self.assertRaises(ScopeError) as caught:
            parse_scope({"kind": "nodes", "nodeIds": [9]}, _gdd(), allow_all=False)
        self.assertEqual(caught.exception.code, "unknown_node_id")
        broken = _gdd()
        broken["nodes"].append({"id": 3, "title": "重复"})
        with self.assertRaises(ScopeError) as caught:
            parse_scope({"kind": "nodes", "nodeIds": [3]}, broken, allow_all=False)
        self.assertEqual(caught.exception.code, "duplicate_node_id")

    def test_trunk_department_rejects_node_scope(self):
        from backend.department_scope import job_for

        with self.assertRaises(ScopeError) as caught:
            job_for("world", Scope("nodes", [3]), REGISTRY)
        self.assertEqual(caught.exception.code, "department_not_on_scope")

    def test_reserved_scope(self):
        with self.assertRaises(ScopeError) as caught:
            parse_scope({"kind": "card"}, _gdd(), allow_all=False)
        self.assertEqual(caught.exception.code, "scope_reserved")


class PatchScopeTests(unittest.TestCase):
    def test_binding_patches_only_the_selected_index(self):
        patches = build_controlled_patches(
            "gameplay", _gdd(), job="binding", node_indexes={1}
        )
        paths = [p["path"] for p in patches]
        self.assertTrue(paths)
        self.assertTrue(all(path.startswith("nodes[1]") for path in paths))
        self.assertFalse(any(path.startswith("nodes[0]") for path in paths))

    def test_catalog_patches_skip_nodes(self):
        gdd = _gdd()
        gdd["themeColor"] = ""
        patches = build_controlled_patches("world", gdd, job="catalog", node_indexes=set())
        self.assertTrue(any(p["path"] == "themeColor" for p in patches))
        self.assertFalse(any(str(p["path"]).startswith("nodes[") for p in patches))

    def test_split_rejects_foreign_index(self):
        kept, rejected = split_patches(
            [
                {"path": "nodes[1].gameplay.cardId", "value": "survivor_horde"},
                {"path": "nodes[0].gameplay.cardId", "value": "survivor_horde"},
                {"path": "title", "value": "nope"},
            ],
            "binding",
            {1},
        )
        self.assertEqual([p["path"] for p in kept], ["nodes[1].gameplay.cardId"])
        self.assertEqual(len(rejected), 2)

    def test_out_of_scope_experimental_card_is_a_risk(self):
        gdd = _gdd()
        gdd["nodes"][0]["gameplay"]["cardId"] = "lab_only"

        def resolve(preferred=None, allow_experimental=False):
            if preferred == "lab_only" and not allow_experimental:
                return {"cardId": "survivor_horde"}
            return {"cardId": preferred}

        risks = experimental_card_risks(gdd, {1}, resolve)
        self.assertEqual(risks, ["node 1 experimental card lab_only left unchanged"])


class StateTests(unittest.TestCase):
    def test_v1_migration_keeps_trunk_and_archives_node_notes(self):
        legacy = {
            "schemaVersion": "loreweaver.department-state.v1",
            "unitId": "campaign_12",
            "stageId": "production_prep",
            "departments": {
                "world": {"id": "world", "status": "confirmed", "version": 2, "prepNotes": "经济已定", "qaScore": 90},
                "gameplay": {"id": "gameplay", "status": "confirmed", "version": 4, "prepNotes": "全关卡牌", "qaScore": 80},
            },
        }
        state = normalize_department_state(migrate_department_state(legacy, REGISTRY), REGISTRY)
        self.assertEqual(state["schemaVersion"], "loreweaver.department-state.v2")
        self.assertEqual(state["scopes"]["trunk"]["departments"]["world"]["status"], "confirmed")
        self.assertEqual(state["scopes"]["trunk"]["departments"]["world"]["prepNotes"], "经济已定")
        self.assertEqual(state["scopes"]["trunk"]["departments"]["gameplay"]["status"], "idle")
        self.assertEqual(state["legacyCampaignNotes"]["gameplay"]["prepNotes"], "全关卡牌")
        self.assertEqual(state["scopes"]["nodes"], {})
        self.assertEqual(state["legacyUnitId"], "campaign_12")

    def test_node_confirm_does_not_stale_another_node(self):
        state = normalize_department_state({"departments": {}}, REGISTRY)
        for nid in (3, 4):
            for did, status in (("narrative", "confirmed"), ("gameplay", "confirmed")):
                put_runtime(
                    state,
                    Scope("nodes", [nid]),
                    REGISTRY,
                    did,
                    {"id": did, "status": status, "version": 1, "prepNotes": "ok"},
                )
        stale = mark_downstream_stale_scoped(
            state,
            REGISTRY,
            "narrative",
            Scope("nodes", [3]),
            stamp="2026-09-22T00:00:00Z",
        )
        self.assertIn("node:3:gameplay", stale)
        self.assertNotIn("node:4:gameplay", stale)
        node4 = state["scopes"]["nodes"]["4"]["departments"]["gameplay"]["status"]
        self.assertEqual(node4, "confirmed")
        self.assertEqual(state["scopes"]["nodes"]["3"]["departments"]["gameplay"]["status"], "stale")

    def test_trunk_confirm_stales_every_node(self):
        state = normalize_department_state({"departments": {}}, REGISTRY)
        put_runtime(
            state,
            Scope("trunk"),
            REGISTRY,
            "world",
            {"id": "world", "status": "confirmed", "version": 1, "prepNotes": "ok"},
        )
        for nid in (3, 4):
            put_runtime(
                state,
                Scope("nodes", [nid]),
                REGISTRY,
                "narrative",
                {"id": "narrative", "status": "confirmed", "version": 1, "prepNotes": "ok"},
            )
        stale = mark_downstream_stale_scoped(
            state,
            REGISTRY,
            "world",
            Scope("trunk"),
            stamp="2026-09-22T00:00:00Z",
        )
        self.assertIn("node:3:narrative", stale)
        self.assertIn("node:4:narrative", stale)

    def test_campaign_gate_names_trunk_and_node(self):
        state = normalize_department_state({"departments": {}}, REGISTRY)
        blockers = campaign_confirmation_blockers(state, REGISTRY, _gdd())
        self.assertIn("trunk:world:status=idle", blockers)
        self.assertTrue(any(item.startswith("node:1:gameplay") for item in blockers))
        self.assertTrue(any(item.startswith("node:3:narrative") for item in blockers))


class PipelineTests(unittest.TestCase):
    def setUp(self):
        from backend import department_agents as agents

        self._agents = agents
        self._provider = agents.resolve_provider
        agents.resolve_provider = lambda: None

    def tearDown(self):
        self._agents.resolve_provider = self._provider

    def test_gameplay_run_does_not_touch_other_nodes_or_director_siblings(self):
        gdd = _gdd()
        state = normalize_department_state({"stageId": "production_prep", "departments": {}}, REGISTRY)
        gameplay = state["scopes"]["trunk"]["departments"]["gameplay"]
        before = gameplay["updatedAt"]
        state, log, _ho, new_gdd, applied = asyncio.run(
            run_auto_prep_pipeline(
                REGISTRY,
                state,
                gdd,
                reports_dir="",
                force=False,
                only=["gameplay"],
                scope={"kind": "nodes", "nodeIds": [3]},
            )
        )
        paths = [p["path"] for p in applied]
        self.assertTrue(paths)
        self.assertTrue(all(path.startswith("nodes[1]") for path in paths))
        self.assertNotIn("shellRetreat", (new_gdd["nodes"][0].get("gameplay") or {}).get("knobs") or {})
        self.assertEqual(new_gdd["nodes"][1]["gameplay"]["cardId"], "survivor_horde")
        self.assertTrue(any(entry["id"] == "gameplay" and entry.get("nodeId") == 3 and not entry.get("skipped") for entry in log))
        self.assertFalse(any(entry["id"] == "director" and not entry.get("skipped") for entry in log))
        self.assertEqual(state["scopes"]["trunk"]["departments"]["gameplay"]["updatedAt"], before)

    def test_director_run_does_not_touch_other_departments(self):
        state = normalize_department_state({"stageId": "production_prep", "departments": {}}, REGISTRY)
        put_runtime(
            state,
            Scope("nodes", [3]),
            REGISTRY,
            "gameplay",
            {"id": "gameplay", "status": "ready_for_review", "updatedAt": "2020-01-01T00:00:00Z", "prepNotes": "keep"},
        )
        state, log, _ho, _gdd_out, applied = asyncio.run(
            run_auto_prep_pipeline(
                REGISTRY,
                state,
                _gdd(),
                reports_dir="",
                only=["director"],
                scope={"kind": "nodes", "nodeIds": [3]},
            )
        )
        self.assertEqual(applied, [])
        kept = state["scopes"]["nodes"]["3"]["departments"]["gameplay"]
        self.assertEqual(kept["updatedAt"], "2020-01-01T00:00:00Z")
        self.assertEqual(kept["prepNotes"], "keep")
        self.assertTrue(any(entry["id"] == "director" and not entry.get("skipped") for entry in log))

    def test_world_run_writes_no_node_paths(self):
        gdd = _gdd()
        gdd.pop("themeColor", None)
        _state, log, _ho, new_gdd, applied = asyncio.run(
            run_auto_prep_pipeline(
                REGISTRY,
                normalize_department_state({"departments": {}}, REGISTRY),
                gdd,
                reports_dir="",
                only=["world"],
                scope={"kind": "trunk"},
            )
        )
        self.assertTrue(any(entry["id"] == "world" and not entry.get("skipped") for entry in log))
        self.assertFalse(any(str(p["path"]).startswith("nodes[") for p in applied))
        self.assertEqual(new_gdd["nodes"][1].get("gameplay"), None)


class ClampTests(unittest.TestCase):
    def test_node_refine_restores_other_nodes_and_root(self):
        before = _gdd()
        after = _gdd()
        after["title"] = "被改掉的标题"
        after["nodes"][0]["title"] = "不该变"
        after["nodes"][1]["title"] = "该变"
        clamped = clamp_manifest(before, after, Scope("nodes", [3]), "binding")
        self.assertEqual(clamped["title"], "界门")
        self.assertEqual(clamped["nodes"][0]["title"], "边关")
        self.assertEqual(clamped["nodes"][1]["title"], "该变")

    def test_trunk_refine_restores_nodes(self):
        before = _gdd()
        after = _gdd()
        after["title"] = "新标题"
        after["nodes"][1]["title"] = "不该变"
        clamped = clamp_manifest(before, after, Scope("trunk"), "catalog")
        self.assertEqual(clamped["title"], "新标题")
        self.assertEqual(clamped["nodes"][1]["title"], "潮汐")


if __name__ == "__main__":
    unittest.main()
