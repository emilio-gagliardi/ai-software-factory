/**
 * Runs INSIDE a Herdr pane, one agent turn. The pane shows a readable transcript; the raw
 * stream-json goes to <turnDir>/events.jsonl for the provider. Shell-agnostic: the pane only
 * has to run `bun pane-turn.ts <turnDir>`.
 *
 * <turnDir>/request.json: { cwd, model?, systemPrompt? }; <turnDir>/prompt.txt: the prompt.
 * Writes <turnDir>/exit.json { code } last. A <turnDir>/cancel file stops the agent.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function paneTurn(turnDir: string): Promise<void> {
const req = JSON.parse(readFileSync(join(turnDir, 'request.json'), 'utf-8'));
const events = join(turnDir, 'events.jsonl');
writeFileSync(events, '');

// Same permission mode as Archon's built-in Claude provider (claude/provider.ts:952).
const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];
if (req.model) args.push('--model', req.model);
if (req.systemPrompt) args.push('--append-system-prompt', req.systemPrompt);

console.log(`[herdr-turn] ${turnDir}\n[herdr-turn] claude ${req.model ?? '(default model)'} in ${req.cwd}\n`);
const child = Bun.spawn(['claude', ...args], {
  cwd: req.cwd,
  stdin: Bun.file(join(turnDir, 'prompt.txt')),
  stdout: 'pipe',
  stderr: 'inherit',
});

const cancelWatch = setInterval(() => {
  if (existsSync(join(turnDir, 'cancel'))) child.kill();
}, 500);

let buffer = '';
const decoder = new TextDecoder();
for await (const bytes of child.stdout) {
  buffer += decoder.decode(bytes, { stream: true });
  let nl: number;
  while ((nl = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    appendFileSync(events, line + '\n');
    show(line);
  }
}
if (buffer.trim()) appendFileSync(events, buffer.trim() + '\n');
const code = await child.exited;
clearInterval(cancelWatch);
writeFileSync(join(turnDir, 'exit.json'), JSON.stringify({ code }));
console.log(`\n[herdr-turn] exit ${code}`);
}

function show(line: string): void {
  try {
    const ev = JSON.parse(line);
    for (const part of ev.message?.content ?? []) {
      if (ev.type === 'assistant' && part.type === 'text') console.log(part.text);
      if (ev.type === 'assistant' && part.type === 'tool_use')
        console.log(`  > ${part.name} ${JSON.stringify(part.input).slice(0, 160)}`);
      if (ev.type === 'user' && part.type === 'tool_result') console.log(`  < ${part.is_error ? 'error' : 'ok'}`);
    }
    if (ev.type === 'result') console.log(`\n[result] ${ev.subtype} cost=$${ev.total_cost_usd ?? '?'}`);
  } catch {
    console.log(line);
  }
}
