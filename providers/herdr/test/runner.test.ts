import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapClaudeLine } from '../src/claude-events.ts';
import { PiMapper } from '../src/pi-events.ts';
import { parseModel, tailLines } from '../src/runner.ts';

test('maps claude stream-json lines to runner events', () => {
  expect(mapClaudeLine({ type: 'system', subtype: 'init' })).toEqual([]);
  expect(
    mapClaudeLine({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a' } }] },
    })
  ).toEqual([
    { type: 'text', text: 'hi' },
    { type: 'tool_call', id: 't1', name: 'Read', input: { file_path: 'a' } },
  ]);
  expect(
    mapClaudeLine({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'ok' }] }] } })
  ).toEqual([{ type: 'tool_result', id: 't1', status: 'completed', output: 'ok' }]);
  expect(
    mapClaudeLine({ type: 'result', subtype: 'success', result: 'done', total_cost_usd: 0.01, usage: { input_tokens: 5, output_tokens: 7 } })
  ).toEqual([{ type: 'done', text: 'done', tokens: { input: 5, output: 7 }, costUsd: 0.01, stopReason: 'end_turn' }]);
  const [err] = mapClaudeLine({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'API Error: 429 rate limit' });
  expect(err).toEqual({ type: 'error', failureClass: 'rate_limited', evidence: 'API Error: 429 rate limit' });
});

// Record shapes copied from a real `pi --mode json` tool turn (trimmed).
const piAssistant = (text: string, input: number, output: number, cost: number) => ({
  type: 'message_end',
  message: { role: 'assistant', content: text ? [{ type: 'text', text }] : [], stopReason: 'stop', usage: { input, output, cost: { total: cost } } },
});

test('maps pi json records, summing usage across assistant messages', () => {
  const pi = new PiMapper();
  expect(pi.map({ type: 'session', cwd: 'x' })).toEqual([]);
  expect(pi.map(piAssistant('', 10, 2, 0.001))).toEqual([]);
  expect(pi.map({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'read', args: { path: 'a' } })).toEqual([
    { type: 'tool_call', id: 'c1', name: 'read', input: { path: 'a' } },
  ]);
  expect(pi.map({ type: 'tool_execution_end', toolCallId: 'c1', result: { content: [{ type: 'text', text: 'ok' }] }, isError: false })).toEqual([
    { type: 'tool_result', id: 'c1', status: 'completed', output: 'ok' },
  ]);
  expect(pi.map(piAssistant('pi-tool-ok', 5, 3, 0.002))).toEqual([{ type: 'text', text: 'pi-tool-ok' }]);
  expect(pi.map({ type: 'agent_settled', aborted: false })).toEqual([
    { type: 'done', text: 'pi-tool-ok', tokens: { input: 15, output: 5 }, costUsd: 0.003, stopReason: 'end_turn' },
  ]);
});

test('pi structured output parses the final JSON and fails typed otherwise', () => {
  const ok = new PiMapper(true);
  ok.map(piAssistant('```json\n{"status":"ok","n":7}\n```', 1, 1, 0));
  expect(ok.map({ type: 'agent_settled', aborted: false })[0]).toMatchObject({ type: 'done', structuredOutput: { status: 'ok', n: 7 } });
  const bad = new PiMapper(true);
  bad.map(piAssistant('no json here', 1, 1, 0));
  expect(bad.map({ type: 'agent_settled', aborted: false })[0]).toMatchObject({ type: 'error', failureClass: 'unknown' });
  // An earlier JSON-bearing message must not stand in for an empty final answer.
  const stale = new PiMapper(true);
  stale.map(piAssistant('{"status":"ok","n":7}', 1, 1, 0));
  stale.map(piAssistant('', 1, 0, 0));
  expect(stale.map({ type: 'agent_settled', aborted: false })[0]).toMatchObject({ type: 'error', failureClass: 'unknown' });
  const err = new PiMapper();
  err.map({ type: 'message_update', assistantMessageEvent: { type: 'error', error: { message: '429 rate limit' } } });
  expect(err.map({ type: 'agent_settled', aborted: false })).toEqual([{ type: 'error', failureClass: 'rate_limited', evidence: '429 rate limit' }]);
});

test('pi recovery after a retried error reports success; truncation fails', () => {
  const retried = new PiMapper();
  retried.map({ type: 'message_update', assistantMessageEvent: { type: 'error', error: { message: '503 overloaded' } } });
  retried.map({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: '503 overloaded' } });
  retried.map({ type: 'auto_retry_start' });
  retried.map(piAssistant('recovered', 2, 2, 0));
  retried.map({ type: 'auto_retry_end', success: true });
  expect(retried.map({ type: 'agent_settled', aborted: false })[0]).toMatchObject({ type: 'done', text: 'recovered' });

  const exhausted = new PiMapper();
  exhausted.map({ type: 'auto_retry_end', success: false, finalError: '429 rate limit' });
  expect(exhausted.map({ type: 'agent_settled', aborted: false })[0]).toMatchObject({ type: 'error', failureClass: 'rate_limited' });

  const cut = new PiMapper();
  cut.map({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'half an ans' }], stopReason: 'length', usage: {} } });
  expect(cut.map({ type: 'agent_settled', aborted: false })[0]).toMatchObject({ type: 'error', failureClass: 'unknown' });
});

test('parses provider-scoped model refs', () => {
  expect(parseModel()).toEqual({ agent: 'claude' });
  expect(parseModel('opus')).toEqual({ agent: 'claude', model: 'opus' });
  expect(parseModel('claude/sonnet')).toEqual({ agent: 'claude', model: 'sonnet' });
  expect(parseModel('pi/anthropic/haiku')).toEqual({ agent: 'pi', model: 'anthropic/haiku' });
});

test('tails appended lines until the exit marker, including a final partial line', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'herdr-tail-'));
  const file = join(dir, 'events.jsonl');
  const marker = join(dir, 'exit.json');
  writeFileSync(file, 'a\n');
  const lines: string[] = [];
  const reading = (async () => {
    for await (const line of tailLines(file, marker, new AbortController().signal, 10)) lines.push(line);
  })();
  await Bun.sleep(30);
  appendFileSync(file, 'b\nc');
  writeFileSync(marker, '{"code":0}');
  await reading;
  expect(lines).toEqual(['a', 'b', 'c']);
});
