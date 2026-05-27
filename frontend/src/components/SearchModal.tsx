import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Project, ChatItem } from '../types';

interface SearchResult {
  chatId: string;
  title: string;
  projectId: string;
  projectName: string;
  createdAt?: number;
}

interface SearchModalProps {
  projects: Project[];
  projectSessions: Record<string, ChatItem[]>;
  onSelect: (projectId: string, chatId: string) => void;
  onClose: () => void;
}

const SearchModal: React.FC<SearchModalProps> = ({
  projects,
  projectSessions,
  onSelect,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 扁平化所有会话，按 createdAt 降序
  const allResults: SearchResult[] = React.useMemo(() => {
    const items: SearchResult[] = [];
    for (const project of projects) {
      const sessions = projectSessions[project.id] || [];
      for (const s of sessions) {
        items.push({
          chatId: s.id,
          title: s.title || '未命名会话',
          projectId: project.id,
          projectName: project.name,
          createdAt: s.createdAt,
        });
      }
    }
    items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return items;
  }, [projects, projectSessions]);

  const filtered = query.trim()
    ? allResults.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          r.projectName.toLowerCase().includes(query.toLowerCase()),
      )
    : allResults;

  // 重置 active index when query changes
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // auto focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const item = filtered[activeIdx];
        if (item) {
          onSelect(item.projectId, item.chatId);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [filtered, activeIdx, onSelect, onClose],
  );

  // 点击背景关闭
  const handleBackdropClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('search-modal-backdrop')) {
      onClose();
    }
  };

  // 滚动保持 active 可见
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <div className="search-modal-backdrop" onMouseDown={handleBackdropClick}>
      <div className="search-modal">
        {/* 搜索输入 */}
        <div className="search-modal-input-wrap">
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity: 0.45, flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="search-modal-input"
            placeholder="搜索对话"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* 结果列表 */}
        <div className="search-modal-list" ref={listRef}>
          {filtered.length > 0 && (
            <div className="search-modal-section-title">
              {query.trim() ? '搜索结果' : '近期对话'}
            </div>
          )}
          {filtered.length === 0 && (
            <div className="search-modal-empty">
              {query.trim() ? `未找到「${query}」相关对话` : '暂无对话记录'}
            </div>
          )}
          {filtered.map((item, idx) => (
            <button
              key={item.chatId}
              data-idx={idx}
              className={`search-modal-item ${activeIdx === idx ? 'active' : ''}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => {
                onSelect(item.projectId, item.chatId);
                onClose();
              }}
            >
              <span className="search-modal-item-title">{item.title}</span>
              <span className="search-modal-item-project">{item.projectName}</span>
              {idx < 9 && (
                <span className="search-modal-item-shortcut">⌘{idx + 1}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
