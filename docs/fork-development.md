# Custom fork development

This checkout customizes `coleam00/ai-software-factory` itself. The installer in
`bin/factory.py` installs the toolkit into a separate application repository; it
is not required to edit or test this toolkit.

## Remotes and branches

- `origin`: https://github.com/emilio-gagliardi/ai-software-factory.git
- `upstream`: https://github.com/coleam00/ai-software-factory.git
- `main`: upstream baseline; keep custom commits off this branch.
- `my-version`: persistent customization branch.
- `feature/*`: focused work, branched from and merged back into `my-version`.

The initial baseline is `9de13f383b579229ffed9113ecdb3fa04dfe492f`.
Local Git configuration defaults pushes to `origin`, uses fast-forward-only pulls,
disables automatic rebase, prunes stale fetched branches and enables rerere.
`main` tracks `upstream/main`; `my-version` tracks `origin/my-version`.
The upstream push URL is `DISABLED` to prevent accidental pushes.
These settings live in `.git/config`; they must be reapplied in new clones.

## Work on a feature

Start with a clean working tree:

```bash
git switch my-version
git switch -c feature/describe-the-change
# Edit, review, test, then commit.
git push -u origin feature/describe-the-change
```

When using a pull request, explicitly target `emilio-gagliardi/ai-software-factory`
and base `my-version`; a fork's suggested PR target may be the original project.

## Receive maintainer updates

Run each command separately, stopping on any failure. Commit or stash pending
work first. Merge normally; do not reset custom history or force-push.

```bash
git status --short
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch my-version
git merge main
python bin/audit.py
python -m unittest discover -s bin -p 'test*.py'
git push origin my-version
```

If a merge conflicts, resolve and test before committing, or run `git merge --abort`
to return to the pre-merge state. A divergent `main` requires inspection before proceeding.

## Local checks

Python 3.10+ is required. The toolkit's local tests use the Python standard library;
there is no root package manifest or dependency installation step.

```bash
python bin/audit.py
python -m unittest discover -s bin -p 'test*.py'
```

Live Archon source conformance requires a separately installed pinned Archon source;
see the test's `FACTORY_INTEGRATION_SOURCE` requirement. Local tests do not establish
provider authentication or live workflow readiness.

## Authentication and runtime

The GitHub connection can manage repository changes, but that connection does not
authenticate the shell. In the initial workspace HTTPS fetch worked and shell push
failed for missing credentials. On your development machine configure GitHub CLI:

```bash
gh auth login -s workflow
gh auth setup-git
```

For future factory execution, also install Bun and uv, configure the chosen coding
provider, and follow README.md from the target application repository. No application
installation, provider configuration, agent run or schedule was started during this
fork preparation.
