import React, { KeyboardEvent, useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus,
  Hand,
  ChevronDown,
  Mic,
  ArrowUp,
  FolderPlus,
  StopSquare,
} from './Icons';
import {
  ListProviders,
  GetProvidersConfig,
  SetActiveProvider,
  SaveProvider,
  SelectImageFiles,
} from '../../bindings/github.com/zboya/deepcodex/app';
import * as apiclient from '../../bindings/github.com/zboya/deepcodex/agent/apiclient/models';

interface InputAreaProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  disabled?: boolean;
  compact?: boolean;
  /** 当前已选中的待发送图片路径列表（受控） */
  imagePaths?: string[];
  /** 图片附件变更回调，由父组件维护实际状态 */
  onChangeImagePaths?: (paths: string[]) => void;
  /** 当前选中模型变更时通知父组件 */
  onModelChange?: (model: string) => void;
}

const InputArea: React.FC<InputAreaProps> = ({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  compact,
  imagePaths = [],
  onChangeImagePaths,
  onModelChange,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 防止文件对话框重复触发（macOS 下连续输入两个 @ 会进入两次）
  const pickingRef = useRef(false);

  /**
   * 弹出原生文件对话框选图片，并把选中的绝对路径以 `@<path>` 形式插入到当前光标位置。
   * - 不修改用户已输入的其他文本
   * - 把每个路径登记到父组件的 imagePaths 状态，发送时一并随消息提交
   */
  const pickImagesAtCaret = useCallback(async () => {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      const paths = (await SelectImageFiles()) || [];
      if (!paths.length) return;

      // 1. 文本：把 @<path> 插入到光标处（每条独占一行更清晰）
      const ta = textareaRef.current;
      const insertion = paths.map((p) => `@${p}`).join(' ');
      if (ta) {
        const start = ta.selectionStart ?? value.length;
        const end = ta.selectionEnd ?? value.length;
        const before = value.slice(0, start);
        const after = value.slice(end);
        // 若 before 末尾已经是用户刚刚输入的 `@`，复用它，避免变成 `@@/path`
        const beforeStripped = before.endsWith('@') ? before.slice(0, -1) : before;
        const next = `${beforeStripped}${insertion}${after}`;
        onChange(next);
        // 异步把光标移动到插入末尾
        const caret = beforeStripped.length + insertion.length;
        requestAnimationFrame(() => {
          ta.focus();
          ta.setSelectionRange(caret, caret);
        });
      } else {
        // 兜底：直接拼到末尾
        const stripped = value.endsWith('@') ? value.slice(0, -1) : value;
        onChange(stripped + insertion);
      }

      // 2. 路径：合并到父组件状态，去重
      if (onChangeImagePaths) {
        const merged = Array.from(new Set([...imagePaths, ...paths]));
        onChangeImagePaths(merged);
      }
    } catch (e) {
      console.warn('[InputArea] SelectImageFiles failed', e);
    } finally {
      pickingRef.current = false;
    }
  }, [value, onChange, imagePaths, onChangeImagePaths]);

  const removeImage = (path: string) => {
    if (!onChangeImagePaths) return;
    onChangeImagePaths(imagePaths.filter((p) => p !== path));
    // 同步从输入框文本里移除对应的 `@<path>` 引用（如果存在）
    const token = `@${path}`;
    if (value.includes(token)) {
      onChange(value.split(token).join('').replace(/\s{2,}/g, ' ').trimStart());
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 输入法合成期间的 Enter 不当作发送
    // @ts-ignore - isComposing 标准属性，但 React 类型有时缺失
    if (e.nativeEvent && (e.nativeEvent as any).isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      onSubmit();
    }
  };

  // 监听输入：当用户键入 `@` 时弹出图片选择对话框（仅独立 `@`，避免邮箱等误触发）。
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);

    // 仅当本次新增的字符正好是 `@`，并且 `@` 前没有非空白字符（避免误把邮箱或代码触发）
    if (next.length === value.length + 1) {
      const caret = e.target.selectionStart ?? next.length;
      const inserted = next.slice(caret - 1, caret);
      if (inserted === '@') {
        const prev = caret >= 2 ? next[caret - 2] : '';
        if (!prev || /\s/.test(prev)) {
          // 异步触发，确保 onChange 状态先落到 React
          setTimeout(() => {
            pickImagesAtCaret();
          }, 0);
        }
      }
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

  // 通知父组件当前模型变化
  useEffect(() => {
    if (onModelChange && currentModel) {
      onModelChange(currentModel);
    }
  }, [currentModel, onModelChange]);

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
        {/* 已选图片附件 chips */}
        {imagePaths.length > 0 && (
          <div className="input-attachments">
            {imagePaths.map((p) => {
              const name = p.split('/').pop() || p;
              return (
                <span key={p} className="attachment-chip" title={p}>
                  <span className="attachment-name">🖼️ {name}</span>
                  <button
                    type="button"
                    className="attachment-remove"
                    onClick={() => removeImage(p)}
                    title="移除"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="input-textarea"
          placeholder={compact ? '要求后续变更（输入 @ 添加图片）' : '尽管问（输入 @ 添加图片）'}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={compact ? 1 : 2}
        />

        <div className="input-toolbar">
          <button
            className="tool-btn"
            title="添加图片"
            onClick={pickImagesAtCaret}
            type="button"
          >
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
          {disabled && onStop ? (
            <button
              className="send-btn stop-btn"
              onClick={onStop}
              title="停止生成"
            >
              <StopSquare size={14} />
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={onSubmit}
              disabled={(!value.trim() && imagePaths.length === 0) || disabled}
              title="发送 (Enter)"
            >
              <ArrowUp size={16} />
            </button>
          )}
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