import React, { useEffect, useRef, useState } from 'react';

// 按需动态加载 mermaid：首次遇到 mermaid 代码块时才拉取 chunk。
// 模块级缓存，确保整个应用生命周期内只加载和初始化一次。
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'inherit',
      });
      return mermaid;
    });
  }
  return mermaidPromise;
};

let seed = 0;
const nextId = () => `mmd-${Date.now()}-${seed++}`;

interface Props {
  code: string;
}

/**
 * 渲染 mermaid 代码块为 SVG。
 * 仅在流式结束、代码块完整时由父组件挂载本组件。
 * mermaid 库通过动态 import 按需加载，避免拖累初始包体积。
 */
const MermaidBlock: React.FC<Props> = ({ code }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(nextId());

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);

    loadMermaid()
      .then((mermaid) => mermaid.render(idRef.current, code))
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        bindFunctions?.(ref.current);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre className="md-mermaid-error">
        <code>Mermaid 渲染失败：{error}{'\n\n'}{code}</code>
      </pre>
    );
  }
  return (
    <div className="md-mermaid" ref={ref}>
      {loading && <div className="md-mermaid-loading">图表加载中…</div>}
    </div>
  );
};

export default MermaidBlock;
