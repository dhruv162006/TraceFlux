import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { AsyncResource, ResourceType } from '../../types/index.js';

interface HeatmapProps {
  resources: AsyncResource[];
  sessionStart: number;
  sessionEnd: number;
  width?: number;
  height?: number;
  onCellClick?: (bucketStart: number, bucketEnd: number, type: ResourceType) => void;
}

export function Heatmap({
  resources,
  sessionStart,
  sessionEnd,
  width = 600,
  height = 300,
  onCellClick,
}: HeatmapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || resources.length === 0) return;

    // Clear previous SVG contents
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 40, left: 120 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // 1. Prepare Heatmap grid dimensions
    const bucketCount = 20;
    const sessionDuration = Math.max(1, sessionEnd - sessionStart);
    const bucketSize = sessionDuration / bucketCount;

    // List of active resource types in this trace session
    const resourceTypes = Array.from(new Set(resources.map((r) => r.resourceType)));
    if (resourceTypes.length === 0) return;

    // 2. Aggregate data cells
    // Grid maps: bucketIndex_resourceType -> count
    const cells: Array<{
      bucketIndex: number;
      resourceType: ResourceType;
      count: number;
      startTime: number;
      endTime: number;
    }> = [];

    for (let b = 0; b < bucketCount; b++) {
      const bucketStart = sessionStart + b * bucketSize;
      const bucketEnd = bucketStart + bucketSize;

      for (const type of resourceTypes) {
        // Count resources of this type active during this bucket interval
        const activeCount = resources.filter((r) => {
          if (r.resourceType !== type) return false;
          const end = r.endTime ?? sessionEnd;
          return r.startTime < bucketEnd && end > bucketStart;
        }).length;

        cells.push({
          bucketIndex: b,
          resourceType: type,
          count: activeCount,
          startTime: bucketStart - sessionStart,
          endTime: bucketEnd - sessionStart,
        });
      }
    }

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // 3. Define Axes Scales
    const x = d3
      .scaleBand<number>()
      .domain(d3.range(bucketCount))
      .range([0, chartWidth])
      .padding(0.05);

    const y = d3
      .scaleBand<string>()
      .domain(resourceTypes)
      .range([0, chartHeight])
      .padding(0.05);

    // Color interpolation for heatmap cells
    const maxCount = d3.max(cells, (d) => d.count) || 1;
    const colorScale = d3
      .scaleSequential<string>()
      .domain([0, maxCount])
      .interpolator(d3.interpolateYlOrRd);

    // 4. Draw Cells
    svg
      .selectAll('.cell')
      .data(cells)
      .enter()
      .append('rect')
      .attr('class', 'cell cursor-pointer transition-opacity hover:opacity-80')
      .attr('x', (d) => x(d.bucketIndex)!)
      .attr('y', (d) => y(d.resourceType)!)
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('fill', (d) => (d.count === 0 ? '#1a1d24' : colorScale(d.count)))
      .attr('rx', 2)
      .attr('ry', 2)
      .on('click', (_event, d) => {
        if (onCellClick && d.count > 0) {
          onCellClick(d.startTime + sessionStart, d.endTime + sessionStart, d.resourceType);
        }
      });

    // 5. Render Axes
    const xAxis = d3
      .axisBottom(x)
      .tickFormat((d) => `${Math.round(d * (bucketSize / 1000) * 10) / 10}s`);

    svg
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('fill', '#8b91a1')
      .style('font-size', '10px');

    svg
      .append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('fill', '#8b91a1')
      .style('font-size', '10px');

    // Customize axis ticks borders
    svg.selectAll('.domain, .tick line').attr('stroke', '#2a2f3a');
  }, [resources, sessionStart, sessionEnd, width, height, onCellClick]);

  return (
    <div className="glass-panel p-6 bg-bg-surface flex flex-col items-center border border-border/40">
      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-4">
        Concurrency Overlap Heatmap
      </span>
      <svg ref={svgRef} className="overflow-visible" />
    </div>
  );
}
