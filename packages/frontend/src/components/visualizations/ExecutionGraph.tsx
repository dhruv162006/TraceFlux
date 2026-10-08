import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphResponse, GraphNode, ResourceType, AsyncEvent } from '../../types/index.js';

interface ExecutionGraphProps {
  graphData: GraphResponse;
  width?: number;
  height?: number;
  onNodeClick?: (asyncId: number) => void;
  activeAsyncId?: number | null;
  activeEvent?: AsyncEvent | null;
}

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: SimNode;
  target: SimNode;
  edgeType: 'spawn' | 'resolve' | 'reject' | 'callback';
}

export function ExecutionGraph({
  graphData,
  width = 800,
  height = 500,
  onNodeClick,
  activeAsyncId,
  activeEvent,
}: ExecutionGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeAsyncIdRef = useRef<number | null | undefined>(activeAsyncId);
  const redrawCanvasRef = useRef<(() => void) | null>(null);

  const COLOR_MAP: Record<ResourceType, string> = {
    PROMISE: '#4f8ef7', // blue
    Timeout: '#fbbf24', // amber
    Immediate: '#fbbf24',
    FSREQCALLBACK: '#4ade80', // green
    TCPWRAP: '#a78bfa', // purple
    HTTPCLIENTREQUEST: '#2dd4bf', // teal
    HTTPINCOMINGMESSAGE: '#2dd4bf',
    TIMERWRAP: '#a78bfa',
    TickObject: '#8b91a1',
    GETADDRINFOREQWRAP: '#a78bfa',
    QueryWrap: '#a78bfa',
    CUSTOM: '#8b91a1',
  };

  // Keep activeAsyncIdRef in sync without triggering simulation re-runs
  useEffect(() => {
    activeAsyncIdRef.current = activeAsyncId;
  }, [activeAsyncId]);

  // Primary D3 Simulation initialization effect — only runs on graphData / dimension changes
  useEffect(() => {
    const { nodes, edges } = graphData.graph;
    if (nodes.length === 0) return;

    const useCanvas = nodes.length > 200;

    // 1. Prepare D3 Force Simulation Data
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n, x: 0, y: 0 }));
    // Map edges to matching simulation node references
    const simLinks: SimLink[] = edges
      .map((e) => {
        const sourceNode = simNodes.find((n) => n.asyncId === e.parentAsyncId);
        const targetNode = simNodes.find((n) => n.asyncId === e.childAsyncId);
        if (sourceNode && targetNode) {
          return { source: sourceNode, target: targetNode, edgeType: e.edgeType } as SimLink;
        }
        return null;
      })
      .filter((l): l is SimLink => l !== null);

    // 2. Setup D3 Force Simulation
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).distance(60).strength(0.8))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(20));

    // Clear previous elements
    d3.select(svgRef.current).selectAll('*').remove();

    if (useCanvas) {
      // CANVAS FALLBACK MODE (> 200 nodes)
      d3.select(svgRef.current).style('display', 'none');
      const canvas = canvasRef.current;
      if (!canvas) return;

      d3.select(canvas).style('display', 'block');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const drawCanvasFrame = () => {
        ctx.clearRect(0, 0, width, height);

        // Draw links
        ctx.strokeStyle = '#2a2f3a';
        ctx.lineWidth = 1;
        for (const link of simLinks) {
          ctx.beginPath();
          ctx.moveTo(link.source.x ?? 0, link.source.y ?? 0);
          ctx.lineTo(link.target.x ?? 0, link.target.y ?? 0);
          ctx.stroke();
        }

        // Draw nodes
        for (const node of simNodes) {
          const isCurrent = activeAsyncIdRef.current != null && node.asyncId === activeAsyncIdRef.current;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, isCurrent ? 10 : 6, 0, 2 * Math.PI);
          ctx.fillStyle = COLOR_MAP[node.resourceType] || COLOR_MAP.CUSTOM;
          ctx.fill();

          if (isCurrent) {
            ctx.strokeStyle = '#38bdf8'; // bright sky blue active replay highlight
            ctx.lineWidth = 2.5;
            ctx.stroke();
          } else if (node.isOnCriticalPath) {
            ctx.strokeStyle = '#fbbf24'; // pulsing amber
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      };

      redrawCanvasRef.current = drawCanvasFrame;
      simulation.on('tick', drawCanvasFrame);
    } else {
      // SVG INTERACTIVE MODE (<= 200 nodes)
      d3.select(canvasRef.current).style('display', 'none');
      const svgEl = svgRef.current;
      if (!svgEl) return;

      const svgSelection = d3
        .select(svgEl)
        .style('display', 'block')
        .attr('width', width)
        .attr('height', height);

      // Create zooming container g
      const g = svgSelection.append('g');

      // Zoom/pan handler
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });
      svgSelection.call(zoom);

      // Arrow marker definitions for edges
      g.append('defs')
        .append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 18)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4 L8,0 L0,4')
        .attr('fill', '#2a2f3a');

      // Draw Edges
      const link = g
        .append('g')
        .selectAll('.edge-line')
        .data(simLinks)
        .enter()
        .append('line')
        .attr('class', 'edge-line')
        .attr('stroke', '#2a2f3a')
        .attr('stroke-width', 1.5)
        .attr('marker-end', 'url(#arrow)');

      // Draw Node groups
      const node = g
        .append('g')
        .selectAll<SVGGElement, SimNode>('.node-group')
        .data(simNodes)
        .enter()
        .append('g')
        .attr('class', 'node-group cursor-pointer')
        .attr('data-async-id', (d) => d.asyncId)
        .call(
          d3
            .drag<SVGGElement, SimNode>()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
        )
        .on('click', (_event, d) => {
          if (onNodeClick) onNodeClick(d.asyncId);
        });

      // Critical path pulsing rings
      node
        .filter((d) => d.isOnCriticalPath)
        .append('circle')
        .attr('r', 12)
        .attr('fill', 'none')
        .attr('stroke', '#fbbf24')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4 2')
        .append('animateTransform')
        .attr('attributeName', 'transform')
        .attr('type', 'rotate')
        .attr('from', '0')
        .attr('to', '360')
        .attr('dur', '10s')
        .attr('repeatCount', 'indefinite');

      // Core Node circles
      node
        .append('circle')
        .attr('class', 'node-circle')
        .attr('r', 7)
        .attr('fill', (d) => COLOR_MAP[d.resourceType] || COLOR_MAP.CUSTOM)
        .attr('stroke', (d) => (d.isOnCriticalPath ? '#fbbf24' : '#111318'))
        .attr('stroke-width', 1.5);

      // Tooltips on hover
      node.append('title').text(
        (d) =>
          `ID: ${d.asyncId}\nType: ${d.resourceType}\nDuration: ${
            d.duration ? d.duration.toFixed(2) + 'ms' : 'Active'
          }\nOverlap Peers: ${d.concurrentPeers}`
      );

      simulation.on('tick', () => {
        link
          .attr('x1', (d) => d.source.x ?? 0)
          .attr('y1', (d) => d.source.y ?? 0)
          .attr('x2', (d) => d.target.x ?? 0)
          .attr('y2', (d) => d.target.y ?? 0);

        node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });
    }

    return () => {
      simulation.stop();
      redrawCanvasRef.current = null;
    };
  }, [graphData, width, height, onNodeClick]);

  // Secondary Targeted Replay Highlight Effect — runs purely on activeAsyncId / activeEvent updates
  // Does NOT re-simulate force physics or re-layout nodes!
  useEffect(() => {
    activeAsyncIdRef.current = activeAsyncId;

    // 1. SVG mode targeted update
    const svgEl = svgRef.current;
    if (svgEl) {
      const svg = d3.select(svgEl);

      svg.selectAll<SVGGElement, SimNode>('.node-group').each(function (d) {
        const isCurrent = activeAsyncId != null && d.asyncId === activeAsyncId;
        const group = d3.select(this);

        // Remove previous replay highlight ring
        group.select('.replay-ring').remove();

        if (isCurrent) {
          group
            .append('circle')
            .attr('class', 'replay-ring')
            .attr('r', 16)
            .attr('fill', 'none')
            .attr('stroke', '#38bdf8') // bright sky blue
            .attr('stroke-width', 2.5)
            .attr('stroke-dasharray', '3 2')
            .append('animateTransform')
            .attr('attributeName', 'transform')
            .attr('type', 'rotate')
            .attr('from', '0')
            .attr('to', '360')
            .attr('dur', '2s')
            .attr('repeatCount', 'indefinite');
        }

        group
          .select<SVGCircleElement>('.node-circle')
          .attr('stroke', isCurrent ? '#38bdf8' : d.isOnCriticalPath ? '#fbbf24' : '#111318')
          .attr('stroke-width', isCurrent ? 3 : 1.5)
          .attr('opacity', activeAsyncId != null ? (isCurrent ? 1 : 0.55) : 1);
      });

      // Highlight active causal edge
      if (activeEvent) {
        svg
          .selectAll<SVGLineElement, SimLink>('.edge-line')
          .attr('stroke', (l) =>
            l.source.asyncId === activeEvent.triggerAsyncId && l.target.asyncId === activeEvent.asyncId
              ? '#38bdf8'
              : '#2a2f3a'
          )
          .attr('stroke-width', (l) =>
            l.source.asyncId === activeEvent.triggerAsyncId && l.target.asyncId === activeEvent.asyncId
              ? 2.5
              : 1.5
          );
      } else {
        svg.selectAll('.edge-line').attr('stroke', '#2a2f3a').attr('stroke-width', 1.5);
      }
    }

    // 2. Canvas mode targeted redraw
    if (redrawCanvasRef.current) {
      redrawCanvasRef.current();
    }
  }, [activeAsyncId, activeEvent]);

  return (
    <div ref={containerRef} className="glass-panel p-6 bg-bg-surface flex flex-col border border-border/40 relative">
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-1">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block">
            Execution Dependency DAG Graph
          </span>
          <p className="text-[10px] text-text-muted">
            {graphData.graph.nodes.length > 200
              ? 'Rendering high-node count using high-performance Canvas.'
              : 'Interactive SVG mode: Drag nodes to rearrange. Active replay node outlined in cyan.'}
          </p>
        </div>
      </div>

      <div className="relative border border-border/20 rounded-lg overflow-hidden bg-bg-primary" style={{ width, height }}>
        <canvas ref={canvasRef} style={{ width, height, display: 'none' }} />
        <svg ref={svgRef} className="overflow-visible" style={{ width, height, display: 'none' }} />
      </div>
    </div>
  );
}
