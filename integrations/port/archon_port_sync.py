#!/usr/bin/env python3
"""Publish sanitized Archon run state from a factory consumer repo into Port.

One-way, read-only on the Archon side: reads `factory/consumer.py runs --json`
plus each run's structured `pr-intent.json` artifact, maps rows to Port
`archonRun` entities, and upserts them (merge). Dry run by default.

  python archon_port_sync.py --repo D:\\path\\to\\app            # dry run, prints entities
  python archon_port_sync.py --repo ... --ensure-blueprints --apply
  python archon_port_sync.py --repo ... --apply --limit 20

Port credentials: PORT_ORG_CLIENT_ID / PORT_ORG_CLIENT_SECRET first, then
PORT_CLIENT_ID / PORT_CLIENT_SECRET, from the environment or --env-file
(default ~/.port/.env). PORT_API_URL defaults to EU https://api.port.io.
Never publishes free-text work orders, prompts, transcripts or logs.
A Port failure never affects Archon: this runs as a separate, idempotent pass.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

RUN_BLUEPRINT = "archonRun"
FACTORY_BLUEPRINT = "archonFactory"
CANONICAL = {
    "pending": "queued",
    "running": "running",
    "paused": "blocked",
    "completed": "succeeded",
    "failed": "failed",
    "cancelled": "cancelled",
}
ALLOWED_API_HOSTS = {"https://api.port.io", "https://api.us.port.io"}
ERROR_LIMIT = 500
# Children must run under the console interpreter: consumer.py under pythonw exits 0 with empty stdout.
# CREATE_NO_WINDOW on each child keeps them windowless.
PYTHON = re.sub(r"pythonw(\.exe)?$", r"python\1", sys.executable, flags=re.IGNORECASE)

BLUEPRINTS = [
    {
        "identifier": FACTORY_BLUEPRINT,
        "title": "Archon Factory",
        "icon": "Github",
        "description": "Repository running the Medin AI software factory (Archon SDLC workflows).",
        "schema": {
            "properties": {
                "githubUrl": {"type": "string", "format": "url", "title": "GitHub URL"},
                "engine": {"type": "string", "title": "Workflow engine"},
                "archonRevision": {"type": "string", "title": "Pinned Archon revision"},
                "defaultProvider": {"type": "string", "title": "Default provider"},
                "baseBranch": {"type": "string", "title": "Integration branch"},
                "scheduleEnabled": {"type": "boolean", "title": "Scheduler enabled"},
                "lifecycleOwner": {"type": "string", "title": "SDLC owner"},
                "skillsRevision": {"type": "string", "title": "Skills revision (engineering-skills)"},
                "packRevision": {"type": "string", "title": "Workflow pack revision"},
            },
            "required": ["githubUrl"],
        },
        "relations": {},
    },
    {
        "identifier": RUN_BLUEPRINT,
        "title": "Archon Run",
        "icon": "Workflow",
        "description": "Sanitized Archon SDLC run summary published by archon_port_sync.py. Archon is authoritative.",
        "schema": {
            "properties": {
                "runId": {"type": "string", "title": "Archon run ID"},
                "workflow": {"type": "string", "title": "Workflow"},
                "rawState": {"type": "string", "title": "Archon state"},
                "canonicalState": {
                    "type": "string",
                    "title": "State",
                    "enum": ["queued", "running", "blocked", "succeeded", "failed", "cancelled", "unknown"],
                    "enumColors": {
                        "queued": "lightGray",
                        "running": "blue",
                        "blocked": "orange",
                        "succeeded": "green",
                        "failed": "red",
                        "cancelled": "darkGray",
                        "unknown": "lightGray",
                    },
                },
                "currentStep": {"type": "string", "title": "Current step"},
                "stopReason": {"type": "string", "title": "Stop reason"},
                "error": {"type": "string", "title": "Error (truncated)"},
                "issueUrl": {"type": "string", "format": "url", "title": "Issue"},
                "prUrl": {"type": "string", "format": "url", "title": "Pull request"},
                "prTitle": {"type": "string", "title": "PR title"},
                "branch": {"type": "string", "title": "Branch"},
                "headSha": {"type": "string", "title": "Head commit"},
                "adoptedFrom": {"type": "string", "title": "Adopted from run"},
                "startedAt": {"type": "string", "format": "date-time", "title": "Started"},
                "completedAt": {"type": "string", "format": "date-time", "title": "Completed"},
                "lastActivityAt": {"type": "string", "format": "date-time", "title": "Last activity"},
                "costUsd": {"type": "number", "title": "Cost (USD)"},
                "tokensIn": {"type": "number", "title": "Tokens in"},
                "tokensOut": {"type": "number", "title": "Tokens out"},
                "observedAt": {"type": "string", "format": "date-time", "title": "Last observed"},
            },
            "required": ["runId", "workflow", "rawState", "canonicalState"],
        },
        "relations": {
            "factory": {"title": "Factory", "target": FACTORY_BLUEPRINT, "required": False, "many": False}
        },
    },
]


# ---------- Archon side (read-only) ----------


def consumer_json(repo: Path, *args: str) -> dict:
    out = subprocess.run(
        [PYTHON, str(repo / "factory" / "consumer.py"), *args, "--json"],
        cwd=repo,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    ).stdout
    return json.loads(out[out.index("{") :])  # consumer prints a banner line before the JSON


def github_slug(repo: Path) -> str:
    url = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    ).stdout.strip()
    match = re.search(r"github\.com[:/](.+?)(?:\.git)?$", url)
    if not match:
        raise SystemExit(f"[FAIL] origin is not a GitHub remote: {url}")
    return match.group(1)


def pr_intent(row: dict) -> dict:
    root = row.get("output_root")
    if not root:
        return {}
    path = Path(root) / "artifacts" / "runs" / row["id"] / "pr-intent.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


# ---------- mapping (pure, tested) ----------


def entity_id(slug: str, run_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_\-@.]", "-", f"{slug.replace('/', '-')}--{run_id}")


LOCAL_PATH = re.compile(r"(?:[A-Za-z]:[\\/]|/(?:home|Users)/)[^\s'\"`)]+")


def scrub(text: str) -> str:
    """Drop local filesystem paths (they reveal usernames and host layout)."""
    return LOCAL_PATH.sub("<local-path>", text)


def iso(value) -> str | None:
    if not value:
        return None
    if isinstance(value, (int, float)):  # epoch ms
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return str(value)


def map_run(row: dict, slug: str, intent: dict, observed_at: str) -> dict:
    meta = row.get("metadata") or {}
    inputs = meta.get("inputs") or {}
    raw_state = row.get("status") or "unknown"
    error = meta.get("error")
    stop = meta.get("stop_reason")
    target = inputs.get("target") or ""
    pr_number = intent.get("existing")
    props = {
        "runId": row["id"],
        "workflow": row.get("workflow_name") or "unknown",
        "rawState": raw_state,
        "canonicalState": CANONICAL.get(raw_state, "unknown"),
        "currentStep": row.get("current_step_name"),
        "stopReason": stop.get("reason") if isinstance(stop, dict) else stop,
        "error": scrub(str(error))[:ERROR_LIMIT] if error else None,
        "issueUrl": target if re.search(r"github\.com/.+/issues/\d+", target) else None,
        "prUrl": f"https://github.com/{slug}/pull/{pr_number}" if pr_number else None,
        "prTitle": intent.get("title"),
        "branch": intent.get("head"),
        "headSha": intent.get("headRevision"),
        "adoptedFrom": row.get("adopted_from_run_id"),
        "startedAt": iso(row.get("started_at")),
        "completedAt": iso(row.get("completed_at")),
        "lastActivityAt": iso(row.get("last_activity_at")),
        "costUsd": meta.get("total_cost_usd"),
        "tokensIn": meta.get("total_tokens_in"),
        "tokensOut": meta.get("total_tokens_out"),
        "observedAt": observed_at,
    }
    # Omit unknowns: with merge upsert, an omitted key keeps Port's last value; null would clear it.
    props = {k: v for k, v in props.items() if v is not None}
    title_bits = [props["workflow"], props.get("prTitle") or row["id"][:8]]
    return {
        "identifier": entity_id(slug, row["id"]),
        "title": " - ".join(title_bits),
        "properties": props,
        "relations": {"factory": entity_id(slug, "factory")},
    }


def git_head(path: Path) -> str | None:
    """Short HEAD of the repository containing `path` (junctions resolved), or None."""
    try:
        out = subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], cwd=path.resolve(), capture_output=True,
                             text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except OSError:
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip() or None


def map_factory(slug: str, repo: Path) -> dict:
    pack = json.loads((repo / "factory" / "pack.json").read_text(encoding="utf-8"))
    config = (repo / ".archon" / "config.yaml")
    text = config.read_text(encoding="utf-8") if config.exists() else ""
    provider = re.search(r"^assistant:\s*(\S+)", text, re.M)
    base = re.search(r"baseBranch:\s*(\S+)", text)
    revision = next((v for k, v in pack.items() if "revision" in k.lower() and isinstance(v, str)), None)
    props = {
        "githubUrl": f"https://github.com/{slug}",
        "engine": "Archon",
        "archonRevision": revision,
        "defaultProvider": provider.group(1) if provider else None,
        "baseBranch": base.group(1) if base else None,
        "scheduleEnabled": False,  # ponytail: descriptive only; read `consumer.py schedule status` if this matters
        "lifecycleOwner": "Archon",
        "skillsRevision": git_head(Path(os.environ.get("SKILLS_REPO", r"D:\workspace\personal\engineering-skills"))),
        # The pack loads from Archon's global scope, a junction into the repo that owns it.
        "packRevision": git_head(Path(os.environ.get("ARCHON_HOME") or Path.home() / ".archon") / "workflows"),
    }
    return {
        "identifier": entity_id(slug, "factory"),
        "title": slug,
        "properties": {k: v for k, v in props.items() if v is not None},
        "relations": {},
    }


# ---------- Port side ----------


def port_credentials() -> tuple[str, str]:
    """Return organization credentials, falling back to legacy Port credentials."""
    client_id = os.environ.get("PORT_ORG_CLIENT_ID") or os.environ.get("PORT_CLIENT_ID")
    client_secret = os.environ.get("PORT_ORG_CLIENT_SECRET") or os.environ.get("PORT_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise SystemExit(
            "[FAIL] set PORT_ORG_CLIENT_ID and PORT_ORG_CLIENT_SECRET "
            "(or legacy PORT_CLIENT_ID and PORT_CLIENT_SECRET)"
        )
    return client_id, client_secret


class Port:
    def __init__(self, base: str):
        if base not in ALLOWED_API_HOSTS:
            raise SystemExit(f"[FAIL] refusing to send Port credentials to {base}")
        self.base = base
        self.token = None

    def call(self, method: str, path: str, body=None) -> tuple[int, dict]:
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        # ponytail: no retry; every pass is an idempotent full upsert, so the next pass is the retry.
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as err:
            if err.code == 401 and self.token and path != "/v1/auth/access_token":
                self.login()  # token expired (~3h); refresh once and replay
                return self.call(method, path, body)
            try:
                return err.code, json.loads(err.read())
            except ValueError:
                return err.code, {}

    def login(self):
        client_id, client_secret = port_credentials()
        status, body = self.call(
            "POST",
            "/v1/auth/access_token",
            {"clientId": client_id, "clientSecret": client_secret},
        )
        if status != 200:
            raise SystemExit(f"[FAIL] Port auth HTTP {status}: {body.get('message', '')}")
        self.token = body["accessToken"]

    def ensure_blueprint(self, blueprint: dict):
        status, _ = self.call("GET", f"/v1/blueprints/{blueprint['identifier']}")
        if status == 200:
            status, body = self.call("PATCH", f"/v1/blueprints/{blueprint['identifier']}", blueprint)
        else:
            status, body = self.call("POST", "/v1/blueprints", blueprint)
        print(f"[{'OK' if status < 300 else 'FAIL'}] blueprint {blueprint['identifier']} HTTP {status} {body.get('message', '')}")

    def ensure_action(self, action: dict):
        status, _ = self.call("GET", f"/v1/actions/{action['identifier']}")
        if status == 200:
            status, body = self.call("PUT", f"/v1/actions/{action['identifier']}", action)
        else:
            status, body = self.call("POST", "/v1/actions", action)
        print(f"[{'OK' if status < 300 else 'FAIL'}] action {action['identifier']} HTTP {status} {body.get('message', '')}")

    def upsert(self, blueprint: str, entity: dict, port_run: str | None = None) -> bool:
        tie = f"&run_id={port_run}" if port_run else ""
        status, body = self.call("POST", f"/v1/blueprints/{blueprint}/entities?upsert=true&merge=true{tie}", entity)
        log(f"[{'OK' if status < 300 else 'FAIL'}] {blueprint}/{entity['identifier']} HTTP {status} {body.get('message', '')}")
        return status < 300

    def active_requests(self) -> list[dict]:
        # `action=` filtering is only accepted with version=v2.
        status, body = self.call("GET", f"/v1/actions/runs?action={REQUEST_ACTION}&active=true&version=v2")
        if status != 200:
            log(f"[FAIL] list {REQUEST_ACTION} runs HTTP {status} {body.get('message', '')}")
            return []
        return body.get("runs", [])

    def patch_run(self, run_id: str, **fields):
        status, body = self.call("PATCH", f"/v1/actions/runs/{run_id}", fields)
        if status >= 300:
            log(f"[FAIL] patch run {run_id} HTTP {status} {body.get('message', '')}")

    def run_log(self, run_id: str, message: str):
        self.call("POST", f"/v1/actions/runs/{run_id}/logs", {"message": message})


# ---------- bridge: Port action runs -> Archon (local, outbound-only) ----------

REQUEST_ACTION = "archon_request_run"
ACTION_FILE = Path(__file__).with_name("action_archon_request_run.json")
TERMINAL = {"completed": "SUCCESS", "failed": "FAILURE", "cancelled": "FAILURE"}
LAUNCH_GRACE_S = 600  # a launch that never shows up in Archon within this window is failed


def log(message: str):
    print(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {message}", flush=True)


def allowed_workflows() -> set[str]:
    action = json.loads(ACTION_FILE.read_text(encoding="utf-8"))
    return set(action["trigger"]["userInputs"]["properties"]["workflow"]["enum"])


def validate_request(req: dict, slug: str, factory_id: str, workflows: set[str]) -> str | None:
    """Return a rejection reason, or None when the request may launch."""
    props = req.get("properties") or {}
    if (req.get("entity") or {}).get("identifier") != factory_id:
        return "request is not for this bridge's factory"
    if props.get("workflow") not in workflows:
        return f"workflow {props.get('workflow')!r} is not allowed"
    if not re.fullmatch(rf"https://github\.com/{re.escape(slug)}/issues/\d+", props.get("target") or ""):
        return f"target must be an issue URL in https://github.com/{slug}"
    return None


LINK_LABEL = re.compile(r"Archon run ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")


def linked_archon_id(req: dict) -> str | None:
    """Archon run id this Port run is tied to. Port accepts externalRunId on PATCH but never returns it,
    so the durable link is the statusLabel ("Archon run <uuid>: <state>")."""
    match = LINK_LABEL.search(req.get("statusLabel") or "")
    return match.group(1) if match else req.get("externalRunId")


def correlate(req: dict, rows: list[dict], claimed: set[str]) -> dict | None:
    """Find the Archon run this Port request launched: same workflow + target, started after the request."""
    props = req.get("properties") or {}
    # 60s slack for clock skew between Port's createdAt and the local Archon start time.
    earliest = parse_time(req.get("createdAt")) - timedelta(seconds=60)
    for row in sorted(rows, key=lambda r: str(r.get("started_at") or "")):
        inputs = (row.get("metadata") or {}).get("inputs") or {}
        started = parse_time(row.get("started_at"))
        if (
            row["id"] not in claimed
            and row.get("workflow_name") == props.get("workflow")
            and inputs.get("target") == props.get("target")
            and started >= earliest
        ):
            return row
    return None


def parse_time(value) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


class Bridge:
    def __init__(self, repo: Path, port: Port, interval: int, log_dir: Path):
        self.repo, self.port, self.interval, self.log_dir = repo, port, interval, log_dir
        self.slug = github_slug(repo)
        self.factory = map_factory(self.slug, repo)
        self.workflows = allowed_workflows()
        self.children: dict[str, tuple[subprocess.Popen, float]] = {}  # port run id -> (process, launched)
        self.published: dict[str, str] = {}  # archon run id -> lastActivityAt already in Port

    def launch(self, req: dict):
        props = req["properties"]
        self.log_dir.mkdir(parents=True, exist_ok=True)
        out = open(self.log_dir / f"{req['id']}.log", "w", encoding="utf-8")
        # Foreground run with a hidden console: never --detach (detached Archon pops a window per child on Windows).
        proc = subprocess.Popen(
            [PYTHON, str(self.repo / "factory" / "consumer.py"), "run", props["workflow"],
             "--input", f"target={props['target']}", "--json"],
            cwd=self.repo,
            stdout=out,
            stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self.children[req["id"]] = (proc, time.time())
        self.port.patch_run(req["id"], statusLabel=f"Launching {props['workflow']}")
        self.port.run_log(req["id"], f"Bridge launched {props['workflow']} for {props['target']} (pid {proc.pid}).")
        log(f"[OK] launched {props['workflow']} for Port run {req['id']}")

    def handle_requests(self, rows: list[dict]):
        by_id = {row["id"]: row for row in rows}
        requests = self.port.active_requests()
        claimed = {a for a in map(linked_archon_id, requests) if a}
        for req in sorted(requests, key=lambda r: r.get("createdAt") or ""):
            rid = req["id"]
            archon_id = linked_archon_id(req)
            if archon_id:  # launched and correlated: close it when Archon ends
                row = by_id.get(archon_id)
                if row and row.get("status") in TERMINAL:
                    self.finish(req, row)
                continue
            row = correlate(req, rows, claimed)
            if row:
                claimed.add(row["id"])
                self.port.patch_run(rid, externalRunId=row["id"], statusLabel=f"Archon run {row['id']}: {row.get('status')}",
                                    link=f"https://github.com/{self.slug}")
                self.port.run_log(rid, f"Correlated to Archon run {row['id']}.")
                continue
            child = self.children.get(rid)
            if child:
                proc, launched = child
                if proc.poll() is not None or time.time() - launched > LAUNCH_GRACE_S:
                    try:
                        tail = (self.log_dir / f"{rid}.log").read_text(encoding="utf-8", errors="replace")[-600:]
                    except OSError:
                        tail = ""
                    self.port.run_log(rid, "Archon run never started. Launcher output (paths removed):\n" + scrub(tail))
                    self.port.patch_run(rid, status="FAILURE", statusLabel="Launch failed")
                    self.children.pop(rid, None)
                continue
            reason = validate_request(req, self.slug, self.factory["identifier"], self.workflows)
            if reason:
                self.port.run_log(rid, f"Rejected: {reason}")
                self.port.patch_run(rid, status="FAILURE", statusLabel="Rejected")
            elif any(p.poll() is None for p, _ in self.children.values()):
                self.port.patch_run(rid, statusLabel="Queued: another bridge launch is running")
            elif (req.get("statusLabel") or "").startswith("Launching"):
                # ponytail: launched by a previous bridge process that died before correlation; fail rather than double-launch.
                self.port.patch_run(rid, status="FAILURE", statusLabel="Bridge restarted before the run was correlated")
            else:
                self.launch(req)

    def finish(self, req: dict, row: dict):
        entity = map_run(row, self.slug, pr_intent(row), datetime.now(timezone.utc).isoformat())
        self.port.upsert(RUN_BLUEPRINT, entity, port_run=req["id"])
        props = entity["properties"]
        links = [u for u in (props.get("prUrl"), props.get("issueUrl")) if u]
        summary = props.get("error") or f"Archon {row.get('workflow_name')} {row.get('status')}."
        self.port.patch_run(req["id"], status=TERMINAL[row["status"]], statusLabel=f"Archon run {row['id']}: {row['status']}",
                            summary=summary, **({"link": links} if links else {}))
        self.children.pop(req["id"], None)
        log(f"[OK] Port run {req['id']} closed as {TERMINAL[row['status']]} (Archon {row['id']})")

    def sync_runs(self, rows: list[dict]):
        observed = datetime.now(timezone.utc).isoformat()
        for row in rows:
            stamp = f"{row.get('status')}|{row.get('last_activity_at')}"
            if self.published.get(row["id"]) != stamp and self.port.upsert(
                RUN_BLUEPRINT, map_run(row, self.slug, pr_intent(row), observed)
            ):
                self.published[row["id"]] = stamp

    def serve(self, limit: int):
        self.port.upsert(FACTORY_BLUEPRINT, self.factory)
        log(f"[OK] bridge serving {self.slug} every {self.interval}s; workflows={sorted(self.workflows)}")
        while True:
            try:
                rows = consumer_json(self.repo, "runs").get("runs", [])[:limit]
                self.sync_runs(rows)
                self.handle_requests(rows)
            except Exception as exc:  # never die: Port or Archon hiccups are retried next pass
                log(f"[WARN] pass failed: {type(exc).__name__}: {scrub(str(exc))[:300]}")
            time.sleep(self.interval)


def load_env_file(path: Path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", type=Path, default=Path.cwd(), help="factory consumer repo (has factory/consumer.py)")
    ap.add_argument("--apply", action="store_true", help="write to Port (default: dry run)")
    ap.add_argument("--ensure-blueprints", action="store_true", help="create/patch archonFactory + archonRun blueprints")
    ap.add_argument("--limit", type=int, default=25, help="most recent N runs")
    ap.add_argument("--env-file", type=Path, default=Path.home() / ".port" / ".env")
    ap.add_argument("--serve", action="store_true", help="run the bridge loop: sync runs + handle Port requests")
    ap.add_argument("--interval", type=int, default=30, help="seconds between bridge passes")
    ap.add_argument("--log", type=Path, help="bridge log file (default <repo>/tmp/port-bridge/bridge.log)")
    args = ap.parse_args(argv)

    repo = args.repo.resolve()
    if args.serve:
        log_dir = repo / "tmp" / "port-bridge"
        log_dir.mkdir(parents=True, exist_ok=True)
        # pythonw has no stdout; always log to a file in serve mode.
        sys.stdout = sys.stderr = open(args.log or log_dir / "bridge.log", "a", encoding="utf-8", buffering=1)
        load_env_file(args.env_file)
        port = Port(os.environ.get("PORT_API_URL", "https://api.port.io").rstrip("/"))
        port.login()
        if args.ensure_blueprints:
            for blueprint in BLUEPRINTS:
                port.ensure_blueprint(blueprint)
            port.ensure_action(json.loads(ACTION_FILE.read_text(encoding="utf-8")))
        Bridge(repo, port, args.interval, log_dir).serve(args.limit)
        return 0

    slug = github_slug(repo)
    observed = datetime.now(timezone.utc).isoformat()
    rows = consumer_json(repo, "runs").get("runs", [])[: args.limit]
    factory = map_factory(slug, repo)
    runs = [map_run(row, slug, pr_intent(row), observed) for row in rows]

    if not args.apply:
        print(json.dumps({"factory": factory, "runs": runs}, indent=2))
        print(f"[DRY RUN] {len(runs)} run(s) for {slug}; add --apply to publish.", file=sys.stderr)
        return 0

    load_env_file(args.env_file)
    port = Port(os.environ.get("PORT_API_URL", "https://api.port.io").rstrip("/"))
    port.login()
    if args.ensure_blueprints:
        for blueprint in BLUEPRINTS:
            port.ensure_blueprint(blueprint)
        port.ensure_action(json.loads(ACTION_FILE.read_text(encoding="utf-8")))
    ok = port.upsert(FACTORY_BLUEPRINT, factory)
    ok = all([port.upsert(RUN_BLUEPRINT, entity) for entity in runs]) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
