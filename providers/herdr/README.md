# archon-provider-herdr

External Archon provider plugin (`provider-herdr`, id `herdr`). It will run Claude Code or Pi turns
in visible Herdr panes. This build is the scaffold: the protocol, chunk mapping, cancellation and
conformance tests are in place, and the real pane runner is not yet written.

## Capabilities declared

Declared in `src/descriptor.ts`. Each flag states what this build does today.

| Flag | Value | Reason |
|------|-------|--------|
| `skills` | `true` | Turns can use skills from the operator's Claude Code / Pi setup |
| `backgroundWork` | `none` | No background subtasks are observed yet |
| `sessionResume` / `sessionFork` | `false` | No session ids are reported yet |
| `structuredOutput` | `false` | No output-format translation yet |
| everything else | `false` | Not wired |

Credentials: `specs: []`. Archon delivers no key. Panes use the operator's own login.
`checkCredential` returns `not_checked`, because a real check would need a live pane.

Model refs are passed as `claude/<model>` or `pi/<vendor/model>`. `ownsUnprefixedModelRefs` is not set.

## Layout

| Path | Purpose |
|------|---------|
| `archon-plugin.json` | Provider manifest (`executable: archon-provider-herdr`) |
| `src/descriptor.ts` | Descriptor sent during `initialize` |
| `src/runner.ts` | `TurnRunner` interface, `RunnerEvent` union, `FakeRunner`, placeholder `HerdrRunner` |
| `src/provider.ts` | `HerdrProvider` (`IAgentProvider`): maps runner events to chunks, honours abort |
| `src/main.ts` | Entry point. `ARCHON_HERDR_FAKE=1` selects `FakeRunner`, otherwise `HerdrRunner` |
| `test/conformance.test.ts` | `runProviderConformance` with the fake runner, plus behaviour tests |
| `test/protocol.test.ts` | Spawns `bun src/main.ts` and drives it over stdio with `connectProvider` |

## Testing

```powershell
cd D:\workspace\personal\software-factory-medin\providers\herdr
bun install
bun test
bun x tsc --noEmit
```

`bun` is at `C:\Users\emili\.cache\factory\bun\bun-v1.4.4\bun-windows-x64\bun.exe`.

The contract package is linked with `file:` to the pinned Archon engine at
`C:/Users/emili/.cache/factory/archon/120f3e040f45c0ad88249601d846e414f4bf438b/packages/provider-contract`.
Do not write under that directory.

## TODO: real HerdrRunner

`HerdrRunner.run()` in `src/runner.ts` throws `misconfigured` with the evidence
`herdr runner not implemented`. The real runner must:

1. Start or attach to a Claude Code or Pi CLI in a Herdr pane under `req.cwd`.
2. Read its event stream and yield `RunnerEvent` values (text, tool calls and results, done or error).
3. Stop the pane process when `req.signal` aborts.
4. Map its failures to `ProviderFailureClass` (`auth`, `rate_limited`, `transient`, and so on).

Flip capability flags only when the matching behaviour is wired and tested.
