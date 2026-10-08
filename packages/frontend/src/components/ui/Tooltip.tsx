import { useState } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 text-xs text-text-primary bg-bg-elevated border border-border/60 rounded-lg shadow-xl whitespace-nowrap pointer-events-none transition-all duration-200 opacity-100 scale-100">
          {content}
        </div>
      )}
    </div>
  );
}
