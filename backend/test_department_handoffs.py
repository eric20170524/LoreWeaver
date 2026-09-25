"""Evidence and scope regression checks for the department desk."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from backend.department_handoffs import (
    acceptance_criteria,
    refresh_counts,
    resolution_fields,
)
from backend.department_agents import collect_report_signals


class HandoffScopeTests(unittest.TestCase):
    def test_open_counts_follow_unit_and_recipient(self):
        state = {
            "activeScope": {"kind": "nodes", "nodeIds": [4]},
            "scopes": {
                "trunk": {"departments": {"art": {}, "audio": {}}},
                "nodes": {
                    "2": {"departments": {"art": {}, "audio": {}}},
                    "4": {"departments": {"art": {}, "audio": {}}},
                },
            },
            "departments": {"art": {}, "audio": {}},
        }
        handoffs = [
            {"unitId": "node:2", "to": "art", "status": "open"},
            {"unitId": "node:4", "to": "art", "status": "open"},
            {"unitId": "trunk", "to": "audio", "status": "open"},
            {"unitId": "node:4", "to": "art", "status": "resolved"},
        ]
        refresh_counts(state, handoffs)
        self.assertEqual(state["scopes"]["trunk"]["departments"]["art"]["openHandoffCount"], 0)
        self.assertEqual(state["scopes"]["trunk"]["departments"]["audio"]["openHandoffCount"], 1)
        self.assertEqual(state["scopes"]["nodes"]["2"]["departments"]["art"]["openHandoffCount"], 1)
        self.assertEqual(state["scopes"]["nodes"]["4"]["departments"]["art"]["openHandoffCount"], 1)
        self.assertEqual(state["departments"]["art"]["openHandoffCount"], 1)
        self.assertEqual(state["departments"]["audio"]["openHandoffCount"], 0)


class HandoffResolutionTests(unittest.TestCase):
    def test_new_handoff_needs_explicit_acceptance_or_summary_fallback(self):
        self.assertEqual(acceptance_criteria({"acceptanceCriteria": [" atlas loaded "]}, "summary"), ["atlas loaded"])
        self.assertEqual(acceptance_criteria({}, "summary"), ["summary"])

    def test_resolution_requires_real_file_and_records_hash(self):
        with tempfile.TemporaryDirectory() as root:
            evidence = Path(root) / "reports" / "proof.json"
            evidence.parent.mkdir()
            evidence.write_text('{"status":"passed"}')
            handoff = {"type": "request", "status": "open"}
            with self.assertRaisesRegex(ValueError, "evidenceRefs"):
                resolution_fields(handoff, {"status": "resolved", "note": "verified"}, root)
            result = resolution_fields(handoff, {
                "status": "resolved", "note": "verified",
                "evidenceRefs": [{"path": "reports/proof.json"}],
            }, root)
            self.assertEqual(result["evidenceRefs"], [{
                "path": "reports/proof.json",
                "sha256": hashlib.sha256(evidence.read_bytes()).hexdigest(),
            }])
            with self.assertRaisesRegex(ValueError, "does not match"):
                resolution_fields(handoff, {
                    "status": "resolved", "note": "verified",
                    "evidenceRefs": [{"path": "reports/proof.json", "sha256": "0" * 64}],
                }, root)
            with self.assertRaisesRegex(ValueError, "inside the repository"):
                resolution_fields(handoff, {
                    "status": "resolved", "note": "verified",
                    "evidenceRefs": [{"path": "../outside.json"}],
                }, root)

    def test_reject_cannot_be_declined_without_fix(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, "cannot be waived"):
                resolution_fields({"type": "reject", "status": "open"}, {
                    "status": "wontfix", "note": "defer it",
                }, root)
            with self.assertRaisesRegex(ValueError, "already closed"):
                resolution_fields({"type": "request", "status": "resolved"}, {
                    "status": "wontfix", "note": "defer it",
                }, root)


class ReportProvenanceTests(unittest.TestCase):
    def test_prep_report_retains_time_and_candidate_identity(self):
        with tempfile.TemporaryDirectory() as root:
            Path(root, "visual_audit_latest.json").write_text(json.dumps({
                "status": "passed", "createdAt": "2026-07-23T09:18:08Z",
            }))
            Path(root, "build_gate_latest.json").write_text(json.dumps({
                "status": "passed", "createdAt": "2026-09-24T21:26:33Z",
                "identity": {"artifactSha256": "a" * 64},
            }))
            by_file = {item["file"]: item for item in collect_report_signals(root)["provenance"]}
            self.assertIsNone(by_file["visual_audit_latest.json"]["artifactSha256"])
            self.assertEqual(by_file["build_gate_latest.json"]["artifactSha256"], "a" * 64)


if __name__ == "__main__":
    unittest.main()
