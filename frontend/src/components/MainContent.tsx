import React, { useState, useRef, useEffect } from 'react';
import InputArea from './InputArea';
import ConnectorCard from './ConnectorCard';
import MarkdownMessage from './MarkdownMessage';
import {
  SlackIcon,
  GithubIcon,
  LinearIcon,
  Minimize,
  Maximize,
  ChevronDown,
} from './Icons';
import { ChatMessage, ChatToolCall, Project } from '../types';

interface MainContentProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeProject?: Project | null;
  onSend: (text: string, imagePaths?: string[], model?: string) => void;
  onStop?: () => void;
  onLinkClick?: (url: string) => void;
}

// ===== 工具调用图标映射 =====
const toolIconMap: Record<string, string> = {
  ListDirectoryTool: '📂',
  GrepTool: '🔍',
  FileReadTool: '📄',
  BashTool: '⚡',
  WebSearchTool: '🌐',
};

function getToolIcon(name: string): string {
  return toolIconMap[name] || '🔧';
}

function getToolLabel(name: string): string {
  const labels: Record<string, string> = {
    ListDirectoryTool: '已列出目录',
    GrepTool: '已搜索代码',
    FileReadTool: '已读取文件',
    BashTool: '已执行命令',
    WebSearchTool: '已搜索网页',
  };
  return labels[name] || `已调用 ${name}`;
}

// ===== 工具调用详情组件 =====
const ToolCallBlock: React.FC<{ toolCall: ChatToolCall }> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const MAX_RESULT_LINES = 10;

  const truncatedResult = React.useMemo(() => {
    if (!toolCall.result) return { text: '', truncated: false };
    const lines = toolCall.result.split('\n');
    if (lines.length > MAX_RESULT_LINES) {
      return { text: lines.slice(0, MAX_RESULT_LINES).join('\n'), truncated: true, totalLines: lines.length };
    }
    return { text: toolCall.result, truncated: false };
  }, [toolCall.result]);

  return (
    <div className="tool-call-block">
      <button className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-call-icon">{getToolIcon(toolCall.name)}</span>
        <span className="tool-call-label">{getToolLabel(toolCall.name)}</span>
        <span
          className="tool-call-chevron"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
        >
          <ChevronDown size={12} />
        </span>
      </button>
      {expanded && (
        <div className="tool-call-detail">
          <pre className="tool-call-args">{formatToolArgs(toolCall.args)}</pre>
          {toolCall.result && (
            <>
              <div className="tool-call-result-label">输出结果</div>
              <pre className="tool-call-result">
                {resultExpanded ? toolCall.result : truncatedResult.text}
              </pre>
              {truncatedResult.truncated && (
                <button
                  className="tool-call-expand-btn"
                  onClick={() => setResultExpanded(!resultExpanded)}
                >
                  {resultExpanded ? '收起' : `展开全部 (${truncatedResult.totalLines} 行)`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

function formatToolArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

const MainContent: React.FC<MainContentProps> = ({ messages, isStreaming, activeProject, onSend, onStop, onLinkClick }) => {
  const [text, setText] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = () => {
    if (isStreaming) return;
    const trimmed = text.trim();
    // 至少要有文本或图片之一
    if (!trimmed && pendingImages.length === 0) return;
    onSend(trimmed, pendingImages, currentModel);
    setText('');
    setPendingImages([]);
  };

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasMessages = messages.length > 0;

  // 将连续的 assistant 消息分组（同一轮工具调用 + 文本是连续的）
  const groupedMessages = groupMessages(messages);

  return (
    <main className={`main ${hasMessages ? 'main-chat' : 'main-empty'}`}>
      {/* 右上窗口控制 */}
      <div className="main-titlebar">
        <button className="icon-btn" title="最小化">
          <Minimize size={14} />
        </button>
        <button className="icon-btn" title="最大化">
          <Maximize size={12} />
        </button>
      </div>

      {!hasMessages ? (
        // ===== 空状态：居中欢迎页 =====
        <div className="main-inner">
          <h1 className="hero-title">
            {activeProject ? `${activeProject.name}` : '我们该做什么？'}
          </h1>
          {activeProject && (
            <div className="hero-project-path">{activeProject.path}</div>
          )}

          <InputArea
            value={text}
            onChange={setText}
            onSubmit={handleSubmit}
            onStop={onStop}
            disabled={isStreaming}
            imagePaths={pendingImages}
            onChangeImagePaths={setPendingImages}
            onModelChange={setCurrentModel}
          />

          <div className="connector-row">
            <ConnectorCard
              icon={<SlackIcon size={26} />}
              title="连接消息传送"
              desc="了解工程对话线程动态"
            />
            <ConnectorCard
              icon={<GithubIcon size={26} />}
              title="连接 GitHub"
              desc="审查 PR、代码和 CI 检查项"
            />
            <ConnectorCard
              icon={<LinearIcon size={26} />}
              title="连接 Linear"
              desc="跟踪缺陷和实施工作"
            />
          </div>
        </div>
      ) : (
        // ===== 对话状态：消息流 + 底部输入框 =====
        <>
          <div className="chat-scroll">
            <div className="chat-content">
              {groupedMessages.map((group) => {
                if (group.type === 'user') {
                  return (
                    <div key={group.id} className="msg-row msg-row-user">
                      <div className="msg-bubble-user">{group.content}</div>
                    </div>
                  );
                }

                // assistant group: 连续的 assistant 消息合并展示
                const isGroupStreaming = group.messages.some((m) => m.streaming);
                const isLastGroup = group === groupedMessages[groupedMessages.length - 1];
                const thinkOpen = !!thinkingOpen[group.id];

                return (
                  <div key={group.id} className="msg-row msg-row-ai">
                    {/* 思考状态 / 已处理折叠条 */}
                    <button
                      className="think-toggle"
                      onClick={() =>
                        setThinkingOpen((s) => ({ ...s, [group.id]: !s[group.id] }))
                      }
                    >
                      <span>{isGroupStreaming ? '思考中…' : '已处理'}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          transform: thinkOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                      >
                        <ChevronDown size={12} />
                      </span>
                    </button>

                    {/* 连续展示所有 assistant 消息段和工具调用 */}
                    <div className="msg-ai-text">
                      {group.messages.map((msg, idx) => (
                        <React.Fragment key={msg.id}>
                          {/* 工具调用（在文本之前展示），受"已处理"折叠控制 */}
                          {thinkOpen && msg.toolCalls && msg.toolCalls.length > 0 && (
                            <div className="tool-calls-group">
                              {msg.toolCalls.map((tc) => (
                                <ToolCallBlock key={tc.id} toolCall={tc} />
                              ))}
                            </div>
                          )}
                          {/* 文本内容 */}
                          {msg.content && (
                            <MarkdownMessage content={msg.content} streaming={msg.streaming} onLinkClick={onLinkClick} />
                          )}
                          {/* 最后一条流式消息的光标 */}
                          {msg.streaming && idx === group.messages.length - 1 && (
                            <span className="cursor-blink">▊</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* 只在整组完成且是最后一组时显示操作按钮 */}
                    {!isGroupStreaming && isLastGroup && !isStreaming && (
                      <div className="msg-actions">
                        <button className="msg-action-btn" title="复制">
                          <CopyIcon />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 底部固定输入框 */}
          <div className="chat-input-bar">
            <div className="chat-input-inner">
              <InputArea
                value={text}
                onChange={setText}
                onSubmit={handleSubmit}
                onStop={onStop}
                disabled={isStreaming}
                imagePaths={pendingImages}
                onChangeImagePaths={setPendingImages}
                onModelChange={setCurrentModel}
                compact
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
};

// ===== 消息分组逻辑：将连续的 assistant 消息合并为一组 =====
interface UserGroup {
  type: 'user';
  id: string;
  content: string;
}
interface AssistantGroup {
  type: 'assistant';
  id: string;
  messages: ChatMessage[];
}
type MessageGroup = UserGroup | AssistantGroup;

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      groups.push({ type: 'user', id: msg.id, content: msg.content });
    } else {
      // assistant: 合并到上一个 assistant group（如果连续）
      const last = groups[groups.length - 1];
      if (last && last.type === 'assistant') {
        last.messages.push(msg);
      } else {
        groups.push({ type: 'assistant', id: msg.id, messages: [msg] });
      }
    }
  }

  return groups;
}

// ===== 简易图标 =====
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

export default MainContent;