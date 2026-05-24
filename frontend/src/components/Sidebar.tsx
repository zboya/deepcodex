import React from 'react';
import {
  PenSquare,
  Search,
  Grid,
  Clock,
  Smartphone,
  FolderClosed,
  Settings,
  ChevronLeft,
  ChevronRight,
  SidebarIcon,
} from './Icons';
import { ChatItem, Project } from '../types';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  projects: Project[];
  chats: ChatItem[];
  activeProjectId: string | null;
  activeChatId: string | null;
  onNewChat: () => void;
  onSelectProject: (id: string) => void;
  onSelectChat: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  projects,
  chats,
  activeProjectId,
  activeChatId,
  onNewChat,
  onSelectProject,
  onSelectChat,
}) => {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 顶部窗口控制 + 折叠 + 更新按钮 */}
      <div className="sidebar-header">
        <div className="window-traffic">
          <span className="dot dot-close" />
          <span className="dot dot-min" />
          <span className="dot dot-max" />
        </div>
        <button className="icon-btn" title="折叠侧边栏" onClick={onToggleCollapse}>
          <SidebarIcon size={16} />
        </button>
        <div className="nav-arrows">
          <button className="icon-btn" title="后退">
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn" title="前进">
            <ChevronRight size={16} />
          </button>
        </div>
        <button className="badge-btn" title="检查更新">
          更新
        </button>
      </div>

      {/* 主菜单 */}
      <nav className="side-nav">
        <button className="nav-item" onClick={onNewChat}>
          <PenSquare size={16} />
          <span>新对话</span>
        </button>
        <button className="nav-item">
          <Search size={16} />
          <span>搜索</span>
        </button>
        <button className="nav-item">
          <Grid size={16} />
          <span>插件</span>
        </button>
        <button className="nav-item">
          <Clock size={16} />
          <span>自动化</span>
        </button>
        <button className="nav-item">
          <Smartphone size={16} />
          <span>Codex 移动版</span>
        </button>
      </nav>

      {/* 项目列表 */}
      <div className="side-section">
        <div className="side-section-title">项目</div>
        <div className="side-list">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`nav-item nav-item-sub ${activeProjectId === p.id ? 'active' : ''}`}
              onClick={() => onSelectProject(p.id)}
            >
              <FolderClosed size={16} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 对话列表 */}
      <div className="side-section side-section-grow">
        <div className="side-section-title">对话</div>
        <div className="side-list">
          {chats.length === 0 ? (
            <div className="empty-hint">暂无对话</div>
          ) : (
            chats.map((c) => (
              <button
                key={c.id}
                className={`nav-item nav-item-sub ${activeChatId === c.id ? 'active' : ''}`}
                onClick={() => onSelectChat(c.id)}
              >
                <span className="chat-title">{c.title || '未命名对话'}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 底部设置 */}
      <div className="sidebar-footer">
        <button className="nav-item">
          <Settings size={16} />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
