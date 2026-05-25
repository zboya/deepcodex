import React, { KeyboardEvent, useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus,
  Hand,
  ChevronDown,
  Mic,
  ArrowUp,
  FolderPlus,
} from './Icons';
import {
  ListProviders,
  GetProvidersConfig,
  SetActiveProvider,
  SaveProvider,
} from '../../wailsjs/go/main/App';
import { apiclient } from '../../wailsjs/go/models';

interface InputAreaProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  compact?: boolean;
}

const InputArea: React.FC<InputAreaProps> = ({ value, onChange, onSubmit, disabled, compact }) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 输入法合成期间的 Enter 不当作发送
    // @ts-ignore - isComposing 标准属性，但 React 类型有时缺失
    if (e.nativeEvent && (e.nativeEvent as any).isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      onSubmit();
    }
  };

  // ===== 模型选择器 =====
  const [providers, setProviders] = useState<apiclient.ProviderConfig[]>([]);
  const [activeProvider, setActiveProviderName] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const refreshProviders = useCallback(async () => {
    try {
      const list = await ListProviders();
      setProviders((list || []).filter((p) => p.enabled));
      const cfg = await GetProvidersConfig();
      setActiveProviderName(cfg?.activeProvider || '');
    } catch (e) {
      console.warn('[InputArea] load providers failed', e);
    }
  }, []);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

  // 点击外部关闭
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  const togglePicker = async () => {
    if (!pickerOpen) {
      // 打开前刷新一次，保证设置页改动同步
      await refreshProviders();
    }
    setPickerOpen((v) => !v);
  };

  // 当前显示的 provider / model
  const current = providers.find((p) => p.name === activeProvider);
  const currentModel = current?.defaultModel || '';

  const handleSelect = async (provider: apiclient.ProviderConfig, model: string) => {
    try {
      // 1. 设为活跃 provider
      if (provider.name !== activeProvider) {
        await SetActiveProvider(provider.name);
      }
      // 2. 若选中的 model 与默认不同，则更新 defaultModel
      if (provider.defaultModel !== model) {
        const next = new apiclient.ProviderConfig({ ...provider, defaultModel: model });
        await SaveProvider(next);
      }
      await refreshProviders();
      setPickerOpen(false);
    } catch (e: any) {
      console.error('[InputArea] switch model failed', e);
      alert(`切换失败: ${e?.message || e}`);
    }
  };

  // 展示文案：优先显示当前模型，否则 provider 名
  const chipLabel = currentModel
    ? currentModel
    : current?.name || (providers.length === 0 ? '未配置' : '选择模型');

  return (
    <div className="input-wrap">
      <div className="input-card">
        <textarea
          className="input-textarea"
          placeholder={compact ? '要求后续变更' : '尽管问'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={compact ? 1 : 2}
        />

        <div className="input-toolbar">
          <button className="tool-btn" title="附件">
            <Plus size={16} />
          </button>
          <button className="tool-chip" title="选择权限">
            <Hand size={14} />
            <span>默认权限</span>
            <ChevronDown size={12} />
          </button>

          <div className="flex-spacer" />

          {/* 模型选择器 */}
          <div className="model-picker" ref={pickerRef}>
            <button
              className="tool-chip"
              title="选择模型"
              onClick={togglePicker}
              type="button"
            >
              <span className="muted">{chipLabel}</span>
              <ChevronDown size={12} />
            </button>

            {pickerOpen && (
              <div className="model-picker-menu" role="menu">
                {providers.length === 0 ? (
                  <div className="model-picker-empty">
                    尚未配置 LLM 提供商
                    <div className="model-picker-hint">请前往设置 → 模型 添加</div>
                  </div>
                ) : (
                  providers.map((p) => {
                    const models = p.models && p.models.length > 0
                      ? p.models
                      : (p.defaultModel ? [p.defaultModel] : []);
                    return (
                      <div key={p.name} className="model-picker-group">
                        <div className="model-picker-group-title">
                          <span>{p.name}</span>
                          <span className="model-picker-kind">{p.kind}</span>
                        </div>
                        {models.length === 0 ? (
                          <div className="model-picker-item disabled">
                            (未配置模型)
                          </div>
                        ) : (
                          models.map((m) => {
                            const selected =
                              p.name === activeProvider && m === currentModel;
                            return (
                              <button
                                key={`${p.name}::${m}`}
                                className={`model-picker-item ${selected ? 'selected' : ''}`}
                                onClick={() => handleSelect(p, m)}
                                type="button"
                              >
                                <span className="model-picker-dot">{selected ? '●' : ''}</span>
                                <span className="model-picker-name">{m}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <button className="tool-btn" title="语音输入">
            <Mic size={16} />
          </button>
          <button
            className="send-btn"
            onClick={onSubmit}
            disabled={!value.trim() || disabled}
            title="发送 (Enter)"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>

      {/* 工作目录条（仅欢迎页显示） */}
      {!compact && (
        <button className="workspace-chip">
          <FolderPlus size={14} />
          <span>进入项目工作</span>
          <ChevronDown size={12} />
        </button>
      )}
    </div>
  );
};

export default InputArea;
