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
