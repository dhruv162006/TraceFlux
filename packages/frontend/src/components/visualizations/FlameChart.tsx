import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphNode, ResourceType } from '../../types/index.js';

interface FlameChartProps {
  nodes: GraphNode[];
  sessionStart: number;
  sessionEnd: number;
  width?: number;
  height?: number;
  onNodeSelect?: (asyncId: number) => void;
}

export function FlameChart({
  nodes,
  sessionStart,
  sessionEnd,
  width = 800,
  height = 300,
  onNodeSelect,
}: FlameChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number]>([sessionStart, sessionEnd]);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: number; label: string }>>([]);

  const COLOR_MAP: Record<ResourceType, string> = {
    PROMISE: '#4f8ef7',
    Timeout: '#fbbf24',
    Immediate: '#fbbf24',
    FSREQCALLBACK: '#4ade80',
    TCPWRAP: '#a78bfa',
    HTTPCLIENTREQUEST: '#2dd4bf',
    HTTPINCOMINGMESSAGE: '#2dd4bf',
    TIMERWRAP: '#a78bfa',
    TickObject: '#8b91a1',
    GETADDRINFOREQWRAP: '#a78bfa',
    QueryWrap: '#a78bfa',
    CUSTOM: '#8b91a1',
  };

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 20 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // 1. Configure X Scale (Timeline zoom-capable)
    const x = d3.scaleLinear().domain(zoomRange).range([0, chartWidth]);

    const laneHeight = 24;

    // 2. Filter nodes falling within the zoom boundaries
    const visibleNodes = nodes.filter((node) => {
      const start = node.startTime;
      const end = start + (node.duration ?? 0.5); // fallback for zero duration
      return start < zoomRange[1] && end > zoomRange[0];
    });

    // 3. Render Flame Rectangles
    svg
      .selectAll('.flame-rect')
      .data(visibleNodes)
      .enter()
      .append('g')
      .attr('class', 'flame-group cursor-pointer')
      .each(function (d) {
        const group = d3.select(this);
        const rectWidth = Math.max(
          1,
          x(d.startTime + (d.duration ?? 0.5)) - x(d.startTime)
        );

        group
          .append('rect')
          .attr('class', 'flame-rect transition-all duration-200 hover:brightness-125')
          .attr('x', x(d.startTime))
          .attr('y', d.depth * laneHeight)
          .attr('width', rectWidth)
          .attr('height', laneHeight - 2)
          .attr('fill', COLOR_MAP[d.resourceType] || COLOR_MAP.CUSTOM)
          .attr('stroke', d.isOnCriticalPath ? 'var(--accent-amber)' : 'rgba(255,255,255,0.05)')
          .attr('stroke-width', d.isOnCriticalPath ? 1.5 : 0.5)
          .attr('rx', 2);

        // Render Labels if width permits
        if (rectWidth > 35) {
          group
            .append('text')
            .attr('x', x(d.startTime) + 4)
            .attr('y', d.depth * laneHeight + 14)
            .text(`${d.resourceType} (${d.asyncId})`)
            .attr('fill', '#0a0b0d')
            .style('font-size', '10px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .style('overflow', 'hidden');
        }
      })
      .on('click', (_event, d) => {
        // Zoom in to click target
        const end = d.startTime + (d.duration ?? 0.5);
        setZoomRange([d.startTime, end]);
        
        // Add to breadcrumbs
        setBreadcrumbs((prev) => {
          if (prev.some((p) => p.id === d.asyncId)) return prev;
          return [...prev, { id: d.asyncId, label: `${d.resourceType} (${d.asyncId})` }];
        });

        if (onNodeSelect) {
          onNodeSelect(d.asyncId);
        }
      });

    // 4. Render X-Axis timeline
    const xAxis = d3
      .axisBottom(x)
      .tickFormat((val) => `${Math.round((val as number - sessionStart) * 10) / 10}ms`);

    svg
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', '#8b91a1')
      .style('font-size', '9px');

    svg.selectAll('.domain, .tick line').attr('stroke', '#2a2f3a');
  }, [nodes, zoomRange, width, height, sessionStart, sessionEnd]);

  function resetZoom() {
    setZoomRange([sessionStart, sessionEnd]);
    setBreadcrumbs([]);
  }

  function handleBreadcrumbClick(index: number, id: number) {
    const node = nodes.find((n) => n.asyncId === id);
    if (node) {
      const end = node.startTime + (node.duration ?? 0.5);
      setZoomRange([node.startTime, end]);
      setBreadcrumbs((prev) => prev.slice(0, index + 1));
    }
  }

  return (
    <div className="glass-panel p-6 bg-bg-surface flex flex-col border border-border/40 w-full overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Execution Flame Chart (Icicle Zoom)
        </span>
        <button
          onClick={resetZoom}
          className="text-[10px] font-bold text-accent-blue bg-bg-elevated hover:bg-bg-hover border border-border px-2.5 py-1 rounded"
        >
          Reset Zoom
        </button>
      </div>

      {/* Breadcrumbs trail path */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-text-secondary overflow-x-auto pb-3 mb-3 border-b border-border/20">
          <span className="cursor-pointer hover:text-accent-blue" onClick={resetZoom}>
            Root
          </span>
          {breadcrumbs.map((crumb, idx) => (
            <div key={crumb.id} className="flex items-center gap-1.5 shrink-0">
              <span className="text-text-muted">/</span>
              <span
                className="cursor-pointer hover:text-accent-blue"
                onClick={() => handleBreadcrumbClick(idx, crumb.id)}
              >
                {crumb.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <svg ref={svgRef} className="overflow-visible select-none" />
    </div>
  );
}
