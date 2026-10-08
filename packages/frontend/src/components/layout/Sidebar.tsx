import { NavLink } from 'react-router-dom';
import {
  Activity,
  PlayCircle,
  Search,
  Clock,
  Network,
  Layers,
  Cpu,
  Zap,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/', label: 'Overview', icon: Activity },
  { path: '/replay', label: 'Trace Replay', icon: PlayCircle },
  { path: '/explorer', label: 'Request Explorer', icon: Search },
  { path: '/timeline', label: 'Timeline Analysis', icon: Clock },
  { path: '/graph', label: 'Resource Graph', icon: Network },
  { path: '/concurrency', label: 'Concurrency', icon: Layers },
  { path: '/event-loop', label: 'Event Loop', icon: Cpu },
  { path: '/race-analyzer', label: 'Race Conditions', icon: Zap },
  { path: '/metrics', label: 'Performance Metrics', icon: BarChart3 },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`bg-bg-surface border-r border-border h-screen flex flex-col transition-all duration-300 relative ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-4">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded bg-accent-blue flex items-center justify-center font-bold text-xs text-bg-primary">
              TF
            </span>
            <span className="font-semibold text-text-primary tracking-wider uppercase text-sm">
              TraceFlux
            </span>
          </div>
        )}
        {isCollapsed && (
          <span className="h-6 w-6 mx-auto rounded bg-accent-blue flex items-center justify-center font-bold text-xs text-bg-primary">
            TF
          </span>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-blue/10 text-accent-blue border-l-2 border-accent-blue'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse Toggle Trigger Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute bottom-4 -right-3 h-6 w-6 rounded-full border border-border bg-bg-elevated hover:bg-bg-hover flex items-center justify-center text-text-secondary hover:text-text-primary z-50 shadow"
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
