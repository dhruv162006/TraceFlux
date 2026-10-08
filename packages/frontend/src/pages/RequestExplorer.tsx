import { useState } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { useTrace, useTraceGraph } from '../hooks/useTraceData.js';
import { LoadingSpinner } from '../components/ui/LoadingSpinner.js';
import { Badge } from '../components/ui/Badge.js';
import { Search, Info, SlidersHorizontal } from 'lucide-react';

export function RequestExplorer() {
  const { selectedTraceId } = useAppStore();
  const { isLoading: isSessionLoading } = useTrace(selectedTraceId);
  const { data: graphData, isLoading: isGraphLoading } = useTraceGraph(selectedTraceId);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  if (!selectedTraceId) {
    return (
      <div className="text-center py-20 text-sm text-text-secondary">
        Please select a trace session from the top bar to inspect resources.
      </div>
    );
  }

  if (isSessionLoading || isGraphLoading) {
    return <LoadingSpinner />;
  }

  const nodes: any[] = graphData?.graph.nodes ?? [];

  // Filter types list
  const resourceTypes = Array.from(new Set(nodes.map((n) => n.resourceType)));

  // Apply search/filters
  const filteredNodes = nodes.filter((node) => {
    const matchesSearch =
      node.asyncId.toString().includes(searchQuery) ||
      node.resourceType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'ALL' || node.resourceType === filterType;
    return matchesSearch && matchesType;
  });

  const selectedNode = nodes.find((n) => n.asyncId === selectedNodeId);

  // Helper to map color to badge variants
  const getVariant = (type: string): any => {
    switch (type) {
      case 'PROMISE':
        return 'blue';
      case 'Timeout':
      case 'Immediate':
        return 'amber';
      case 'FSREQCALLBACK':
        return 'green';
      case 'TCPWRAP':
        return 'purple';
      case 'HTTPCLIENTREQUEST':
      case 'HTTPINCOMINGMESSAGE':
        return 'teal';
      default:
        return 'gray';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Async Request Explorer
          </h1>
          <p className="text-xs text-text-secondary font-mono">
            Session: {selectedTraceId}
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-bg-surface border border-border p-4 rounded-xl">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
          <input
            type="text"
            placeholder="Search by ID or Type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue"
          />
        </div>

        {/* Filter Type */}
        <div className="relative">
          <SlidersHorizontal className="absolute left-3 top-2.5 h-4.5 w-4.5 text-text-muted" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue appearance-none"
          >
            <option value="ALL">All Resource Types</option>
            {resourceTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: List + Detail Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: List of Nodes */}
        <div className="lg:col-span-2 glass-panel p-6 bg-bg-surface border border-border/40 overflow-hidden">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-4">
            Async Resources ({filteredNodes.length})
          </span>

          <div className="overflow-y-auto max-h-[500px] divide-y divide-border/20">
            {filteredNodes.map((node) => {
              const isSelected = selectedNodeId === node.asyncId;
              return (
                <div
                  key={node.asyncId}
                  onClick={() => setSelectedNodeId(node.asyncId)}
                  className={`flex items-center justify-between py-3.5 px-3 cursor-pointer hover:bg-bg-hover/20 transition-colors rounded-lg ${
                    isSelected ? 'bg-accent-blue/5 border-l-2 border-accent-blue' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-text-primary">
                      #{node.asyncId}
                    </span>
                    <Badge variant={getVariant(node.resourceType)}>
                      {node.resourceType}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-text-secondary">
                    <span>
                      Depth: <span className="font-bold text-text-primary">{node.depth}</span>
                    </span>
                    <span>
                      Duration:{' '}
                      <span className="font-bold text-text-primary">
                        {node.duration ? `${node.duration.toFixed(2)}ms` : 'Active'}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Selected Node Context Detail card */}
        <div className="glass-panel p-6 bg-bg-surface border border-border/40 min-h-[300px] flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-4">
              Context Details
            </span>

            {!selectedNode ? (
              <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-2">
                <Info className="h-6 w-6" />
                <span className="text-xs font-medium">Select a resource to inspect context metadata</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/20 pb-3">
                  <span className="font-mono text-sm font-bold text-text-primary">
                    ID #{selectedNode.asyncId}
                  </span>
                  <Badge variant={getVariant(selectedNode.resourceType)}>
                    {selectedNode.resourceType}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-bg-elevated p-3 rounded-lg border border-border/20">
                    <div className="text-text-muted mb-1 font-medium uppercase text-[9px] tracking-wide">
                      Start Time
                    </div>
                    <div className="font-semibold text-text-primary">
                      {new Date(selectedNode.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="bg-bg-elevated p-3 rounded-lg border border-border/20">
                    <div className="text-text-muted mb-1 font-medium uppercase text-[9px] tracking-wide">
                      Duration
                    </div>
                    <div className="font-semibold text-text-primary">
                      {selectedNode.duration ? `${selectedNode.duration.toFixed(2)}ms` : 'Active'}
                    </div>
                  </div>
                </div>

                {/* Display Context Keys */}
                <div className="bg-bg-elevated p-4 rounded-lg border border-border/20 space-y-2.5">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    Context Tags
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Critical Path:</span>
                      <span className={`font-bold ${selectedNode.isOnCriticalPath ? 'text-accent-amber' : 'text-text-primary'}`}>
                        {selectedNode.isOnCriticalPath ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-secondary">Concurrency Peers:</span>
                      <span className="font-bold text-text-primary">
                        {selectedNode.concurrentPeers} ops
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
