/**
 * WailsAgent adapts deepcodex's Wails event transport to the official AG-UI
 * AbstractAgent interface used by CopilotKit.
 *
 * The backend already emits standard AG-UI events on the Wails event channel
 * `agui:event`, so the frontend can use CopilotKit's official chat UI without
 * introducing an HTTP runtime. This class only owns the transport bridge and
 * a little bit of deepcodex-specific metadata (project/model selection).
 */

import { AbstractAgent, type AgentConfig } from '@ag-ui/client';
import {
  EventType,
  type BaseEvent,
  type InputContent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import { Observable } from 'rxjs';

import { Events } from '@wailsio/runtime';
import { SendMessage, StopMessage } from '../../bindings/github.com/zboya/deepcodex/app';
import { InputMessage, ProjectEntry } from '../../bindings/github.com/zboya/deepcodex/app/models';

const CHANNEL = 'agui:event';

export interface WailsAgentConfig extends AgentConfig {
  /** Project ID forwarded to backend StopMessage. */
  projectId?: string;
  /** Project entry forwarded to backend InputMessage.proj. */
  project?: ProjectEntry | null;
  /** Model used for new runs. Can be changed at runtime by setModel(). */
  model?: string;
}

type AttachmentPayload = {
  type: string;
  source?: {
    type: 'data' | 'url';
    value: string;
    mimeType?: string;
  };
  metadata?: Record<string, unknown>;
};

export class WailsAgent extends AbstractAgent {
  private configSnapshot: WailsAgentConfig;

  /** Project the run targets; can be updated between runs. */
  projectId: string;

  /** Full project entry passed to backend InputMessage.proj. */
  project: ProjectEntry | null;

  /** Model name used for subsequent runs. */
  private model: string;

  private runActive = false;
  private stopRequested = false;

  constructor({ projectId = '', project = null, model = '', ...rest }: WailsAgentConfig = {}) {
    super(rest);
    this.configSnapshot = { ...rest, projectId, project, model };
    this.projectId = projectId;
    this.project = project;
    this.model = model;
  }

  setProject(projectId: string, project: ProjectEntry | null) {
    this.projectId = projectId;
    this.project = project;
    this.configSnapshot = { ...this.configSnapshot, projectId, project };
  }

  setModel(model: string) {
    this.model = model;
    this.configSnapshot = { ...this.configSnapshot, model };
  }

  override clone() {
    const next = new WailsAgent(this.configSnapshot);
    next.projectId = this.projectId;
    next.project = this.project;
    next.model = this.model;
    next.setMessages([...this.messages]);
    next.setState({ ...this.state });
    return next;
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
   * Implements AbstractAgent.run by wiring Wails events into the AG-UI stream
   * and kicking off the backend through the existing Wails-bound SendMessage.
   */
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let cancelled = false;
      this.runActive = true;
      this.stopRequested = false;

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

      const lastUser = [...input.messages].reverse()
        .find((m) => m.role === 'user') as Message | undefined;
      const { text, imagePaths, attachments } = normalizeUserContent(lastUser?.content);

      const inputMsg = new InputMessage({
        chat_id: input.threadId,
        model: this.model,
        user_input: text,
        image_paths: imagePaths.length > 0 ? imagePaths : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        proj: this.project || new ProjectEntry(),
        send_options: {
          continueSession: false,
          resumeSessionID: input.threadId,
        },
      });

      SendMessage(inputMsg).catch((err: unknown) => {
        console.error('[WailsAgent] SendMessage rejected', err);
        this.runActive = false;
        if (!cancelled) subscriber.error(err);
      });

      return () => {
        cancelled = true;
        off();
        this.runActive = false;
      };
    });
  }
}

function normalizeUserContent(content: Message['content']): {
  text: string;
  imagePaths: string[];
  attachments: AttachmentPayload[];
} {
  if (typeof content === 'string') {
    return { text: content, imagePaths: [], attachments: [] };
  }
  if (!Array.isArray(content)) {
    return { text: '', imagePaths: [], attachments: [] };
  }

  const textParts: string[] = [];
  const imagePaths: string[] = [];
  const attachments: AttachmentPayload[] = [];

  for (const part of content as InputContent[]) {
    if (part.type === 'text') {
      textParts.push(part.text);
      continue;
    }

    const payload = part as AttachmentPayload;
    const metadata = payload.metadata && typeof payload.metadata === 'object'
      ? payload.metadata
      : undefined;
    const maybePath = metadata?.path;

    if (part.type === 'image' && typeof maybePath === 'string' && maybePath) {
      imagePaths.push(maybePath);
      continue;
    }

    if (payload.source) {
      attachments.push({ ...payload, metadata });
    }
  }

  return {
    text: textParts.join('\n'),
    imagePaths,
    attachments,
  };
}

/**
 * Decode the raw payload Wails delivers. The backend pre-marshals events as
 * `json.RawMessage`, so Wails may deliver either a parsed object or a JSON
 * string depending on runtime behaviour.
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
