"""Run: python -m pytest integrations/port -q  (or: python integrations/port/test_archon_port_sync.py)"""

import archon_port_sync as s

SLUG = "owner/repo"
NOW = "2026-10-25T00:00:00+00:00"


def row(**over):
    base = {
        "id": "bcea6daa-f472-4475-8884-5611ae91e918",
        "workflow_name": "archon-deliver",
        "status": "failed",
        "started_at": "2026-10-25T02:21:41Z",
        "metadata": {
            "inputs": {"work": "SECRET-ish free text", "target": "https://github.com/owner/repo/issues/114"},
            "error": "x" * 900,
            "stop_reason": {"reason": "node_error"},
            "total_cost_usd": 2.47,
        },
    }
    base.update(over)
    return base


def test_failed_run_maps_and_never_leaks_work_text():
    e = s.map_run(row(), SLUG, {"existing": 115, "head": "b", "headRevision": "abc", "title": "T"}, NOW)
    p = e["properties"]
    assert e["identifier"] == "owner-repo--bcea6daa-f472-4475-8884-5611ae91e918"
    assert p["canonicalState"] == "failed" and p["stopReason"] == "node_error"
    assert len(p["error"]) == s.ERROR_LIMIT
    assert p["prUrl"] == "https://github.com/owner/repo/pull/115"
    assert p["issueUrl"].endswith("/issues/114")
    assert "SECRET-ish" not in str(e)
    assert e["relations"]["factory"] == "owner-repo--factory"


def test_unknowns_are_omitted_not_nulled():
    e = s.map_run(row(status="weird", metadata={}), SLUG, {}, NOW)
    p = e["properties"]
    assert p["canonicalState"] == "unknown"
    assert None not in p.values()
    assert "prUrl" not in p and "issueUrl" not in p


def test_non_issue_target_is_not_an_issue_url():
    e = s.map_run(row(metadata={"inputs": {"target": "https://github.com/owner/repo/pull/9"}}), SLUG, {}, NOW)
    assert "issueUrl" not in e["properties"]


def test_local_paths_are_scrubbed_from_errors():
    err = r"failed (C:\Users\emili\.archon\runs\x\reviewed-head is missing) and /home/bob/x"
    e = s.map_run(row(metadata={"error": err}), SLUG, {}, NOW)
    assert "emili" not in e["properties"]["error"] and "bob" not in e["properties"]["error"]
    assert e["properties"]["error"].count("<local-path>") == 2


def test_refuses_foreign_api_host():
    try:
        s.Port("https://evil.example.com")
    except SystemExit:
        return
    raise AssertionError("credentials host allowlist not enforced")


def request(**over):
    base = {
        "id": "port-run-1",
        "createdAt": "2026-10-25T00:00:00Z",
        "properties": {
            "workflow": "archon-triage",
            "target": "https://github.com/owner/repo/issues/114",
        },
        "entity": {"identifier": "owner-repo--factory"},
    }
    base.update(over)
    return base


def archon_run(run_id="archon-1", workflow="archon-triage", target="https://github.com/owner/repo/issues/114",
               started_at="2026-10-25T00:00:01Z"):
    return {
        "id": run_id,
        "workflow_name": workflow,
        "started_at": started_at,
        "metadata": {"inputs": {"target": target}},
    }


def test_validate_request_accepts_allowed_workflow_issue_and_factory():
    allowed = {"archon-triage", "archon-ship"}
    assert s.validate_request(request(), "owner/repo", "owner-repo--factory", allowed) is None
    assert s.validate_request(
        request(properties={"workflow": "archon-ship", "target": "https://github.com/owner/repo/issues/2"}),
        "owner/repo", "owner-repo--factory", allowed,
    ) is None


def test_validate_request_rejects_other_repo_and_pull_request_url():
    allowed = {"archon-triage", "archon-ship"}
    other_repo = request(properties={"workflow": "archon-triage", "target": "https://github.com/other/repo/issues/114"})
    pull_request = request(properties={"workflow": "archon-triage", "target": "https://github.com/owner/repo/pull/114"})
    assert s.validate_request(other_repo, "owner/repo", "owner-repo--factory", allowed)
    assert s.validate_request(pull_request, "owner/repo", "owner-repo--factory", allowed)


def test_validate_request_rejects_unknown_workflow_and_wrong_factory_entity():
    allowed = {"archon-triage", "archon-ship"}
    unknown = request(properties={"workflow": "archon-admin", "target": "https://github.com/owner/repo/issues/114"})
    wrong_entity = request(entity={"identifier": "some-other-factory"})
    assert s.validate_request(unknown, "owner/repo", "owner-repo--factory", allowed)
    assert s.validate_request(wrong_entity, "owner/repo", "owner-repo--factory", allowed)


def test_correlate_matches_workflow_and_target_after_request_with_clock_skew():
    req = request()
    skewed = archon_run(started_at="2026-10-24T23:59:30Z")  # 30 seconds before createdAt
    later = archon_run("archon-later", started_at="2026-10-25T00:00:10Z")
    assert s.correlate(req, [later, skewed], set()) == skewed


def test_correlate_ignores_claimed_ids_other_targets_and_other_workflows():
    req = request()
    claimed = archon_run("claimed")
    wrong_target = archon_run("wrong-target", target="https://github.com/owner/repo/issues/999")
    wrong_workflow = archon_run("wrong-workflow", workflow="archon-ship")
    match = archon_run("match", started_at="2026-10-25T00:00:02Z")
    assert s.correlate(req, [claimed, wrong_target, wrong_workflow, match], {"claimed"}) == match


def test_correlate_ignores_runs_started_more_than_60_seconds_before_request():
    req = request()
    too_early = archon_run(started_at="2026-10-24T23:58:59Z")
    assert s.correlate(req, [too_early], set()) is None


def test_linked_archon_id_survives_port_dropping_external_run_id():
    rid = "c7bffd38-6728-47db-bc66-2fee21091d37"
    assert s.linked_archon_id({"statusLabel": f"Archon run {rid}: running"}) == rid
    assert s.linked_archon_id({"statusLabel": "Launching archon-triage"}) is None


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("[OK] all tests passed")
