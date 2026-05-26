import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import MermaidBlock from './MermaidBlock';

interface MarkdownMessageProps {
  content: string;
  /**
   * 链接点击回调。预留给“内置浏览器”等场景；
   * 不传则按默认 <a target="_blank"> 行为。
   */
  onLinkClick?: (url: string) => void;
  /**
   * 是否处于流式输出中。流式期间，mermaid 代码块按普通代码块显示；
   * 流式结束后再渲染为图，避免中间态报错。
   */
  streaming?: boolean;
}

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, onLinkClick, streaming }) => {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ href, children, ...rest }) => {
            const url = href || '';
            return (
              <a
                {...rest}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (onLinkClick && url) {
                    e.preventDefault();
                    onLinkClick(url);
                  }
                }}
              >
                {children}
              </a>
            );
          },
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code className={`md-inline-code ${className || ''}`} {...props}>
                  {children}
                </code>
              );
            }
            const lang = /language-(\w+)/.exec(className || '')?.[1];
            const raw = String(children).replace(/\n$/, '');
            // mermaid: 流式期间作为普通代码块显示，流式结束后渲染成图
            if (lang === 'mermaid' && !streaming) {
              return <MermaidBlock code={raw} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownMessage;
