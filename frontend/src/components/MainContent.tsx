import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAgent,
  useCopilotKit,
  UseAgentUpdate,
} from '@copilotkit/react-core/v2';
import type { InputContent } from '@ag-ui/core';
import { Minimize, Maximize } from './Icons';
import InputArea from './InputArea';
import MarkdownMessage from './MarkdownMessage';
import { Project } from '../types';

interface MainContentProps {
  agentId: string;
  threadId: string;
  activeProject?: Project | null;
  onModelChange?: (model: string) => void;
  onRunFinished?: () => void;
}

/**
 * Codex 风格主面板（对齐参考截图）：
 *  - 欢迎页：仅居中标题 “我们该做什么？” + InputArea（含 +/默认权限/模型/麦克风/发送）
 *  - 会话中：消息列表 + 底部 InputArea
 *
 * 不再使用 CopilotChat 整体壳：通过 useAgent + useCopilotKit 自己驱动消息流，
 * 复用项目自有的 InputArea、MarkdownMessage 组件。
 */
const MainContent: React.FC<MainContentProps> = ({
  agentId,
  threadId,
  activeProject,
  onModelChange,
  onRunFinished,
}) => {
  const { agent } = useAgent({
    agentId,
    updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged],
    throttleMs: 60,
  });
  const { copilotkit } = useCopilotKit();

  const messages = agent.messages;
  const isRunning = agent.isRunning;
  const hasMessages = messages.length > 0;

  const [input, setInput] = useState('');
  const [imagePaths, setImagePaths] = useState<string[]>([]);

  // 切换会话时清空输入区
  useEffect(() => {
    setInput('');
    setImagePaths([]);
  }, [threadId]);

  // run 结束后回调（用于父组件刷新会话列表）
  const wasRunningRef = useRef(false);
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      onRunFinished?.();
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, onRunFinished]);

  // 自动滚到底部
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isRunning]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text && imagePaths.length === 0) return;
    if (isRunning) return;

    // 组装 AG-UI message content。文本 + 图片附件（image + metadata.path）。
    const contentParts: InputContent[] = [];
    if (text) contentParts.push({ type: 'text', text } as InputContent);
    for (const p of imagePaths) {
      contentParts.push({
        type: 'image',
        source: { type: 'url', value: p },
        metadata: { path: p },
      } as unknown as InputContent);
    }

    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    agent.addMessage({
      id,
      role: 'user',
      // 当只有文本时直接传字符串，避免后端兼容问题
      content: contentParts.length === 1 && contentParts[0].type === 'text'
        ? text
        : (contentParts as any),
    } as any);

    // 立刻清空输入，避免重复发送
    setInput('');
    setImagePaths([]);

    try {
      await copilotkit.runAgent({ agent });
    } catch (err) {
      console.error('[MainContent] runAgent failed', err);
    }
  }, [input, imagePaths, isRunning, agent, copilotkit]);

  const handleStop = useCallback(() => {
    try {
      agent.abortRun();
    } catch (err) {
      console.warn('[MainContent] abortRun failed', err);
    }
  }, [agent]);

  // 提取消息文本（兼容字符串 / parts 数组）
  const extractText = (content: unknown): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((p: any) => (p && p.type === 'text' ? p.text : ''))
        .join('');
    }
    return '';
  };

  // 提取消息中的图片路径用于回显
  const extractImagePaths = (content: unknown): string[] => {
    if (!Array.isArray(content)) return [];
    const out: string[] = [];
    for (const p of content as any[]) {
      if (p && p.type === 'image') {
        const path = p.metadata?.path || p.source?.value;
        if (typeof path === 'string') out.push(path);
      }
    }
    return out;
  };

  const renderedMessages = useMemo(() => {
    return messages
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any, idx: number) => {
        const text = extractText(m.content);
        const imgs = extractImagePaths(m.content);
        if (m.role === 'user') {
          return (
            <div key={m.id || idx} className="msg-row msg-row-user">
              {imgs.length > 0 && (
                <div className="msg-bubble-user" style={{ marginBottom: 6 }}>
                  {imgs.map((p) => (
                    <div key={p} style={{ fontSize: 12, opacity: 0.85 }}>
                      🖼️ {p.split('/').pop()}
                    </div>
                  ))}
                </div>
              )}
              {text && <div className="msg-bubble-user">{text}</div>}
            </div>
          );
        }
        return (
          <div key={m.id || idx} className="msg-row msg-row-ai">
            <div className="msg-ai-text">
              <MarkdownMessage content={text} streaming={isRunning && idx === messages.length - 1} />
            </div>
          </div>
        );
      });
  }, [messages, isRunning]);

  return (
    <main className={`main ${hasMessages ? 'main-chat' : 'main-empty'} codex-main`}>
      <div className="main-titlebar">
        <button className="icon-btn" title="最小化">
          <Minimize size={14} />
        </button>
        <button className="icon-btn" title="最大化">
          <Maximize size={12} />
        </button>
      </div>

      {hasMessages ? (
        <>
          <div className="chat-scroll" ref={scrollRef}>
            <div className="chat-content">{renderedMessages}</div>
          </div>
          <div className="codex-input-dock">
            <InputArea
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onStop={handleStop}
              disabled={isRunning}
              compact
              imagePaths={imagePaths}
              onChangeImagePaths={setImagePaths}
              onModelChange={onModelChange}
            />
          </div>
        </>
      ) : (
        <div className="codex-welcome">
          <h1 className="hero-title">
            {activeProject ? activeProject.name : '我们该做什么？'}
          </h1>
          <div className="codex-welcome-input">
            <InputArea
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onStop={handleStop}
              disabled={isRunning}
              imagePaths={imagePaths}
              onChangeImagePaths={setImagePaths}
              onModelChange={onModelChange}
            />
          </div>
        </div>
      )}
    </main>
  );
};

export default MainContent;
