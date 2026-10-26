# Set up your AI Software Factory fork on your Windows PC

This runbook runs in **PowerShell on your Windows machine**. It clones your existing GitHub fork, `emilio-gagliardi/ai-software-factory`, into a folder you choose. The `emilio-alpha` branch and the documentation committed earlier are already on that fork. Nothing in this runbook creates another GitHub repository.

> Run the blocks in order. Stop if a command errors. Replace only the parent-folder path in Step 2.

## 1. Check prerequisites and sign in to GitHub

Open **PowerShell** on your PC:

```powershell
git --version
python --version
gh --version
```

If one is missing, install it from its official package using Windows Package Manager, then open a **new** PowerShell window and re-run the version commands:

```powershell
winget install --id Git.Git -e
winget install --id Python.Python.3.12 -e
winget install --id GitHub.cli -e
```

If `gh` already has a valid GitHub login, `gh auth status` will show it. Otherwise complete the interactive browser sign-in. The `workflow` scope matters for future factory work that pushes CI files. `gh auth setup-git` lets ordinary Git pushes reuse the login:

```powershell
gh auth status
gh auth login -s workflow
gh auth setup-git
gh auth status
```

If the first `gh auth status` succeeds, skip `gh auth login`; run `gh auth refresh -s workflow` if the scope is absent, then `gh auth setup-git`. Do **not** paste access tokens into commands or the repository.

## 2. Clone the existing fork into your chosen folder

Set the parent path to the actual **Windows folder** where you keep source projects. For example, use `D:\Projects` if that is where you work. The clone will create a child folder named `ai-software-factory`.

```powershell
$ProjectsDir = 'D:\Projects'  # EDIT THIS ONE PATH
New-Item -ItemType Directory -Force -Path $ProjectsDir | Out-Null
Set-Location $ProjectsDir
gh repo clone emilio-gagliardi/ai-software-factory ai-software-factory
Set-Location .\ai-software-factory
```

If you already have an `ai-software-factory` directory there, **stop**. Inspect it with `git status` and `git remote -v`; do not overwrite it or blindly clone on top of it.

## 3. Connect Cole's repository as upstream and select your branch

```powershell
git remote add upstream https://github.com/coleam00/ai-software-factory.git
git remote set-url --push upstream DISABLED
git fetch upstream
git fetch origin
git switch emilio-alpha
```

If `git remote add upstream` reports `remote upstream already exists`, inspect `git remote -v`; if it already points to Cole's repository, skip that single command and continue.

Set safe repository-local defaults. `main` follows the maintainer; `emilio-alpha` follows your fork. No custom work should be committed to `main`:

```powershell
git config --local remote.pushDefault origin
git config --local push.default simple
git config --local pull.ff only
git config --local pull.rebase false
git config --local fetch.prune true
git config --local rerere.enabled true
git config --local branch.main.remote upstream
git config --local branch.main.merge refs/heads/main
git config --local branch.main.pushRemote origin
git config --local branch.emilio-alpha.remote origin
git config --local branch.emilio-alpha.merge refs/heads/emilio-alpha
git config --local branch.emilio-alpha.pushRemote origin
```

## 4. Verify that the **Windows folder** is ready

```powershell
Get-Location
git status --short --branch
git branch -vv
git remote -v
git rev-parse --is-shallow-repository
Test-Path .\README.md
Test-Path .\docs\fork-development.md
```

Expected: `Get-Location` shows your Windows path ending in `ai-software-factory`; status begins `## emilio-alpha...origin/emilio-alpha` and contains no changed files; `origin` is `emilio-gagliardi/ai-software-factory`; `upstream` fetches from `coleam00/ai-software-factory` while its push URL is `DISABLED`; the shallow check says `false`; both `Test-Path` checks say `True`.

Open the actual local project:

```powershell
code .
```

If `code` is not found, open VS Code normally and choose **File → Open Folder** for the path printed by `Get-Location`.

## 5. Make your first change to the factory itself

Start a focused branch from your customization branch:

```powershell
git switch emilio-alpha
git pull --ff-only origin emilio-alpha
git switch -c feature/describe-your-change
```

Edit in VS Code, then run the repository's own checks:

```powershell
python bin/audit.py
python -m unittest discover -s bin -p 'test*.py'
git status --short
```

Commit and push when satisfied:

```powershell
git add -A
git diff --cached --check
git diff --cached --stat
git commit -m "Describe your change"
git push -u origin feature/describe-your-change
```

If you open a PR for this branch, target **your fork's `emilio-alpha`** branch. GitHub may otherwise suggest Cole's upstream repository.

## 6. Later: bring in changes from Cole

First commit or stash any pending work. Run each command separately and stop if one fails:

```powershell
git status --short
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch emilio-alpha
git merge main
python bin/audit.py
python -m unittest discover -s bin -p 'test*.py'
git push origin emilio-alpha
```

If `git merge main` reports conflicts, resolve them and rerun checks before completing the merge; use `git merge --abort` if you need to abandon that merge. Do not force-push to resolve ordinary sync conflicts.

## Separate task: use the factory to build an application

The commands above install **your editable copy of the factory** on your PC. To actually run the factory, choose a separate application repository. The factory installer runs **from that application's root**; it copies its consumer files there and installs a pinned Archon source. It does not run in this toolkit checkout to transform the toolkit itself into an application.

For that later task, the factory README lists additional prerequisites: Bun, uv, a working coding agent/provider, and GitHub authentication. In the chosen application's folder, the invocation is:

```powershell
$FactoryDir = 'D:\Projects\ai-software-factory'  # EDIT to the cloned factory path
python "$FactoryDir\bin\factory.py" init
python .\factory\consumer.py doctor
python .\factory\consumer.py list
```

Set `$FactoryDir` to the path verified by `Get-Location` above. Provider/model configuration, app mission, user journeys, checks, runtime host and a first supervised issue follow the installation. See [the upstream factory instructions](https://github.com/coleam00/ai-software-factory#instructions-for-the-agent) and the [first-hour guide](https://github.com/coleam00/ai-software-factory/blob/main/docs/first-hour.md). Do not turn on scheduling before observing one successful issue run.
