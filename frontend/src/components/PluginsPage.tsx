import React, { useState, useRef, useEffect } from 'react';
import { Settings, ChevronDown } from './Icons';

// ─── 图标 ────────────────────────────────────────────────────────────────────

const PluginIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M17.5 14v6M14.5 17h6" />
  </svg>
);

const SkillIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.3 4.7-3.2 6l-.8.5V18H9v-2.5l-.8-.5A7 7 0 0 1 5 9a7 7 0 0 1 7-7Z" />
    <path d="M9 22h6" />
    <path d="M9 18h6" />
  </svg>
);

const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const MoreIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

// ─── 类型 ─────────────────────────────────────────────────────────────────────

type Tab = 'plugins' | 'skills';

interface PluginItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  installed: boolean;
}

// ─── Mock 数据 ────────────────────────────────────────────────────────────────

const FEATURED_PLUGINS: PluginItem[] = [
  {
    id: 'computer-use',
    name: 'Computer Use',
    description: 'Control Mac apps from Codex',
    icon: <span style={{ fontSize: 20 }}>🖥</span>,
    installed: true,
  },
  {
    id: 'chrome',
    name: 'Chrome',
    description: 'Control Chrome with Codex',
    icon: <span style={{ fontSize: 20 }}>🌐</span>,
    installed: false,
  },
  {
    id: 'spreadsheets',
    name: 'Spreadsheets',
    description: 'Create and edit spreadsheet files',
    icon: <span style={{ fontSize: 20 }}>📊</span>,
    installed: true,
  },
  {
    id: 'presentations',
    name: 'Presentations',
    description: 'Create and edit presentations',
    icon: <span style={{ fontSize: 20 }}>📽</span>,
    installed: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Triage PRs, issues, CI, and publish flows',
    icon: <span style={{ fontSize: 20 }}>🐙</span>,
    installed: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read and manage Slack',
    icon: <span style={{ fontSize: 20 }}>💬</span>,
    installed: false,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notion workflows for notes, research',
    icon: <span style={{ fontSize: 20 }}>📝</span>,
    installed: false,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Find and reference issues and projects',
    icon: <span style={{ fontSize: 20 }}>📐</span>,
    installed: false,
  },
];

const FEATURED_SKILLS: PluginItem[] = [
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Automated code review and suggestions',
    icon: <span style={{ fontSize: 20 }}>🔍</span>,
    installed: true,
  },
  {
    id: 'test-gen',
    name: 'Test Generator',
    description: 'Generate unit tests for your code',
    icon: <span style={{ fontSize: 20 }}>🧪</span>,
    installed: false,
  },
  {
    id: 'doc-gen',
    name: 'Doc Writer',
    description: 'Auto-generate documentation',
    icon: <span style={{ fontSize: 20 }}>📄</span>,
    installed: false,
  },
  {
    id: 'refactor',
    name: 'Refactor Assistant',
    description: 'Smart code refactoring suggestions',
    icon: <span style={{ fontSize: 20 }}>⚙️</span>,
    installed: true,
  },
];

// ─── Banner 示例文字 ───────────────────────────────────────────────────────────

const BANNER_EXAMPLES = [
  { icon: '📧', app: 'Gmail', text: '为每封我还没来得及回复的邮件起草回复' },
  { icon: '📅', app: 'Calendar', text: '整理今天所有会议的摘要' },
  { icon: '🐙', app: 'GitHub', text: '列出本周所有待 Review 的 PR' },
];

// ─── 插件卡片 ─────────────────────────────────────────────────────────────────

const PluginCard: React.FC<{
  item: PluginItem;
  onToggle: (id: string) => void;
}> = ({ item, onToggle }) => (
  <div className="plugin-card">
    <div className="plugin-card-icon">{item.icon}</div>
    <div className="plugin-card-info">
      <div className="plugin-card-name">{item.name}</div>
      <div className="plugin-card-desc">{item.description}</div>
    </div>
    <button
      className={`plugin-card-toggle ${item.installed ? 'installed' : ''}`}
      onClick={() => onToggle(item.id)}
      title={item.installed ? '已安装' : '安装'}
    >
      {item.installed ? <CheckIcon size={13} /> : <PlusIcon size={13} />}
    </button>
  </div>
);

// ─── 创建下拉菜单 ─────────────────────────────────────────────────────────────

const CreateDropdown: React.FC<{
  onCreatePlugin: () => void;
  onCreateSkill: () => void;
  onClose: () => void;
}> = ({ onCreatePlugin, onCreateSkill, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div className="create-dropdown" ref={ref}>
      <button className="create-dropdown-item" onClick={() => { onCreatePlugin(); onClose(); }}>
        <PluginIcon size={15} />
        <span>创建插件</span>
      </button>
      <button className="create-dropdown-item" onClick={() => { onCreateSkill(); onClose(); }}>
        <SkillIcon size={15} />
        <span>创建技能</span>
      </button>
    </div>
  );
};

// ─── PluginsPage ──────────────────────────────────────────────────────────────

const PluginsPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('plugins');
  const [search, setSearch] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [bannerIdx] = useState(0);
  const [plugins, setPlugins] = useState(FEATURED_PLUGINS);
  const [skills, setSkills] = useState(FEATURED_SKILLS);

  const items = tab === 'plugins' ? plugins : skills;

  const filtered = search.trim()
    ? items.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const handleTogglePlugin = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p)),
    );
  };

  const handleToggleSkill = (id: string) => {
    setSkills((prev) =>
      prev.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p)),
    );
  };

  const handleToggle = tab === 'plugins' ? handleTogglePlugin : handleToggleSkill;

  const banner = BANNER_EXAMPLES[bannerIdx % BANNER_EXAMPLES.length];

  return (
    <div className="plugins-page">
      {/* 顶栏 */}
      <div className="plugins-topbar">
        <div className="plugins-tabs">
          <button
            className={`plugins-tab ${tab === 'plugins' ? 'active' : ''}`}
            onClick={() => setTab('plugins')}
          >
            插件
          </button>
          <button
            className={`plugins-tab ${tab === 'skills' ? 'active' : ''}`}
            onClick={() => setTab('skills')}
          >
            技能
          </button>
        </div>

        <div className="plugins-topbar-actions">
          <button className="plugins-manage-btn">
            <Settings size={14} />
            <span>管理</span>
          </button>

          <div className="plugins-create-wrap">
            <button
              className="plugins-create-btn"
              onClick={() => setShowCreateMenu((v) => !v)}
            >
              <span>创建</span>
              <ChevronDown size={13} />
            </button>
            {showCreateMenu && (
              <CreateDropdown
                onCreatePlugin={() => alert('创建插件')}
                onCreateSkill={() => alert('创建技能')}
                onClose={() => setShowCreateMenu(false)}
              />
            )}
          </div>

          <button className="plugins-more-btn">
            <MoreIcon size={15} />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="plugins-body">
        {/* Hero Banner */}
        <div className="plugins-hero">
          <h1 className="plugins-hero-title">让 DeepCodex 按你的方式工作</h1>
          <div className="plugins-banner">
            <div className="plugins-banner-card">
              <span className="plugins-banner-icon">{banner.icon}</span>
              <span className="plugins-banner-app">{banner.app}</span>
              <span className="plugins-banner-text">{banner.text}</span>
            </div>
            <button className="plugins-banner-try">
              <span style={{ opacity: 0.6, fontSize: 13 }}>💬</span>
              在对话中试用
            </button>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="plugins-search-row">
          <div className="plugins-search-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              className="plugins-search"
              placeholder={tab === 'plugins' ? '搜索插件' : '搜索技能'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* 卡片网格 */}
        <div className="plugins-section">
          <div className="plugins-section-title">Featured</div>
          <div className="plugins-grid">
            {filtered.map((item) => (
              <PluginCard key={item.id} item={item} onToggle={handleToggle} />
            ))}
            {filtered.length === 0 && (
              <div className="plugins-empty">未找到匹配的{tab === 'plugins' ? '插件' : '技能'}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PluginsPage;
