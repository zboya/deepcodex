// 内联 SVG 图标集合，避免引入额外依赖
import React from 'react';

type IconProps = {
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
};

const base = (props: IconProps) => ({
  width: props.size ?? 16,
  height: props.size ?? 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: props.color ?? 'currentColor',
  strokeWidth: props.strokeWidth ?? 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: props.className,
});

export const PenSquare: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
  </svg>
);

export const Search: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const Grid: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const Clock: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Smartphone: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <path d="M11 18h2" />
  </svg>
);

export const FolderClosed: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M3 11h18" />
  </svg>
);

export const FolderPlus: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </svg>
);

export const Settings: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.0009a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.0009a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.0009a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const ChevronLeft: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const ChevronRight: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const ChevronDown: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const SidebarIcon: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

export const Plus: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const Hand: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M18 11V6a2 2 0 0 0-4 0v5" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

export const Mic: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </svg>
);

export const ArrowUp: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </svg>
);

export const StopSquare: React.FC<IconProps> = (p) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);

export const Minimize: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const Maximize: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="1" />
  </svg>
);

// 三方连接器图标（彩色，固定颜色）
export const SlackIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="13" y="2" width="3" height="9" rx="1.5" fill="#36C5F0" />
    <rect x="2" y="8" width="9" height="3" rx="1.5" fill="#2EB67D" />
    <rect x="8" y="13" width="3" height="9" rx="1.5" fill="#ECB22E" />
    <rect x="13" y="13" width="9" height="3" rx="1.5" fill="#E01E5A" />
  </svg>
);

export const GithubIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff">
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.8-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.3v3.4c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);

export const LinearIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="linearGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5e6ad2" />
        <stop offset="1" stopColor="#a4adff" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="10" fill="url(#linearGrad)" />
    <path d="M5 13.5L10.5 19a10 10 0 0 0 4-1L6 9.5a10 10 0 0 0-1 4Z" fill="rgba(255,255,255,0.85)" />
  </svg>
);