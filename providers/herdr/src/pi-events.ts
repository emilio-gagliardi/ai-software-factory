import type { RunnerEvent, JsonValue } from './runner.ts';

/**
 * Maps `pi --mode json` JSONL to runner events. Unlike Claude's stream there is no single summary
 * line: usage arrives per assistant `message_end` and the turn ends at `agent_settled`, so the
 * mapper keeps the running totals. Unknown record types map to nothing.
 *
 * With `structured`, the final assistant text must be a JSON object (Pi has no schema flag; the
 * schema is put in the system prompt) and becomes `structuredOutput`.
 */
export class PiMapper {
  private text = '';
  private input = 0;
  private output = 0;
  private cost = 0;
  private failure?: string;
  private stopReason?: string;

  constructor(private readonly structured = false) {}

  map(line: unknown): RunnerEvent[] {
    if (!line || typeof line !== 'object') return [];
    const ev = line as Record<string, any>;
    if (ev.type === 'message_end' && ev.message?.role === 'assistant') {
      const msg = ev.message;
      this.input += Number(msg.usage?.input ?? 0);
      this.output += Number(msg.usage?.output ?? 0);
      this.cost += Number(msg.usage?.cost?.total ?? 0);
      // The latest assistant message is authoritative for the outcome AND the answer: a successful
      // retry clears an earlier failure, and an empty final message must not reuse earlier text.
      this.stopReason = msg.stopReason;
      this.failure = msg.stopReason === 'error' || msg.errorMessage ? String(msg.errorMessage ?? 'pi error') : undefined;
      const text = (msg.content ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
      this.text = text;
      return text ? [{ type: 'text', text }] : [];
    }
    if (ev.type === 'message_update' && ev.assistantMessageEvent?.type === 'error') {
      this.failure = String(ev.assistantMessageEvent.error?.message ?? ev.assistantMessageEvent.reason ?? 'pi stream error');
      return [];
    }
    if (ev.type === 'auto_retry_end') {
      this.failure = ev.success ? undefined : String(ev.finalError ?? this.failure ?? 'pi retries exhausted');
      return [];
    }
    if (ev.type === 'tool_execution_start')
      return [{ type: 'tool_call', id: String(ev.toolCallId), name: String(ev.toolName), input: (ev.args ?? {}) as Record<string, JsonValue> }];
    if (ev.type === 'tool_execution_end') {
      const output = (ev.result?.content ?? []).map((c: any) => c.text ?? '').join('');
      return [{ type: 'tool_result', id: String(ev.toolCallId), status: ev.isError ? 'failed' : 'completed', output }];
    }
    if (ev.type === 'agent_settled') return [this.finish(Boolean(ev.aborted))];
    return [];
  }

  private finish(aborted: boolean): RunnerEvent {
    if (aborted || this.failure)
      return { type: 'error', failureClass: classify(this.failure ?? 'aborted'), evidence: this.failure ?? 'pi turn aborted' };
    // Archon only checks truncation through schema validation, so a cut-off plain-text answer must not pass as done.
    if (this.stopReason === 'length')
      return { type: 'error', failureClass: 'unknown', evidence: 'pi answer truncated at the output limit (stopReason length)' };
    const done: RunnerEvent = {
      type: 'done',
      text: this.text,
      tokens: { input: this.input, output: this.output },
      costUsd: this.cost,
      stopReason: 'end_turn',
    };
    if (!this.structured) return done;
    try {
      // Models often fence JSON; take the outermost object.
      const json = JSON.parse(this.text.slice(this.text.indexOf('{'), this.text.lastIndexOf('}') + 1));
      return { ...done, structuredOutput: json };
    } catch {
      return { type: 'error', failureClass: 'unknown', evidence: `pi final answer is not a JSON object: ${this.text.slice(0, 200)}` };
    }
  }
}

/** The appended system prompt that stands in for Claude's --json-schema. */
export function schemaInstruction(schema: Record<string, unknown>): string {
  return `Your final answer must be only a JSON object that satisfies this JSON Schema, with no prose and no code fence:\n${JSON.stringify(schema)}`;
}

// ponytail: keyword classification, same ceiling as claude-events.ts.
function classify(text: string): 'rate_limited' | 'auth' | 'quota_exhausted' | 'unknown' {
  const t = text.toLowerCase();
  if (t.includes('rate limit') || t.includes('429')) return 'rate_limited';
  if (t.includes('quota') || t.includes('usage limit') || t.includes('insufficient')) return 'quota_exhausted';
  if (t.includes('auth') || t.includes('401') || t.includes('login')) return 'auth';
  return 'unknown';
}
