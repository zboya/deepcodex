// SettingsPage 是仿照截图实现的设置中心页面.
//
// 布局:
//   - 左侧: 分类导航 (常规 / 外观 / 模型 / ...).
//   - 右侧: 当前选中分类的内容. 「常规」与截图一致, 「模型」是新增的 LLM 提供商管理页.
//
// 其他分类暂为占位, 保持入口完整即可.
import React, { useState } from 'react';
import {
  ArrowLeft,
  Sun,
  Camera,
  Sliders,
  Smile,
  Keyboard,
  Plug,
  Anchor,
  Globe,
  Branch,
  Monitor,
  Tree,
  Browser,
  Cursor,
  Archive,
  Gauge,
  Cpu,
} from './SettingsIcons';
import { Settings as GearIcon } from './Icons';
import ModelSettings from './ModelSettings';

type TabKey =
  | 'general'
  | 'appearance'
  | 'snapshot'
  | 'config'
  | 'models'
  | 'personal'
  | 'shortcut'
  | 'mcp'
  | 'hook'
  | 'connect'
  | 'git'
  | 'env'
  | 'tree'
  | 'browser'
  | 'computer'
  | 'archive'
  | 'usage';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.FC<{ size?: number }>;
}

// 与截图一致的分类列表, 其中 "模型" 是本次新增项.
const TABS: TabDef[] = [
  { key: 'general', label: '常规', icon: GearIcon },
  { key: 'appearance', label: '外观', icon: Sun },
  { key: 'snapshot', label: '应用快照', icon: Camera },
  { key: 'config', label: '配置', icon: Sliders },
  { key: 'models', label: '模型', icon: Cpu }, // ← 新增
  { key: 'personal', label: '个性化', icon: Smile },
  { key: 'shortcut', label: '键盘快捷键', icon: Keyboard },
  { key: 'mcp', label: 'MCP 服务器', icon: Plug },
  { key: 'hook', label: '钩子', icon: Anchor },
  { key: 'connect', label: '连接', icon: Globe },
  { key: 'git', label: 'Git', icon: Branch },
  { key: 'env', label: '环境', icon: Monitor },
  { key: 'tree', label: '工作树', icon: Tree },
  { key: 'browser', label: '浏览器', icon: Browser },
  { key: 'computer', label: '电脑操控', icon: Cursor },
  { key: 'archive', label: '已归档对话', icon: Archive },
  { key: 'usage', label: '使用情况和计费', icon: Gauge },
];

interface Props {
  onBack: () => void;
}

const SettingsPage: React.FC<Props> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  return (
    <div className="settings-root">
      {/* 左侧导航 */}
      <aside className="settings-side">
        <button className="settings-back" onClick={onBack}>
          <ArrowLeft size={16} />
          <span>返回应用</span>
        </button>
        <nav className="settings-nav">
          {TABS.map((t) => {
            const Icon = t.icon as React.FC<{ size?: number }>;
            return (
              <button
                key={t.key}
                className={`settings-nav-item ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* 右侧内容 */}
      <main className="settings-main">
        <div className="settings-main-inner">
          {activeTab === 'general' && <GeneralPanel />}
          {activeTab === 'models' && <ModelSettings />}
          {activeTab !== 'general' && activeTab !== 'models' && (
            <div className="settings-section">
              <div className="settings-section-title">
                {TABS.find((t) => t.key === activeTab)?.label}
              </div>
              <div className="settings-section-desc">该分类暂未实现</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// GeneralPanel 还原截图中「常规」页的关键控件.
const GeneralPanel: React.FC = () => {
  const [workMode, setWorkMode] = useState<'coding' | 'daily'>('coding');
  const [permDefault, setPermDefault] = useState(true);
  const [permAutoReview, setPermAutoReview] = useState(true);
  const [permFullAccess, setPermFullAccess] = useState(true);

  return (
    <>
      <h1 className="settings-h1">常规</h1>

      <div className="settings-section">
        <div className="settings-section-title">工作模式</div>
        <div className="settings-section-desc">选择 Codex 显示多少技术细节</div>
        <div className="mode-grid">
          <button
            className={`mode-card ${workMode === 'coding' ? 'active' : ''}`}
            onClick={() => setWorkMode('coding')}
          >
            <div className="mode-card-icon">{'</>'}</div>
            <div className="mode-card-text">
              <div className="mode-card-title">适用于编程</div>
              <div className="mode-card-desc">更具技术性的回复和控制</div>
            </div>
            <div className={`mode-radio ${workMode === 'coding' ? 'on' : ''}`} />
          </button>
          <button
            className={`mode-card ${workMode === 'daily' ? 'active' : ''}`}
            onClick={() => setWorkMode('daily')}
          >
            <div className="mode-card-icon">💬</div>
            <div className="mode-card-text">
              <div className="mode-card-title">适用于日常工作</div>
              <div className="mode-card-desc">同样强大，技术细节更少</div>
            </div>
            <div className={`mode-radio ${workMode === 'daily' ? 'on' : ''}`} />
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">权限</div>
        <div className="setting-row">
          <div className="setting-row-text">
            <div className="setting-row-title">默认权限</div>
            <div className="setting-row-desc">
              默认情况下，Codex 可以读取并编辑其工作区中的文件。必要时，它可以请求额外的访问权限。
            </div>
          </div>
          <Toggle on={permDefault} onChange={setPermDefault} />
        </div>
        <div className="setting-row">
          <div className="setting-row-text">
            <div className="setting-row-title">自动审核</div>
            <div className="setting-row-desc">
              Codex 可以读取和编辑其工作区中的文件。Codex 会自动审核额外访问权限请求。自动审核可能会出错。
            </div>
          </div>
          <Toggle on={permAutoReview} onChange={setPermAutoReview} />
        </div>
        <div className="setting-row">
          <div className="setting-row-text">
            <div className="setting-row-title">完全访问权限</div>
            <div className="setting-row-desc">
              当 Codex 以完全访问权限运行时，无需你批准，即可编辑你的电脑上的任何文件并运行联网命令。这会显著增加数据丢失、泄露或意外行为的风险。
            </div>
          </div>
          <Toggle on={permFullAccess} onChange={setPermFullAccess} />
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">常规</div>
        <div className="setting-row">
          <div className="setting-row-text">
            <div className="setting-row-title">默认打开目标</div>
            <div className="setting-row-desc">默认打开文件和文件夹的位置</div>
          </div>
          <select className="settings-select" defaultValue="vscode">
            <option value="vscode">VS Code</option>
            <option value="cursor">Cursor</option>
            <option value="finder">Finder</option>
          </select>
        </div>
        <div className="setting-row">
          <div className="setting-row-text">
            <div className="setting-row-title">语言</div>
            <div className="setting-row-desc">应用 UI 语言</div>
          </div>
          <select className="settings-select" defaultValue="auto">
            <option value="auto">自动检测</option>
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </>
  );
};

// 简单的开关组件.
const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
    <span className="toggle-knob" />
  </button>
);

export default SettingsPage;
