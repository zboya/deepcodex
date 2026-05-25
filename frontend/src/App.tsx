import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsPage from './components/SettingsPage';
import { ChatItem, ChatMessage, Project } from './types';
import { SendMessage, StopMessage } from '../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime';

function App() {
  const [projects] = useState<Project[]>([
    { id: 'p1', name: 'nanochat' },
    { id: 'p2', name: 'chatgpt-demo' },
    { id: 'p3', name: 'ansible' },
  ]);

  const [chats] = useState<ChatItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // 当前视图: chat (默认聊天页) | settings (设置页全屏覆盖).
  const [view, setView] = useState<'chat' | 'settings'>('chat');

  // 用 ref 跟踪流式消息的累积文本
  const streamingTextRef = useRef('');
  // 用 ref 标记是否已被用户中止
  const stoppedRef = useRef(false);

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
  };

  // 监听流式事件
  useEffect(() => {
    const offDelta = EventsOn('chat:delta', (text: string) => {
      streamingTextRef.current += text;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: streamingTextRef.current },
          ];
        }
        return prev;
      });
    });

    const offDone = EventsOn('chat:done', (_fullText: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }];
        }
        return prev;
      });
      setIsStreaming(false);
    });

    // 后端主动停止（context 取消后发出），与前端 handleStop 配合收尾
    const offStopped = EventsOn('chat:stopped', (_partialText: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }];
        }
        return prev;
      });
      setIsStreaming(false);
    });

    return () => {
      offDelta();
      offDone();
      offStopped();
    };
  }, []);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;
      stoppedRef.current = false;

      // 添加用户消息
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        time: Date.now() / 1000,
      };

      // 添加空的 assistant 流式占位消息
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        time: Date.now() / 1000,
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      streamingTextRef.current = '';

      // 调用后端绑定方法（它会通过事件推送流式数据）
      try {
        console.log('[SendMessage] start', { chatID: activeChatId || 'default', text });
        const resp = await SendMessage(activeChatId || 'default', text);
        console.log('[SendMessage] resolved', resp);

        // 兜底：若 chat:done 事件没触发（例如返回的全文走的是非流式路径），
        // 也要把流式状态收尾，并把最终内容填充进去。
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: last.content || (resp && (resp as any).content) || '',
                streaming: false,
              },
            ];
          }
          return prev;
        });
        setIsStreaming(false);
      } catch (err) {
        console.error('[SendMessage error]', err);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: `[错误] ${err}`, streaming: false },
            ];
          }
          return prev;
        });
        setIsStreaming(false);
      }
    },
    [isStreaming, activeChatId]
  );

  const handleStop = useCallback(() => {
    stoppedRef.current = true;
    // 通知后端取消当前请求
    StopMessage().catch((err) => console.warn('[StopMessage]', err));
    // 立即把流式状态收尾，将已收到的内容保留
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
    setIsStreaming(false);
  }, []);

  return (
    <div id="App" className="app-root">
      {view === 'settings' ? (
        <SettingsPage onBack={() => setView('chat')} />
      ) : (
        <>
          <Sidebar
            collapsed={false}
            projects={projects}
            chats={chats}
            activeProjectId={activeProjectId}
            activeChatId={activeChatId}
            onNewChat={handleNewChat}
            onSelectProject={setActiveProjectId}
            onSelectChat={setActiveChatId}
            onOpenSettings={() => setView('settings')}
          />
          <MainContent
            messages={messages}
            isStreaming={isStreaming}
            onSend={handleSendMessage}
            onStop={handleStop}
          />
        </>
      )}
    </div>
  );
}

export default App;