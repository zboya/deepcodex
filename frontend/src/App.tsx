import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { ChatItem, Project } from './types';

function App() {
  // ---- 模拟数据（后端联通前的占位） ----
  const [projects] = useState<Project[]>([
    { id: 'p1', name: 'nanochat' },
    { id: 'p2', name: 'chatgpt-demo' },
    { id: 'p3', name: 'ansible' },
  ]);

  const [chats] = useState<ChatItem[]>([]);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const handleNewChat = () => {
    setActiveChatId(null);
  };

  const handleSendMessage = (text: string) => {
    // 占位：后端接入后调用 Wails 绑定方法
    console.log('[Send Message]', text);
  };

  return (
    <div id="App" className="app-root">
      <Sidebar
        collapsed={false}
        projects={projects}
        chats={chats}
        activeProjectId={activeProjectId}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onSelectProject={setActiveProjectId}
        onSelectChat={setActiveChatId}
      />
      <MainContent onSend={handleSendMessage} />
    </div>
  );
}

export default App;
