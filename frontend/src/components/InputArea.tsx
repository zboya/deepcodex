import React, { KeyboardEvent } from 'react';
import {
  Plus,
  Hand,
  ChevronDown,
  Mic,
  ArrowUp,
  FolderPlus,
} from './Icons';

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

          <button className="tool-chip" title="模型">
            <span className="muted">5.5</span>
            <span className="muted">中</span>
            <ChevronDown size={12} />
          </button>
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
