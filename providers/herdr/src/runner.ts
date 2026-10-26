import type { ProviderFailureClass, ProviderStopReason } from '@archon/provider-contract';
import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { mapClaudeLine } from './claude-events.ts';

/** A JSON value, as the provider contract's tool-call input requires. */
export type JsonValue = z.infer<ReturnType<typeof z.json>>;

/**
 * A runner drives one turn in a Herdr pane (or, for tests, in memory) and reports what
 * happened as a stream of RunnerEvent values. The provider maps these onto Archon chunks.
 *
 * Contract for implementers:
 *  - Yield `done` or `error` exactly once, as the last event of a turn. Stopping early
 *    because `signal` aborted is allowed; the provider reports the cancellation itself.
 *  - Every `tool_call` must be followed by a `tool_result` with the same id, unless the
 *    turn is interrupted (the provider then closes the call as `cancelled`).
 */
export type RunnerEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input?: Record<string, JsonValue> }
  | { type: 'tool_result'; id: string; status: 'completed' | 'failed'; output?: string }
  | {
      type: 'done';
      text?: string;
      tokens?: { input: number; output: number };
      costUsd?: number;
      stopReason?: ProviderStopReason;
      structuredOutput?: unknown;
    }
  | { type: 'error'; failureClass: ProviderFailureClass; evidence: string };

export interface TurnRequest {
  prompt: string;
  cwd: string;
  model?: string;
  systemPrompt?: string;
  /** JSON Schema the final answer must satisfy (the node's output_format). */
  jsonSchema?: Record<string, unknown>;
  signal: AbortSignal;
}

export interface TurnRunner {
  run(req: TurnRequest): AsyncIterable<RunnerEvent>;
}

/**
 * Deterministic runner for tests and for `ARCHON_HERDR_FAKE=1`. Behaviour is chosen by prompt:
 *  - `failure`      emits a transient error whose evidence is fixed text
 *  - `tool-turn`    completes one tool call, starts a second, then fails mid-turn
 *  - `hang`         emits text, then waits until the signal aborts
 *  - anything else  echoes the prompt as text and finishes with usage
 */
export class FakeRunner implements TurnRunner {
  async *run(req: TurnRequest): AsyncGenerator<RunnerEvent> {
    if (req.prompt === 'failure') {
      yield { type: 'error', failureClass: 'transient', evidence: 'fake runner: connection reset' };
      return;
    }
    if (req.prompt === 'tool-turn') {
      yield { type: 'tool_call', id: 'fake-tool-1', name: 'read_file', input: { path: 'a.txt' } };
      yield { type: 'tool_result', id: 'fake-tool-1', status: 'completed', output: 'contents' };
      yield { type: 'tool_call', id: 'fake-tool-2', name: 'write_file', input: { path: 'b.txt' } };
      yield { type: 'error', failureClass: 'transient', evidence: 'fake runner: interrupted' };
      return;
    }
    if (req.prompt === 'hang') {
      yield { type: 'text', text: 'working' };
      await new Promise<void>(resolve =>
        req.signal.addEventListener('abort', () => resolve(), { once: true })
      );
      return;
    }
    yield { type: 'text', text: `fake: ${req.prompt}` };
    yield {
      type: 'done',
      text: `fake: ${req.prompt}`,
      tokens: { input: 3, output: 2 },
      costUsd: 0,
      stopReason: 'end_turn',
    };
  }
}

/** Thrown by the real runner when its prerequisites are missing; the provider maps it to a typed failure. */
export class HerdrRunnerError extends Error {
  constructor(
    public readonly failureClass: ProviderFailureClass,
    public readonly evidence: string
  ) {
    super(evidence);
    this.name = 'HerdrRunnerError';
  }
}

/**
 * Runs each turn as `claude -p --output-format stream-json` in its own tab of a Herdr
 * workspace labelled `Factory`, so the turn is watchable live. The pane writes raw events to
 * a turn directory; this runner tails that file. Herdr is the viewing surface, the file is
 * the data channel (Herdr's own read API is text-only).
 */
export class HerdrRunner implements TurnRunner {
  constructor(private readonly herdr: (args: string[]) => any = herdrCli) {}

  async *run(req: TurnRequest): AsyncGenerator<RunnerEvent> {
    if (process.env.HERDR_ENV !== '1')
      throw new HerdrRunnerError('misconfigured', 'not running inside a Herdr terminal (HERDR_ENV!=1): launch the factory from a Herdr pane');
    const { agent, model } = parseModel(req.model);
    if (agent !== 'claude') throw new HerdrRunnerError('misconfigured', `herdr agent '${agent}' not supported yet (claude only)`);

    const turnDir = join(process.env.ARCHON_HOME ?? join(homedir(), '.archon'), 'herdr', 'turns', `${Date.now()}-${randomUUID().slice(0, 8)}`);
    mkdirSync(turnDir, { recursive: true });
    writeFileSync(join(turnDir, 'prompt.txt'), req.prompt);
    writeFileSync(join(turnDir, 'request.json'), JSON.stringify({ cwd: req.cwd, model, systemPrompt: req.systemPrompt, jsonSchema: req.jsonSchema }));

    const command = paneCommand(turnDir);
    const tab = this.herdr(['tab', 'create', '--workspace', factoryWorkspace(this.herdr, req.cwd), '--cwd', req.cwd, '--label', basename(turnDir), '--no-focus']).result;
    this.herdr(['pane', 'run', tab.root_pane.pane_id, ...command]);

    let finished = false;
    let failed = false;
    try {
      for await (const line of tailLines(join(turnDir, 'events.jsonl'), join(turnDir, 'exit.json'), req.signal)) {
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { continue; }
        for (const ev of mapClaudeLine(parsed)) {
          if (ev.type === 'done' || ev.type === 'error') { finished = true; failed = ev.type === 'error'; }
          yield ev;
        }
      }
      if (req.signal.aborted) { writeFileSync(join(turnDir, 'cancel'), ''); return; }
      if (!finished) {
        failed = true;
        const exit = existsSync(join(turnDir, 'exit.json')) ? readFileSync(join(turnDir, 'exit.json'), 'utf-8') : 'no exit record';
        yield { type: 'error', failureClass: 'unknown', evidence: `claude ended without a result (${exit}); transcript: ${turnDir}` };
      }
    } finally {
      // Failed turns keep their tab open for inspection; HERDR_KEEP_PANES=1 keeps every tab.
      if (!failed && !req.signal.aborted && process.env.HERDR_KEEP_PANES !== '1') this.herdr(['tab', 'close', tab.tab.tab_id]);
    }
  }
}

export function parseModel(model?: string): { agent: string; model?: string } {
  if (!model) return { agent: 'claude' };
  const slash = model.indexOf('/');
  if (slash < 0) return { agent: 'claude', model };
  return { agent: model.slice(0, slash), model: model.slice(slash + 1) || undefined };
}

/** The pane command: the provider binary re-invoked as `pane-turn` (compiled) or via bun (dev). */
export function paneCommand(turnDir: string): string[] {
  const dev = basename(process.execPath).toLowerCase().startsWith('bun');
  const command = dev ? [process.execPath, join(import.meta.dir, 'main.ts'), 'pane-turn', turnDir] : [process.execPath, 'pane-turn', turnDir];
  // ponytail: no shell quoting; panes may run pwsh or cmd, so refuse paths that would need it.
  if (command.some(part => /\s/.test(part))) throw new HerdrRunnerError('misconfigured', `path with whitespace cannot be run in a pane: ${command.join(' ')}`);
  return command;
}

function factoryWorkspace(herdr: (args: string[]) => any, cwd: string): string {
  const existing = herdr(['workspace', 'list']).result.workspaces.find((w: any) => w.label === 'Factory');
  return existing ? existing.workspace_id : herdr(['workspace', 'create', '--label', 'Factory', '--cwd', cwd, '--no-focus']).result.workspace.workspace_id;
}

function herdrCli(args: string[]): any {
  const out = Bun.spawnSync(['herdr', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const text = out.stdout.toString();
  if (out.exitCode !== 0) throw new HerdrRunnerError('misconfigured', `herdr ${args[0]} ${args[1]} failed: ${text || out.stderr.toString()}`);
  return text.trim() ? JSON.parse(text) : {};
}

/** Yields complete lines appended to `file` until `doneMarker` exists and the file is drained, or abort. */
export async function* tailLines(file: string, doneMarker: string, signal: AbortSignal, pollMs = 250): AsyncGenerator<string> {
  let offset = 0;
  let partial = '';
  while (!signal.aborted) {
    const done = existsSync(doneMarker);
    if (existsSync(file)) {
      const data = readFileSync(file);
      if (data.length > offset) {
        partial += data.subarray(offset).toString('utf-8');
        offset = data.length;
        const lines = partial.split('\n');
        partial = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) yield line;
      }
    }
    if (done) { if (partial.trim()) yield partial; return; }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}
