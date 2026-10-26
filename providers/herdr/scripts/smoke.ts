// Live smoke test: one real turn in a Herdr pane. Run from inside Herdr:
//   bun scripts/smoke.ts [model]      (default claude/haiku)
import { HerdrRunner } from '../src/runner.ts';

const events = [];
for await (const ev of new HerdrRunner().run({
  prompt: 'Reply with exactly the text: herdr-ok',
  cwd: process.cwd(),
  model: process.argv[2] ?? 'claude/haiku',
  signal: new AbortController().signal,
})) {
  events.push(ev);
  console.log(JSON.stringify(ev));
}
const done = events.find(ev => ev.type === 'done');
if (!done || !String(done.text).includes('herdr-ok')) throw new Error('smoke failed');
console.log('[OK] herdr smoke passed');

// Structured output: the node output_format path Archon uses for gated nodes.
let structured: unknown;
for await (const ev of new HerdrRunner().run({
  prompt: 'Return status "ok" and the number 7.',
  cwd: process.cwd(),
  model: process.argv[2] ?? 'claude/haiku',
  jsonSchema: {
    type: 'object',
    properties: { status: { type: 'string' }, n: { type: 'integer' } },
    required: ['status', 'n'],
    additionalProperties: false,
  },
  signal: new AbortController().signal,
})) {
  if (ev.type === 'done') structured = ev.structuredOutput;
  if (ev.type === 'error') throw new Error(`structured smoke failed: ${ev.evidence}`);
}
console.log(JSON.stringify(structured));
if ((structured as any)?.status !== 'ok' || (structured as any)?.n !== 7) throw new Error('structured smoke failed');
console.log('[OK] herdr structured smoke passed');
