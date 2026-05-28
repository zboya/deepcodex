import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from './Icons';
import {
  ListProviders,
  GetProvidersConfig,
  SetActiveProvider,
  SaveProvider,
} from '../../bindings/github.com/zboya/deepcodex/app';
import * as apiclient from '../../bindings/github.com/zboya/deepcodex/agent/apiclient/models';

interface ModelSelectorProps {
  onModelChange?: (model: string) => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange }) => {
  const [providers, setProviders] = useState<apiclient.ProviderConfig[]>([]);
  const [activeProvider, setActiveProviderName] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const refreshProviders = useCallback(async () => {
    try {
      const list = (await ListProviders()) as apiclient.ProviderConfig[];
      setProviders((list || []).filter((p: apiclient.ProviderConfig) => p.enabled));
      const cfg = await GetProvidersConfig();
      setActiveProviderName(cfg?.activeProvider || '');
    } catch (e) {
      console.warn('[ModelSelector] load providers failed', e);
    }
  }, []);

  useEffect(() => {
    refreshProviders();
  }, [refreshProviders]);

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
      await refreshProviders();
    }
    setPickerOpen((v) => !v);
  };

  const current = providers.find((p) => p.name === activeProvider);
  const currentModel = current?.defaultModel || '';

  useEffect(() => {
    if (currentModel) {
      onModelChange?.(currentModel);
    }
  }, [currentModel, onModelChange]);

  const handleSelect = async (provider: apiclient.ProviderConfig, model: string) => {
    try {
      if (provider.name !== activeProvider) {
        await SetActiveProvider(provider.name);
      }
      if (provider.defaultModel !== model) {
        const next = new apiclient.ProviderConfig({ ...provider, defaultModel: model });
        await SaveProvider(next);
      }
      onModelChange?.(model);
      await refreshProviders();
      setPickerOpen(false);
    } catch (e: any) {
      console.error('[ModelSelector] switch model failed', e);
      alert(`切换失败: ${e?.message || e}`);
    }
  };

  const chipLabel = currentModel
    ? currentModel
    : current?.name || (providers.length === 0 ? '未配置' : '选择模型');

  return (
    <div className="model-picker copilot-model-picker" ref={pickerRef}>
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
                    models.map((m: string) => {
                      const selected = p.name === activeProvider && m === currentModel;
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
  );
};

export default ModelSelector;
