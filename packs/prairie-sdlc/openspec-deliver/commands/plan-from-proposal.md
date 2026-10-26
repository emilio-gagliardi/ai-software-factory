# Plan One OpenSpec Change for Delivery

Write the delivery plan for one OpenSpec change. The gate has already verified that the change folder exists and passes strict validation and the architecture-contract validator.

Change id:

$INPUTS.change_id

Proposal folder:

$INPUTS.proposal_dir

Target repository note (may be empty):

$INPUTS.target_repo_note

## Read in full

- `openspec/changes/<change id>/proposal.md`
- `openspec/changes/<change id>/design.md`
- every file under `openspec/changes/<change id>/specs/`
- `openspec/changes/<change id>/tasks.md`

Invoke the `$openspec-prairieapplied` skill for the change's conventions before you write the plan. Cite code by repository-relative path when the plan names a file.

## Write the plan

Write `$ARTIFACTS_DIR/plan.md` with these sections, omitting any that do not apply:

- **Scope** — what this change delivers and what it explicitly does not.
- **Requirements** — each requirement and its scenarios, quoted from the specs.
- **Tasks in order** — the tasks from `tasks.md`, in dependency order, with the repository files each one touches.
- **Verification** — the tests and checks the change names, and the ones the implementation must add.
- **Blocking questions** — anything that prevents delivery. If one exists, state it plainly so the run does not proceed on a guess.

## Hard limits

- Never run `openspec archive`, never merge, and never change pull request state.
- Do not modify the checkout. The plan is the only file you write.

## Declare the result

- `report` — copy exactly:

  ```json
  {"type": "archon_artifact", "run_id": "$WORKFLOW_ID", "path": "plan.md"}
  ```

- `summary` — two or three sentences naming the change, the number of tasks, and any blocking question, pointing to `$ARTIFACTS_DIR/plan.md`.
