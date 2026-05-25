import React, { useState, useRef, useEffect } from 'react';
import InputArea from './InputArea';
import ConnectorCard from './ConnectorCard';
import {
  SlackIcon,
  GithubIcon,
  LinearIcon,
  Minimize,
  Maximize,
  ChevronDown,
} from './Icons';
import { ChatMessage } from '../types';

interface MainContentProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSend: (text: string) => void;
}

const MainContent: React.FC<MainContentProps> = ({ messages, isStreaming, onSend }) => {
  const [text, setText] = useState('');
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText('');
  };

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const hasMessages = messages.length > 0;

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
          <h1 className="hero-title">我们该做什么？</h1>

          <InputArea
            value={text}
            onChange={setText}
            onSubmit={handleSubmit}
            disabled={isStreaming}
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
              {messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="msg-row msg-row-user">
                      <div className="msg-bubble-user">{msg.content}</div>
                    </div>
                  );
                }

                // assistant
                const showThinking = msg.streaming && !msg.content;
                const thinkOpen = !!thinkingOpen[msg.id];

                return (
                  <div key={msg.id} className="msg-row msg-row-ai">
                    {/* 思考状态 / 已处理折叠条 */}
                    {(showThinking || msg.content) && (
                      <button
                        className="think-toggle"
                        onClick={() =>
                          setThinkingOpen((s) => ({ ...s, [msg.id]: !s[msg.id] }))
                        }
                      >
                        <span>{showThinking ? '思考中…' : '已处理'}</span>
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
                    )}

                    {/* AI 正文：无气泡 */}
                    <div className="msg-ai-text">
                      {msg.content}
                      {msg.streaming && <span className="cursor-blink">▊</span>}
                    </div>

                    {/* 完成后的反馈按钮 */}
                    {!msg.streaming && msg.content && (
                      <div className="msg-actions">
                        <button className="msg-action-btn" title="复制">
                          <CopyIcon />
                        </button>
                        <button className="msg-action-btn" title="赞">
                          <ThumbUpIcon />
                        </button>
                        <button className="msg-action-btn" title="踩">
                          <ThumbDownIcon />
                        </button>
                        <button className="msg-action-btn" title="分享">
                          <ShareIcon />
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
                disabled={isStreaming}
                compact
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
};

// ===== 简易反馈图标 =====
const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);
const ThumbUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
  </svg>
);
const ThumbDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
  </svg>
);
const ShareIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
    <polyline points="16 6 12 2 8 6"></polyline>
    <line x1="12" y1="2" x2="12" y2="15"></line>
  </svg>
);

export default MainContent;
