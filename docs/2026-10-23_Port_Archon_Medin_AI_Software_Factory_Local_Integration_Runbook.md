# Port + Cole Medin AI Software Factory (Archon)
## Exhaustive technical research and Windows-first local-project onboarding runbook

**Research date:** 2026-10-23  
**Audience:** Python/AI engineers operating a local multi-agent harness (Herdr + Claude Code + Codex + Pi + Hermes) and Cole Medin's `ai-software-factory`.  
**Primary platforms:** Windows 11 / PowerShell for interactive setup; GitHub; Port SaaS; optional always-on Linux worker.  
**Deliverable type:** Architecture decision, documented installation, integration design, tests, troubleshooting, hardening, and source index.  
**Execution status:** Research and runbook only. No commands have been executed on the reader's workstation, GitHub organization, or Port tenant. Exact tenant options, permissions and model configuration must be inspected before execution.  
**Interpretation of names:** “Port” = [Port.io](https://www.port.io/), not a TCP port; “Medin factory” = [Cole Medin (`coleam00`), AI Software Factory](https://github.com/coleam00/ai-software-factory); its workflow engine = [Archon](https://github.com/coleam00/Archon).

> **Primary conclusion.** Port is an engineering **control plane / software catalog / governance and workflow platform**; Cole Medin's factory, powered by Archon, is the **agentic SDLC execution plane**. They can be combined without replacing Archon or the local coding harnesses. Install Port as a cloud service, connect the project through **GitHub Ocean**, let local agents consult its **remote MCP** read-only, then optionally publish Archon run state through a small **custom adapter**. Give Port the *request and observe* roles initially; let Archon own *build, review, verify, merge and schedule*.

---

## Contents

1. [Answer in one page](#1-answer-in-one-page)
2. [Verified architecture and boundaries](#2-verified-architecture-and-boundaries)
3. [What is native, what requires engineering](#3-what-is-native-what-requires-engineering)
4. [Choose the right rollout model](#4-choose-the-right-rollout-model)
5. [Preflight and local repository audit](#5-preflight-and-local-repository-audit)
6. [Install or verify Medin's factory and Archon](#6-install-or-verify-medins-factory-and-archon)
7. [Provision Port and connect GitHub](#7-provision-port-and-connect-github)
8. [Create a factory catalog blueprint](#8-create-a-factory-catalog-blueprint)
9. [Declare your repository in `port.yml`](#9-declare-your-repository-in-portyml)
10. [Install and authenticate Port CLI](#10-install-and-authenticate-port-cli)
11. [Connect Claude Code, Codex and VS Code via Port MCP](#11-connect-claude-code-codex-and-vs-code-via-port-mcp)
12. [Run the first controlled issue](#12-run-the-first-controlled-issue)
13. [Capture Archon run telemetry in Port](#13-capture-archon-run-telemetry-in-port)
14. [Optional Port-initiated work patterns](#14-optional-port-initiated-work-patterns)
15. [Agent/harness inventory and division of responsibilities](#15-agentharness-inventory-and-division-of-responsibilities)
16. [Approval, CI, security and secret handling](#16-approval-ci-security-and-secret-handling)
17. [End-to-end validation and acceptance checklist](#17-end-to-end-validation-and-acceptance-checklist)
18. [Troubleshooting](#18-troubleshooting)
19. [Upgrades, operating procedures and rollback](#19-upgrades-operating-procedures-and-rollback)
20. [Recommended backlog and implementation sequence](#20-recommended-backlog-and-implementation-sequence)
21. [Version-sensitive details and confidence](#21-version-sensitive-details-and-confidence)
22. [Official documentation and scraped source register](#22-official-documentation-and-scraped-source-register)

---

## 1. Answer in one page

### 1.1 A crucial distinction

Although Port markets an "AI Software Factory" platform, that phrase does **not** mean the same implementation as Cole Medin's `ai-software-factory`. Both address automated software delivery, but they are separate products with different owners, codebases and operational models.

| Dimension | Port.io | Cole Medin AI Software Factory / Archon | Your Herdr ecosystem |
|---|---|---|---|
| Primary role | Catalog, engineering context, workflow and agent governance | SDLC scheduling and execution, issue-to-PR lifecycle, verification gates | Local operator interface; multiplexes sessions and harnesses |
| Execution model | SaaS workflows and integrations, MCP, optional private execution agent | Pinned Archon YAML DAG/SDLC workflow pack plus consumer CLI | Claude Code, Codex, Pi, Hermes as coding/agent runtimes |
| GitHub role | Ingest repo/issue/PR/workflow data; optionally create/dispatch actions | Own issues, branches, PR creation, CI interpretation, merge policy | Agents interact with local clone and tools |
| Source of truth | **Catalog projection** of GitHub/factory data | GitHub + repo `MISSION.md`/policies + Archon run state | Local working tree/session state |
| Requires public internet? | Yes, for hosted Port and its APIs | GitHub and providers generally required; runs can execute locally | Depends on provider/tools |
| Runs a local repo automatically after login? | **No** | **No**: install and configure the factory, then explicitly invoke workflows | Local access depends on installed harness |
| First integration | GitHub Ocean + remote Port MCP | Existing installed consumer/Archon | Keep existing Herdr setup |
| Native Archon integration evidenced? | **No native Archon connector established by the documentation reviewed** | No first-party Port exporter established | Requires explicit per-harness Port MCP configuration |

Do **not** reimplement `archon-ship`, `archon-review`, `archon-verify-runtime`, or `archon-merge-queue` as separate Port workflows. This would duplicate decisions and permit incompatible merge criteria. A Port workflow can *request* work, obtain owner approval, or call a documented adapter, but Archon should remain the authoritative SDLC implementation for this architecture.

### 1.2 Minimal safe outcome

The first milestone is complete when:

1. A local application repository has a working GitHub `origin` and a functioning Medin factory installation.
2. Port's GitHub Ocean integration imports **that repository**, at least one issue/PR, and relevant GitHub Actions checks into its context lake.
3. The app repository has an optional `port.yml` describing its factory metadata, synchronized into a custom `archonFactory` blueprint.
4. Claude Code and Codex can ask Port *read-only* questions through the remote Port MCP endpoint and retrieve the catalog entity.
5. A manually triggered Archon workflow can take one small issue to a reviewed PR under human supervision.
6. No Port automation independently merges PRs or triggers an unbounded loop.

### 1.3 The preferred deployment model

```text
                   PORT.IO CLOUD (control plane)
       +----------------------------------------------+
       | GitHub Ocean ingestion -> Context Lake       |
       | services/repositories/issues/PRs/CI/owners   |
       | custom archonFactory + (later) archonRun      |
       | MCP catalog queries / RBAC / dashboards      |
       | optional governed request / approval         |
       +------------------+---------------------------+
                          ^ read/sync and requests
                          |
              +-----------+------------+
              |         GitHub         |
              | issue / PR / CI / repo |
              +-----------+------------+
                          ^
                          |
         Windows workstation / always-on Linux runner
       +----------------------------------------------+
       | Local application repository                 |
       |  MISSION.md, engineering.md, harness/, etc.  |
       |  Medin factory consumer -> pinned Archon     |
       |  Archon SDLC workflows -> Claude/Codex/agent |
       |  Herdr orchestrates user-visible terminals   |
       |  Pi and Hermes remain distinct harnesses     |
       |  optional telemetry exporter -> Port API     |
       +----------------------------------------------+
                          |
                          v
                 staging / test runtime
                 verify evidence / gates
```

**Important trust boundary:** Port never reads `C:\...` or an unpublished Git working tree by virtue of having a GitHub connection. It ingests the **remote** repository and whatever explicitly permitted services or APIs export. A local worktree becomes visible only after Git push or authorized telemetry publishing.

### 1.4 Suggested ownership table

| Object / decision | Authoritative owner | Port treatment |
|---|---|---|
| Source code and branches | Git / GitHub | Synced reference, not alternate editor |
| Backlog issues and dependencies | GitHub + Archon | Synced/queried; optionally created via approved workflow |
| PR checks / protected files | GitHub checks and `harness/harness.config.json` + Archon gates | Dashboard status; do not override gates |
| Archon provider and model tier | Installed Archon configuration | Descriptive metadata only |
| Archon run ID/status/hold evidence | Archon runtime and its persisted run state | Custom adapter, if implemented |
| Human release intent / exclusions | `MISSION.md`, PRD and review | Linked references, not rewritten policy |
| Catalog metadata/ownership | Port blueprints plus synced sources | Governed representation |
| Port workflow approval | Port workflow run | Separate from Archon's merge decision unless explicitly bridged and mapped |
| Secrets and credentials | Local OS secret store, Port secrets/CI secrets | Never put in repo, entity metadata or `port.yml` |
| Local multiplexing | Herdr | Not replaced by Port |

**Primary sources:** [Medin factory README](https://github.com/coleam00/ai-software-factory), [Port overview](https://docs.port.io/getting-started/overview/), [Port workflows](https://docs.port.io/workflows/overview/), [Port MCP server](https://docs.port.io/agent-management/port-mcp-server/overview/).

---

## 2. Verified architecture and boundaries

### 2.1 Cole Medin's factory architecture

The current Medin repository describes a semi-autonomous delivery system: the human selects a release and judges the staging product; the factory derives an ordered backlog, delegates work to agents, obtains independent review, checks runnable application behavior, and creates or merges pull requests subject to its policy. All AI workflow logic lives in **Archon's shared SDLC pack**, not in the factory consumer's Python.

The runtime relationship is:

```text
User-written PRD / GitHub issue
  -> ai-software-factory consumer.py
       -> installed, version-pinned Archon workflow
            -> triage / backlog
            -> issue planning
            -> deliver changes in worktree
            -> independent review / static checks / CI
            -> runtime scenario verification / holdout
            -> repair or discoveries
            -> merge policy and optional deployment
```

Archon itself is a workflow engine: DAG-style YAML definitions coordinate AI steps, scripts and human decisions. The pinned source, exact command signatures and SDLC workflow availability must be verified locally with `factory/pack.json` and `python factory/consumer.py list`. The factory installation brings its own pinned Archon; installing a second global Archon release can produce mismatched workflow behavior.

The live README reviewed on **2026-10-23** displayed pinned revision `1cf9c3f0f6f10301351addb35517ca4fd5879b09` on `factory/sdlc-on-dev`. This is a **snapshot, not an instruction to hard-code that commit**. Upstream moves rapidly and the actual installed `factory/pack.json` is authoritative for your checkout.

### 2.2 Port architecture

Port consists of at least six relevant concerns:

1. **Context Lake / software catalog.** Blueprints define entities and relationships; integrations ingest resources from systems such as GitHub. Port is a context index, not an automatic working-copy mirror.
2. **Workflows.** Governed action graph with triggers, conditions, human inputs/approvals, integration actions and audit. It can integrate with GitHub and external execution services.
3. **Remote Port MCP server.** Lets authorized agents query the catalog and, where permitted, invoke Port actions/workflows from supported clients.
4. **Agent management and registry.** Tracks/governs agents and approved MCPs/skills. Registry entries need not imply execution is *hosted* in Port.
5. **Port AI.** Optional native AI assistant and provider features; not required to use the Port MCP server.
6. **Interface / scorecards / policies.** Engineering portal for ownership, readiness and operational visibility.

Port's own workflows can run AI nodes, and Port offers native integration patterns for several hosted/cloud agents. Those are capabilities you *could* adopt in a separate architecture. In **this** design, duplicating the factory's SDLC state machine in Port is undesirable; keep Port workflows scoped to authorization, catalog updates and request handoff.

### 2.3 Separation of network scopes

- **Port SaaS:** account on `app.port.io` (EU) or `app.us.port.io` (US); internet access needed.
- **Port REST API:** current API documentation uses `https://api.port.io/v1` (EU) or `https://api.us.port.io/v1` (US).
- **Port CLI:** its current installation guide uses `PORT_API_URL=https://api.getport.io/v1` (EU) or `https://api.us.getport.io/v1` (US) for *CLI configuration*. Follow your CLI version's documented hostname; do not interchange regional suffixes casually.
- **Port remote MCP:** `https://mcp.port.io/v1` (EU) or `https://mcp.us.port.io/v1` (US).
- **Local workspace:** Windows/WSL path or Linux path. Port cannot reach it by default.
- **GitHub:** the synchronization/execution bridge, when installed and granted permission.

**Data residency:** Choose the appropriate Port region based on your organization and contractual needs, not automatically on your local physical location. Before registering confidential customer work, verify applicable retention, data export, third-party transfers and organization permissions. Agent prompts and telemetry may contain secrets or customer data; only publish curated metadata.

---

## 3. What is native, what requires engineering

| Desired capability | Technical mechanism | Availability / confidence | Guidance |
|---|---|---|---|
| Register repo | GitHub Ocean native integration | Documented | Phase 1 |
| Track GitHub issues, PRs, workflow runs | GitHub Ocean ingestion | Documented, resource mapping/permissions dependent | Phase 1 |
| Store custom `factory` metadata | Port blueprint/entity + `port.yml` GitOps | Documented building blocks | Phase 2 |
| Query Port in Claude Code | Official remote HTTP MCP, OAuth | Documented | Phase 2 |
| Query Port in Codex CLI | Official remote HTTP MCP, OAuth | Documented | Phase 2 |
| Query Port in VS Code | Official HTTP MCP server or gallery | Documented | Phase 2 |
| Use Port from Pi or Hermes | Standard MCP only if supported by installed version | **Client-dependent, not verified as native** | Test individually |
| Control Herdr panes from Port | No evidence of native integration | Custom work / out of scope | Retain Herdr |
| Trigger GitHub Actions | Port GitHub Ocean `dispatch_workflow` action | Documented, write permissions required | Optional Phase 4 |
| Launch a local Archon run from Port | GitHub dispatch+worker, or private webhook+bridge | **Custom adapter/workflow required** | Phase 4 after telemetry |
| Automatically ingest Archon run IDs, reviewer verdicts | Custom `archonRun` exporter/API upserts | **Custom code required** | Phase 3 |
| List Claude/Codex/Pi/Hermes workers in catalog | Custom agent blueprint/entity updates | Documented Port schema; custom ingestion | Phase 3 |
| Enforce who can query Port through MCP | Port RBAC; optional `x-read-only-mode: 1` | Documented | Phase 2 |
| Enforce who may merge a PR | GitHub branch protections + Archon merge gate | Outside Port; already in Medin factory | Do not delegate |
| Import local uncommitted source transparently | N/A | **Not supported by mere GitHub connection** | Explicitly push or export |
| Port fully self-hosted/offline local | Not established; Port platform is hosted | **Do not assume** | Use SaaS account |

**Design rule:** Begin with **one-way GitHub -> Port** plus **read-only Port MCP -> harness**. Add **one-way Archon metadata -> Port** next. Only then consider **Port approval/request -> GitHub/Archon**; preserve a single ownership model for every transition.

---

## 4. Choose the right rollout model

### Model A — Observability and context (recommended initially)

- GitHub remains the backbone of source, issues and PRs.
- Port ingests those resources and offers read-only MCP catalog tools.
- Archon remains initiated manually or by its own native scheduler.
- Port has **no merge, deployment or local-shell permission**.

**Advantages:** minimal attack surface, rapid proof of value, trivial removal, no split-brain scheduler. **Limitations:** Archon internal workflow statuses invisible unless mirrored.

### Model B — Governed requests, Archon execution (recommended next)

- A human or approved agent submits a Port workflow to *create a GitHub issue* or *request an Archon run*.
- Archon independently consumes the issue and runs its shared lifecycle.
- Port reflects execution by GitHub data and optionally the telemetry adapter.
- Approval in Port authorizes *starting/requesting work*, **not merging code**.

**Advantages:** governed intake and clear ownership. **Limitations:** correlation/status adapter must be implemented for meaningful progress.

### Model C — Port dispatches a worker directly (advanced)

- Port workflow calls GitHub `workflow_dispatch`, a protected webhook/private worker, or a Port execution-agent-managed webhook.
- An authorized worker runs `python factory/consumer.py run ...` in the correct application checkout.
- Worker records correlation ID and run result back to Port.
- Archon still performs all SDLC work, with Port acting as outer orchestration.

**Risks:** double scheduler, duplicate runs, untrusted issue payloads, a local runner executing unreviewed code, inaccurate workflow “success” when Archon detached the real run, and human approval semantics that might diverge. Defer this until local tests and state observability pass.

**Reject:** Port and Archon independently polling the same issues and both merging; Port writing files protected by Archon's gate; launching direct Claude/Codex build subprocesses from Port that bypass `archon-*` review/verification.

---

## 5. Preflight and local repository audit

### 5.1 What you must have

- A **specific application repo** on the local workstation (or Linux host), not the `ai-software-factory` installer repo itself.
- Git remote to **GitHub** (Medin factory uses `gh` for issues, PRs, checks and merges).
- Git, Python 3.10+, `gh` authenticated with workflow scope, `bun`, `uv`, and a working coding provider (Claude or Codex, etc.).
- For Port CLI: Node.js/npm, installed `@port-labs/port-cli` (or released binary).
- An authorized **Port organization** and permission to install GitHub Ocean.
- Port region selected and tested, with policy approval for storing project metadata.
- A small, safe GitHub issue for the first manual test.

### 5.2 Windows 11 — inspect, do not modify

Run in **PowerShell** from the actual *application repo*. Replace the path with the real one. This is a *template*; do not paste fictitious paths as literal values.

```powershell
Set-Location 'D:\path\to\your-application-repo'
Get-Location
Test-Path .git
Get-ChildItem -Force | Select-Object -First 25 Name

git status --short --branch
git remote -v
git branch --show-current
git log -1 --format='%h %s'

git --version
python --version
gh --version
bun --version
uv --version
node --version
npm --version
claude --version
codex --version
```

Some harnesses may not be installed on the system-wide `PATH`; an unavailable `claude`, `codex` or `bun` should be investigated **without** uninstalling or replacing a working Herdr-managed installation.

Check the installed factory **without assuming it exists**:

```powershell
Test-Path .\factory\consumer.py
Test-Path .\factory\pack.json
Test-Path .\engineering.md
Test-Path .\MISSION.md
Test-Path .\harness\harness.config.json
Test-Path .\harness\END-TO-END.md
Test-Path .\.factory\holdout\HOLDOUT.md
```

If files exist, inspect them *before upgrading*:

```powershell
Get-Content .\factory\pack.json
Get-Content .\harness\harness.config.json
python .\factory\consumer.py doctor
python .\factory\consumer.py list
```

**Never** run factory `init` in the installer checkout, your Herdr source, a parent monorepo root, or another project by accident. Check `Get-Location` and `git remote -v` before modifying files.

### 5.3 GitHub authentication

```powershell
gh auth status
# Only if missing auth or insufficient scopes:
gh auth login -s workflow
gh auth setup-git

gh repo view --json nameWithOwner,url,defaultBranchRef
```

Use an authorized repository and a least-privilege account. If the repository is private, confirm that Port's GitHub application is permitted to see it. If the repository is not yet pushed, do not assume creating it is harmless: decide visibility and remote owner explicitly, then push intentionally.

### 5.4 Backup baseline and collect evidence

Before any install or model change:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportDir = Join-Path $HOME "factory-port-preflight-$stamp"
New-Item -ItemType Directory -Path $reportDir | Out-Null

git status --short --branch | Out-File "$reportDir\git-status.txt"
git remote -v             | Out-File "$reportDir\git-remotes.txt"
if (Test-Path .\factory\pack.json) {
    Copy-Item .\factory\pack.json "$reportDir\pack.json"
}
if (Test-Path .\harness\harness.config.json) {
    Copy-Item .\harness\harness.config.json "$reportDir\harness.config.json"
}
```

Keep this backup private; do not upload local config, credentials or unredacted `doctor` output into Port. Do not stage all modified files blindly: `git diff --stat` and `git diff --check` first.

### 5.5 WSL versus Windows versus server

- **Windows PowerShell:** suitable for first manual lap. The factory can use Windows Task Scheduler later; documented scheduler runs while signed in. Pay attention to Windows path escaping and executable resolution.
- **WSL:** optional Unix-oriented execution environment; do not put the same checkout under competing Windows and Linux schedulers. Authenticate tools *inside* the chosen environment.
- **Always-on Linux VPS:** preferred for unattended work. Keep scheduled Archon workflow and app runtime on the same durable execution host. Adopt a dedicated non-root OS account and systemd user units or equivalent.
- **GitHub-hosted runner:** ephemeral: suitable for bounded validation, **not automatically** a durable always-on local Archon controller.

Sources: [Medin README](https://github.com/coleam00/ai-software-factory), [Archon repo](https://github.com/coleam00/Archon), [Medin first-hour guide](https://github.com/coleam00/ai-software-factory/blob/main/docs/first-hour.md).

---
## 6. Install or verify Medin's factory and Archon

**Skip reinstall when the application repo already has a healthy consumer.** These instructions show the official installer route for an otherwise unconfigured application repository. Do not treat `factory init` as a generic Port installer: it installs the *Medin/Archon* side only.

### 6.1 Clone the installer OUTSIDE the application repository

Windows PowerShell:

```powershell
# Application checkout: must already be selected.
Set-Location 'D:\path\to\your-application-repo'
$AppRepo = (Get-Location).Path

# Installer checkout lives under your home, not inside the app repo.
$FactorySource = Join-Path $HOME 'ai-software-factory'
if (-not (Test-Path $FactorySource)) {
    git clone https://github.com/coleam00/ai-software-factory $FactorySource
} else {
    git -C $FactorySource status --short
    # If clean, optionally update with: git -C $FactorySource pull --ff-only
}

# Review upstream README AND bin/factory.py before executing downloaded code.
Get-Content (Join-Path $FactorySource 'README.md') | Select-Object -First 100

# If this application is not yet configured with the factory:
Set-Location $AppRepo
python (Join-Path $FactorySource 'bin\factory.py') init
```

Linux/macOS/WSL equivalent:

```bash
cd /path/to/YOUR_APPLICATION_REPOSITORY
git clone https://github.com/coleam00/ai-software-factory "$HOME/ai-software-factory"
python3 "$HOME/ai-software-factory/bin/factory.py" init
```

Before executing `init`, ensure the repo is correct and make a recoverable commit or backup. The installer is third-party executable code and may add/update local files. The README says it writes factory/project templates, installs the pinned Archon source, preserves project configuration across upgrades, and appends a pointer to `factory/WORKFLOW_POLICY.md` in root `engineering.md`. It does **not** log in your provider, configure model tiers, or schedule work on its own. After installation inspect actual `git diff` and pinned `pack.json`.

### 6.2 Configure Archon's chosen coding provider

The installed Archon source contains its native provider settings and supported model identifiers. Do not blindly copy model names from another revision. Validate which harness and model tiers are actually supported by the pinned Archon revision. A local Herdr pane working with Claude Code does *not* imply Archon knows where Claude's binary or authentication is.

Actions:

1. Identify the provider that Archon will execute under during the **first manual lap** (recommend one: Claude Code or Codex CLI).
2. Ensure the provider CLI can run a harmless one-turn request in the same OS user/context where Archon will launch.
3. Configure model tiers in Archon's native settings per installed docs; preserve any previously working settings.
4. Verify the Archon workflow list and consumer doctor.
5. Leave Pi and Hermes as separately configured tools; neither needs to be installed or replaced just to integrate Port.

```powershell
python .\factory\consumer.py doctor
python .\factory\consumer.py list
Get-Content .\factory\pack.json
```

A **successful `doctor` is not proof of live provider OAuth, runtime isolation, reviewer access or end-to-end CI**. A real `archon-ship` run must be observed later.

### 6.3 Establish the product's true validation policy

Medin's installer expects three project-specific documents:

- `MISSION.md`: purpose and out-of-scope constraints. This is the authoritative defense against plausible but unwanted features. Propose at least seven concrete exclusions and have the product owner edit them.
- `harness/END-TO-END.md`: two–five *current* user journeys (or intended journeys if starting from **PRD only**) with assertions that demonstrate real user value, not merely a 200 HTTP status.
- `.factory/holdout/HOLDOUT.md`: independently composed cross-feature scenarios. The pathname alone does **not** make them hidden: isolate sensitive tests from builder worktrees if true holdout integrity is required.

Also inspect `engineering.md`, `factory/WORKFLOW_POLICY.md`, `factory/RUNTIME_HOST.md`, `harness/harness.config.json`. Configure unit/lint/type/static commands and runtime scenario preparation using the project's actual stack. Never copy stock placeholder journeys for a different kind of app: the runtime gate may reject all PRs.

For an existing FastAPI app, journeys might cover a health endpoint, an authorized API request, correct response schema, a persistence round trip, and a failing permission check. For a JS web app, use app-specific browser/user flow probes. For a PRD-only app, the initial issue must create its runnable skeleton and name its start/health/build-identity contracts. Do not fabricate these as already-existing facts.

### 6.4 Protect the governance files

The source README specifically calls out `required_checks` and `protected_paths` in `harness/harness.config.json`:

- **`required_checks`**: name required CI jobs explicitly where GitHub cannot expose branch protection (notably some free private-repo cases). Leaving it unknown can cause merge holds. Use actual job *names*, not guessed YAML filenames. The string `"none"` is supported but inappropriate if your gate needs CI.
- **`protected_paths`**: restrict modifications to policy and validation files so an agent cannot weaken the rules governing its PR. Default patterns include `MISSION.md`, `FACTORY.md`, `FACTORY_RULES.md`, `harness/**`, `.factory/**`, `factory/**`. Include `engineering.md`, the GitHub CI workflow(s), and any project-specific permissions/security policy.

Inspect the file and modify its **existing schema**; do not replace the whole JSON with an example from this report. Treat edits to the protected paths as explicitly human-reviewed governance changes.

### 6.5 Important command behaviors

```powershell
python .\factory\consumer.py doctor
python .\factory\consumer.py list
python .\factory\consumer.py status --all --json
```

The factory's `consumer.py` is the supported consumer entry point. Do not invoke direct coding-agent subprocesses from an ad hoc "Port adapter" in place of shared Archon SDLC workflows. Do not copy or fork workflow YAML into application-local replacements merely to satisfy Port.

**Sources:** [factory README — installation and instructions](https://github.com/coleam00/ai-software-factory#instructions-for-the-agent), [first hour](https://github.com/coleam00/ai-software-factory/blob/main/docs/first-hour.md), [Archon](https://github.com/coleam00/Archon).

---

## 7. Provision Port and connect GitHub

### 7.1 Provision the SaaS organization

1. Open the [Port app](https://app.port.io/) and sign in or create the appropriate organization; if the tenant is US-hosted, use [Port US](https://app.us.port.io/).
2. Record the selected **region** and the approved organization name (not credentials) in a private operations note.
3. Identify the owner/admin who may configure integrations, blueprints and workflow permissions.
4. Decide visibility: start with **one test repository**; do not grant a connector blanket access to all customer repositories without approval.
5. Confirm plan, seat, entity, automation and AI quotas in your actual tenant. Port pricing changes; don't assume unlimited workflow or agent execution.
6. Prefer a separate sandbox organization for experimentation if the account plan allows it. Do not mix test entities with the production service catalog.

Port is a hosted system; there is no need to `docker compose up` a local Port server simply to onboard a local project. You **may** deploy local supporting components (e.g., Port CLI, Archon worker, private Port execution agent), but these are not the Port application itself.

### 7.2 Connect GitHub Ocean (not the deprecated GitHub connector)

In Port: **Settings / Data sources / Integrations** (menu labels may change) -> **GitHub (Ocean)** -> **Connect**. The direct docs are [GitHub Ocean](https://docs.port.io/context-lake/ingestion/ingest-data-into-port/native-integrations/available-integrations/git/github-ocean/).

Recommended integration options:

| Choice | Recommended setting | Reason |
|---|---|---|
| Provider | GitHub | Medin factory uses `gh` today |
| Integration | **GitHub Ocean** | Current supported data pipeline and integration actions |
| Installation | Hosted by Port, for proof of concept | Avoid operating your own ingestion instance |
| Authentication | GitHub App with required read permissions | Narrow repo/org scope |
| Repository access | Selected repositories only (initially) | Least privilege and data minimization |
| Data resources | Repos, issues, pull requests, workflow runs, deployments as needed | Covers factory evidence |
| Action writes | Leave out where possible initially | Prevent accidental mutation |
| Default blueprint creation | Allow on a new empty Port tenant; review on an existing tenant | Avoid duplicate blueprint families |
| Live updates | Enabled with appropriate GitHub webhook/app permissions | Reduce sync delay; confirm by test |

Important: the **older GitHub app integration** and **GitHub Ocean** are different installation paths. Port documents migration behavior and warns that enabling default resource creation when migrating can create duplicate blueprints. Inspect the actual installation screen and existing resources before changing any default.

### 7.3 Verify GitHub ingestion and mappings

In Port's software catalog / data sources:

1. Find the target GitHub repository and check its `owner/repo` name, default branch, URL and visibility.
2. Open one known issue and pull request; if none exists yet, create a small manual issue in the GitHub UI or `gh` and refresh/resync.
3. Check the connector's synchronization logs. Use the Port UI mapping editor to see **actual** blueprint identifiers such as the repository/issue/PR types created in your tenant. These names are mapping-dependent; do **not** assume a hard-coded identifier like `service` already exists.
4. Confirm ingestion of GitHub Actions workflow runs if that resource mapping is enabled and relevant.
5. Check that only intended repositories are visible to a regular Port reader.

**Acceptance example:** Port displays the exact GitHub repo `OWNER/REPO`, one real GitHub issue, and a matching PR/check status after the next sync. Record the refresh delay. A Port empty catalog is not proof that GitHub has no data: permissions, mappings or sync may be incomplete.

### 7.4 `port.yml` vs `port-app-config.yml` vs `factory/pack.json`

These three are **not interchangeable**:

| Filename | Who reads it | Where | Purpose |
|---|---|---|---|
| `port.yml` | GitHub/Port GitOps ingestion | **Application repo**, default branch | Declares catalog entity metadata |
| `port-app-config.yml` | GitHub Ocean integration | Org-level `.github-private` repo when `repoManagedMapping: true` | Declares Port ingestion mapping/config |
| `factory/pack.json` | Medin consumer/Archon | Application repo | Pins installed SDLC source/workflow expectations |

GitHub Ocean's `repoManagedMapping: true` does **not** accept a per-repository `port-app-config.yml` for the repo-local project in the same way `port.yml` works. Use the Port UI mapping or the designated organization-level config location per the [GitHub Ocean docs](https://docs.port.io/context-lake/ingestion/ingest-data-into-port/native-integrations/available-integrations/git/github-ocean/).

---

## 8. Create a factory catalog blueprint

Port's **blueprints** are data-model schemas. A blueprint is not an Archon workflow and does not run code. You can retain GitHub's default repository blueprint and create a separate custom `archonFactory` blueprint to track factory-specific metadata. If your Port tenant already has a suitable `service`/`component` blueprint, enriching it may be preferable, but the independent example below is safer as a demonstration.

### 8.1 Recommended minimal model

**Blueprint identifier:** `archonFactory`  
**Entity identifier:** `OWNER-REPO` (for example `acme-invoice-api`, chosen to be unique and stable)  
**Source of truth:** application repo `port.yml` for static metadata; optional API for dynamic status; GitHub Ocean for Git-derived entities.

Suggested fields:

| Field | Type | Example | Semantics / source |
|---|---|---|---|
| `githubUrl` | string URL | `https://github.com/OWNER/REPO` | Remote repository; required |
| `engine` | string | `Archon` | SDLC orchestration engine |
| `consumer` | string | `coleam00/ai-software-factory` | Distribution/consumer |
| `executionHost` | string | `Windows-local` | Descriptive label, not a hostname or secret |
| `defaultBranch` | string | `main` | Actual `gh repo view` default branch |
| `provider` | string | `Claude Code` or `Codex CLI` | What the installed Archon uses; avoid fictional cross-provider readiness |
| `missionPath` | string | `MISSION.md` | Relative repo policy reference |
| `policyPath` | string | `factory/WORKFLOW_POLICY.md` | Relative repo policy reference |
| `autonomy` | string | `supervised` | Operational control level |
| `scheduleEnabled` | boolean | `false` | Manual/manual-first |
| `lifecycleOwner` | string | `Archon` | Avoids split-brain ownership |

Avoid adding passwords, API tokens, environment variables, local usernames, private server IPs, raw prompts, full holdout bodies or unredacted agent logs. Use a `repository` relation *later* once you know the actual GitHub Ocean repository blueprint identifier/entity identifier.

### 8.2 Create in Port UI (lowest risk)

Open the Port blueprint/data model editor -> **Add blueprint**; create `archonFactory`, add the fields above and designate `githubUrl` required. Review its generated schema before saving. Create a catalog page if desired. In an existing production tenant, prefer namespaced identifiers such as `medinArchonFactory` to avoid collisions with organization conventions.

### 8.3 Equivalent REST blueprint payload

The following JSON uses Port's documented `POST /v1/blueprints` contract. It is an **example for review**, not something applied to your tenant here. Save the file as `archon-factory-blueprint.json` **outside** the app checkout until reviewed; the admin can apply via API or import a custom definition via Port UI.

```json
{
  "identifier": "archonFactory",
  "title": "Archon-backed AI Factory",
  "description": "Repository with a Medin factory consumer and Archon SDLC workflows.",
  "schema": {
    "properties": {
      "githubUrl": { "type": "string", "format": "url", "title": "GitHub URL" },
      "engine": { "type": "string", "title": "Workflow engine" },
      "consumer": { "type": "string", "title": "Factory consumer" },
      "executionHost": { "type": "string", "title": "Execution host class" },
      "defaultBranch": { "type": "string", "title": "Default branch" },
      "provider": { "type": "string", "title": "Configured agent provider" },
      "missionPath": { "type": "string", "title": "Mission path" },
      "policyPath": { "type": "string", "title": "Workflow policy path" },
      "autonomy": { "type": "string", "title": "Autonomy mode" },
      "scheduleEnabled": { "type": "boolean", "title": "Scheduler enabled" },
      "lifecycleOwner": { "type": "string", "title": "SDLC owner" }
    },
    "required": ["githubUrl"]
  },
  "relations": {}
}
```

**Notes:** `schema.properties` defines the actual fields; entities carry corresponding values in `properties`. This is **not** the structure of a `port.yml`; the latter includes a `blueprint` reference and entity values. If the blueprint identifier exists, inspect it before creating a duplicate. Port's API rejects mismatched property types.

### 8.4 API smoke test (optional; PowerShell)

The Port CLI/UI is usually easier for onboarding. REST is useful for automation and demonstrates how telemetry is ingested later. Obtain a dedicated credential from Port's approved organization credentials screen; do not display it or commit it. This example assumes you have already provided **session-scoped** environment variables through a secure process, not stored them in the repository.

```powershell
# Port REST API region (this is Port API, not MCP):
$PortApi = 'https://api.port.io/v1'      # EU
# $PortApi = 'https://api.us.port.io/v1' # US

# Required: $env:PORT_CLIENT_ID and $env:PORT_CLIENT_SECRET are set
# in your current, trusted PowerShell process. Never echo their values.
if (-not $env:PORT_CLIENT_ID -or -not $env:PORT_CLIENT_SECRET) {
    throw 'Set PORT_CLIENT_ID / PORT_CLIENT_SECRET using a secret store first.'
}

$authBody = @{
    clientId     = $env:PORT_CLIENT_ID
    clientSecret = $env:PORT_CLIENT_SECRET
} | ConvertTo-Json

$auth = Invoke-RestMethod -Uri "$PortApi/auth/access_token" `
    -Method POST -ContentType 'application/json' -Body $authBody

if (-not $auth.accessToken) { throw 'Port token response omitted accessToken.' }
$headers = @{ Authorization = "Bearer $($auth.accessToken)" }

# Pure read: list current blueprints. Avoid printing the token or auth body.
$blueprints = Invoke-RestMethod -Uri "$PortApi/blueprints" -Headers $headers
$blueprints | ConvertTo-Json -Depth 4 | Out-File '.\port-blueprints-redact-before-sharing.json'
```

The auth endpoint uses JSON keys **`clientId`, `clientSecret`**; the response includes **`accessToken`** and `expiresIn`. This is the REST API credential flow, **not** the MCP OAuth machine token grant at `/v1/token`. The endpoints and token shapes must not be interchanged. For a private repo, store the readout outside the tracked root and delete it after inspection.

Only after reviewing the tenant and permissions, an admin may submit the blueprint JSON:

```powershell
$definition = Get-Content .\archon-factory-blueprint.json -Raw
Invoke-RestMethod -Uri "$PortApi/blueprints" `
    -Method POST -Headers $headers -ContentType 'application/json' -Body $definition
```

If you do not need API-based provisioning, **omit this write** and use the Port blueprint UI. Reference: [Create a blueprint](https://docs.port.io/api-reference/create-a-blueprint/); [REST ingestion and authentication](https://docs.port.io/context-lake/ingestion/ingest-data-into-port/api/ingest-via-api-overview/).

---

## 9. Declare your repository in `port.yml`

### 9.1 Add a minimal descriptive manifest

Create `<APPLICATION_REPO>/port.yml` on a **branch that will be merged to the default branch**, after the `archonFactory` blueprint exists. Do not put it in `~/ai-software-factory` installer checkout. Replace all placeholder values with real project metadata and match the `archonFactory` blueprint's exact field names:

```yaml
identifier: OWNER-REPO
blueprint: archonFactory
title: OWNER/REPO
properties:
  githubUrl: https://github.com/OWNER/REPO
  engine: Archon
  consumer: coleam00/ai-software-factory
  executionHost: Windows-local
  defaultBranch: main
  provider: Claude Code
  missionPath: MISSION.md
  policyPath: factory/WORKFLOW_POLICY.md
  autonomy: supervised
  scheduleEnabled: false
  lifecycleOwner: Archon
relations: {}
```

Use the actual provider; if provider is Codex, change it. Set `scheduleEnabled: false` until scheduling has been intentionally applied. This field is **descriptive**: editing it does not toggle the real OS timer. The true scheduler is managed by `factory/consumer.py schedule ...`.

A small convention you can enforce with a schema validation check is that these paths exist and `githubUrl` equals `gh repo view --json url`. For example:

```powershell
Test-Path .\MISSION.md
Test-Path .\factory\WORKFLOW_POLICY.md
$GitHubUrl = gh repo view --json url --jq .url
Write-Output $GitHubUrl
```

Commit only after review. A non-running proof-of-concept has no reason to invent a release URL or production health property.

### 9.2 Enable the ingestion behavior and synchronize

Port's GitHub integration GitOps documentation presents **two ways** of ingesting `port.yml`:

1. `port.yml` on the **repository default branch** detected via GitHub push events.
2. Explicit **GitHub Ocean integration mapping** for `kind: file` resources with resync support.

The mapping mechanism is especially useful when you need predictable initial population of files already present before installing the connector. In the connector mapping editor, *merge rather than replace the current `resources` array*. Example for a **single `port.yml` entity**:

```yaml
# APPEND this resource to the GitHub Ocean connector's existing resources.
# Do not paste as a replacement for unrelated organization mappings.
resources:
  - kind: file
    selector:
      query: 'true'
      files:
        - path: 'port.yml'
          organization: YOUR_GITHUB_ORG  # optional when githubOrganization is configured
          repos:
            - name: YOUR_REPO
              branch: main
    port:
      entity:
        mappings:
          identifier: .content.identifier
          title: .content.title
          blueprint: .content.blueprint
          properties:
            githubUrl: .content.properties.githubUrl
            engine: .content.properties.engine
            consumer: .content.properties.consumer
            executionHost: .content.properties.executionHost
            defaultBranch: .content.properties.defaultBranch
            provider: .content.properties.provider
            missionPath: .content.properties.missionPath
            policyPath: .content.properties.policyPath
            autonomy: .content.properties.autonomy
            scheduleEnabled: .content.properties.scheduleEnabled
            lifecycleOwner: .content.properties.lifecycleOwner
```

**Integration YAML caution:** the example depicts a complete top-level `resources` structure for clarity. If the integration already contains mappings for repositories/issues/PRs, add just the new `- kind: file` item to **the existing `resources` list**, preserving everything else. Save the old YAML first. Port's documented mapping also uses optional `enableMergeEntity: true` in an example for `port.yml`; whether that is needed depends on whether multiple mappings target the same entity. Choose a consistent single ownership policy and validate resync. Do not enable two competing mappings creating different shapes for the same identifier.

If a repo has **multiple entities** in one `port.yml` (YAML list), Port documents a separate `itemsToParse: .content` mapping and uses `.item.*`. The one-entity example above is intentionally simpler.

### 9.3 Push and verify

```powershell
Set-Location 'D:\path\to\your-application-repo'
git checkout -b chore/port-catalog-integration
git add port.yml
git diff --cached --check
git diff --cached -- port.yml
git commit -m "chore: declare Archon factory in Port catalog"
git push -u origin chore/port-catalog-integration

gh pr create --title "Register factory in Port" `
    --body "Adds Port catalog metadata only; does not alter Archon execution."
```

Review and merge according to your repository's existing branch policy. On a factory-managed repo, changing a protected `port.yml` may require human approval; that is intentional. **Do not bypass policy to force the metadata in.** After merging to the default branch:

- In Port, verify the `archonFactory` entity appears exactly once.
- Verify the GitHub URL and `scheduleEnabled: false` fields.
- If not ingested, check connector GitHub access, `push` event delivery, mapping branch, blueprint identifier and property schema; perform integration resync where supported.
- If the `port.yml` existed before the connector was installed, Port documentation warns that a push/update to the file may be needed for the push-event path. Explicit `kind: file` mapping + resync is the predictable recovery.

**Source:** [Port GitOps with GitHub Ocean](https://docs.port.io/context-lake/ingestion/ingest-data-into-port/native-integrations/available-integrations/git/github-ocean/gitops/).

---

## 10. Install and authenticate Port CLI

Port CLI (`port`) is a client for the Port API, useful for viewing blueprints, automating catalog operations, inspecting JSON from scripts and exporting a tenant configuration. It is **not** Port's AI software factory worker. Use remote MCP for interactive agent reasoning and CLI for deterministic shell scripts.

### 10.1 Windows, PowerShell

```powershell
node --version
npm --version
npm install -g @port-labs/port-cli
port --version
port --help
```

Do not install the older experimental package `@port-experimental/port-cli` or the deprecated local MCP package `mcp-server-port` as a substitute.

### 10.2 Interactive user authentication (preferred for exploration)

```powershell
port auth login
# For a US tenant, review the installed CLI's --region choices:
port auth login --help
port api call /blueprints
port api blueprints list
```

This browser login is under the interactive user. The CLI may cache a token at `~/.port/creds.json`, so protect the user profile and do not commit those files. If authentication selected the wrong Port organization/region, explicitly re-login using the CLI's region option instead of mixing endpoints.

### 10.3 Machine auth (automation only)

Port's CLI documentation accepts:

```text
PORT_CLIENT_ID
PORT_CLIENT_SECRET
PORT_API_URL
PORT_CONFIG_FILE
PORT_DEFAULT_ORG
```

For CLI in the documented default EU configuration, Port's CLI guide uses `https://api.getport.io/v1`; for US, `https://api.us.getport.io/v1`. The REST API pages also use `.port.io` hostnames, as documented in section 2.3. Use the endpoint specified for the installed client and region; `port api call /blueprints` is the definitive connectivity test.

Store machine credentials in a dedicated local secret manager or protected process environment. Port's CLI supports `~/.port/.env` and `~/.port/config.yaml`, but files containing secrets should have restricted permissions and should **never** reside under a shared application repository. Prefer a limited-scope service account to a personal user's long-lived credentials.

### 10.4 Export a backup before changing live blueprints

```powershell
$backupDir = Join-Path $HOME 'port-admin-backups'
New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
port export --output (Join-Path $backupDir "port-backup-$stamp.tar.gz")
```

**Careful:** a Port export may expose private engineering catalog data. Secure backups, exclude them from Git, and set a retention policy.

`port compare`, `port import`, `port migrate` and especially `port clear` are administrative operations; use `port --help` and a sandbox for rehearsals. `port clear` deletes resources and is not part of ordinary project setup. `port skills` can sync Port-hosted AI skills into client-specific local tools, but syncing skill instructions does not inject Port's registry/workflow semantics into Archon automatically. Treat agent skills as reviewed, versioned code-like dependencies.

**Sources:** [Port CLI installation](https://docs.port.io/context-lake/consuming-the-lake/port-cli/installation/), [CLI overview](https://docs.port.io/context-lake/consuming-the-lake/port-cli/overview/), [CLI examples](https://docs.port.io/context-lake/consuming-the-lake/port-cli/examples/).

---

## 11. Connect Claude Code, Codex and VS Code via Port MCP

### 11.1 Use Port's **remote** MCP server

Port explicitly recommends the managed/remote server for new deployments. The **old local Docker or `uvx mcp-server-port` repository is deprecated**. Port's remote server works even if Port AI is not enabled or its AI terms have not been accepted. The source documentation lists supported client installation procedures for Claude Code, Codex and VS Code.

| Port region | Organization UI | Remote MCP URL |
|---|---|---|
| EU | `https://app.port.io` | `https://mcp.port.io/v1` |
| US | `https://app.us.port.io` | `https://mcp.us.port.io/v1` |

**Start in read-only mode.** `x-read-only-mode: 1` removes MCP write tools from the client tool list. Without it, Port defaults to `0`: available write tools depend on RBAC. Later, `x-allowed-actions-to-run` can further restrict named actions, but it does not replace Port role permissions.

### 11.2 Claude Code — direct HTTP

From a terminal with `claude` available:

```powershell
# EU example; US substitutions below.
claude mcp add --transport http port-eu https://mcp.port.io/v1 `
    --header "x-read-only-mode: 1"

# US organization:
# claude mcp add --transport http port-us https://mcp.us.port.io/v1 --header "x-read-only-mode: 1"

claude
```

Inside Claude Code, run **`/mcp`** and select `port-eu` or `port-us`; complete browser OAuth while signed in to the intended Port organization. Then ask: **“List the Port blueprints I may view. Find the `archonFactory` entry for OWNER/REPO and summarize its metadata.”**

If `claude mcp add` complains that the server exists, **inspect the current configuration before removing/updating it**. Do not retain a second stale Port entry configured with write access. Port's documentation shows direct HTTP; no `npx mcp-remote` proxy is necessary for Claude Code.

### 11.3 Codex CLI — direct HTTP

```powershell
codex mcp add port-eu --url https://mcp.port.io/v1
codex mcp login port-eu

# For US, substitute:
# codex mcp add port-us --url https://mcp.us.port.io/v1
# codex mcp login port-us
```

To restrict Codex to read-only tools, open **`~/.codex/config.toml`** (on Windows typically `$HOME\.codex\config.toml`). If the server section is present, *add the nested header table* rather than creating duplicate server definitions:

```toml
[mcp_servers.port-eu]
url = "https://mcp.port.io/v1"
enabled = true

[mcp_servers.port-eu.http_headers]
x-read-only-mode = "1"
```

For a US organization use `port-us` and `https://mcp.us.port.io/v1`. Save, restart Codex and open **`/mcp`** to verify the connection. Ask it to query the exact test blueprint and entity. A matching server name in the CLI and config is important; do not configure `port` in one place and `port-eu` in another if you expect settings to apply to the same server.

### 11.4 VS Code — optional catalog access

Port's MCP gallery has a **Port** listing by **port-labs**. Alternatively, use VS Code's **MCP: Open User Configuration** command and merge this into the existing `servers` object:

```json
{
  "servers": {
    "port-eu": {
      "type": "http",
      "url": "https://mcp.port.io/v1",
      "headers": {
        "x-read-only-mode": "1"
      }
    }
  }
}
```

For a US org, use the US endpoint. Start the server, complete browser OAuth, select Port's tools, and ask it to list Port blueprints. Use a *user-level* MCP configuration initially; per-repo `.vscode/mcp.json` would make the connection definition shared with repository contributors and could affect unintended users.

### 11.5 Herdr, Pi and Hermes

Port's documentation does **not** establish that Herdr propagates one MCP server configuration to every multiplexed harness. Nor does it prove that the currently installed versions of Pi and Hermes have a first-party Port connector. Treat each combination as a separate integration test:

1. Confirm the harness version supports remote HTTP MCP and OAuth (or a compatible, supportable proxy).
2. Add the **same Port region endpoint** and read-only policy in that harness's native config.
3. Authenticate the same intended Port org.
4. Query a known `archonFactory` entity.
5. Confirm whether an **Archon-launched** agent inherits access; it may run under a different account, profile, environment or process than the interactive Herdr pane.
6. Record actual auth/token behavior; do not assume a browser OAuth refresh token works in headless CI.

**Recommended first implementation:** Claude Code and Codex only, because their exact Port commands are documented. Bring Pi/Hermes online after a successful test and avoid adding provider-specific assumptions to `factory/consumer.py`.

### 11.6 Headless MCP machine authentication

For CI/noninteractive agents, Port supports the OAuth `client_credentials` grant at the **MCP server** (different from REST API auth):

```bash
# Use only with a dedicated machine account and secure secret variables.
curl -sS -X POST 'https://mcp.port.io/v1/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode "client_id=${PORT_CLIENT_ID}" \
  --data-urlencode "client_secret=${PORT_CLIENT_SECRET}"
```

Response fields include `access_token`, `token_type`, `expires_in` (typically 10,800 seconds / 3 hours). Cache the token until close to expiry; do not exchange it per MCP tool call. Port documents a `client_credentials` rate limit of **50 token requests per 15 minutes per client** as of the research date. US machine auth URL is `https://mcp.us.port.io/v1/token`. OAuth user sessions and machine sessions use different flows. Machine credentials should be service-account-scoped and rotated under organization policy.

A client lacking native machine OAuth may use the `mcp-remote` compatibility proxy connected **to Port's remote endpoint** with a bearer token and read-only header. However, the proxy or long-running process must refresh tokens, and OAuth machine credentials must never be hard-coded into repository JSON. This is more complex than the interactive Claude/Codex route; do not enable until needed.

**Sources:** [Port MCP install](https://docs.port.io/agent-management/port-mcp-server/installation/), [MCP machine auth](https://docs.port.io/agent-management/port-mcp-server/token-based-authentication/), [MCP available tools](https://docs.port.io/agent-management/port-mcp-server/available-tools/).

---

## 12. Run the first controlled issue

Port being connected to GitHub and two IDE agents does not demonstrate that Archon can actually build, test and review code. Validate each system independently and then together.

### 12.1 Select a narrow, safe existing-codebase issue

Pick a small, concrete change that **does not touch** `MISSION.md`, CI definitions, factory policies or production deploy credentials. An example: fix a reproducible bug in a small Python utility with an existing test, or add a low-risk regression test. Ensure the ticket includes observable acceptance criteria and no open dependency.

```powershell
Set-Location 'D:\path\to\your-application-repo'
gh repo view --json nameWithOwner,url

gh issue list --limit 10
```

If necessary, create an issue through GitHub's authenticated UI or:

```powershell
gh issue create --title "test: add a narrowly scoped regression case" `
    --body "Add a reproducible test for the documented existing behavior. Do not change production deployment, factory policy or protected paths. Acceptance: targeted test passes and existing tests remain green."
```

Do not create this example ticket if it is not actually relevant to the repo. Better: file a genuine small bug with a clear oracle and known environment.

### 12.2 Run `archon-ship` explicitly

```powershell
python .\factory\consumer.py doctor
python .\factory\consumer.py list

# Use an actual, authorized GitHub issue URL.
python .\factory\consumer.py run archon-ship `
    --input target=https://github.com/OWNER/REPO/issues/123 `
    --detach --json
```

`--detach` returns an Archon run ID while work continues under Archon's runtime. **Capture that ID** and inspect its state; do not interpret a zero exit code from the consumer wrapper as "PR reviewed and merged".

```powershell
python .\factory\consumer.py get YOUR_ARCHON_RUN_ID --json --events
python .\factory\consumer.py status --all --json
```

Observe issue triage, workspace isolation, committed diff, reviewer findings, CI status and PR creation. Ask: Were independent reviewers actually run? Did the tests run against the claimed commit? Were protected path changes held? Did agent authentication function in the background context?

### 12.3 When to use `archon-lifecycle` instead

The full `archon-lifecycle` sequence includes runtime/holdout verification, repairs/discoveries, merge and optional deployment. It requires properly configured `scenario`, `holdout`, runtime host, review/CI gate and merge policy **before** running. For the first test, keep human merge approval (`merge_mode=approve`) and discoveries in preview. Exact workflow inputs must be taken from the installed workflow's `list`/help/docs, not invented based on another revision.

For a repo containing a PRD only, start instead with the documented backlog workflow:

```powershell
python .\factory\consumer.py run archon-backlog `
    --input prd=PATH_TO_YOUR_PRD `
    --input publication=approve
```

Review proposed issues before publishing; the initial skeleton ticket defines the runnable service health and build identity, so do not assume these paths exist today.

### 12.4 Human approval and initial halt control

Supported Medin commands include:

```powershell
python .\factory\consumer.py status --all --json
python .\factory\consumer.py get YOUR_ARCHON_RUN_ID --json --events
python .\factory\consumer.py approve YOUR_ARCHON_RUN_ID --comment "Approved"
python .\factory\consumer.py cancel YOUR_ARCHON_RUN_ID
python .\factory\consumer.py halt
```

Only approve after reviewing code, independent tests and a real running app. The consumer's `halt` blocks new launches and continuations; it is stronger than pausing the scheduled starter. `pause` stops new timer-triggered laps while allowing existing ones waiting on CI to awaken. `unpause` and `unhalt` have distinct effects. Check status before any recovery change.

### 12.5 Check Port observes GitHub, not fabricated Archon state

When the PR exists:

- Verify the PR appears in Port's GitHub resource catalog.
- Inspect actual PR URL, head SHA, CI status and merge status.
- Correlate the GitHub issue `#123` with the PR in Port using GitHub-derived properties.
- **Do not** mark `archon-ship` "completed" in a custom Port run entity merely because a PR exists. Use the Archon run's own terminal state and evidence.

Only after this manual test should you consider Archon's own `archon-loop` scheduling. Medin's documented scheduling:

```powershell
python .\factory\consumer.py schedule install
# First command previews/writes Archon's schedule trigger; does not apply OS timer.
python .\factory\consumer.py schedule install --apply
python .\factory\consumer.py schedule status
# Uninstall later (only when actually desired):
# python .\factory\consumer.py schedule remove --apply
```

The documented default schedule is **not installed by the factory `init`**. The selected `.factory/schedule.json` workflow, inputs, `parallel` and native OS timer must all be reviewed. Never install a second Port cron performing the same Archon loop. On a Windows workstation, the Task Scheduler timer runs only while that user is logged on; unattended work typically belongs on a durable Linux host. Medin advises an always-on server for serious use.

**Sources:** [Medin factory README](https://github.com/coleam00/ai-software-factory), [first hour](https://github.com/coleam00/ai-software-factory/blob/main/docs/first-hour.md).

---
## 13. Capture Archon run telemetry in Port

### 13.1 What Port can and cannot see by default

GitHub Ocean can ingest repository, issue, PR and GitHub workflow-run information **without modifying Archon**. It does **not** imply that Port has authoritative knowledge of an Archon DAG's node state, independent reviewer transcripts, retry history, working-tree isolation, holdout outcomes, model/token usage, or the factory consumer's scheduler receipts.

A status bridge is therefore an **engineering task**. Recommended scope:

1. Read `python factory/consumer.py get RUN_ID --json --events` and/or `status --all --json` in the installed version.
2. Record a **canonical sanitized event schema**; keep the original output on its trusted local host.
3. Map Archon run ID, workflow, state, issue/PR URLs, head SHA, start/end timestamps, review/verification *summary*, and observation timestamp to Port.
4. Publish using the official Port entity upsert API.
5. Repeat only when state changes, or at a bounded poll interval. Implement idempotency, retry/backoff and output redaction.
6. Display state in Port; **never** let Port's stale view override Archon's internal truth.

### 13.2 Recommended data flow and identifiers

```text
Archon consumer get/status JSON
  -> version-pinned, read-only mapper
  -> scrub secrets / remove raw prompts and logs
  -> canonical run manifest JSON
  -> port-upsert-run.py
  -> POST Port /v1/blueprints/archonRun/entities?upsert=true&merge=true
  -> Port archonRun catalog entity
  -> dashboard + MCP queries
```

Use stable IDs for joins:

| Key | Example | Owner |
|---|---|---|
| `githubUrl` | `https://github.com/OWNER/REPO` | GitHub |
| `issueNumber` | `123` | GitHub |
| `issueUrl` | `.../issues/123` | GitHub |
| `prUrl` | `.../pull/45` | GitHub |
| `headSha` | 40-character Git SHA | GitHub |
| `archonRunId` | Actual consumer `--json` result | Archon |
| `portWorkflowRunId` | Port-generated workflow execution ID, if applicable | Port |
| `entity identifier` | `OWNER-REPO--RUN_ID` normalized to allowed identifier characters | Adapter |
| `observedAt` | UTC time when source queried | Adapter |

Do not invent a Port workflow-run ID for a manual Archon launch; the two are unrelated until a real Port workflow initiated and correlated the launch. Your bridge should handle **many Archon runs per issue**, and potentially **many PRs or repairs per issue**.

### 13.3 Proposed custom `archonRun` blueprint

An operator with blueprint privileges can create the following complementary schema through Port's UI or REST. Start without relations; later add a relation to your `archonFactory` entity and GitHub repository once identifiers are verified. Do not overload Port's system `_ai_agent` blueprint with *runs*.

```json
{
  "identifier": "archonRun",
  "title": "Archon SDLC Run",
  "description": "Sanitized external execution summary from the Medin factory.",
  "schema": {
    "properties": {
      "runId": { "type": "string", "title": "Archon run ID" },
      "githubUrl": { "type": "string", "format": "url", "title": "Repository" },
      "workflow": { "type": "string", "title": "SDLC workflow" },
      "state": { "type": "string", "title": "Execution state" },
      "issueUrl": { "type": "string", "format": "url", "title": "Issue" },
      "prUrl": { "type": "string", "format": "url", "title": "Pull request" },
      "headSha": { "type": "string", "title": "Head commit" },
      "reviewVerdict": { "type": "string", "title": "Review verdict" },
      "runtimeVerdict": { "type": "string", "title": "Runtime verification" },
      "observedAt": { "type": "string", "format": "date-time", "title": "Last observed" },
      "summary": { "type": "string", "title": "Safe summary" }
    },
    "required": ["runId", "githubUrl", "workflow", "state"]
  },
  "relations": {}
}
```

**State model advice:** keep two fields in a later production schema, `rawState` (original Archon vocabulary) and `canonicalState` (your normalized `queued`, `running`, `blocked`, `succeeded`, `failed`, `cancelled`, `unknown`). Do not claim the factory emits those names today until its actual JSON has been inspected. A generic `state` field above makes the initial bridge version-agnostic.

### 13.4 A hand-authored **sanitized input manifest**

The first bridge proof should be a synthetic/local file, not a speculative parser of undocumented Archon output. Save this as `archon-run-sample.json` outside the tracked repository; substitute only observed facts for a real run:

```json
{
  "identifier": "OWNER-REPO--EXAMPLE-RUN-001",
  "title": "Archon ship example - issue 123",
  "properties": {
    "runId": "EXAMPLE-RUN-001",
    "githubUrl": "https://github.com/OWNER/REPO",
    "workflow": "archon-ship",
    "state": "example-only",
    "issueUrl": "https://github.com/OWNER/REPO/issues/123",
    "prUrl": null,
    "headSha": null,
    "reviewVerdict": null,
    "runtimeVerdict": null,
    "observedAt": "2026-10-23T00:00:00Z",
    "summary": "SYNTHETIC EXAMPLE; not evidence of an actual Archon run"
  },
  "relations": {}
}
```

This is **not** automatically obtained from Archon. It merely proves Port accepts an entity matching the blueprint. For a live run, the mapper must generate the manifest from a version-tested `consumer.py` source schema and omit unavailable optional values. Null values will intentionally clear fields on upsert; if you want to *retain* old values, omit fields and confirm merge semantics, don't send null.

### 13.5 Working reference implementation: controlled manifest upsert (Python stdlib)

This script is suitable as a **narrow transport component** after blueprint creation. It never runs a coding agent, never reads untrusted PR code, and uses only official Port REST endpoints. It does **not** purport to parse Archon's internal state. Its default mode is **dry run**; add `--apply` to write.

Save as `port_upsert_run.py` in a separate integration/tools directory; do not put unreviewed integration tooling into Archon's protected factory paths. Require Python 3.10+.

```python
#!/usr/bin/env python3
"""Upsert a reviewed, sanitized Archon run manifest into Port.

Requires PORT_CLIENT_ID and PORT_CLIENT_SECRET supplied securely by the host.
No external Python packages needed. Safe dry-run by default.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ALLOWED_API_BASES = {
    "https://api.port.io/v1",
    "https://api.us.port.io/v1",
}
REQUIRED_PROPERTIES = {"runId", "githubUrl", "workflow", "state"}


def post_json(url: str, body: dict[str, Any], token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = response.read(2_000_000)
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as exc:
        # Do not print response bodies: they may include data supplied by user.
        raise RuntimeError(f"Port API rejected operation (HTTP {exc.code})") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Port API network failure: {type(exc.reason).__name__}") from exc


def validate_manifest(path: Path) -> dict[str, Any]:
    obj = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        raise ValueError("Manifest must be an object")
    identifier = obj.get("identifier")
    properties = obj.get("properties")
    if not isinstance(identifier, str) or not identifier or len(identifier) > 1000:
        raise ValueError("Missing/invalid stable identifier")
    if not isinstance(properties, dict):
        raise ValueError("Manifest must have a properties object")
    if not REQUIRED_PROPERTIES.issubset(properties):
        raise ValueError(f"Missing required properties: {REQUIRED_PROPERTIES - properties.keys()}")
    for key in REQUIRED_PROPERTIES:
        if not isinstance(properties[key], str) or not properties[key].strip():
            raise ValueError(f"Required property must be a nonblank string: {key}")
    if not properties["githubUrl"].startswith("https://github.com/"):
        raise ValueError("Only GitHub repository URLs are accepted")
    # Fail closed: only send explicitly allowlisted fields.
    allowed_props = {
        "runId", "githubUrl", "workflow", "state", "issueUrl", "prUrl",
        "headSha", "reviewVerdict", "runtimeVerdict", "observedAt", "summary",
    }
    unexpected = set(properties) - allowed_props
    if unexpected:
        raise ValueError(f"Unexpected potentially sensitive property keys: {unexpected}")
    if len(json.dumps(obj)) > 20_000:
        raise ValueError("Run manifest is unexpectedly large; publish summaries only")
    return {
        "identifier": identifier,
        "title": obj.get("title", identifier),
        "properties": properties,
        "relations": obj.get("relations", {}),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--apply", action="store_true", help="Write after review")
    args = parser.parse_args()

    manifest = validate_manifest(args.manifest)
    print(f"Validated: {manifest['identifier']} ({manifest['properties']['state']})")
    print("Keys:", ", ".join(sorted(manifest["properties"])))
    if not args.apply:
        print("DRY RUN. Nothing was sent to Port. Add --apply to publish.")
        return 0

    api_base = os.environ.get("PORT_API_BASE", "https://api.port.io/v1").rstrip("/")
    if api_base not in ALLOWED_API_BASES:
        raise RuntimeError("Unrecognized API host. Set EU or US Port API base explicitly.")
    client_id = os.environ.get("PORT_CLIENT_ID")
    client_secret = os.environ.get("PORT_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("PORT_CLIENT_ID and PORT_CLIENT_SECRET are required")

    auth = post_json(
        api_base + "/auth/access_token",
        {"clientId": client_id, "clientSecret": client_secret},
    )
    access_token = auth.get("accessToken")
    if not access_token:
        raise RuntimeError("Port authentication did not return accessToken")

    blueprint = urllib.parse.quote("archonRun", safe="")
    endpoint = f"{api_base}/blueprints/{blueprint}/entities?upsert=true&merge=true"
    response = post_json(endpoint, manifest, token=access_token)
    print(f"Port upsert accepted: {manifest['identifier']}")
    print("Response keys:", ", ".join(sorted(response)))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, RuntimeError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
```

Usage from the **secure** work environment:

```powershell
python .\port_upsert_run.py .\archon-run-sample.json
# Verify it reports DRY RUN.
# Only in a dedicated Port test tenant, with authorized machine credentials:
# $env:PORT_API_BASE='https://api.port.io/v1'
# python .\port_upsert_run.py .\archon-run-sample.json --apply
```

The sample `--apply` would publish an **example** entity; do not run it in a production Port catalog. Before real usage:

- Create the `archonRun` blueprint and test with `?validation_only=true` via API if desired.
- Replace synthetic input with actual **mapped** consumer state.
- Prevent a later/stale event from regressing `state` using an `observedAt` monotonicity rule or one writer per run.
- Generate deterministic entity identifiers from a namespaced repository/run composite and validate Port's identifier character restrictions.
- Protect credential variables, set strict TLS, use a queue/retry design for large volume, respect API rate limits and avoid giant entity payloads.
- Send only sanitized verdict summaries; store full evidence in GitHub artifact storage/a trusted telemetry backend with tightly controlled access.

**Technical API reference:** [Create an access token](https://docs.port.io/api-reference/create-an-access-token/), [Create an entity](https://docs.port.io/api-reference/create-an-entity/), [API ingestion](https://docs.port.io/context-lake/ingestion/ingest-data-into-port/api/ingest-via-api-overview/). `upsert=true` enables updates to an entity; `merge=true` with upsert is used to merge rather than unconditionally overwrite. Carefully test real-field update behavior in a sandbox.

### 13.6 Mapper design (intentionally version-specific)

Do not write an Archon JSON extractor based on imagined field names. Instead:

```powershell
# Capture a real, non-sensitive run output; keep this file private.
python .\factory\consumer.py get YOUR_ARCHON_RUN_ID --json --events `
    | Out-File (Join-Path $HOME 'archon-get-private.json') -Encoding utf8
```

Then inspect whether it emits a single JSON object or JSON lines/event stream, the shape of terminal states, timestamps and nested execution details, and whether `get --events` has any embedded secrets. Build a schema adapter **pinned to the installed factory/Archon revision**, with unit tests for at least: unknown fields, absent PR, retry, multi-PR, blocked run, cancellation, failure, completed run, malformed JSON, and secret redaction. A failure to parse must produce `unknown` / no update—not `succeeded`.

For production, poll by an OS service or subscribe to a supported Archon event/hook if one is verified in your pin. The bridge may use bounded retries with jitter; avoid a Port side effect inside a merge gate. Publishing Port telemetry must never be a prerequisite for the factory to evaluate its own evidence unless explicitly designed and tested to be fail-closed.

### 13.7 Suggested operational dashboards

Start with fields that have trustworthy sources:

- Open GitHub issues by age, category, dependency and owner.
- Pull requests by change age, reviewer verdict and CI state.
- Archon active / blocked / terminal runs, by workflow and repo (only once adapter works).
- Run identity coverage: fraction with issue URL, PR URL, head SHA and observation time.
- Verification failure categories; records of deliberately faulty calibration where authorized.
- Work awaiting **human approval**, separated into Port approval vs Archon merge approval.
- Duplicate work/claim conflicts, stuck CI waits, failed runtime probes, repeated repair rounds.

Metrics such as cost per successful PR, tokens per issue or reviewer disagreement rate **must not be displayed as numeric facts** until an instrumented and reconciled data source exists. Port can be a dashboard for telemetry; it does not generate missing ground truth.

---

## 14. Optional Port-initiated work patterns

### 14.1 Safest: Port creates a GitHub issue; Archon does the rest

This is the recommended **first write-capable** Port integration, after the read-only baseline works.

```text
Port request form (repo, issue title, acceptance criteria)
  -> Port permissions / optional human approval
  -> GitHub Ocean create_issue integration action
  -> real GitHub issue in permitted repo
  -> Archon archon-loop (its own scheduler) picks up eligible issue
  -> Archon triage/build/review/runtime/merge policy
  -> GitHub state synchronizes back into Port
  -> optional Archon telemetry bridge adds internal run status
```

How to configure in the Port UI:

1. Create a new **Port workflow** in a sandbox. Use a **self-service trigger** (a named, governed request form).
2. Required inputs: target repository (selected from approved catalog entries), title, task description, acceptance criteria, requested priority. Validate issue title/size and restrict to the correct owner/repo.
3. Add a human **input/approval** node if required for policy/cost.
4. Add a **GitHub Ocean integration action** -> **Create an issue**. Port documents the invocation type `create_issue`.
5. Select the actual `installationId` of the GitHub Ocean integration; map exact required fields using Port's workflow editor and the installed integration schema.
6. Restrict execution using Port **workflow permissions**; confirm the GitHub App has issue *write* permission only in the allowed repo(s).
7. Set a conventional issue marker or label only if the factory's actual intake semantics support it. Do not invent a label that makes Archon skip or incorrectly claim the issue.
8. Test with a synthetic **non-executable** request in a test repository and verify exactly one GitHub issue was created.
9. Do **not** create a second Port schedule that launches `archon-loop`; Archon's installed timer already owns backlog progression if enabled.

Port's current workflow action structure uses:

```json
{
  "type": "INTEGRATION_ACTION",
  "installationId": "ACTUAL_GITHUB_OCEAN_INSTALLATION_ID",
  "integrationProvider": "github-ocean",
  "integrationInvocationType": "create_issue",
  "integrationActionExecutionProperties": {
    "EXACT_REQUIRED_FIELDS": "SELECT_IN_CURRENT_PORT_EDITOR"
  }
}
```

This JSON **illustrates the wrapper fields only**, and the `EXACT_REQUIRED_FIELDS` placeholder is not a valid deployable node. The full workflow definition must include trigger/edges and action-specific fields. Use the [current GitHub integration actions reference](https://docs.port.io/workflows/build-workflows/nodes/action-nodes/integration-actions/git/github/) for the selected operation rather than assuming an example for `dispatch_workflow` has the same payload as `create_issue`.

### 14.2 Advanced: Port -> GitHub `workflow_dispatch` -> protected runner -> Archon

Port's GitHub integration action **`dispatch_workflow`** is real and documented. Its essential action config resembles:

```json
{
  "type": "INTEGRATION_ACTION",
  "installationId": "ACTUAL_GITHUB_OCEAN_INSTALLATION_ID",
  "integrationProvider": "github-ocean",
  "integrationInvocationType": "dispatch_workflow",
  "integrationActionExecutionProperties": {
    "org": "YOUR_ORG",
    "repo": "YOUR_REPO",
    "workflow": "request-archon-run.yml",
    "workflowInputs": {
      "issue_number": "{{ .outputs.trigger.issue_number }}"
    },
    "reportWorkflowStatus": true
  }
}
```

The configuration still needs a valid enclosing Port workflow and a GitHub Actions workflow that accepts `workflow_dispatch`. The example interpolation is Port's documented output-reference pattern **only if** the trigger actually defines `issue_number`. Copy/paste from the correct current workflow editor rather than building an unreviewed workflow JSON by guesswork.

The GitHub Actions side must have:

- A trusted worker/runner capable of executing the existing application checkout and pinned Archon.
- Explicit fixed repository/workflow allowlists, not arbitrary repository, command or branch strings from users.
- Input validation (`issue_number` a real issue in the permitted repo), authorized caller, idempotency key / de-duplication, and per-repo concurrency limits.
- Correct GitHub token scopes and gh authentication; don't trust an automatically provided `GITHUB_TOKEN` can push or merge without checking repo policy.
- A trusted branch with tested code; no unreviewed PR checkout on a self-hosted machine with credentialed access.
- Run status reporting that distinguishes **request accepted**, **Archon run launched**, **Archon terminal success/failure**, and **merge confirmed**. A GitHub job that returns the detached run ID is *not* proof of completion.
- Secure handling of provider auth and API spend, cancellation, log retention and failure alerts.

**Runner isolation warning:** a self-hosted GitHub Actions runner on the personal Windows desktop is not equivalent to a sandbox. Never configure untrusted forks/PRs to run privileged code on that host. Prefer a dedicated hardened Linux runner or separately authenticated private worker with a narrow API. Set an explicit maximum concurrency and terminate abandoned runtime instances.

### 14.3 Private-network alternative: Port execution agent

Port has an **execution agent** that consumes action events and calls an internal HTTP endpoint without exposing that endpoint publicly. The current Port workflow document describes a **Webhook** action with `agent: true`; the execution agent transports the action event over a Port-provided Kafka topic or an HTTP polling mode, and calls a reachable private service. This does **not** imply the execution agent can magically run a local shell command—it calls a **service you write and operate**, which then decides whether to launch Archon.

```text
Port workflow -> WEBHOOK agent:true
  -> Port execution agent installed inside trusted network
  -> authenticated private POST /factory/request
  -> factory-bridge service: validate identity, repo, issue & idempotency
  -> existing Medin consumer / Archon
  -> publish correlation + status, enforce human merge gates
```

The agent's Kafka transport may require a **dedicated topic provisioned through Port support**. HTTP polling has documented limitations, including **lack of support for encrypted user inputs and organization secrets in the payload**. Review that constraint before selecting it. Do **not** expose a no-auth `localhost:8080/run?cmd=...` handler or a publicly reachable general-purpose shell endpoint.

**Sources:** [Port execution agent for workflows](https://docs.port.io/workflows/build-workflows/nodes/action-nodes/port-execution-agent/), [execution agent installation and usage](https://docs.port.io/workflows/actions-and-automations/setup-backend/webhook/port-execution-agent/), [GitHub workflow actions](https://docs.port.io/workflows/build-workflows/nodes/action-nodes/integration-actions/git/github/).

### 14.4 Which side gets the scheduler?

Archon should own its own `archon-loop` (and `archon-manager`) schedule on the one designated worker host. Port may own **different** schedules such as catalog hygiene reports or scheduled export health checks. If Port eventually triggers **specific** Archon runs, disable overlapping Archon issue selection for those runs or establish a single durable claim system; otherwise duplicate work is possible even when both schedulers appear healthy.

The distinction between "run is queued", "runner acknowledged" and "run completed and independently verified" must be part of the workflow contract. Configure Port's approval for work request and Archon's merge approval as **separate gates** unless an explicit audited integration is implemented and tested.

---

## 15. Agent/harness inventory and division of responsibilities

### 15.1 What to register

Port documents an AI Agent Registry (including a built-in `_ai_agent` blueprint and custom agent registry patterns). The presence of a catalog entity does not prove the agent is currently reachable or that Port can execute it. For your multi-harness environment, consider a **custom `agentHarness` blueprint** or extend a compatible organization registry model.

Suggested inventory fields:

| Property | Example | Why |
|---|---|---|
| `harnessName` | `Claude Code` / `Codex` / `Pi` / `Hermes` | Clear runtime identity |
| `role` | `builder`, `reviewer`, `researcher` | Avoid ambiguous duties |
| `launchOwner` | `Archon`, `Herdr`, `manual` | Distinguish controller |
| `provider` | `OpenAI`, `Anthropic`, or actual provider | Routing/trust context |
| `modelTier` | `small/medium/large` | Descriptive, only if verified |
| `environment` | `Windows-local`, `VPS` | Deployment class only |
| `mcpPortEnabled` | `false/true` | Test-derived rather than assumed |
| `approvedScopes` | `Port-read-catalog` | Permissions review |
| `agentVersion` | installed/version pinned | Reproducibility |
| `ownerTeam` | team reference | Governance |
| `lastValidatedAt` | UTC timestamp | Identify stale inventory |

Herdr itself is primarily the local multiplex/operator layer; it can have an inventory record, but do not falsely describe it as an SDLC agent equivalent to the coder subprocess. Archon is the orchestrator, Medin's repo is the consumer/distribution, and the coding harness is the executor under the workflow.

### 15.2 Native registry vs custom records

Port's docs discuss native connectors for **Claude managed agents** and **Cursor cloud agents**, along with generic/code-first external agent inventory. A local Claude Code process under Archon is **not necessarily** the same entity as Anthropic's managed-agent cloud resource. Do not claim that Port's Claude managed integration automatically tracks local Claude Code sessions or Archon runs.

The simplest first version is a manually reviewed `agentHarness` inventory updated when configuration changes, with independent remote MCP connectivity tests. Later, use a custom Ocean integration or REST API exporter to ingest verified configuration and health signals. Each exporter should have a single authoritative source; avoid two writers overwriting the same fields.

### 15.3 Optional skills and Port MCP registry

Port also has an MCP registry and skill registry. These are **governance catalogs**, not a replacement for Archon's version-pinned SDLC pack. Use them to publish *approved tool discovery and access policy* for local agents. Do not sync an unreviewed Port skill into the protected factory policy or allow a skill's instructions to override repository invariants.

A worthwhile later skill would answer: "How should an agent fetch the owner, dependencies, deploy environment and operational scorecard of this repository from Port before designing a change?" This is a **context retrieval skill**, not a second `archon-ship` implementation.

**Sources:** [Port agent registry](https://docs.port.io/agent-management/ai-registry/agent-registry/), [External agents](https://docs.port.io/agent-management/external-agents/overview/), [MCP registry](https://docs.port.io/agent-management/ai-registry/mcp-registry/), [Port skills](https://docs.port.io/agent-management/ai-registry/skills/overview/).

---

## 16. Approval, CI, security and secret handling

### 16.1 Threat model

Your combined software factory can affect source code, CI, deployment and production systems. A compromised PR, GitHub issue, Port workflow input, Port MCP tool description, third-party skill or agent prompt is **untrusted data**, not an instruction from the operator. Every integration boundary must resist prompt injection and command injection.

Key boundaries:

```text
untrusted: issue text, PR comments, contributor code, retrieved docs
    -> validate + quote + constrain; never shell-evaluate
trusted: signed config, approved repo and workflow, pinned Archon source
    -> authorize work -> isolate workspace -> run checks
privileged: gh token, Port API/MCP credentials, cloud deploy keys
    -> least privilege, isolated service identity, short-lived token
human-critical: changing mission/policy/required checks, approving merge
    -> separated privileges + logged approval
```

### 16.2 Minimum safeguards

1. **Account isolation.** Separate an interactive Port human account from a machine service credential. Separate local development from unattended worker service accounts. Use GitHub App or fine-grained credentials where supported.
2. **Read-only first.** Every Claude/Codex Port MCP connection initially uses `x-read-only-mode: 1`. In Port RBAC, regular agents should not be administrators.
3. **Repository allowlist.** GitHub Ocean and launch worker should only access explicitly approved repositories; protected branches and mandatory checks remain enabled.
4. **No arbitrary shell.** Port form inputs may contain issue number/accepted types, never `command`, `working_directory`, `script`, `model_prompt_to_execute` or arbitrary `git_ref` without validation.
5. **No secrets in Git.** Never commit Port API credentials, MCP bearer tokens, Claude OAuth tokens, `.factory-env`, CI secrets, or private holdout fixtures.
6. **Respect protected paths.** Factory governance, runtime/verifier inputs and workflow config must be reviewed by a human if changed.
7. **Real verification.** Test execution must use actual candidate code, correct commit identity and real state transitions. Do not accept green probes that only check response code or seed the expected result.
8. **Explicit approvers.** Port request approval and Archon PR merge approval are distinct. If the merge requires a human, no external automation may override it.
9. **Concurrence and spend.** Set one run at a time initially, scoped worktrees, token budgets, finite repairs/retries and optional daily cost ceilings. Collect metrics before increasing concurrency.
10. **Audit and redaction.** Record triggering principal, Port workflow run ID if any, GitHub issue/PR and Archon run IDs; redact prompts, authorization headers, PII and sensitive evidence.
11. **Incident stop.** Know how to `halt` the factory, revoke the GitHub App/Port credentials, disable Port workflows, pause hosted runners and recover a branch safely.
12. **Backup.** Preserve Port blueprint/export snapshots and repository policy diffs before changing schema or worker logic.

### 16.3 How branch protection intersects Port

There can be three concurrent gates:

- **GitHub**: required checks/branch protection, merge rules, review requirements.
- **Archon**: independent reviewers, runtime evidence, protected path checks, issue claims, merge queue policy.
- **Port**: who can create a governed request, execute a workflow, approve a Port input node and see or mutate catalog entities.

They are **not interchangeable**. If Port has a GitHub integration action with permission to merge PRs, disable/hide that action for ordinary factory users unless you deliberately want Port to be an independent authorized merge actor—and then prove it applies **all** Archon constraints. The preferred approach is **no Port merge permissions**, leaving Archon + GitHub as the authoritative merge controls.

### 16.4 Worktree security and runner isolation

- Use one worktree and runtime port per concurrent candidate. Do not share one app database or PID file across worktrees if verification needs isolation.
- Never copy secrets into worktrees accessible to untrusted code or LLM context.
- If running code from external issues/forks on a self-hosted runner, require trusted code-source controls or sandbox it under a fully isolated ephemeral VM/container without credentials.
- When a run pauses on CI, prefer Archon's native wake mechanism; don't implement an independent infinite polling loop in Port.
- Ensure rollback/cleanup of candidate infrastructure, orphaned processes, temp databases and test artifacts, especially after cancellation.
- On Linux, use a dedicated non-root account. Avoid running unattended code as root. Record and review vendor-specific environment requirements before deviating.

### 16.5 Data-minimization policy for Port

| Data | May Port ingest? | Condition |
|---|---|---|
| Repo metadata, safe issues, PR URL/head SHA/CI state | Yes | Authorized GitHub integration and tenant |
| Agent name, selected tier, owning team | Yes | Verified; not client secrets |
| Archon terminal state and sanitized summaries | Yes | Audited exporter + RBAC |
| Full raw task prompts, local `.env`, private client data | No by default | Separate formal data-governance review |
| Hidden holdout test bodies | No by default | Keep isolated from builder and broad catalog access |
| Port/GitHub/LLM OAuth tokens | Never | Secret store only |
| Full unfiltered Archon run events/logs | Not by default | May contain secrets/PII; store and redact outside Port |

**Sources:** [Port RBAC](https://docs.port.io/context-lake/consuming-the-lake/govern-data-access/overview/), [Port workflow permissions](https://docs.port.io/workflows/permissions-and-rbac/permissions/), [MCP permissions and headers](https://docs.port.io/agent-management/port-mcp-server/installation/), [Medin factory security policy details](https://github.com/coleam00/ai-software-factory).

---

## 17. End-to-end validation and acceptance checklist

Do not consider the integration "working" because you saw an OAuth success toast. Validate each data/control path and record concrete evidence (timestamp, repo, branch/SHA, run ID and screenshot or redacted output where permitted).

| ID | Test | Action | Pass criterion | Owner |
|---|---|---|---|---|
| P01 | Local target repo | `git status`, `git remote -v`, `gh repo view` | Actual intended `OWNER/REPO` and default branch confirmed | Local operator |
| P02 | Factory integrity | `consumer.py doctor` | Required workflows found; diagnostics reviewed | Local operator |
| P03 | Archon pin | Inspect `factory/pack.json` | Installed source revision matches expected pack; no duplicate SDLC logic | Local operator |
| P04 | Provider auth | Harmless native agent call under Archon's OS account | Auth succeeds under same runtime, not only Herdr interactive pane | Local operator |
| P05 | Port tenant and region | Login and inspect organization | Correct intended organization/region/role | Port admin |
| P06 | GitHub Ocean | Install with selected repo access | Connector healthy, successful sync, no unknown repos | Port admin |
| P07 | GitHub metadata | Inspect repo/issue/PR | Exact URLs/IDs visible; checks reflect GitHub | Port reader |
| P08 | Blueprint | Inspect `archonFactory` schema | Required properties/types match JSON | Port admin |
| P09 | GitOps manifest | Merge `port.yml`, trigger sync/resync | Exactly one catalog entity with correct properties | Port admin |
| P10 | Port CLI | `port api call /blueprints` | Returns expected tenant blueprints | Local operator |
| P11 | Claude MCP | `/mcp` + list blueprints | OAuth succeeds; Port read-only tools, correct entity | Agent operator |
| P12 | Codex MCP | `/mcp` + list factory | Same org and entity; read-only header in effect | Agent operator |
| P13 | Client least privilege | Attempt to find write tool in read-only session | Write tools absent; RBAC restricts unauthorized user | Security reviewer |
| P14 | First SDLC lap | Run `archon-ship` on safe ticket | Actual run ID and independently reviewed PR; CI status visible | Maintainer |
| P15 | Product checks | Exercise app baseline/negative tests | Real outputs plus baseline identity, deliberate-fault rejection | Maintainer |
| P16 | No Port scheduler | Inspect Port workflows/schedules | No hidden independent Archon loop or merge automation | Port admin |
| P17 | Telemetry dry run | Validate synthetic manifest | No network/Port writes; schema validation passes | Integrator |
| P18 | Telemetry sandbox upsert | `--apply` in sandbox only | Correct `archonRun` entity, idempotent update | Integrator |
| P19 | Status reconciliation | Compare Port vs consumer state | Same run ID, state, update timestamp; never stale terminal claim | Integrator |
| P20 | Approval separation | Request/merge test | Port authorizes request only; Archon gate still enforces merge | Security reviewer |
| P21 | Auth failure | Expire/remove token in safe test | Clearly fails closed; no success marked | Integrator |
| P22 | Offline interruption | Disconnect network/restart worker | Archon source of truth survives; telemetry retries without duplicates | Operator |
| P23 | Rollback | Disable Port access | Archon still processes its manual issue-to-PR lifecycle | Maintainer |

### Acceptance thresholds (recommendation, not vendor guarantee)

- **No data corruption:** Port GitHub and `archonFactory` entities identify the same exact repo; no duplicate mapping.
- **No unapproved writes:** read-only MCP cannot trigger catalog or GitHub mutations.
- **No split-brain:** exactly one owner for issue claims and merge decisions.
- **No false success:** detached Archon launch, GitHub workflow dispatch and Port workflow run must not each be misreported as the others' terminal completion.
- **Observable failure:** provider auth, CI gate, runtime hold, network loss and wrong tenant are distinguishable.
- **Reversible:** disabling the Port connector/workflow leaves local Archon execution and GitHub source/PR history intact.

---
## 18. Troubleshooting

Use the relevant row **before** changing settings. Do not "solve" connectivity problems by increasing permissions or turning off CI/security gates. Save evidence without copying credentials, prompt contents or sensitive app data.

| Symptom | Probable cause | Diagnosis | Safe correction |
|---|---|---|---|
| `factory/consumer.py` missing | Ran commands in the installer checkout or wrong app repo; not installed yet | `Get-Location`, `git remote -v`, `Test-Path .\factory\consumer.py` | Change to actual application repo and install with official `init` after backup |
| `doctor` fails | Missing pinned engine, `bun`/`uv`, workflow mismatch, incomplete install | Read error text, `Get-Content factory/pack.json`, check executable paths | Repair exact dependency/pin; do not install arbitrary newer global Archon |
| `doctor` green but provider launch fails | Native Claude/Codex auth absent in background account | Run harmless provider CLI as Archon OS identity; inspect run events | Reauthenticate/configure native Archon provider settings |
| `gh` cannot open PR | Wrong Git remote, insufficient scope, Git credential mismatch | `gh auth status`, `gh repo view`, `gh auth setup-git` | Correct scopes and Git credential helper with least privilege |
| Local code not visible in Port | Never pushed to GitHub; Port only sees remote | `git status`, compare local/remote SHA | Push reviewed changes; Port is not a local file watcher |
| Port catalog empty | GitHub Ocean not installed, wrong repo access, mapping/filter, resync incomplete | Port connector sync logs; GitHub App installed repos; blueprint list | Fix app permissions or mapping; trigger authorized resync |
| Port imported too many repos | GitHub App too broad / connector filters too broad | Inspect GitHub App installation and Port resource selectors | Narrow to selected repos; assess whether data must be deleted per policy |
| Duplicate repository or issue blueprints | Migrated from legacy connector with defaults enabled | Inspect data model/integration list | Follow Port's GitHub Ocean migration steps, back up before cleanup |
| `port.yml` missing from catalog | Manifest not on default branch, push event not received, no file mapping | `git show origin/main:port.yml`; connector events | Merge to default, inspect mapping; resync or update/push file |
| `port.yml` entity rejected | Blueprint does not exist; mismatched required property/type | Compare blueprint definition and YAML | Create schema first; correct case-sensitive property IDs |
| `port.yml` entity duplicates | Different entity identifier or two competing resource mappings | Inspect entity IDs and connector config | Set deterministic ID; choose one ingestion ownership path |
| `port.yml` update not reflected | Existing file before integration and no push, or selector scoped to wrong branch | GitHub event delivery; connector logs | Update/push to default branch or use `kind:file` resync |
| CLI auth selects wrong organization | Browser OAuth logged into other tenant; wrong region | Port UI org name vs CLI `port api call /blueprints` | Re-login to correct org/region; avoid mixing EU/US endpoints |
| Port CLI `401` | Expired browser token, machine secret invalid, region mismatch | `port auth login`, inspect regional URL, auth only | Refresh auth, validate service credential; don't log tokens |
| Port MCP `401`/OAuth loop | Wrong tenant, expired consent, SSO/DCR issue, client token refresh problem | `/mcp`, browser org, Port MCP install docs; SSO setup | Reauthenticate same org; if SSO DCR problem, contact Port support |
| MCP correct OAuth, no tools | Port RBAC, read-only hiding write tools, wrong client server name | Ask list blueprints; inspect user's rights | Grant only required catalog read permissions; don't set admin by default |
| Codex still lists write tools | Misnamed TOML server table or missing `x-read-only-mode: 1` | Inspect `~/.codex/config.toml`, restart, `/mcp` | Match exact MCP server key and header; retest before allowing agent |
| Claude can query Port manually but Archon agent cannot | Spawned agent under different config/process/OS user | Check actual Archon provider launch context | Configure under worker's native user profile; verify in a real run |
| Pi/Hermes cannot authenticate | MCP transport or OAuth unsupported in installed version | Check native harness docs and runtime | Use supported client/proxy only after careful verification; don't invent native integration |
| Port workflow not creating issue | GitHub action lacks write permission/installation ID/input fields | Port workflow node logs, GitHub App grants | Fix exact GitHub integration node; scope selected repo |
| GitHub workflow dispatch not reporting completion | Self-hosted Ocean actions processor off / callback URL inaccessible | Integration processor config and Port node run | Enable supported actions processor and callbacks, or report status explicitly |
| GitHub workflow appears success before Archon finishes | GitHub job only launched detached Archon run | Compare Port/GitHub job times vs `consumer.py get` | Distinguish **launched** vs **terminal**; add run-ID correlation and polling |
| Port execution agent doesn't call local service | No Kafka topic, polling transport issue, local endpoint inaccessible | Agent logs; Kafka/polling config; firewall; service listening | Set up supported transport and an authenticated internal endpoint |
| `archon-merge-queue` holds all PRs | No available branch protection data or missing explicit required checks | Review hold reason, `harness.config.json`, `gh pr checks` | Define actual required check names, not arbitrary bypass |
| Merge held on governance file | Protected path matched change | Read changed paths and hold evidence | Human review; do not remove path protection as workaround |
| Runtime verification fails before feature exists | Existing-codebase journeys describe future intended behavior | Inspect `END-TO-END.md` and app baseline | Describe real existing behavior, or follow special PRD-only skeleton path |
| Runtime tests pass without exercising app | Weak tests, seeded final state, wrong build identity | Probe actual user transitions and build SHA | Add negative/calibration tests and correct candidate runtime wiring |
| `archonRun` API returns `422` | Invalid entity or missing blueprint property/identifier | Validate blueprint and payload offline; `validation_only` endpoint | Correct field types, ID and URL properties; sanitize payload |
| `archonRun` API `401` after 3h | Expired REST access token or wrong regional API | Inspect status; compare API region; no secrets in logs | Refresh bearer token via auth; don't reuse MCP JWT as REST token |
| Port data claims `succeeded` but Archon blocked | Stale exporter update, guessed state mapping or wrong run ID | Compare raw consumer state and observedAt | Fail closed; repair mapper and monotonic timestamp rule |
| Suddenly high token spend | More simultaneous loops/provider tier escalation | Archon run metrics, cloud/provider usage, schedules | Halt new factory launches, constrain concurrency and provider tier |
| Windows scheduled runs never fire after logoff | Task Scheduler timer only while logged on | `schedule status`, Task Scheduler task history | Use an always-on Linux host for unattended work |
| Two agents pick the same issue | Independent Port/Archon schedulers or separate workspaces without shared claim | Issue comments, Archon claims, Port trigger history | Disable duplicate launcher; centralize claims in Archon |

### 18.1 First-response diagnostic commands

Windows PowerShell:

```powershell
Get-Location
git status --short --branch
git remote -v
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef

python .\factory\consumer.py doctor
python .\factory\consumer.py list
python .\factory\consumer.py status --all --json

port --version
port api call /blueprints

# Optional: inspect Port connector/blueprint via authenticated browser UI.
# Claude: /mcp; Codex: /mcp. Do not expose OAuth token output.
```

### 18.2 Specific high-risk failure: incorrect merge authorization

If a Port action or service identity can merge PRs independently of Archon's deterministic gate:

1. Disable that Port action/workflow (not the entire Port read-only catalog).
2. Verify GitHub App permissions and protect branch policies.
3. Halt new Archon launches while investigating any already merged unauthorized changes.
4. Compare exact PR head SHA, CI check runs, independent reviewer verdict, protected path list and approval evidence.
5. Restore from version control and issue a corrective PR; do not rewrite Git history casually, particularly on shared branches.
6. Add regression tests proving Port approval cannot bypass the Archon merge gate.

### 18.3 Specific high-risk failure: leaking Port or model credentials

If credentials entered source control or an unredacted Port catalog entry:

1. Revoke/rotate exposed credentials **first**; deleting the commit/entity alone does not revoke them.
2. Remove secret-bearing catalog content and audit access/downloads.
3. Review CI artifacts and agent run transcripts for propagation.
4. Reissue least-privilege credentials; add local secret scanning/precommit controls.
5. Record incident timeline and clean up any backups containing the secret according to policy.

---

## 19. Upgrades, operating procedures and rollback

### 19.1 Routine read-only operation

Daily or per development session:

1. Inspect repo's active issues and PRs in Port (GitHub Ocean), including CI status.
2. Query factory metadata through read-only Claude/Codex MCP.
3. Check Archon active runs **using consumer CLI**, not by trusting an old Port snapshot.
4. Review running provider costs and current hold/review outcomes.
5. Escalate stuck runs and approvals to the actual authority (Archon + maintainer), not an unrelated Port action.

Weekly:

- Audit Port GitHub App repository scope and Port MCP tool exposure.
- Reconcile Port entities with GitHub and Archon sample runs.
- Check for schema/mapping drift, duplicate IDs, stale inventory, unexplained action runs and unused service accounts.
- Export/back up Port configuration under approved retention rules.
- Track upstream Medin and Port release notes; do **not** silently auto-upgrade the SDLC pack during an active release.

### 19.2 Upgrading Medin factory (version-controlled)

On a clean working tree and after preserving config:

```powershell
$FactorySource = Join-Path $HOME 'ai-software-factory'
Set-Location 'D:\path\to\your-application-repo'

git status --short
Get-Content .\factory\pack.json

# Inspect upstream changes before update:
git -C $FactorySource fetch origin
git -C $FactorySource status --short
# After explicit approval if clean:
git -C $FactorySource pull --ff-only

# From application root, rerun the official installer after reviewing migration docs:
python (Join-Path $FactorySource 'bin\factory.py') init

git diff --stat
git diff --check
python .\factory\consumer.py doctor
python .\factory\consumer.py list
```

Read the installed/repo [factory migration instructions](https://github.com/coleam00/ai-software-factory/blob/main/template/factory/MIGRATION.md) if present; verify path in the upstream version. Review the new Archon pin, supported workflow names and input schemas. Rerun smoke tests, the staging baseline, deliberate-fault calibration and at least one manual `archon-ship` before re-enabling unattended scheduling. Do **not** treat `git pull` of the installer as equivalent to updating each app repository.

### 19.3 Updating Port blueprints and mappings

Maintain a versioned record of:

- Port region, connector installation type, selected repos.
- Blueprint JSON and entity property ownership matrix.
- GitHub Ocean resource mappings (with a secure export backup).
- MCP server names/headers and service-account scope.
- Port workflow definitions and approval policy.
- Telemetry mapper schema version + tested Archon source revision.

Change protocol: snapshot -> propose schema diff -> test in Port sandbox -> verify real GitHub resync -> verify read-only MCP -> deploy tenant change -> reconcile sample entities. **Never use `port clear` as a routine reset**; it can delete multiple catalog resource classes. If using Port `compare`/`migrate`, dry-run and scope to the desired organization/resource types.

### 19.4 Rolling back **Port integration only**

For an incident or negative evaluation, the safest rollback generally leaves source/Archon untouched:

1. Disable affected Port workflow triggers and any GitHub `workflow_dispatch` permissions introduced for the integration.
2. Disable/remove the Port MCP server entry from Claude, Codex and VS Code, or set it read-only as an intermediate measure.
3. Stop a telemetry exporter service if implemented; record its last successful upsert.
4. Narrow/remove the GitHub Ocean connector's repository permissions when appropriate; avoid blind deletion if other projects rely on the connector.
5. Export the catalog/blueprints before any destructive cleanup.
6. Delete only custom `archonFactory`/`archonRun` entities/blueprints **after** confirming no shared relations or dashboards depend on them.
7. Confirm `python factory/consumer.py doctor/list` and a harmless manual Archon run still work.

The intended guarantee is **loose coupling**: Port failure cannot destroy your repo, break the Archon consumer, or silently approve merges.

### 19.5 Rolling back an Archon change

Revert with versioned Git changes or the factory's documented migration/repair procedure; align installed `pack.json` with its source; stop/restart only the designated scheduler; check any running detached workflows before changing the execution engine. Rebuild agent auth if provider settings changed. Port's run catalog is telemetry, **not** the source of truth for restoring Archon state.

### 19.6 Schedule operating notes

Medin's documentation states `schedule install` binds Archon native triggers and that `schedule fire` calls Archon's trigger/wake logic. `archon-loop` admits only configured concurrency, with claim handling and dependencies; `parallel` supports 1–8 laps per documented source but should begin at **1**. Linux uses systemd user timer, macOS launchd, and Windows Task Scheduler. Keep `.factory/schedule.json` and installed native schedule reconciled; `schedule install --apply` is an actual persistent host change. Linux `runtime_host` should be separately run as a service where required; the timer cannot wrap it.

On servers, inspect the account's `PATH`, `uv`/`bun`/provider binary location, environment-file secrets, worktree resource cleanup, GitHub credential persistence and host reboot behavior. Avoid running services as root unless explicitly unavoidable and independently reviewed.

---

## 20. Recommended backlog and implementation sequence

The most maintainable integration is incremental. Assign **one owner** per milestone and gate later work on demonstrated evidence; otherwise you'll end up with a sophisticated dashboard over a broken factory or duplicate schedulers.

| Phase | Deliverable | Level of change | Acceptance evidence |
|---|---|---|---|
| **0 — Audit** | Correct app repo, healthy Medin consumer, known GitHub remote and provider | Read-only local diagnostics | `doctor/list`, repo ID, Archon pin, provider test |
| **1 — Port catalog** | Port tenant + selected-repo GitHub Ocean | Hosted Port config; GitHub App permission | Repo, issue, PR/CI appear correctly |
| **2 — Factory metadata** | `archonFactory` blueprint + app `port.yml` | Reviewed Port schema + small Git change | Exact entity and properties after default-branch sync |
| **2 — Agent context** | Claude Code + Codex remote Port MCP **read-only** | Per-client OAuth/config | Two distinct clients resolve same entity, no write tools |
| **2 — Manual SDLC** | One safe `archon-ship` issue-to-PR trial | Existing Archon invocation | Run ID, review verdict, PR and CI evidence |
| **3 — State visibility** | `archonRun` blueprint, reviewed manifest exporter, schema mapper | Custom Python integration | Auth, dry-run, upsert, reconciliation and failure tests |
| **3 — Catalog operations** | Run/PR dashboards and scorecards based on real data | Port configuration | Accurate blocked vs running vs terminal state |
| **4 — Governed intake** | Port approval -> GitHub `create_issue` | Write-capable Port workflow | One approved issue created, no merge privilege |
| **5 — Direct launch (optional)** | Port request -> protected runner/bridge -> Archon, with correlation | High-risk custom integration | Idempotency, auth, full terminal tracking, no duplicate work |
| **6 — Multiple harnesses (optional)** | Pi/Hermes live MCP tests, registry inventory | Harness-specific adapters | Verified native client/server capability and permissions |

### 20.1 Decisions to make before Phase 4

- Will Port only *request* work, or must it launch a specific Archon workflow immediately?
- Is Archon running on the local Windows workstation only, or on an always-on Linux server?
- Is GitHub Ocean permitted to write issues to this org's repositories?
- Does Archon's scheduler already claim the target issue automatically?
- Which human signs off on a Port request, and which human signs off on merging into the default branch?
- Are Port's native approval records sufficient for governance, or do you need the event embedded into GitHub issue comments/Archon run metadata?
- What correlation ID joins a Port workflow run, a GitHub issue and an Archon run when the latter is launched asynchronously?

**My architecture recommendation:** Start with phases 0–3. You already have a sophisticated local multi-harness environment; a second execution orchestrator is unnecessary until there is a measured operational need for Port-driven *request/approval* workflows. Keep the optional direct-launch route out of the initial branch.

### 20.2 Engineer-facing work items

**Issue A — Catalog onboarding.** Set up a Port sandbox, GitHub Ocean selected-repository integration, inspect default schema, import a real repo, validate read-only visibility and document region.

**Issue B — Archon blueprint/GitOps.** Create custom blueprint, commit correct `port.yml`, add a lightweight validation for property IDs and remote URL, verify reconciliation and avoid duplicate mapping.

**Issue C — MCP hardening.** Configure Port remote MCP in Claude Code and Codex, enforce read-only, test correct org and catalog scopes, document worker-context inheritance.

**Issue D — SDLC baseline.** Run one manual issue with Archon and record PR/CI/runtime evidence. Confirm there is no Port schedule or merge action.

**Issue E — Archon telemetry schema.** Capture representative `consumer.py` outputs per installed revision, define schema and redaction policy, build parser tests, publish synthetic+real runs to Port sandbox.

**Issue F — Observability/reconciliation.** Implement stale-event protection, retry, run-ID correlation, dashboards, and a daily discrepancy report.

**Issue G — Controlled intake (later).** Build a Port workflow with RBAC and approval to create issues in GitHub, after deciding single schedulers and merge authority.

**Issue H — Private execution bridge (only if needed).** Design protected runner or execution-agent-hosted webhook to start Archon, with separate service identity, strict input validation and terminal event propagation.

### 20.3 Suggested engineering tests for the bridge

Unit tests should include:

- Valid and invalid Port API base URLs; refusing arbitrary hosts for credentials.
- JSON parsing and manifest type validation, missing required fields, invalid GitHub URL and extra sensitive fields.
- OAuth failure and 401, 403, 422, 429 and 5xx classification with bounded retry for retryable responses.
- Stable run IDs across retries; one Port entity per Archon run.
- Correct `succeeded` only after genuine Archon completion evidence (not a job launch response).
- Timestamps monotonic, stale events discarded, final state not regressed by delayed poll.
- Null/omitted value distinctions in merge upsert.
- Correlation across multiple PRs, retries and review rounds.
- No secrets, PII, prompt dumps or holdout data in published fields.
- A disabled Port tenant does not block normal Archon lifecycle.

Integration tests should run against a **dedicated Port sandbox tenant** and **test GitHub repository**. Do not point synthetic `OWNER/REPO` examples at the production organization.

---

## 21. Version-sensitive details and confidence

The following table intentionally separates documented facts from hypotheses requiring tests. In October 2026 both Port's product surface and Medin's factory are moving quickly; installation guides must state provenance and volatility.

| Statement | Basis and date checked | Confidence | Verify before execution |
|---|---|---|---|
| Medin factory calls shared Archon SDLC workflows | Upstream README read on 2026-10-23 | High | Actual app `factory/pack.json` and `consumer.py list` |
| Factory installer bootstraps pinned Archon, no schedule or provider auth | Upstream README | High | Review script diff and fresh install in app repo |
| Live factory default pin `1cf9c3...` | Upstream README 2026-10-23 | Point-in-time only | Never assume future pin; read current README and pack |
| Port GitHub Ocean supports repo/issue/PR/file/workflow-run ingestion | Port GitHub Ocean documentation | High | Selected resource mappings and permissions in tenant |
| Port `port.yml` is repo-root/default branch GitOps | Port GitOps doc | High | Correct mapping, push events, resync behavior |
| `port-app-config.yml` for GitHub Ocean is organization-level | Port GitHub Ocean doc | High | `repoManagedMapping` and `.github-private` config |
| Port MCP should be remote, local package deprecated | Port MCP install doc | High | Correct tenant region/client version |
| Claude/Codex official Port remote MCP setup available | Port MCP install doc | High | Current CLI version and user OAuth |
| `x-read-only-mode: 1` hides Port write tools | Port MCP install doc | High | Observe tool list under actual user and worker |
| Port workflow GitHub `dispatch_workflow` and `create_issue` actions | Port integration action doc | High | Exact node property schema and installed integration ID |
| Port agent can reach private webhook without public inbound port | Port execution agent doc | High | Kafka availability/polling caveats and local service |
| Native Port-to-Archon run orchestration | **No native integration verified** | Not established | Must implement/test custom bridge |
| Native Port run ingestion from Medin `consumer.py` | **No exporter verified** | Not established | Build version-specific parser/exporter |
| Herdr or Pi or Hermes automatically inherit Port MCP | No first-party claim verified | Not established | Test each process/client independently |
| Port free plan limits | [Port pricing page](https://www.port.io/pricing/) viewed in research | Changeable | Check tenant plan/current price before budget commitment |
| Custom `archonFactory`, `archonRun` examples in this report | Proposed architecture, not shipped Port templates | Explicit design proposal | Sandbox apply + schema validation |
| Working example `port_upsert_run.py` | Standard-library code based on documented REST API | Reasoned, not live tested | Dry-run, isolated test, credentials and sandbox API |

### 21.1 Definitions of implementation certainty

- **Verified vendor feature** = documented on a first-party current Port/Medin page.
- **Documented command** = copied in substance from first-party CLI/README and adjusted for Windows shell where obvious; user-specific arguments remain placeholders.
- **Architecture recommendation** = an opinionated, compatible integration pattern based on available primitives, not an official interoperability endorsement.
- **Working transport example** = designed for the documented HTTP contract; **not** validated against the user's tenant or Archon output schema.
- **Unsupported inference** = explicitly called out as not established; no unqualified compatibility claim is made.

### 21.2 What was **not** done in this research

- Did not install Port locally or register a Port tenant.
- Did not connect to your private GitHub repositories or inspect their exact Port mappings.
- Did not run Cole Medin's installer, modify Herdr configuration, start Archon jobs or enable automation.
- Did not execute a real Claude, Codex, Pi or Hermes Port MCP session.
- Did not fetch private Archon run JSON or implement a production mapper for it.
- Did not test real Port API permissions, tenant pricing/quota, support entitlement or CI callback behavior.

Those remain steps in the runbook, not accomplishments. The downloadable Markdown can be copied to your local project; it was not automatically written into an arbitrary folder on your PC.

---

## 22. Official documentation and scraped source register

**Method.** Reviewed Port's official online docs including page content scraped from the Port site, plus official Cole Medin GitHub repositories and technical readmes. Sources are primary documentation, not Wikipedia or news commentary. The links below point to the publisher's own page for future updates; the primary assertions in each section are linked near the relevant instructions. Review date: **2026-10-23**.

### 22.1 Port — architecture, onboarding and Context Lake

| Reference | Official URL | Used for |
|---|---|---|
| Port root docs | https://docs.port.io/ | SaaS platform overview |
| Getting started | https://docs.port.io/getting-started/overview/ | Initial Port software factory concepts |
| Agentic SDLC pillars | https://docs.port.io/getting-started/agentic-sdlc-pillars/ | Platform responsibilities vs execution |
| Context Lake overview | https://docs.port.io/context-lake/overview/ | Catalog, sources, entities and relationships |
| Blueprint model | https://docs.port.io/context-lake/data-model/setup-blueprint/overview/ | Property/schema fundamentals |
| Default blueprints | https://docs.port.io/context-lake/data-model/setup-blueprint/default-blueprints/ | Existing system/default types |
| GitHub Ocean | https://docs.port.io/context-lake/ingestion/ingest-data-into-port/native-integrations/available-integrations/git/github-ocean/ | Selected repo installation, resources, mapping |
| GitOps with GitHub Ocean | https://docs.port.io/context-lake/ingestion/ingest-data-into-port/native-integrations/available-integrations/git/github-ocean/gitops/ | `port.yml`, `kind:file`, `itemsToParse`, resync |
| Native integrations | https://docs.port.io/context-lake/ingestion/ingest-data-into-port/native-integrations/overview/ | Port ingestion strategies |
| REST ingestion | https://docs.port.io/context-lake/ingestion/ingest-data-into-port/api/ingest-via-api-overview/ | API endpoints and machine credentials |
| Catalog RBAC | https://docs.port.io/context-lake/consuming-the-lake/govern-data-access/overview/ | Least privilege |
| CLI overview | https://docs.port.io/context-lake/consuming-the-lake/port-cli/overview/ | CLI responsibilities |
| CLI installation | https://docs.port.io/context-lake/consuming-the-lake/port-cli/installation/ | npm install, CLI auth and region |
| CLI examples | https://docs.port.io/context-lake/consuming-the-lake/port-cli/examples/ | export/compare/import and skills |

### 22.2 Port — MCP, agents and workflows

| Reference | Official URL | Used for |
|---|---|---|
| Remote Port MCP overview | https://docs.port.io/agent-management/port-mcp-server/overview/ | Remote catalog integration |
| Remote Port MCP installation | https://docs.port.io/agent-management/port-mcp-server/installation/ | Claude, Codex, VS Code, read-only and endpoints |
| MCP machine authentication | https://docs.port.io/agent-management/port-mcp-server/token-based-authentication/ | OAuth `client_credentials` and token lifetime/rate limit |
| MCP available tools | https://docs.port.io/agent-management/port-mcp-server/available-tools/ | Role-scoped read/write tool inventory |
| Agent management | https://docs.port.io/agent-management/overview/ | AI inventory/governance |
| AI agent registry | https://docs.port.io/agent-management/ai-registry/agent-registry/ | Agent metadata model |
| External agents | https://docs.port.io/agent-management/external-agents/overview/ | Code-first and cloud-managed distinction |
| MCP registry | https://docs.port.io/agent-management/ai-registry/mcp-registry/ | Approved MCP metadata |
| AI skills | https://docs.port.io/agent-management/ai-registry/skills/overview/ | Approved skills vs local harness |
| Workflows overview | https://docs.port.io/workflows/overview/ | Port workflow node graph and trigger semantics |
| Workflows quickstart | https://docs.port.io/workflows/build-workflows/quickstart/ | Self-service setup steps |
| Expose workflow as tool | https://docs.port.io/workflows/expose-as-tool/ | MCP workflow invocation |
| Workflow permissions | https://docs.port.io/workflows/permissions-and-rbac/permissions/ | RBAC and approvals |
| GitHub integration actions | https://docs.port.io/workflows/build-workflows/nodes/action-nodes/integration-actions/git/github/ | `create_issue`, `dispatch_workflow`, execution processor |
| Port execution agent workflow node | https://docs.port.io/workflows/build-workflows/nodes/action-nodes/port-execution-agent/ | Private-network requests |
| Port execution agent docs | https://docs.port.io/workflows/actions-and-automations/setup-backend/webhook/port-execution-agent/ | Kafka/polling/private-webhook behavior |
| Tracking workflow runs | https://docs.port.io/workflows/track-workflow-execution/track-and-manage-runs/ | Actual Port run state and audit |

### 22.3 Port — REST endpoints and business constraints

| Reference | Official URL | Used for |
|---|---|---|
| API overview | https://docs.port.io/api-reference/port-api/ | Port REST API discovery |
| Create access token | https://docs.port.io/api-reference/create-an-access-token/ | API `clientId`/`clientSecret` -> `accessToken` |
| Create blueprint | https://docs.port.io/api-reference/create-a-blueprint/ | JSON schema/payload |
| Create entity | https://docs.port.io/api-reference/create-an-entity/ | `upsert=true`, `merge=true`, `validation_only=true` |
| API rate limits | https://docs.port.io/api-reference/rate-limits/ | Batch/retry budgets; verify limits per actual API |
| Security | https://docs.port.io/platform-administration/security/ | Platform controls |
| Pricing | https://www.port.io/pricing/ | Feature/usage entitlement must be checked live |

### 22.4 Cole Medin / Archon — official code sources

| Reference | Official URL | Used for |
|---|---|---|
| AI Software Factory README | https://github.com/coleam00/ai-software-factory | Architecture, prerequisites, latest pin, installer, commands |
| `bin/factory.py` | https://github.com/coleam00/ai-software-factory/blob/main/bin/factory.py | Actual bootstrap entry point |
| `docs/first-hour.md` | https://github.com/coleam00/ai-software-factory/blob/main/docs/first-hour.md | First lap, PRD vs codebase, manual verification |
| `docs/server-cheat-sheet.md` | https://github.com/coleam00/ai-software-factory/blob/main/docs/server-cheat-sheet.md | Host/SSH/server deployment tasks |
| `docs/incidents.md` | https://github.com/coleam00/ai-software-factory/blob/main/docs/incidents.md | Historical production lessons |
| `template/factory/MIGRATION.md` | https://github.com/coleam00/ai-software-factory/blob/main/template/factory/MIGRATION.md | Installed factory upgrade procedure; check location |
| Archon repository | https://github.com/coleam00/Archon | Underlying workflow engine architecture |
| Archon official documentation | https://archon.diy/ | Provider/workflow syntax and native controls |
| Archon LLM-readable docs | https://archon.diy/llms-full.txt | Discover workflow DAG and CLI details |
| GitHub CLI | https://cli.github.com/ | Authentication, issues, PRs |

### 22.5 Documentation changes to watch

Port is actively introducing new workflow and AI functionality while retaining some "actions & automations" compatibility/legacy pages. Prefer the **current `/workflows/...`** editor and node documentation for *new* control-plane workflows rather than blindly pasting older self-service action examples. The Port remote MCP documentation explicitly supersedes the deprecated local MCP server. The factory README's Archon pin and workflow composition evolve quickly; prefer *current source/installed pack* over older screenshots, blog posts or third-party templates.

---

## Final recommendation

**Implement Port as an incremental integration, not as a replacement harness.** First connect Port GitHub Ocean to one repository; register only safe metadata via `port.yml`; enable read-only remote MCP in Claude Code and Codex; then prove one supervised Archon issue-to-PR lifecycle. After that, add an explicitly reviewed `archonRun` telemetry exporter. Only create a Port-triggered issue/launch workflow if you need a governed intake interface, and preserve Archon's authority over all shared SDLC workflows, runtime verification, merge gates and its own scheduler.

**Stop conditions:** wrong repository/tenant, missing factory policy, unverified Archon provider authentication, GitHub App overprivilege, untrusted self-hosted runner code execution, unclear merge authority or inability to correlate detached runs. Resolve these before enabling any autonomous scheduling or write-capable Port action.
