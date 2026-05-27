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
  onOpenPlugins?: () => void;
  onOpenSearch?: () => void;
  onAddProject?: () => void;
  onDeleteProject?: (id: string) => void;
  onLoadSessions?: (projectId: string) => void;
  onNewSessionForProject?: (projectId: string) => void;
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
  onNewSession: () => void;
}

// ─── 更多菜单图标 ──────────────────────────────────────────────────────────────

const MoreDotsIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const PinIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 17v5M9 3h6l1 7h-8l1-7zM8 10l-1 4h10l-1-4" />
  </svg>
);

const FolderOpenIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const RemoveIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const NewChatIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  sessions,
  isActive,
  activeChatId,
  onSelect,
  onSelectChat,
  onDelete,
  onLoadSessions,
  onNewSession,
}) => {
  // null = 用户未手动操作过，跟随 isActive/containsActive 自动展开
  // true/false = 用户手动设置了展开/折叠状态
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [hovering, setHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);

  // 当本项目被选中、或当前 activeChatId 属于本项目，自动展开会话列表
  const containsActive = !!activeChatId && sessions.some((s) => s.id === activeChatId);
  // 用户手动操作优先；否则根据 isActive/containsActive 自动展开
  const effectiveOpen = manualOpen !== null ? manualOpen : (isActive || containsActive);

  // 项目变为激活但还没拉过 sessions 时，主动加载一次；同时重置手动状态以自动展开
  React.useEffect(() => {
    if (isActive) {
      setManualOpen(null); // 切换项目时重置，让自动展开生效
      onLoadSessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // 点击外部关闭菜单
  React.useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleToggle = () => {
    const next = !effectiveOpen;
    setManualOpen(next);
    if (next) {
      onLoadSessions();
    }
    onSelect();
  };

  const handleOpenInFinder = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    // 调用系统打开目录（Wails 环境下可通过 runtime 调用）
    try {
      (window as any).runtime?.BrowserOpenURL?.(`file://${project.path}`);
    } catch { /* 静默忽略 */ }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setMenuOpen(false);
    setConfirmDelete(false);
    onDelete();
  };

  return (
    <div className="proj-group">
      {/* 项目标题行 */}
      <div
        className={`proj-row ${isActive ? 'active' : ''}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => { if (!menuOpen) setHovering(false); }}
        onClick={handleToggle}
      >
        <ChevronRightIcon size={11} open={effectiveOpen} />
        <FolderClosed size={14} />
        <span className="proj-name">{project.name}</span>
        <span className="proj-path" title={project.path}>
          {project.path.replace(/^.*[\\/]([^\\/]+)[\\/]?$/, '$1')}
        </span>

        {/* 操作按钮区 */}
        {(hovering || menuOpen) && (
          <div className="proj-actions">
            {/* 更多菜单按钮 */}
            <div className="proj-menu-wrapper" ref={menuRef}>
              <button
                ref={menuBtnRef}
                className={`proj-action-btn ${menuOpen ? 'active' : ''}`}
                title="更多操作"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!menuOpen && menuBtnRef.current) {
                    const rect = menuBtnRef.current.getBoundingClientRect();
                    setMenuPos({ top: rect.bottom + 4, left: rect.left });
                  }
                  setMenuOpen(!menuOpen);
                  setConfirmDelete(false);
                }}
              >
                <MoreDotsIcon size={14} />
              </button>

              {/* 下拉菜单 - fixed 定位避免 overflow 遮挡 */}
              {menuOpen && (
                <div className="proj-dropdown-menu" style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}>
                  <button className="proj-menu-item" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); /* 置顶暂为占位 */ }}>
                    <PinIcon size={13} />
                    <span>置顶项目</span>
                  </button>
                  <button className="proj-menu-item" onClick={handleOpenInFinder}>
                    <FolderOpenIcon size={13} />
                    <span>在访达中打开</span>
                  </button>
                  <div className="proj-menu-divider" />
                  <button className={`proj-menu-item danger ${confirmDelete ? 'confirm' : ''}`} onClick={handleDelete}>
                    <RemoveIcon size={13} />
                    <span>{confirmDelete ? '确认移除?' : '移除项目'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* 新增会话按钮 */}
            <button
              className="proj-action-btn"
              title="基于此项目新建会话"
              onClick={(e) => { e.stopPropagation(); onNewSession(); }}
            >
              <NewChatIcon size={14} />
            </button>
          </div>
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
  onOpenPlugins,
  onOpenSearch,
  onAddProject,
  onDeleteProject,
  onLoadSessions,
  onNewSessionForProject,
}) => {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* 主菜单 */}
      <nav className="side-nav">
        <button className="nav-item" onClick={onNewChat}>
          <PenSquare size={16} />
          <span>新对话</span>
        </button>
        <button className="nav-item" onClick={onOpenSearch}>
          <Search size={16} />
          <span>搜索</span>
        </button>
        <button className="nav-item" onClick={onOpenPlugins}>
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
                onNewSession={() => onNewSessionForProject?.(p.id)}
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