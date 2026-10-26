import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mapClaudeLine } from '../src/claude-events.ts';
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
