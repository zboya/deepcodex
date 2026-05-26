/**
 * WailsAgent — adapter that lets the official AG-UI client SDK consume our
 * Wails-event-based transport.
 *
 * The deepcodex backend translates harness streaming events into AG-UI events
 * and emits them on a single Wails event channel ("agui:event"). This class
 * subclasses AbstractAgent from @ag-ui/client and implements its `run()`
 * method by:
 *   1. Subscribing to `agui:event` and pushing decoded events into an RxJS
 *      Observable<BaseEvent>.
 *   2. Triggering the backend run via the existing Wails-bound `SendMessage`
 *      method (so we don't have to invent a new RPC just to start a run).
 *   3. Completing the observable on RUN_FINISHED / RUN_ERROR and unwiring
 *      the Wails listener on teardown.
 *
 * This keeps every UI consumer that talks to AbstractAgent (CopilotKit,
 * `agent.runAgent(...)`, `agent.subscribe(...)`, etc.) fully reusable, and
 * the day we want to switch to HTTP+SSE we only swap this class for
 * `HttpAgent` from @ag-ui/client.
 */

import { AbstractAgent, type AgentConfig } from '@ag-ui/client';
import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import { Observable } from 'rxjs';

import { Events } from '@wailsio/runtime';
import { SendMessage, StopMessage } from '../../bindings/github.com/zboya/deepcodex/app';

const CHANNEL = 'agui:event';

export interface WailsAgentConfig extends AgentConfig {
  /** Project ID forwarded to backend SendMessage(projectId, chatId, ...). */
  projectId?: string;
}

export class WailsAgent extends AbstractAgent {
  /** Project the run targets; can be updated between runs. */
  projectId: string;

  /**
   * Image paths to attach to the next outgoing user message.
   * The frontend (InputArea) lets the user pick image files via the native
   * file dialog (triggered by typing `@`); the resulting absolute paths are
   * stored here and forwarded to the backend on the next `runAgent()` call.
   * Cleared automatically once consumed.
   */
  pendingImagePaths: string[] = [];

  private runActive = false;
  private stopRequested = false;

  constructor({ projectId = '', ...rest }: WailsAgentConfig = {}) {
    super(rest);
    this.projectId = projectId;
  }

  override abortRun() {
    this.stopRequested = true;
    if (this.runActive) {
      StopMessage(this.projectId).catch(() => {
        /* best-effort cancel */
      });
    }
    super.abortRun();
  }

  /**
   * Implements the abstract `run` from AbstractAgent. Wires a Wails listener,
   * triggers the backend send, and forwards decoded events into the SDK.
   */
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let cancelled = false;
      this.runActive = true;
      this.stopRequested = false;

      // 1. Listen for AG-UI events flowing back from the backend.
      const off = Events.On(CHANNEL, (event) => {
        if (cancelled) return;
        const evt = decodeEvent(event.data);
        if (!evt) return;
        subscriber.next(evt);
        if (
          evt.type === EventType.RUN_FINISHED ||
          evt.type === EventType.RUN_ERROR
        ) {
          this.runActive = false;
          subscriber.complete();
        }
      });

      // 2. Kick off the backend run. We pass the latest user message as the
      //    payload, because the existing SendMessage signature expects a
      //    plain string. AbstractAgent has already pushed the user message
      //    into `input.messages` for us.
      const lastUser = [...input.messages].reverse()
        .find((m) => m.role === 'user');
      const text = typeof lastUser?.content === 'string' ? lastUser.content : '';

      // Snapshot & clear pending images so concurrent typing won't leak
      // attachments into a subsequent run.
      const imagePaths = this.pendingImagePaths;
      this.pendingImagePaths = [];

      SendMessage(
        this.projectId,
        input.threadId, // threadId == backend chatID / sessionID
        text,
        imagePaths,
        {
          continueSession: false,
          resumeSessionID: input.threadId,
        },
      ).catch((err: unknown) => {
        console.error('[WailsAgent] SendMessage rejected', err);
        this.runActive = false;
        if (!cancelled) subscriber.error(err);
      });

      // 3. Teardown: unwire the listener. Do not call StopMessage here:
      // AG-UI also tears subscriptions down after normal completion, and
      // treating every teardown as cancellation races with the mock stream.
      return () => {
        cancelled = true;
        off();
        this.runActive = false;
      };
    });
  }
}

/**
 * Decode the raw payload Wails delivers. The backend pre-marshals events as
 * `json.RawMessage`, so we can receive either:
 *   - an already-parsed object (Wails decodes JSON automatically), OR
 *   - a JSON string (older Wails behaviour).
 * Both cases are normalized to `BaseEvent`.
 */
function decodeEvent(raw: unknown): BaseEvent | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BaseEvent;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') {
    return raw as BaseEvent;
  }
  return null;
}