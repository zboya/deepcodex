// 设置面板用到的图标补充。复用与 Icons.tsx 相同的样式约束。
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

export const ArrowLeft: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const Sun: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const Camera: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M3 9a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

export const Sliders: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <circle cx="4" cy="12" r="2" />
    <circle cx="12" cy="6" r="2" />
    <circle cx="20" cy="14" r="2" />
  </svg>
);

export const Smile: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <path d="M9 9h.01M15 9h.01" />
  </svg>
);

export const Keyboard: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="2" y="6" width="20" height="13" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M8 17h8" />
  </svg>
);

export const Plug: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M9 2v6M15 2v6" />
    <path d="M5 8h14v3a7 7 0 0 1-14 0Z" />
    <path d="M12 18v4" />
  </svg>
);

export const Anchor: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v15" />
    <path d="M5 14a7 7 0 0 0 14 0" />
    <path d="M3 14h4M17 14h4" />
  </svg>
);

export const Globe: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

export const Branch: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="6" cy="4" r="2" />
    <circle cx="6" cy="20" r="2" />
    <circle cx="18" cy="8" r="2" />
    <path d="M6 6v12M18 10v2a4 4 0 0 1-4 4H8" />
  </svg>
);

export const Monitor: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

export const Tree: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M12 3v18" />
    <path d="M12 8h6M12 14h6M6 11h6" />
    <circle cx="6" cy="11" r="1.5" />
    <circle cx="18" cy="8" r="1.5" />
    <circle cx="18" cy="14" r="1.5" />
  </svg>
);

export const Browser: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
  </svg>
);

export const Cursor: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M5 3l6 16 2-7 7-2Z" />
  </svg>
);

export const Archive: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M10 12h4" />
  </svg>
);

export const Gauge: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13l4-3" />
    <path d="M8 4l1 2M16 4l-1 2" />
  </svg>
);

export const Cpu: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
  </svg>
);

export const Trash: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const PlusCircle: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export const Edit: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const Check: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export const X: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Refresh: React.FC<IconProps> = (p) => (
  <svg {...base(p)}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </svg>
);
