import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsPage from './components/SettingsPage';
import { ChatItem, ChatMessage, Project } from './types';
import {
  ListProjects,
  AddProject,
  DeleteProject,
  ListSessionsForProject,
  GetSessionMessages,
  SelectDirectory,
  OpenBrowserWindow,
} from '../bindings/github.com/zboya/deepcodex/app';
import { WailsAgent } from './agui/WailsAgent';
import type { Message as AGUIMessage } from '@ag-ui/core';

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

  // ─── 初始化 ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadProjects();
  }, []);

  // 全局拦截链接点击：统一通过系统浏览器打开外链，
  // 避免 macOS 下 Wails WebView 的 openWebViewWindow 因 nil title 崩溃。
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!href) return;
      // 只拦截 http(s) 外链；忽略锚点、相对路径、javascript: 等
      if (!/^https?:\/\//i.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      OpenBrowserWindow(href);
    };
    // 使用 capture 阶段，先于任何组件自带的 onClick 处理，避免冒泡到原生 WebKit 触发新窗口
    document.addEventListener('click', handler, true);
    document.addEventListener('auxclick', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('auxclick', handler, true);
    };
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
    // 若切换项目，清空当前消息并起新会话
    if (id !== activeProjectId) {
      setActiveChatId(`chat-${Date.now()}`);
      setMessages([]);
    } else if (!activeChatId) {
      setActiveChatId(`chat-${Date.now()}`);
    }
  }, [activeProjectId, activeChatId]);

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
    setActiveChatId(`chat-${Date.now()}`);
    setMessages([]);
  };

  // ─── AG-UI Agent 单例 ─────────────────────────────────────────────────────

  // WailsAgent 在切换 project / chat 时重新创建（threadId 绑定到 chatId）
  const agentRef = useRef<WailsAgent | null>(null);

  useEffect(() => {
    const threadId = activeChatId || `default-${Date.now()}`;
    const agent = new WailsAgent({
      projectId: activeProjectId || '',
      threadId,
      initialMessages: chatMessagesToAGUI(messages),
    });

    // 监听 AG-UI 的标准 messages 变化，把它映射回我们的 ChatMessage[]
    const unsub = agent.subscribe({
      onMessagesChanged: ({ messages: ms }) => {
        setMessages(aguiMessagesToChat(ms as readonly AGUIMessage[]));
      },
      onRunFinishedEvent: () => {
        setIsStreaming(false);
      },
      onRunErrorEvent: ({ event }) => {
        console.error('[agui] RUN_ERROR', event);
        setIsStreaming(false);
      },
    });

    agentRef.current = agent;
    return () => {
      unsub.unsubscribe();
      if (agentRef.current === agent) {
        agentRef.current = null;
      }
    };
    // 仅在 chat / project 切换时重建，messages 初始化只取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId, activeProjectId]);

  // ─── 发消息 ──────────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string, imagePaths: string[] = []) => {
      if (isStreaming) return;
      const agent = agentRef.current;
      if (!agent) return;

      // 把图片路径以 markdown 形式附加在用户文本后，便于在聊天气泡中展示，
      // 与后端 persistTurn 写入会话文件时的格式保持一致。
      let displayText = text;
      if (imagePaths.length > 0) {
        const refs = imagePaths.map((p) => `![image](${p})`).join('\n');
        displayText = text ? `${text}\n${refs}` : refs;
        // 透传给 WailsAgent，由 run() 时随 SendMessage 一并发送给后端
        agent.pendingImagePaths = imagePaths;
      }

      // AG-UI 规范：在 runAgent 之前把用户消息推入 agent.messages
      agent.addMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: displayText,
      });
      setIsStreaming(true);

      try {
        await agent.runAgent();
        // 刷新会话列表
        if (activeProjectId) {
          handleLoadSessions(activeProjectId);
        }
      } catch (err) {
        console.error('[runAgent error]', err);
        setIsStreaming(false);
      }
    },
    [isStreaming, activeProjectId, handleLoadSessions],
  );

  const handleStop = useCallback(() => {
    agentRef.current?.abortRun();
    setIsStreaming(false);
  }, []);

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
            onLinkClick={(url) => OpenBrowserWindow(url)}
          />
        </>
      )}
    </div>
  );
}

export default App;

// ─── AGUI ↔ ChatMessage 适配 ────────────────────────────────────────────────

function chatMessagesToAGUI(msgs: ChatMessage[]): AGUIMessage[] {
  return msgs.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  })) as AGUIMessage[];
}

function aguiMessagesToChat(msgs: readonly AGUIMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of msgs) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = typeof m.content === 'string' ? m.content : '';
    const item: ChatMessage = {
      id: m.id,
      role: m.role,
      content,
      time: Date.now() / 1000,
      streaming: false,
    };
    if (m.role === 'assistant') {
      const tcs = (m as { toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }> }).toolCalls;
      if (tcs && tcs.length > 0) {
        item.toolCalls = tcs.map((t) => ({
          id: t.id,
          name: t.function?.name ?? '',
          args: t.function?.arguments ?? '',
        }));
      }
    }
    out.push(item);
  }
  return out;
}
