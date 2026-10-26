import {
  truncateToolOutput,
  type CredentialStatus,
  type IAgentProvider,
  type ProviderCapabilities,
  type ProviderChunk,
  type ProviderFailureClass,
  type ProviderStopReason,
  type SendQueryOptions,
} from '@archon/provider-contract';
import type { ProviderLogSink } from '@archon/provider-contract/plugin';
import { descriptor } from './descriptor.ts';
import { HerdrRunnerError, type RunnerEvent, type TurnRunner } from './runner.ts';

type ResultChunk = Extract<ProviderChunk, { type: 'result' }>;

const ABORTED = 'aborted' as const;

/** Resolves once the signal aborts, including when it was already aborted. */
function abortSignalled(signal: AbortSignal): { promise: Promise<typeof ABORTED>; dispose(): void } {
  let onAbort: (() => void) | undefined;
  const promise = new Promise<typeof ABORTED>(resolve => {
    if (signal.aborted) resolve(ABORTED);
    else {
      onAbort = (): void => resolve(ABORTED);
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  return {
    promise,
    dispose(): void {
      if (onAbort) signal.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * Archon provider that delegates each turn to a TurnRunner and maps its events onto the
 * provider chunk contract. Every turn yields exactly one `result`, then one `settled`.
 * Tool calls still open when a turn ends close as `cancelled` before the `result`.
 */
export class HerdrProvider implements IAgentProvider {
  constructor(
    private readonly runner: TurnRunner,
    private readonly log?: ProviderLogSink,
    private readonly runnerKind = 'herdr'
  ) {}

  getType(): string {
    return descriptor.id;
  }

  getCapabilities(): ProviderCapabilities {
    return descriptor.capabilities;
  }

  /**
   * Archon delivers no credential to this provider, and a check would need a live pane, so the
   * status is `not_checked`. Nothing is read from the environment.
   */
  async checkCredential(): Promise<CredentialStatus> {
    return { state: 'not_checked', source: 'native' };
  }

  async *sendQuery(
    prompt: string,
    cwd: string,
    _resumeSessionId?: string,
    options?: SendQueryOptions
  ): AsyncGenerator<ProviderChunk> {
    const signal = options?.abortSignal ?? new AbortController().signal;
    const openCalls = new Map<string, string>();
    const usage: { text?: string; tokens?: { input: number; output: number }; costUsd?: number } =
      {};
    let stopReason: ProviderStopReason | undefined;
    let failure: { class: ProviderFailureClass; evidence: string } | undefined;
    let finished = false;
    let completed = false;

    await this.log?.({
      level: 'info',
      msg: 'herdr.turn.started',
      bindings: { runner: this.runnerKind },
    });

    const aborted = abortSignalled(signal);
    try {
      const iterator = this.runner
        .run({
          prompt,
          cwd,
          ...(options?.model !== undefined ? { model: options.model } : {}),
          ...(typeof options?.systemPrompt === 'string'
            ? { systemPrompt: options.systemPrompt }
            : {}),
          signal,
        })
        [Symbol.asyncIterator]();

      while (!finished) {
        const next = iterator.next();
        next.catch(() => undefined);
        const step = await Promise.race([next, aborted.promise]);
        if (step === ABORTED) {
          void iterator.return?.(undefined)?.catch(() => undefined);
          break;
        }
        if (step.done) break;
        const event: RunnerEvent = step.value;
        switch (event.type) {
          case 'text':
            if (event.text.length > 0) yield { type: 'agent_message_chunk', text: event.text };
            break;
          case 'tool_call':
            openCalls.set(event.id, event.name);
            yield {
              type: 'tool_call',
              toolCallId: event.id,
              name: event.name,
              title: event.name,
              ...(event.input !== undefined ? { rawInput: event.input } : {}),
            };
            break;
          case 'tool_result':
            if (openCalls.delete(event.id)) {
              yield {
                type: 'tool_call_update',
                toolCallId: event.id,
                status: event.status,
                ...(event.output !== undefined ? truncateToolOutput(event.output) : {}),
              };
            }
            break;
          case 'done':
            usage.text = event.text;
            usage.tokens = event.tokens;
            usage.costUsd = event.costUsd;
            stopReason = event.stopReason;
            completed = true;
            finished = true;
            break;
          case 'error':
            failure = { class: event.failureClass, evidence: event.evidence };
            finished = true;
            break;
        }
      }
    } catch (error) {
      failure = this.classifyThrown(error);
    } finally {
      aborted.dispose();
    }

    // A tool call the turn did not finish closes as cancelled, before the result.
    for (const toolCallId of openCalls.keys()) {
      yield { type: 'tool_call_update', toolCallId, status: 'cancelled' };
    }

    const result: ResultChunk = { type: 'result' };
    if (signal.aborted) {
      result.stopReason = 'cancelled';
      if (usage.text !== undefined) result.text = usage.text;
    } else if (failure) {
      result.isError = true;
      result.failure = failure;
    } else if (!completed) {
      // The runner ended without a done or error event.
      result.isError = true;
      result.failure = {
        class: 'unknown',
        evidence: 'herdr runner ended without a done or error event',
      };
    } else {
      if (usage.text !== undefined) result.text = usage.text;
      if (usage.tokens !== undefined) {
        result.tokens = {
          input: usage.tokens.input,
          output: usage.tokens.output,
          total: usage.tokens.input + usage.tokens.output,
          ...(usage.costUsd !== undefined ? { cost: usage.costUsd } : {}),
        };
      }
      if (usage.costUsd !== undefined) result.cost = usage.costUsd;
      if (stopReason !== undefined) result.stopReason = stopReason;
    }
    yield result;
    yield { type: 'settled' };
  }

  private classifyThrown(error: unknown): { class: ProviderFailureClass; evidence: string } {
    if (error instanceof HerdrRunnerError) {
      return { class: error.failureClass, evidence: error.evidence };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { class: 'unknown', evidence: `herdr runner threw: ${message}` };
  }
}
