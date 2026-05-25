// 模型 (LLM Provider) 设置面板.
//
// 该 Tab 在「设置」中新增, 用于管理 ~/.deepcodex/providers.json 里的 LLM 提供商配置.
// 主要功能:
//   1. 列表展示所有已配置的 provider, 显示 Kind / 默认模型 / 状态;
//   2. 设为活跃 / 启用-禁用 / 编辑 / 删除;
//   3. 新增 provider, 表单包含 Name / Kind / BaseURL / APIKey / DefaultModel / Models 列表;
//   4. 编辑时点 "拉取" 按钮可以调用 ListProviderModels(name) 远程获取模型 ID.
//
// 所有数据均通过 wails 绑定与 Go 端通信.
import React, { useEffect, useMemo, useState } from 'react';
import {
  ListProviders,
  GetProvidersConfig,
  SaveProvider,
  DeleteProvider,
  SetActiveProvider,
  ListProviderModels,
  GetProvidersConfigPath,
} from '../../wailsjs/go/main/App';
import { apiclient } from '../../wailsjs/go/models';
import { PlusCircle, Edit, Trash, Check, X, Refresh } from './SettingsIcons';

// 支持的 provider 协议种类, 与后端 ProviderConfig.ToProviderKind() 对齐.
const PROVIDER_KINDS: { value: string; label: string; defaultBase?: string }[] = [
  { value: 'openai', label: 'OpenAI', defaultBase: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic (Claude)', defaultBase: '' },
  { value: 'gemini', label: 'Google Gemini', defaultBase: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { value: 'xai', label: 'xAI (Grok)', defaultBase: 'https://api.x.ai/v1' },
  { value: 'deepseek', label: 'DeepSeek', defaultBase: 'https://api.deepseek.com/v1' },
  { value: 'mistral', label: 'Mistral', defaultBase: 'https://api.mistral.ai/v1' },
  { value: 'openrouter', label: 'OpenRouter', defaultBase: 'https://openrouter.ai/api/v1' },
  { value: 'together', label: 'Together AI', defaultBase: 'https://api.together.xyz/v1' },
  { value: 'groq', label: 'Groq', defaultBase: 'https://api.groq.com/openai/v1' },
  { value: 'azure', label: 'Azure OpenAI', defaultBase: '' },
  { value: 'novita', label: 'Novita AI', defaultBase: 'https://api.novita.ai/v3/openai' },
  { value: 'openai-compat', label: 'OpenAI 兼容 (自定义)', defaultBase: '' },
];

// 表单的初始值 (用于新增).
function emptyForm(): apiclient.ProviderConfig {
  return new apiclient.ProviderConfig({
    name: '',
    kind: 'openai',
    baseUrl: '',
    apiKey: '',
    authToken: '',
    models: [],
    defaultModel: '',
    enabled: true,
  });
}

const ModelSettings: React.FC = () => {
  const [providers, setProviders] = useState<apiclient.ProviderConfig[]>([]);
  const [activeName, setActiveName] = useState<string>('');
  const [configPath, setConfigPath] = useState<string>('');

  // 编辑/新增对话框状态.
  const [editing, setEditing] = useState<apiclient.ProviderConfig | null>(null);
  const [editingOriginalName, setEditingOriginalName] = useState<string>(''); // 用于判断「新增 vs 编辑」
  const [modelsInput, setModelsInput] = useState(''); // 一行一个模型 ID

  // 远程拉取模型列表的 loading.
  const [pullingModels, setPullingModels] = useState(false);
  const [pullError, setPullError] = useState<string>('');

  // 全局 toast.
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refresh = async () => {
    try {
      const list = await ListProviders();
      setProviders(list || []);
      const cfg = await GetProvidersConfig();
      setActiveName(cfg?.activeProvider || '');
      const path = await GetProvidersConfigPath();
      setConfigPath(path || '');
    } catch (e: any) {
      setToast({ kind: 'err', text: `加载配置失败: ${e?.message || e}` });
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // 自动消失 toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const openCreate = () => {
    setEditing(emptyForm());
    setEditingOriginalName('');
    setModelsInput('');
    setPullError('');
  };

  const openEdit = (p: apiclient.ProviderConfig) => {
    // 拷贝一份避免直接改列表.
    const copy = new apiclient.ProviderConfig(JSON.parse(JSON.stringify(p)));
    setEditing(copy);
    setEditingOriginalName(p.name);
    setModelsInput((p.models || []).join('\n'));
    setPullError('');
  };

  const closeEdit = () => {
    setEditing(null);
    setEditingOriginalName('');
    setModelsInput('');
    setPullError('');
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setToast({ kind: 'err', text: '请填写 Provider 名称' });
      return;
    }
    // 解析模型列表 (按行分割).
    editing.models = modelsInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    // 对于「新增」, 但 name 与现有冲突 → 阻止.
    if (!editingOriginalName && providers.some((p) => p.name.toLowerCase() === editing.name.toLowerCase())) {
      setToast({ kind: 'err', text: `名称 "${editing.name}" 已存在` });
      return;
    }

    try {
      await SaveProvider(editing);
      setToast({ kind: 'ok', text: '已保存' });
      closeEdit();
      await refresh();
    } catch (e: any) {
      setToast({ kind: 'err', text: `保存失败: ${e?.message || e}` });
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除 provider "${name}" 吗？`)) return;
    try {
      await DeleteProvider(name);
      setToast({ kind: 'ok', text: '已删除' });
      await refresh();
    } catch (e: any) {
      setToast({ kind: 'err', text: `删除失败: ${e?.message || e}` });
    }
  };

  const handleSetActive = async (name: string) => {
    try {
      await SetActiveProvider(name);
      setActiveName(name);
      setToast({ kind: 'ok', text: `已激活 ${name}` });
    } catch (e: any) {
      setToast({ kind: 'err', text: `设置失败: ${e?.message || e}` });
    }
  };

  // 远程拉取模型: 仅在编辑已存在的 provider 时可用 (因为后端要按 name 查配置).
  const handlePullModels = async () => {
    if (!editing || !editingOriginalName) {
      setPullError('请先保存 Provider, 再拉取模型列表');
      return;
    }
    setPullingModels(true);
    setPullError('');
    try {
      const models = await ListProviderModels(editingOriginalName);
      const ids = (models || []).map((m) => m.id).filter(Boolean);
      if (ids.length === 0) {
        setPullError('未拉取到模型 (检查 BaseURL / APIKey)');
      } else {
        setModelsInput(ids.join('\n'));
        setToast({ kind: 'ok', text: `已拉取 ${ids.length} 个模型` });
      }
    } catch (e: any) {
      setPullError(`${e?.message || e}`);
    } finally {
      setPullingModels(false);
    }
  };

  const kindOptions = useMemo(() => PROVIDER_KINDS, []);

  return (
    <div className="settings-section">
      <div className="settings-section-title">模型</div>
      <div className="settings-section-desc">
        管理 LLM 提供商的接入参数。配置保存在
        <code className="inline-code">{configPath || '~/.deepcodex/providers.json'}</code>
      </div>

      {/* Provider 列表 */}
      <div className="model-providers">
        {providers.length === 0 ? (
          <div className="model-empty">尚未配置任何 LLM 提供商</div>
        ) : (
          providers.map((p) => (
            <div key={p.name} className={`model-card ${activeName === p.name ? 'active' : ''}`}>
              <div className="model-card-head">
                <div className="model-card-title">
                  <span className="model-name">{p.name}</span>
                  <span className="model-kind">{kindOptions.find((k) => k.value === p.kind)?.label || p.kind}</span>
                  {activeName === p.name && <span className="badge badge-active">活跃</span>}
                  {!p.enabled && <span className="badge badge-disabled">已禁用</span>}
                </div>
                <div className="model-card-actions">
                  {activeName !== p.name && (
                    <button className="btn btn-ghost" onClick={() => handleSetActive(p.name)}>
                      <Check size={14} />
                      <span>设为活跃</span>
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => openEdit(p)}>
                    <Edit size={14} />
                    <span>编辑</span>
                  </button>
                  <button className="btn btn-ghost danger" onClick={() => handleDelete(p.name)}>
                    <Trash size={14} />
                    <span>删除</span>
                  </button>
                </div>
              </div>
              <div className="model-card-meta">
                <div>
                  <span className="meta-key">默认模型</span>
                  <span className="meta-val">{p.defaultModel || '(未设置)'}</span>
                </div>
                <div>
                  <span className="meta-key">BaseURL</span>
                  <span className="meta-val">{p.baseUrl || '(默认)'}</span>
                </div>
                <div>
                  <span className="meta-key">API Key</span>
                  <span className="meta-val mono">{p.apiKey || '(无)'}</span>
                </div>
                <div>
                  <span className="meta-key">模型数</span>
                  <span className="meta-val">{(p.models || []).length}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <button className="btn btn-primary btn-add" onClick={openCreate}>
        <PlusCircle size={16} />
        <span>新增 LLM 提供商</span>
      </button>

      {/* 编辑/新增弹窗 */}
      {editing && (
        <div className="modal-mask" onClick={closeEdit}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>{editingOriginalName ? `编辑 ${editingOriginalName}` : '新增 LLM 提供商'}</span>
              <button className="icon-btn" onClick={closeEdit}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <label>名称 *</label>
                <input
                  type="text"
                  value={editing.name}
                  disabled={!!editingOriginalName}
                  placeholder="my-openai"
                  onChange={(e) =>
                    setEditing(new apiclient.ProviderConfig({ ...editing, name: e.target.value }))
                  }
                />
                <div className="form-hint">该名称在配置文件中唯一, 保存后不可修改</div>
              </div>

              <div className="form-row">
                <label>类型</label>
                <select
                  value={editing.kind}
                  onChange={(e) => {
                    const next = kindOptions.find((k) => k.value === e.target.value);
                    setEditing(
                      new apiclient.ProviderConfig({
                        ...editing,
                        kind: e.target.value,
                        baseUrl: editing.baseUrl || next?.defaultBase || '',
                      })
                    );
                  }}
                >
                  {kindOptions.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label>BaseURL</label>
                <input
                  type="text"
                  value={editing.baseUrl || ''}
                  placeholder="留空使用默认"
                  onChange={(e) =>
                    setEditing(new apiclient.ProviderConfig({ ...editing, baseUrl: e.target.value }))
                  }
                />
              </div>

              <div className="form-row">
                <label>API Key</label>
                <input
                  type="password"
                  value={editing.apiKey || ''}
                  placeholder={editingOriginalName ? '留空保持不变' : 'sk-...'}
                  onChange={(e) =>
                    setEditing(new apiclient.ProviderConfig({ ...editing, apiKey: e.target.value }))
                  }
                />
                {editingOriginalName && (
                  <div className="form-hint">
                    后端返回的是脱敏占位 (****xxxx), 留空将保留原 key
                  </div>
                )}
              </div>

              {editing.kind === 'anthropic' && (
                <div className="form-row">
                  <label>Auth Token (可选)</label>
                  <input
                    type="password"
                    value={editing.authToken || ''}
                    placeholder="ANTHROPIC_AUTH_TOKEN"
                    onChange={(e) =>
                      setEditing(new apiclient.ProviderConfig({ ...editing, authToken: e.target.value }))
                    }
                  />
                </div>
              )}

              <div className="form-row">
                <label>默认模型</label>
                <input
                  type="text"
                  value={editing.defaultModel || ''}
                  placeholder="gpt-5.4 / claude-sonnet-4-6 / ..."
                  onChange={(e) =>
                    setEditing(new apiclient.ProviderConfig({ ...editing, defaultModel: e.target.value }))
                  }
                />
              </div>

              <div className="form-row">
                <div className="form-row-head">
                  <label>模型列表 (一行一个)</label>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={pullingModels || !editingOriginalName}
                    onClick={handlePullModels}
                    title={editingOriginalName ? '从远程 /models 接口拉取' : '请先保存再拉取'}
                  >
                    <Refresh size={14} />
                    <span>{pullingModels ? '拉取中…' : '拉取远程模型'}</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={modelsInput}
                  placeholder={'gpt-5.4\ngpt-4o\no3-mini'}
                  onChange={(e) => setModelsInput(e.target.value)}
                />
                {pullError && <div className="form-error">{pullError}</div>}
              </div>

              <div className="form-row form-row-inline">
                <label>
                  <input
                    type="checkbox"
                    checked={editing.enabled}
                    onChange={(e) =>
                      setEditing(new apiclient.ProviderConfig({ ...editing, enabled: e.target.checked }))
                    }
                  />
                  <span>启用该 Provider</span>
                </label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={closeEdit}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </div>
  );
};

export default ModelSettings;
