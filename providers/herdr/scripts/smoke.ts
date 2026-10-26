// Live smoke test: one real turn in a Herdr pane. Run from inside Herdr:
//   bun scripts/smoke.ts [model]      (default claude/haiku)
import { HerdrProvider } from '../src/provider.ts';
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

// Through the provider, the path Archon uses: a successful turn must close its own tab.
const turnTabs = () => {
  const tabs = JSON.parse(Bun.spawnSync(['herdr', 'tab', 'list']).stdout.toString()).result.tabs;
  return tabs.filter((t: any) => /^\d{13}-[0-9a-f]{8}$/.test(t.label)).length;
};
const before = turnTabs();
let result: any;
for await (const chunk of new HerdrProvider(new HerdrRunner()).sendQuery('Reply with exactly the text: herdr-ok', process.cwd(), undefined, {
  model: process.argv[2] ?? 'claude/haiku',
} as any)) if (chunk.type === 'result') result = chunk;
if (result?.isError || !String(result?.text).includes('herdr-ok')) throw new Error(`provider smoke failed: ${JSON.stringify(result)}`);
if (turnTabs() !== before) throw new Error(`provider smoke left a turn tab open (${before} -> ${turnTabs()})`);
console.log('[OK] herdr provider smoke passed (tab closed)');
