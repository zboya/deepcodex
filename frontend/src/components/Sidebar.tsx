import React, { useState } from 'react';
import {
  PenSquare,
  Search,
  Grid,
  Clock,
  FolderClosed,
  Settings,
} from './Icons';
import { ChatItem, Project } from '../types';

// ─── 图标 ────────────────────────────────────────────────────────────────────

const ChevronRightIcon = ({ size = 12, open = false }: { size?: number; open?: boolean }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.15s ease',
      flexShrink: 0,
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const TrashIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);

const ChatBubbleIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  projects: Project[];
  // key = projectId → sessions
  projectSessions: Record<string, ChatItem[]>;
  activeProjectId: string | null;
  activeChatId: string | null;
  onNewChat: () => void;
  onSelectProject: (id: string) => void;
  onSelectChat: (projectId: string, chatId: string) => void;
  onOpenSettings?: () => void;
  onAddProject?: () => void;
  onDeleteProject?: (id: string) => void;
  onLoadSessions?: (projectId: string) => void;
}

// ─── ProjectRow ───────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: Project;
  sessions: ChatItem[];
  isActive: boolean;
  activeChatId: string | null;
  onSelect: () => void;
  onSelectChat: (chatId: string) => void;
  onDelete: () => void;
  onLoadSessions: () => void;
}

const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  sessions,
  isActive,
  activeChatId,
  onSelect,
  onSelectChat,
  onDelete,
  onLoadSessions,
}) => {
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 当本项目被选中、或当前 activeChatId 属于本项目，自动展开会话列表
  const containsActive = !!activeChatId && sessions.some((s) => s.id === activeChatId);
  const effectiveOpen = open || isActive || containsActive;

  // 项目变为激活但还没拉过 sessions 时，主动加载一次
  React.useEffect(() => {
    if (isActive) {
      onLoadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const handleToggle = () => {
    const next = !effectiveOpen;
    setOpen(next);
    if (next) {
      onLoadSessions();
    }
    onSelect();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    onDelete();
  };

  return (
    <div className="proj-group">
      {/* 项目标题行 */}
      <div
        className={`proj-row ${isActive ? 'active' : ''}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { setHovering(false); setConfirmDelete(false); }}
        onClick={handleToggle}
      >
        <ChevronRightIcon size={11} open={effectiveOpen} />
        <FolderClosed size={14} />
        <span className="proj-name">{project.name}</span>
        <span className="proj-path" title={project.path}>
          {project.path.replace(/^.*[\\/]([^\\/]+)[\\/]?$/, '$1')}
        </span>

        {/* 删除按钮 */}
        {hovering && (
          <button
            className={`proj-delete-btn ${confirmDelete ? 'confirm' : ''}`}
            title={confirmDelete ? '再次点击确认删除' : '删除项目'}
            onClick={handleDelete}
          >
            {confirmDelete ? '确认?' : <TrashIcon size={12} />}
          </button>
        )}
      </div>

      {/* 展开的会话列表 */}
      {effectiveOpen && (
        <div className="proj-sessions">
          {sessions.length === 0 ? (
            <div className="proj-session-empty">暂无会话</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                className={`proj-session-item ${activeChatId === s.id ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSelectChat(s.id); }}
                title={s.title}
              >
                <ChatBubbleIcon size={12} />
                <span className="proj-session-title">{s.title || '未命名会话'}</span>
                {s.createdAt && (
                  <span className="proj-session-time">
                    {formatRelativeTime(s.createdAt)}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  projects,
  projectSessions,
  activeProjectId,
  activeChatId,
  onNewChat,
  onSelectProject,
  onSelectChat,
  onOpenSettings,
  onAddProject,
  onDeleteProject,
  onLoadSessions,
}) => {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
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
      </nav>

      {/* 项目列表 */}
      <div className="side-section side-section-grow">
        {/* 标题 + 添加按钮 */}
        <div className="side-section-header">
          <span className="side-section-title">项目</span>
          {onAddProject && (
            <button className="side-add-btn" onClick={onAddProject} title="添加本地项目">
              <PlusIcon size={13} />
            </button>
          )}
        </div>

        <div className="side-list">
          {projects.length === 0 ? (
            <div className="empty-hint">点击 + 添加本地项目</div>
          ) : (
            projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                sessions={projectSessions[p.id] || []}
                isActive={activeProjectId === p.id}
                activeChatId={activeChatId}
                onSelect={() => onSelectProject(p.id)}
                onSelectChat={(chatId) => onSelectChat(p.id, chatId)}
                onDelete={() => onDeleteProject?.(p.id)}
                onLoadSessions={() => onLoadSessions?.(p.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* 底部设置 */}
      <div className="sidebar-footer">
        <button className="nav-item" onClick={onOpenSettings}>
          <Settings size={16} />
          <span>设置</span>
        </button>
      </div>
    </aside>
  );
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatRelativeTime(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return `${Math.floor(diff / 604800)} 周前`;
}

export default Sidebar;
