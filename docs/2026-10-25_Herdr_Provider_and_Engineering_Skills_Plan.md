# Herdr-native factory and engineering-skills: build plan

Date: 2026-10-25. Owner: user. Lead: Claude Code (Herdr `w1:p1`).
No OpenSpec proposals and no skylos for this work (user, 2026-10-25).

## Goal

One delivery surface for people and agents. Archon (Cole's engine, pinned) runs every
agent turn through Herdr, so factory work looks the same as manual work. Hermes/Chief
only files issues and asks the factory to build, through Port. Skills, gates and review
policy live in one pinned Git repo that every harness and the factory read.

```
You ---------------------------------> Herdr panes -> Claude Code / Pi + engineering-skills
Hermes/Chief -> GitHub issues -> Port action -> bridge -> factory -> Archon + prairie pack
                                                                       | each agent turn
                                                                       v
                                                  archon-provider-herdr -> Herdr panes (same agents, same skills)
```

## Ownership boundaries

| Layer | Owner | Location |
|---|---|---|
| Archon engine and stock SDLC stages | Cole (upstream) | pinned by `factory/pack.json` |
| Workflow pack `prairie-sdlc` | user | `software-factory-medin/packs/prairie-sdlc/` |
| Provider `archon-provider-herdr` | user | `software-factory-medin/providers/herdr/` |
| Port bridge | user | `software-factory-medin/integrations/port/` (exists) |
| Skills, gates, review policy | user | new repo `D:/workspace/personal/engineering-skills` |
| Per-repo config | each repo | `.archon/config.yaml`, `AGENTS.md`, CI, `.factory/review.yaml` |

Rule: only add to Cole's work, never edit it. Upgrading = move the pin, rerun fixtures.

## Phase 0: spike (read-only, plus one throwaway run)

Answer before building. Each answer is cited to a file/line in the pinned source or a
real command output.

| # | Question | Worker |
|---|---|---|
| S1 | Provider plugin protocol: how `archon-provider-<name>` executables are discovered, spawned, and spoken to; the event contract (tool calls, output, usage, session resume); required capabilities | Haiku A |
| S2 | Workflow-pack format: `archon-plugin.json`, `archon plugin install` from a local path or `owner/repo/path`, entry naming, whether a pack's `include:` reaches the factory's pinned SDLC workflows | Haiku B |
| S3 | How a node's `skills:` names resolve to files (search roots, per-provider handling) | Haiku B |
| S4 | Whether `consumer.py run` accepts a pack entry (`owner/plugin:name`), or what the minimal consumer change is | lead |
| S5 | Herdr CLI surface for a provider: start agent in a new pane, send a prompt, wait, read output, structured output options, cleanup; headless/no-TUI operation | Pi-1 |
| S6 | Inventory of current skills (`~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, Pi skills): real dirs vs junctions, scripts, hooks, harness-specific bits; Pi's skill loader | Pi-2 |

Exit: a go/no-go note per question, appended to this file. A failed S1 or S2 changes
the plan below (fallback: additive-only Archon fork rebased on Cole's branch).

### Phase 0 results (2026-10-25, pinned engine 120f3e04; paths under `packages/`)

| # | Verdict | Finding that shapes the build |
|---|---|---|
| S1 | GO | External provider = stdio JSON-RPC 2.0 (NDJSON), one process per turn: `initialize` -> `session/new` -> `session/prompt`, chunks via `_archon/chunk`, exactly one `result` then `settled`, `session/cancel` honoured (`provider-contract/src/plugin/{rpc,connect,serve,wire}.ts`). `serveProvider()` implements the transport; `runProviderConformance()` (`provider-contract/src/conformance.ts`) is the test suite. Descriptor id must be `herdr`, executable `archon-provider-herdr`. Install is GitHub-release only: `archon plugin install owner/repo[/path][@tag]` fetches `<exe>-<os>-<arch>` + `checksums.txt` (`cli/src/commands/plugin.ts:319-410`). A node with `skills:` on a provider declaring `skills:false` fails before spend. Tiers route with `tiers: {large: {provider: herdr, model: ...}}`; `herdr:claude` syntax does not exist. |
| S2 | CHANGED | Installed packs cannot `include:` project/global/bundled workflows (`workflows/src/include-expander.ts:1268-1273`, `workflow-discovery.ts:953-1020`). Project, global and bundled share one name map (`workflow-discovery.ts:10-17, 888-904`), so a workflow in GLOBAL scope `~/.archon/workflows/` can include `archon-deliver` from the pinned source. Global scope is frozen into each run's capture (`workflow-source.ts:915-922`). `archon workflow test [target]` runs `fixtures/*.stubs.yaml` with no model call. Names must be unique across scopes (`workflow-discovery.ts:856-886`). |
| S3 | GO | `skills:` names resolve to `<root>/<name>/SKILL.md`. Claude: `<cwd>/.claude/skills`, `~/.claude/skills`. Pi and others: `<cwd>/.agents/skills`, `<cwd>/.claude/skills`, `~/.agents/skills`, `~/.claude/skills` (`paths/src/skills.ts:22-62`). Codex declares `skills:false`. |
| S4 | SMALL CHANGE | `consumer.py run` accepts only names present in BOTH the native list and the pinned tree (`factory/consumer.py:178-187, 333-334`). Needs: also accept names the native list reports from global scope with the `prairie-` prefix. |
| S5 | GO, WITH LIMITS | Herdr has no JSON output (`agent read`/`pane read` are text/ANSI). Control requires `HERDR_ENV=1` (a process started inside Herdr). So the provider runs the agent's own headless structured mode as a pane command and parses a tee'd file; Herdr is the viewing surface. Factory runs (and the Port bridge) must be launched from inside a Herdr pane so the provider inherits `HERDR_ENV`. |
| S6 | GO | About 240 skill entries across `~/.agents/skills` (45), `~/.claude/skills` (95), `~/.codex/skills` (100), `~/.pi/agent/skills` (2), many duplicated as real directories. Pi 1.4.0 reads `~/.pi/agent/skills`, `.pi/skills`, `~/.agents/skills`, `.agents/skills`. Sync targets: `~/.agents/skills` + `~/.claude/skills` cover Claude, Pi and Archon resolution. |

### Revised design after Phase 0

- The pack becomes a GLOBAL-scope workflow set: repo `software-factory-medin/packs/prairie-sdlc/` junctioned to `~/.archon/workflows/prairie-sdlc/`. Workflow names are prefixed `prairie-` to avoid collisions. Its revision is recorded per run (Port `packRevision`). Not an installed plugin.
- The provider stays a real external plugin (`archon-provider-herdr`), compiled with bun to a single exe and published as a GitHub release so `archon plugin install` accepts it. Needs a GitHub repo (user decision).
- Herdr provider data path: pane runs `claude -p --output-format stream-json ...` (or Pi's JSON mode) with output tee'd to `<run artifacts>/herdr/<turn>.jsonl`; the provider tails that file and maps events to `_archon/chunk`. Declares `skills: true` (agents read the synced skill roots in the worktree cwd), `sessionResume` only once resume ids are mapped, `containerExec: false`.

## Phase 1: engineering-skills repo

1. Create local repo `engineering-skills` with `skills/`, `gates/`, `review/`, `sync/`.
2. Move in the stable SDLC skills from the S6 inventory (governance, review lenses,
   architecture rules, logging, OpenSpec authoring, Port, Herdr). Project- and
   client-specific skills stay where they are.
3. `sync/sync.py`: the only harness-specific code. Junctions skills into
   `~/.agents/skills` (and `~/.claude/skills`, `~/.codex/skills` where needed), with
   `--dry-run` default, refuse to overwrite a real directory, report drift.
4. `gates/`: harness-neutral enforcement scripts (openspec validate wrapper, pyrefly,
   ruff, ponytail-check runner). Each exits non-zero on failure and prints one line.
5. `review/review.schema.json` + template `.factory/review.yaml` (which gates and
   which judgment lenses a repo runs).
6. Port: `skillsRevision` property on `archonRun`; Git-sync the repo into Port's Skills
   blueprint later (catalog + Chief runtime via MCP).

Accept: sync dry run on this machine shows the intended links and no clobbering;
gates run standalone on data-science-workbench; repo self-test passes.

## Phase 2: workflow pack `prairie-sdlc`

1. Layout `packs/prairie-sdlc/<workflow>/{<workflow>.yaml,commands/,scripts/,fixtures/}`;
   junction into `~/.archon/workflows/prairie-sdlc/` (global scope).
2. `prairie-openspec-deliver`: `gate-proposal` script (both validators, fail closed) ->
   `plan-from-proposal` command (`skills: [openspec-prairieapplied]`) ->
   `include: archon-deliver`.
3. `prairie-review-gates`: reads `.factory/review.yaml`, runs listed gates as script
   nodes and listed lenses as command nodes with `skills:`.
4. `fixtures/*.stubs.yaml` for each workflow, matching Cole's pattern; run with
   `archon workflow test`.
5. Consumer change (S4) in the fork's `factory/consumer.py`, then re-run `factory init`
   to copy it into the workbench.

Accept: fixtures pass with the engine's workflow test command; one real
`openspec-deliver` run on a small proposal produces a draft PR (stops before merge).

## Phase 3: `archon-provider-herdr`

1. Implement the S1 protocol as an executable that, per agent turn: creates or reuses a
   pane in a dedicated Herdr workspace (`factory-<repo>`), starts the mapped agent
   (Claude Code / Pi) in structured-output mode, streams the turn so it is visible,
   translates output into Archon events, cleans up owned panes.
2. Tier mapping in `.archon/config.yaml`: start with `large -> herdr:claude`, then
   `small -> herdr:pi`.
3. Contract tests against S1's conformance suite where one exists.

Accept: provider conformance tests pass; one triage run where every agent turn is
visible in a Herdr pane and the run result matches a run on the built-in provider.

## Phase 4: Chief contract and unattended mode

1. Chief contract doc: Chief may create issues and call the Port action only; no code
   tools. (Implementation lives in Hermes; user decides where.)
2. Port: `skillsRevision`, pack revision, provider on `archonRun`; review-policy link.
3. Persistence for bridge and Herdr factory workspace: user decision (blocked for
   agents by the auto-mode classifier).
4. Scheduling and `archon-loop`: off until supervised laps pass.

## Build status (2026-10-25, all local, nothing committed)

| Piece | State | Evidence |
|---|---|---|
| `engineering-skills` repo | scaffolded: 6 skills copied, manifest, `sync/sync.py` (dry-run default, refuses to clobber), `gates/` (ruff, pyrefly, openspec, run_gates), `review/` schema + examples | `sync/test_sync.py` and `gates/test_gates.py` pass; sync dry run: 6 CREATE, 6 CONFLICT (originals are real dirs) |
| Consumer pack entries (S4) | done in `template/factory/consumer.py` (`PACK_PREFIX`, `PACK_DIR`) | `bin/test_consumer.py`: 64 passed, 1 skipped |
| `providers/herdr` | protocol, descriptor, fake runner, real `HerdrRunner` (Factory workspace, tab per turn, `pane-turn` wrapper, stream-json tail, cancel file, tab cleanup), `scripts/smoke.ts` | `bun test`: 11 pass; `tsc --noEmit` clean. Live smoke NOT run: auto-mode classifier denied launching Claude with bypassPermissions ("Create Unsafe Agents") |
| `packs/prairie-sdlc` | `prairie-openspec-deliver` (gate-proposal, plan-from-proposal, include archon-deliver) + 2 fixtures; junctioned to `~/.archon/workflows/prairie-sdlc` | validates (bun-on-PATH warnings only) |

Open issues:
1. `workflow test` finds no fixtures through the junction: `fixture-runner.ts:222-225` skips symlinked dirs. Options: sync copies instead of a junction, or run fixtures from a project-scope copy.
2. Node `skills:` fails validation under the factory (pinned-root validate uses the Codex default). Investigate tier/provider resolution in `validator.ts` before relying on `skills:`.
3. Live provider smoke and first `provider: herdr` run need the user to allow Claude with bypassPermissions in panes, or to run `bun scripts/smoke.ts` themselves.
4. Gate script calls `python` and `openspec`; confirm interpreter (uv/ps-ops) and `openspec.cmd` on Windows.
5. Pi runner (`herdr:pi`) not implemented; claude only.

## Decisions reserved for the user

- Creating GitHub remotes for `engineering-skills` (local only until then).
- Committing anything in `software-factory-medin` (fork files remain uncommitted).
- Persistence (Scheduled Task / startup) for bridge and Herdr.
- Hermes/Chief changes.
- Turning on scheduling and any merge automation.

## Work routing

Lead (Claude Opus): plan, integration, provider and pack code, review of all output.
Haiku x2: source reading for S1-S3, later fixture authoring. Pi x2: Herdr CLI facts,
skills inventory, file moves, boilerplate. Every worker writes only to its own
directory under `data-science-workbench/tmp/spike/<worker>/`. No worker reads `.env`
files, calls Port, or sees credentials.
