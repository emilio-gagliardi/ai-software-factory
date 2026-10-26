/**
 * Gate one OpenSpec change before delivery planning.
 *
 * Runs in the run's working directory and fails, with the tool output tail as
 * evidence, when any check fails:
 *   1. the change folder openspec/changes/<change_id> exists;
 *   2. `openspec validate <change_id> --strict` passes;
 *   3. the Prairie architecture-contract validator passes.
 *
 * On success it prints one strict JSON document: { change_id, proposal_dir }.
 * Failures write to stderr and set a non-zero exit code; nothing is printed to stdout.
 */

import { existsSync } from 'node:fs';

const VALIDATOR = 'C:/Users/emili/.codex/skills/openspec-prairieapplied/scripts/validate_proposal.py';
const TAIL_LINES = 60;
// Letters, digits, dot, underscore, hyphen; no separators and no leading dot.
const SAFE_CHANGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function refuse(message: string): void {
  console.error(message);
  process.exitCode = 1;
}

function tail(output: string): string {
  return output
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .slice(-TAIL_LINES)
    .join('\n');
}

function run(argv: string[]): { code: number; output: string } {
  const result = Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'pipe' });
  return {
    code: result.exitCode ?? 1,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

function main(): void {
  const changeId = (process.env.INPUTS_CHANGE_ID ?? '').trim();
  if (changeId === '') {
    refuse('gate-proposal: change_id is empty; the workflow requires an OpenSpec change id');
    return;
  }
  if (!SAFE_CHANGE_ID.test(changeId) || changeId.includes('..')) {
    refuse(`gate-proposal: change_id "${changeId}" is not a plain change folder name`);
    return;
  }

  const proposalDir = `openspec/changes/${changeId}`;
  if (!existsSync(proposalDir)) {
    refuse(`gate-proposal: ${proposalDir} does not exist; there is no change to deliver`);
    return;
  }

  const strict = run(['openspec', 'validate', changeId, '--strict']);
  if (strict.code !== 0) {
    refuse(
      `gate-proposal: openspec validate ${changeId} --strict failed (exit ${strict.code})\n${tail(strict.output)}`
    );
    return;
  }

  // uv only (user standard); --no-project so the target repo's own env is not required.
  const contract = run([
    'uv',
    'run',
    '--no-project',
    'python',
    VALIDATOR,
    '--root',
    '.',
    '--id',
    changeId,
    '--strict',
    '--profile',
    'architecture-contract-v1',
  ]);
  if (contract.code !== 0) {
    refuse(
      `gate-proposal: architecture-contract validation failed (exit ${contract.code})\n${tail(contract.output)}`
    );
    return;
  }

  console.log(JSON.stringify({ change_id: changeId, proposal_dir: proposalDir }));
}

try {
  main();
} catch (error) {
  refuse(`gate-proposal: ${error instanceof Error ? error.message : String(error)}`);
}
