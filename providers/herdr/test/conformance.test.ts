import { expect, test } from 'bun:test';
import { runProviderConformance } from '@archon/provider-contract/conformance';
import type { ProviderChunk } from '@archon/provider-contract';
import { descriptor } from '../src/descriptor.ts';
import { HerdrProvider } from '../src/provider.ts';
import { FakeRunner, HerdrRunner, HerdrRunnerError } from '../src/runner.ts';

const cwd = process.cwd();

async function collect(stream: AsyncIterable<unknown>): Promise<ProviderChunk[]> {
  const out: ProviderChunk[] = [];
  for await (const chunk of stream) out.push(chunk as ProviderChunk);
  return out;
}

test('a finished turn closes the runner so its cleanup (tab close) runs', async () => {
  let cleaned = 0;
  const runner = {
    async *run() {
      try {
        yield { type: 'done' as const, text: 'ok', stopReason: 'end_turn' as const };
        yield { type: 'text' as const, text: 'never pulled' };
      } finally {
        cleaned++;
      }
    },
  };
  const chunks = await collect(new HerdrProvider(runner).sendQuery('hello', cwd));
  expect(chunks.map(chunk => chunk.type)).toEqual(['result', 'settled']);
  expect(cleaned).toBe(1);
});

test('in-process fake provider conforms to the provider contract', async () => {
  const provider = new HerdrProvider(new FakeRunner());
  const failures = await runProviderConformance({
    capabilities: provider.getCapabilities(),
    turns: [{ name: 'turn', run: () => provider.sendQuery('hello', cwd) }],
    toolTurn: { name: 'tool turn', run: () => provider.sendQuery('tool-turn', cwd) },
    failureCases: [
      {
        name: 'transient failure',
        expected: 'transient',
        evidence: 'connection reset',
        run: () => provider.sendQuery('failure', cwd),
      },
    ],
  });
  expect(failures).toEqual([]);
});

test('a successful turn yields one result then settled, last', async () => {
  const provider = new HerdrProvider(new FakeRunner());
  const chunks = await collect(provider.sendQuery('hello', cwd));
  const types = chunks.map(chunk => chunk.type);
  expect(types).toEqual(['agent_message_chunk', 'result', 'settled']);
  const result = chunks[1];
  if (result.type !== 'result') throw new Error('missing result');
  expect(result.isError).toBeUndefined();
  expect(result.stopReason).toBe('end_turn');
  expect(result.tokens).toEqual({ input: 3, output: 2, total: 5, cost: 0 });
  expect(result.cost).toBe(0);
});

test('a failed turn carries a typed failure with the runner evidence', async () => {
  const provider = new HerdrProvider(new FakeRunner());
  const chunks = await collect(provider.sendQuery('failure', cwd));
  expect(chunks.map(chunk => chunk.type)).toEqual(['result', 'settled']);
  const result = chunks[0];
  if (result.type !== 'result') throw new Error('missing result');
  expect(result.isError).toBe(true);
  expect(result.failure).toEqual({
    class: 'transient',
    evidence: 'fake runner: connection reset',
  });
});

test('an interrupted tool call closes as cancelled before the result', async () => {
  const provider = new HerdrProvider(new FakeRunner());
  const chunks = await collect(provider.sendQuery('tool-turn', cwd));
  const updates = chunks.filter(chunk => chunk.type === 'tool_call_update');
  expect(updates).toEqual([
    { type: 'tool_call_update', toolCallId: 'fake-tool-1', status: 'completed', output: 'contents' },
    { type: 'tool_call_update', toolCallId: 'fake-tool-2', status: 'cancelled' },
  ]);
  const types = chunks.map(chunk => chunk.type);
  expect(types.indexOf('tool_call_update', types.lastIndexOf('tool_call'))).toBeLessThan(
    types.indexOf('result')
  );
  expect(types.at(-1)).toBe('settled');
});

test('abort stops the runner, reports cancelled, and still settles', async () => {
  const provider = new HerdrProvider(new FakeRunner());
  const abort = new AbortController();
  const chunks: ProviderChunk[] = [];
  for await (const chunk of provider.sendQuery('hang', cwd, undefined, {
    abortSignal: abort.signal,
  })) {
    chunks.push(chunk);
    if (chunk.type === 'agent_message_chunk') abort.abort();
  }
  expect(chunks.map(chunk => chunk.type)).toEqual(['agent_message_chunk', 'result', 'settled']);
  const result = chunks[1];
  if (result.type !== 'result') throw new Error('missing result');
  expect(result.stopReason).toBe('cancelled');
  expect(result.isError).toBeUndefined();
});

test('the real runner refuses to run outside a Herdr terminal', async () => {
  const saved = process.env.HERDR_ENV;
  delete process.env.HERDR_ENV;
  try {
    const chunks = await collect(new HerdrProvider(new HerdrRunner()).sendQuery('hello', cwd));
    expect(chunks.map(chunk => chunk.type)).toEqual(['result', 'settled']);
    const result = chunks[0];
    if (result.type !== 'result') throw new Error('missing result');
    expect(result.failure?.class).toBe('misconfigured');
    expect(result.failure?.evidence).toContain('HERDR_ENV');
    await expect(
      collect(new HerdrRunner().run({ prompt: 'x', cwd, signal: new AbortController().signal }))
    ).rejects.toBeInstanceOf(HerdrRunnerError);
  } finally {
    if (saved !== undefined) process.env.HERDR_ENV = saved;
  }
});

test('checkCredential reports not_checked and descriptor declares no credential specs', async () => {
  const provider = new HerdrProvider(new FakeRunner());
  expect(await provider.checkCredential()).toEqual({ state: 'not_checked', source: 'native' });
  expect(descriptor.credentials.specs).toEqual([]);
  expect(provider.getType()).toBe('herdr');
});
