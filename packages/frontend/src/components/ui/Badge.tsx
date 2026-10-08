interface BadgeProps {
  children: React.ReactNode;
  variant?: 'blue' | 'teal' | 'amber' | 'red' | 'purple' | 'green' | 'gray';
}

export function Badge({ children, variant = 'gray' }: BadgeProps) {
  const styles: Record<string, string> = {
    blue: 'bg-accent-blue/10 text-accent-blue border-accent-blue/30',
    teal: 'bg-accent-teal/10 text-accent-teal border-accent-teal/30',
    amber: 'bg-accent-amber/10 text-accent-amber border-accent-amber/30',
    red: 'bg-accent-red/10 text-accent-red border-accent-red/30',
    purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/30',
    green: 'bg-accent-green/10 text-accent-green border-accent-green/30',
    gray: 'bg-text-muted/10 text-text-secondary border-text-muted/30',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
        styles[variant]
      }`}
    >
      {children}
    </span>
  );
}
