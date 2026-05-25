import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsPage from './components/SettingsPage';
import { ChatItem, ChatMessage, Project, SendOptions } from './types';
import {
  SendMessage,
  StopMessage,
  ListProjects,
  AddProject,
  DeleteProject,
  ListSessionsForProject,
  GetSessionMessages,
  SelectDirectory,
} from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  // key = projectId → session list
  const [projectSessions, setProjectSessions] = useState<Record<string, ChatItem[]>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  // 当前视图: chat | settings
  const [view, setView] = useState<'chat' | 'settings'>('chat');

  // 用 ref 跟踪流式消息的累积文本
  const streamingTextRef = useRef('');

  // ─── 初始化 ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const list = await ListProjects();
      setProjects(list as Project[]);
    } catch (err) {
      console.error('[loadProjects]', err);
    }
  };

  // ─── 项目管理 ────────────────────────────────────────────────────────────────

  const handleAddProject = useCallback(async () => {
    try {
      const dir = await SelectDirectory();
      if (!dir) return;
      await AddProject(dir, '');
      await loadProjects();
    } catch (err) {
      console.error('[AddProject]', err);
      alert(`添加项目失败: ${err}`);
    }
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await DeleteProject(id);
      setProjectSessions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setActiveChatId(null);
        setMessages([]);
      }
      await loadProjects();
    } catch (err) {
      console.error('[DeleteProject]', err);
    }
  }, [activeProjectId]);

  // ─── 会话管理 ────────────────────────────────────────────────────────────────

  const handleLoadSessions = useCallback(async (projectId: string) => {
    try {
      const sessions = await ListSessionsForProject(projectId);
      setProjectSessions((prev) => ({
        ...prev,
        [projectId]: sessions as ChatItem[],
      }));
    } catch (err) {
      console.error('[ListSessionsForProject]', err);
    }
  }, []);

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    // 若切换项目，清空当前消息
    if (id !== activeProjectId) {
      setActiveChatId(null);
      setMessages([]);
    }
  }, [activeProjectId]);

  const handleSelectChat = useCallback(async (projectId: string, chatId: string) => {
    setActiveProjectId(projectId);
    setActiveChatId(chatId);
    // 加载该会话的历史消息
    try {
      const msgs = await GetSessionMessages(projectId, chatId);
      const chatMsgs: ChatMessage[] = (msgs as any[]).map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        time: m.time,
      }));
      setMessages(chatMsgs);
    } catch (err) {
      console.error('[GetSessionMessages]', err);
      setMessages([]);
    }
  }, []);

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
  };

  // ─── 流式事件监听 ────────────────────────────────────────────────────────────

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

  // ─── 发消息 ──────────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        time: Date.now() / 1000,
      };

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

      // 若已有 activeChatId，携带 resumeSessionID 以继续该会话
      const opts = {
        continueSession: false,
        resumeSessionID: activeChatId || '',
      };

      try {
        const resp = await SendMessage(
          activeProjectId || '',
          activeChatId || 'default',
          text,
          opts
        );

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

        // 刷新会话列表
        if (activeProjectId) {
          handleLoadSessions(activeProjectId);
        }
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
    [isStreaming, activeChatId, activeProjectId, handleLoadSessions]
  );

  const handleStop = useCallback(() => {
    StopMessage(activeProjectId || '').catch((err) => console.warn('[StopMessage]', err));
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && last.streaming) {
        return [...prev.slice(0, -1), { ...last, streaming: false }];
      }
      return prev;
    });
    setIsStreaming(false);
  }, [activeProjectId]);

  // ─── 当前项目信息 ─────────────────────────────────────────────────────────────

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // ─── 渲染 ─────────────────────────────────────────────────────────────────────

  return (
    <div id="App" className="app-root">
      {view === 'settings' ? (
        <SettingsPage onBack={() => setView('chat')} />
      ) : (
        <>
          <Sidebar
            collapsed={false}
            projects={projects}
            projectSessions={projectSessions}
            activeProjectId={activeProjectId}
            activeChatId={activeChatId}
            onNewChat={handleNewChat}
            onSelectProject={handleSelectProject}
            onSelectChat={handleSelectChat}
            onOpenSettings={() => setView('settings')}
            onAddProject={handleAddProject}
            onDeleteProject={handleDeleteProject}
            onLoadSessions={handleLoadSessions}
          />
          <MainContent
            messages={messages}
            isStreaming={isStreaming}
            activeProject={activeProject}
            onSend={handleSendMessage}
            onStop={handleStop}
          />
        </>
      )}
    </div>
  );
}

export default App;
