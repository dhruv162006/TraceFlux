import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DashboardLayout } from './components/layout/DashboardLayout.js';
import { Overview } from './pages/Overview.js';
import { RequestExplorer } from './pages/RequestExplorer.js';
import { TimelineAnalysis } from './pages/TimelineAnalysis.js';
import { ResourceGraph } from './pages/ResourceGraph.js';
import { ConcurrencyInspector } from './pages/ConcurrencyInspector.js';
import { EventLoopMonitor } from './pages/EventLoopMonitor.js';
import { RaceConditionAnalyzer } from './pages/RaceConditionAnalyzer.js';
import { PerformanceMetrics } from './pages/PerformanceMetrics.js';
import { TraceReplay } from './pages/TraceReplay.js';

export default function App() {
  return (
    <Router>
      <DashboardLayout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/replay" element={<TraceReplay />} />
          <Route path="/explorer" element={<RequestExplorer />} />
          <Route path="/timeline" element={<TimelineAnalysis />} />
          <Route path="/graph" element={<ResourceGraph />} />
          <Route path="/concurrency" element={<ConcurrencyInspector />} />
          <Route path="/event-loop" element={<EventLoopMonitor />} />
          <Route path="/race-analyzer" element={<RaceConditionAnalyzer />} />
          <Route path="/metrics" element={<PerformanceMetrics />} />
        </Routes>
      </DashboardLayout>
    </Router>
  );
}
