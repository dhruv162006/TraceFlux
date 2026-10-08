import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TimelineEntry, ResourceType, AsyncEvent } from '../../types/index.js';

interface TimelineProps {
  entries: TimelineEntry[];
  sessionStart: number;
  sessionEnd: number;
  width?: number;
  height?: number;
  activeAsyncId?: number | null;
  activeEvent?: AsyncEvent | null;
}

export function Timeline({
  entries,
  sessionStart,
  sessionEnd,
  width = 800,
  height = 320,
  activeAsyncId,
  activeEvent,
}: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number]>([0, Math.max(1, sessionEnd - sessionStart)]);

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

  const margin = { top: 18, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Draw Canvas Bars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || entries.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = chartWidth * dpr;
    canvas.height = chartHeight * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, chartWidth, chartHeight);

    // X scale maps ms from session start to canvas pixel coordinates
    const xScale = d3.scaleLinear().domain(zoomRange).range([0, chartWidth]);

    const maxLane = Math.max(...entries.map((e) => e.lane), 0);
    const laneHeight = Math.min(20, chartHeight / (maxLane + 1 || 1));

    const currentTime = activeEvent ? activeEvent.timestamp - sessionStart : null;

    // Draw timeline bars on canvas
    for (const e of entries) {
      const start = e.startTime;
      const end = start + e.duration;

      // Skip drawing if outside current zoom window bounds
      if (start > zoomRange[1] || end < zoomRange[0]) continue;

      const x = xScale(start);
      const w = Math.max(2, xScale(end) - xScale(start));
      const y = e.lane * laneHeight;
      const isCurrent = activeAsyncId != null && e.asyncId === activeAsyncId;

      // Adjust opacity based on replay temporal position
      if (currentTime != null) {
        if (isCurrent) {
          ctx.globalAlpha = 1.0;
        } else if (end < currentTime) {
          ctx.globalAlpha = 0.55; // completed operation
        } else if (start > currentTime) {
          ctx.globalAlpha = 0.25; // future operation
        } else {
          ctx.globalAlpha = 0.9; // concurrently active operation
        }
      } else {
        ctx.globalAlpha = 1.0;
      }

      ctx.fillStyle = COLOR_MAP[e.resourceType] || COLOR_MAP.CUSTOM;
      ctx.fillRect(x, y, w, laneHeight - 2);

      // Replay Active Highlight Border
      if (isCurrent) {
        ctx.strokeStyle = '#38bdf8'; // bright sky blue
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x - 1, y - 1, w + 2, laneHeight);
      } else if (e.isOnCriticalPath) {
        // Critical path highlight border
        ctx.strokeStyle = '#fbbf24'; // amber
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, laneHeight - 2);
      }
    }

    ctx.globalAlpha = 1.0;
  }, [entries, zoomRange, chartWidth, chartHeight, activeAsyncId, activeEvent, sessionStart]);

  // Update SVG Axes overlay, Brush zoom, and Replay Playhead line
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    d3.select(svgEl).selectAll('*').remove();

    const svg = d3
      .select(svgEl)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain(zoomRange).range([0, chartWidth]);

    const maxLane = Math.max(...entries.map((e) => e.lane), 0);
    const yScale = d3.scaleLinear().domain([0, maxLane + 1]).range([0, chartHeight]);

    // X Axis
    const xAxis = d3.axisBottom(xScale).tickFormat((d) => `${Math.round(d as number)}ms`);
    svg
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', '#8b91a1')
      .style('font-size', '10px');

    // Y Axis (Lanes)
    const yAxis = d3.axisLeft(yScale).ticks(Math.min(10, maxLane + 1)).tickFormat((d) => `Lane ${d}`);
    svg
      .append('g')
      .call(yAxis)
      .selectAll('text')
      .attr('fill', '#8b91a1')
      .style('font-size', '10px');

    svg.selectAll('.domain, .tick line').attr('stroke', '#2a2f3a');

    // Replay Playhead Vertical Scrubber Line & Time Badge
    if (activeEvent) {
      const currentTime = activeEvent.timestamp - sessionStart;
      const playheadX = xScale(currentTime);

      if (playheadX >= 0 && playheadX <= chartWidth) {
        // Vertical dashed playhead line
        svg
          .append('line')
          .attr('class', 'playhead-line')
          .attr('x1', playheadX)
          .attr('y1', 0)
          .attr('x2', playheadX)
          .attr('y2', chartHeight)
          .attr('stroke', '#38bdf8')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '3 2');

        // Playhead time badge pill
        const badgeWidth = 52;
        const badgeX = Math.max(0, Math.min(chartWidth - badgeWidth, playheadX - badgeWidth / 2));

        svg
          .append('rect')
          .attr('x', badgeX)
          .attr('y', -14)
          .attr('width', badgeWidth)
          .attr('height', 14)
          .attr('rx', 3)
          .attr('fill', '#38bdf8');

        svg
          .append('text')
          .attr('x', badgeX + badgeWidth / 2)
          .attr('y', -3)
          .attr('text-anchor', 'middle')
          .attr('fill', '#090d16')
          .attr('font-size', '9px')
          .attr('font-weight', 'bold')
          .text(`${Math.round(currentTime)}ms`);
      }
    }

    // Horizontal Brush Zoom selection helper
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [chartWidth, chartHeight],
      ])
      .on('end', (event) => {
        const selection = event.selection;
        if (selection) {
          const newRange = [xScale.invert(selection[0]), xScale.invert(selection[1])] as [number, number];
          setZoomRange(newRange);
          svg.select<SVGGElement>('.brush').call(brush.move as any, null);
        }
      });

    svg.append('g').attr('class', 'brush').call(brush);
  }, [entries, zoomRange, chartWidth, chartHeight, width, height, activeEvent, sessionStart]);

  function resetZoom() {
    setZoomRange([0, Math.max(1, sessionEnd - sessionStart)]);
  }

  return (
    <div className="glass-panel p-6 bg-bg-surface flex flex-col border border-border/40 relative select-none w-full overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
            Resource Timeline View
          </span>
          <p className="text-[10px] text-text-muted">
            Drag/Brush horizontally to zoom. Cyan playhead cursor tracks the active replay event.
          </p>
        </div>
        <button
          onClick={resetZoom}
          className="text-[10px] font-bold text-accent-blue bg-bg-elevated hover:bg-bg-hover border border-border px-2.5 py-1 rounded transition-colors"
        >
          Reset Zoom
        </button>
      </div>

      <div className="relative" style={{ width: chartWidth, height: chartHeight, marginLeft: margin.left, marginTop: margin.top }}>
        {/* Canvas Background Bars */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0"
          style={{ width: chartWidth, height: chartHeight, pointerEvents: 'none' }}
        />

        {/* SVG Foreground Axes, Playhead & Brush */}
        <svg
          ref={svgRef}
          className="absolute top-0 left-0 overflow-visible"
          style={{ width: width, height: height, transform: `translate(-${margin.left}px, -${margin.top}px)` }}
        />
      </div>
    </div>
  );
}
