import { serveProvider } from '@archon/provider-contract/plugin';
import { descriptor } from './descriptor.ts';
import { paneTurn } from './pane-turn.ts';
import { HerdrProvider } from './provider.ts';
import { FakeRunner, HerdrRunner } from './runner.ts';

// `pane-turn <dir>` is the per-turn wrapper run inside a Herdr pane (see runner.ts paneCommand).
const sub = process.argv.indexOf('pane-turn');
if (sub >= 0) {
  await paneTurn(process.argv[sub + 1]);
} else {
  // stdout carries JSON-RPC only. Diagnostics go through the provider log sink, never console.log.
  const useFake = process.env.ARCHON_HERDR_FAKE === '1';
  await serveProvider({
    descriptor,
    create: log =>
      useFake
        ? new HerdrProvider(new FakeRunner(), log, 'fake')
        : new HerdrProvider(new HerdrRunner(), log, 'herdr'),
  });
}
