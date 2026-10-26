import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { connectProvider } from '@archon/provider-contract/plugin';
import type { ProviderChunk } from '@archon/provider-contract';

const projectRoot = join(import.meta.dir, '..');
const entry = join(projectRoot, 'src', 'main.ts');

test('stdio protocol: initialize, session/new, session/prompt yield a result and settled', async () => {
  const child = spawn(process.execPath, [entry], {
    cwd: projectRoot,
    env: { ...process.env, ARCHON_HERDR_FAKE: '1' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const exited = new Promise<number | null>(resolve => child.once('close', code => resolve(code)));
  const client = await connectProvider({
    readable: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    writable: Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
  });
  try {
    expect(client.getType()).toBe('herdr');
    expect(client.getCapabilities().skills).toBe(true);

    const chunks: ProviderChunk[] = [];
    for await (const chunk of client.sendQuery('hello over stdio', projectRoot)) {
      chunks.push(chunk);
    }
    const types = chunks.map(chunk => chunk.type);
    expect(types).toContain('result');
    expect(types.at(-1)).toBe('settled');
    const result = chunks.find(chunk => chunk.type === 'result');
    expect(result).toMatchObject({ type: 'result', text: 'fake: hello over stdio' });
  } finally {
    await client.close();
    await exited;
  }
});
