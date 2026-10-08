import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  colorClass?: string; // e.g. text-accent-blue
}

export function MetricCard({ title, value, subtitle, icon: Icon, colorClass = 'text-accent-blue' }: MetricCardProps) {
  return (
    <div className="glass-panel p-5 bg-bg-surface hover:bg-bg-hover transition-all duration-200 border border-border/40 hover:border-border/80 flex items-center justify-between">
      <div className="space-y-2">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {title}
        </span>
        <div className={`text-3xl font-bold ${colorClass}`}>
          {value}
        </div>
        {subtitle && (
          <p className="text-xs text-text-muted">
            {subtitle}
          </p>
        )}
      </div>
      {Icon && (
        <div className="h-10 w-10 rounded-lg bg-bg-elevated flex items-center justify-center text-text-secondary border border-border/20">
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
