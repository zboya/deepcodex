import { useState, useCallback, useEffect, useMemo } from 'react';
import { CopilotKitProvider } from '@copilotkit/react-core/v2';
import '@copilotkit/react-core/v2/styles.css';
import './App.css';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsPage from './components/SettingsPage';
import PluginsPage from './components/PluginsPage';
import SearchModal from './components/SearchModal';
import { ChatItem, Project } from './types';
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
import { ProjectEntry } from '../bindings/github.com/zboya/deepcodex/app/models';
import type { Message as AGUIMessage } from '@ag-ui/core';

const AGENT_ID = 'deepcodex';

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSessions, setProjectSessions] = useState<Record<string, ChatItem[]>>({});
  const [initialMessages, setInitialMessages] = useState<AGUIMessage[]>([]);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('');

  const [view, setView] = useState<'chat' | 'settings' | 'plugins'>('chat');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  // 全局拦截链接点击：统一通过系统浏览器打开外链，避免 Wails WebView 新窗口崩溃。
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      OpenBrowserWindow(href);
    };
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
        setInitialMessages([]);
      }
      await loadProjects();
    } catch (err) {
      console.error('[DeleteProject]', err);
    }
  }, [activeProjectId]);

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
    if (id !== activeProjectId) {
      setActiveChatId(`chat-${Date.now()}`);
      setInitialMessages([]);
    } else if (!activeChatId) {
      setActiveChatId(`chat-${Date.now()}`);
    }
  }, [activeProjectId, activeChatId]);

  const handleSelectChat = useCallback(async (projectId: string, chatId: string) => {
    setActiveProjectId(projectId);
    setActiveChatId(chatId);
    try {
      const msgs = await GetSessionMessages(projectId, chatId);
      setInitialMessages((msgs as any[])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })) as AGUIMessage[]);
    } catch (err) {
      console.error('[GetSessionMessages]', err);
      setInitialMessages([]);
    }
  }, []);

  const handleNewChat = () => {
    setActiveChatId(`chat-${Date.now()}`);
    setInitialMessages([]);
  };

  const handleNewSessionForProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveChatId(`chat-${Date.now()}`);
    setInitialMessages([]);
  };

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  const threadId = activeChatId || `chat-${Date.now()}`;

  const projectEntry = useMemo(() => {
    if (!activeProject) return null;
    return new ProjectEntry({
      id: activeProject.id,
      name: activeProject.name,
      path: activeProject.path,
      createdAt: activeProject.createdAt || 0,
    });
  }, [activeProject]);

  const agent = useMemo(() => new WailsAgent({
    agentId: AGENT_ID,
    threadId,
    projectId: activeProjectId || '',
    project: projectEntry,
    model: selectedModel,
    initialMessages,
  }), [threadId, activeProjectId, projectEntry, selectedModel, initialMessages]);

  const agents = useMemo(() => ({ [AGENT_ID]: agent }), [agent]);

  const handleRunFinished = useCallback(() => {
    if (activeProjectId) {
      handleLoadSessions(activeProjectId);
    }
  }, [activeProjectId, handleLoadSessions]);

  return (
    <div id="App" className="app-root">
      {view === 'settings' ? (
        <SettingsPage onBack={() => setView('chat')} />
      ) : view === 'plugins' ? (
        <>
          <Sidebar
            collapsed={false}
            projects={projects}
            projectSessions={projectSessions}
            activeProjectId={activeProjectId}
            activeChatId={activeChatId}
            onNewChat={() => { handleNewChat(); setView('chat'); }}
            onSelectProject={handleSelectProject}
            onSelectChat={(pid, cid) => { handleSelectChat(pid, cid); setView('chat'); }}
            onOpenSettings={() => setView('settings')}
            onOpenPlugins={() => setView('plugins')}
            onOpenSearch={() => setShowSearch(true)}
            onAddProject={handleAddProject}
            onDeleteProject={handleDeleteProject}
            onLoadSessions={handleLoadSessions}
            onNewSessionForProject={(pid) => { handleNewSessionForProject(pid); setView('chat'); }}
          />
          <PluginsPage />
        </>
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
            onOpenPlugins={() => setView('plugins')}
            onOpenSearch={() => setShowSearch(true)}
            onAddProject={handleAddProject}
            onDeleteProject={handleDeleteProject}
            onLoadSessions={handleLoadSessions}
            onNewSessionForProject={handleNewSessionForProject}
          />
          <CopilotKitProvider
            agents__unsafe_dev_only={agents}
            onError={({ code, error, context }) => {
              console.error('[copilotkit]', code, error, context);
            }}
          >
            <MainContent
              agentId={AGENT_ID}
              threadId={threadId}
              activeProject={activeProject}
              onModelChange={setSelectedModel}
              onRunFinished={handleRunFinished}
            />
          </CopilotKitProvider>
        </>
      )}

      {showSearch && (
        <SearchModal
          projects={projects}
          projectSessions={projectSessions}
          onSelect={(pid, cid) => {
            handleSelectChat(pid, cid);
            setView('chat');
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}

export default App;
