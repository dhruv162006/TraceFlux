import { motion } from 'framer-motion';

interface EventLoopGaugeProps {
  score: number; // 0–100
  lagMs: number;
  activeHandles: number;
  pendingPromises: number;
}

export function EventLoopGauge({ score, lagMs, activeHandles, pendingPromises }: EventLoopGaugeProps) {
  // Map 0-100 score to degrees (-90deg to 90deg for a half-circle gauge)
  const angle = (score / 100) * 180 - 90;

  // Determine indicator color
  let color = 'var(--accent-green)';
  if (score >= 40 && score < 70) {
    color = 'var(--accent-amber)';
  } else if (score >= 70) {
    color = 'var(--accent-red)';
  }

  return (
    <div className="glass-panel p-6 bg-bg-surface flex flex-col items-center justify-center border border-border/40 min-h-[300px]">
      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-6">
        Event Loop Pressure Gauge
      </span>

      {/* SVG Arc Gauge */}
      <div className="relative h-32 w-52 overflow-hidden flex items-end justify-center">
        <svg className="absolute top-0 left-0 w-full h-full" viewBox="0 0 200 100">
          {/* Background arc */}
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke="#1a1d24"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Color Fill arc */}
          <path
            d="M 20 90 A 80 80 0 0 1 180 90"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={251.3} // Circumference of semicircle (pi * r) -> 3.14 * 80 ≈ 251.3
            strokeDashoffset={251.3 - (251.3 * score) / 100}
            className="transition-all duration-1000 ease-out"
          />
          {/* Center Hub */}
          <circle cx="100" cy="90" r="8" fill="var(--text-primary)" />
        </svg>

        {/* Animated Needle */}
        <motion.div
          className="absolute bottom-0 h-20 w-1 bg-text-primary origin-bottom"
          style={{ bottom: '10px' }}
          initial={{ rotate: -90 }}
          animate={{ rotate: angle }}
          transition={{ type: 'spring', stiffness: 50, damping: 10 }}
        />

        {/* Score Value Display */}
        <div className="absolute bottom-2 flex flex-col items-center">
          <span className="text-3xl font-extrabold text-text-primary tracking-tight">
            {score}
          </span>
          <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            Pressure Score
          </span>
        </div>
      </div>

      {/* Live Core Metrics */}
      <div className="w-full grid grid-cols-3 gap-3 mt-6 border-t border-border/40 pt-5 text-center">
        <div className="space-y-1">
          <div className="text-sm font-bold text-text-primary">
            {lagMs.toFixed(2)}ms
          </div>
          <div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">
            Lag Time
          </div>
        </div>
        <div className="space-y-1 border-x border-border/40">
          <div className="text-sm font-bold text-text-primary">
            {activeHandles}
          </div>
          <div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">
            Active Handles
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-sm font-bold text-text-primary">
            {pendingPromises}
          </div>
          <div className="text-[9px] font-semibold text-text-muted uppercase tracking-wider">
            Pending Promises
          </div>
        </div>
      </div>
    </div>
  );
}
