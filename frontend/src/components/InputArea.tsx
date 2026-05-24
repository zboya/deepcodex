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
}

const InputArea: React.FC<InputAreaProps> = ({ value, onChange, onSubmit }) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="input-wrap">
      <div className="input-card">
        <textarea
          className="input-textarea"
          placeholder="尽管问"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
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
            disabled={!value.trim()}
            title="发送 (Enter)"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>

      {/* 工作目录条 */}
      <button className="workspace-chip">
        <FolderPlus size={14} />
        <span>进入项目工作</span>
        <ChevronDown size={12} />
      </button>
    </div>
  );
};

export default InputArea;
