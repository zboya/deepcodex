import React, { useState, useRef, useEffect } from 'react';
import { Settings, ChevronDown } from './Icons';
import { ListMCPServers, ListSkills } from '../../bindings/github.com/zboya/deepcodex/app';

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
  toolCount?: number;
  connected?: boolean;
}

// ─── Banner 示例文字 ───────────────────────────────────────────────────────────

const BANNER_EXAMPLES = [
  { icon: '📧', app: 'Gmail', text: '为每封我还没来得及回复的邮件起草回复' },
  { icon: '📅', app: 'Calendar', text: '整理今天所有会议的摘要' },
  { icon: '🐙', app: 'GitHub', text: '列出本周所有待 Review 的 PR' },
];

// ─── 插件卡片 ─────────────────────────────────────────────────────────────────

const PluginCard: React.FC<{
  item: PluginItem;
  tab: Tab;
}> = ({ item, tab }) => (
  <div className="plugin-card">
    <div className="plugin-card-icon">{item.icon}</div>
    <div className="plugin-card-info">
      <div className="plugin-card-name">{item.name}</div>
      <div className="plugin-card-desc">{item.description}</div>
      {tab === 'plugins' && item.toolCount !== undefined && (
        <div className="plugin-card-meta">
          {item.toolCount} tools · {item.connected ? '已连接' : '未连接'}
        </div>
      )}
    </div>
    <div className={`plugin-card-status ${item.connected || item.installed ? 'active' : ''}`}>
      {item.connected || item.installed ? <CheckIcon size={13} /> : <PlusIcon size={13} />}
    </div>
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
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [skills, setSkills] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 从后端加载 MCP 和 Skills 列表
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [mcpServers, skillList] = await Promise.all([
          ListMCPServers(),
          ListSkills(),
        ]);

        // 转换 MCP servers → PluginItem
        const mcpItems: PluginItem[] = (mcpServers || []).map((s: any) => ({
          id: s.id || s.name,
          name: s.name,
          description: s.description || s.command || '',
          icon: <span style={{ fontSize: 20 }}>🔌</span>,
          installed: s.connected,
          toolCount: s.toolCount,
          connected: s.connected,
        }));
        setPlugins(mcpItems);

        // 转换 Skills → PluginItem
        const skillItems: PluginItem[] = (skillList || []).map((s: any) => ({
          id: s.id || s.name,
          name: s.name,
          description: s.description || '',
          icon: <span style={{ fontSize: 20 }}>⚡</span>,
          installed: true, // 所有加载的 skills 都可用
        }));
        setSkills(skillItems);
      } catch (err) {
        console.error('[PluginsPage] failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const items = tab === 'plugins' ? plugins : skills;

  const filtered = search.trim()
    ? items.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

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
          <div className="plugins-section-title">
            {tab === 'plugins' ? 'MCP Servers' : 'Skills'}
            <span className="plugins-section-count">{filtered.length}</span>
          </div>
          {loading ? (
            <div className="plugins-loading">加载中...</div>
          ) : (
            <div className="plugins-grid">
              {filtered.map((item) => (
                <PluginCard key={item.id} item={item} tab={tab} />
              ))}
              {filtered.length === 0 && (
                <div className="plugins-empty">
                  {tab === 'plugins'
                    ? '未找到 MCP 服务器，请在 .deepcodex/mcp.json 中配置'
                    : '未找到匹配的技能'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PluginsPage;
