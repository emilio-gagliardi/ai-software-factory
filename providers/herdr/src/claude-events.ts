import type { RunnerEvent, JsonValue } from './runner.ts';

/**
 * Maps one line of `claude -p --output-format stream-json --verbose` to runner events.
 * Unknown line types map to nothing: the CLI adds event kinds over time and none of them
 * may break a turn. The final `result` line is the only source of `done`/`error`.
 */
export function mapClaudeLine(line: unknown): RunnerEvent[] {
  if (!line || typeof line !== 'object') return [];
  const ev = line as Record<string, any>;
  if (ev.type === 'assistant') {
    const out: RunnerEvent[] = [];
    for (const part of ev.message?.content ?? []) {
      if (part.type === 'text' && part.text) out.push({ type: 'text', text: part.text });
      if (part.type === 'tool_use')
        out.push({
          type: 'tool_call',
          id: String(part.id),
          name: String(part.name),
          input: (part.input ?? {}) as Record<string, JsonValue>,
        });
    }
    return out;
  }
  if (ev.type === 'user') {
    const out: RunnerEvent[] = [];
    for (const part of ev.message?.content ?? []) {
      if (part.type !== 'tool_result') continue;
      const content = Array.isArray(part.content)
        ? part.content.map((c: any) => c.text ?? '').join('')
        : String(part.content ?? '');
      out.push({
        type: 'tool_result',
        id: String(part.tool_use_id),
        status: part.is_error ? 'failed' : 'completed',
        output: content,
      });
    }
    return out;
  }
  if (ev.type === 'result') {
    if (ev.is_error || ev.subtype !== 'success') {
      return [{ type: 'error', failureClass: classify(ev), evidence: String(ev.result ?? ev.subtype ?? 'claude error') }];
    }
    return [
      {
        type: 'done',
        text: typeof ev.result === 'string' ? ev.result : undefined,
        tokens: ev.usage
          ? { input: Number(ev.usage.input_tokens ?? 0), output: Number(ev.usage.output_tokens ?? 0) }
          : undefined,
        costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : undefined,
        stopReason: 'end_turn',
      },
    ];
  }
  return [];
}

// ponytail: keyword classification of the CLI's error text; widen when real failures show other wording.
function classify(ev: Record<string, any>): 'rate_limited' | 'auth' | 'quota_exhausted' | 'unknown' {
  const text = `${ev.subtype ?? ''} ${ev.result ?? ''}`.toLowerCase();
  if (text.includes('rate limit') || text.includes('429')) return 'rate_limited';
  if (text.includes('usage limit') || text.includes('quota')) return 'quota_exhausted';
  if (text.includes('auth') || text.includes('login') || text.includes('401')) return 'auth';
  return 'unknown';
}
