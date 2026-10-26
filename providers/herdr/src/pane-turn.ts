/**
 * Runs INSIDE a Herdr pane, one agent turn. The pane shows a readable transcript; the raw
 * stream-json goes to <turnDir>/events.jsonl for the provider. Shell-agnostic: the pane only
 * has to run `bun pane-turn.ts <turnDir>`.
 *
 * <turnDir>/request.json: { cwd, model?, systemPrompt? }; <turnDir>/prompt.txt: the prompt.
 * Writes <turnDir>/exit.json { code } last. A <turnDir>/cancel file stops the agent.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { schemaInstruction } from './pi-events.ts';

/** Always leaves exit.json behind, so the provider never waits on a turn that crashed. */
export async function paneTurn(turnDir: string): Promise<void> {
  try {
    await runTurn(turnDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[herdr-turn] crashed: ${message}`);
    writeFileSync(join(turnDir, 'exit.json'), JSON.stringify({ code: -1, error: message }));
  }
}

/**
 * The real Claude executable. On Windows `claude` is an npm .cmd shim, and Bun refuses to pass
 * JSON arguments through cmd.exe, so read the .exe path out of the shim. CLAUDE_BIN_PATH overrides.
 */
export function claudeBinary(): string {
  if (process.env.CLAUDE_BIN_PATH) return process.env.CLAUDE_BIN_PATH;
  const found = Bun.which('claude');
  if (!found) throw new Error('claude CLI not found on PATH (set CLAUDE_BIN_PATH)');
  if (!/\.cmd$/i.test(found)) return found;
  const target = /"%dp0%\\([^"]+\.exe)"/i.exec(readFileSync(found, 'utf-8'));
  if (!target) throw new Error(`cannot read the claude executable from ${found} (set CLAUDE_BIN_PATH)`);
  return join(dirname(found), target[1]);
}

/**
 * The Pi command without cmd.exe: `pi.cmd` is `node "%~dp0pi-launcher.js" %*`, so run node on the
 * launcher directly (same quoting problem as claude). PI_BIN_PATH overrides with a plain executable.
 */
export function piCommand(): string[] {
  if (process.env.PI_BIN_PATH) return [process.env.PI_BIN_PATH];
  const found = Bun.which('pi');
  if (!found) throw new Error('pi CLI not found on PATH (set PI_BIN_PATH)');
  if (!/\.cmd$/i.test(found)) return [found];
  const launcher = /node\s+"%~dp0([^"]+)"/i.exec(readFileSync(found, 'utf-8'));
  const node = Bun.which('node');
  if (!launcher || !node) throw new Error(`cannot read the pi launcher from ${found} (set PI_BIN_PATH)`);
  return [node, join(dirname(found), launcher[1])];
}

/** The agent command for a turn request; the prompt always goes on stdin. */
export function agentCommand(req: Record<string, any>): string[] {
  if (req.agent === 'pi') {
    // --no-session: the turn is one-shot; Archon owns the conversation state.
    const args = ['--mode', 'json', '--no-session'];
    if (req.model) args.push('--model', req.model);
    if (req.systemPrompt) args.push('--append-system-prompt', req.systemPrompt);
    if (req.jsonSchema) args.push('--append-system-prompt', schemaInstruction(req.jsonSchema));
    return [...piCommand(), ...args];
  }
  // Same permission mode as Archon's built-in Claude provider (claude/provider.ts:952).
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];
  if (req.model) args.push('--model', req.model);
  if (req.systemPrompt) args.push('--append-system-prompt', req.systemPrompt);
  if (req.jsonSchema) args.push('--json-schema', JSON.stringify(req.jsonSchema));
  return [claudeBinary(), ...args];
}

async function runTurn(turnDir: string): Promise<void> {
const req = JSON.parse(readFileSync(join(turnDir, 'request.json'), 'utf-8'));
const events = join(turnDir, 'events.jsonl');
writeFileSync(events, '');

console.log(`[herdr-turn] ${turnDir}\n[herdr-turn] ${req.agent ?? 'claude'} ${req.model ?? '(default model)'} in ${req.cwd}\n`);
const child = Bun.spawn(agentCommand(req), {
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
    // pi --mode json
    if (ev.type === 'message_end' && ev.message?.role === 'assistant')
      for (const part of ev.message.content ?? []) if (part.type === 'text') console.log(part.text);
    if (ev.type === 'tool_execution_start') console.log(`  > ${ev.toolName} ${JSON.stringify(ev.args ?? {}).slice(0, 160)}`);
    if (ev.type === 'tool_execution_end') console.log(`  < ${ev.isError ? 'error' : 'ok'}`);
    if (ev.type === 'agent_settled') console.log(`\n[result] ${ev.aborted ? 'aborted' : 'settled'}`);
  } catch {
    console.log(line);
  }
}
