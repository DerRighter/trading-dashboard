import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart as ELine } from "echarts/charts";
import {
  GridComponent, MarkLineComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { themeColors, useControls } from "../ui/state";

echarts.use([BarChart, HeatmapChart, ELine, GridComponent, TooltipComponent, VisualMapComponent,
             MarkLineComponent, CanvasRenderer]);

export type EOption = echarts.EChartsCoreOption;

/** Histogrammes et heatmaps (ECharts, import modulaire). `build` reçoit les
 *  couleurs du thème courant. */
export function EChart({ build, height = 280 }: { build: (c: ReturnType<typeof themeColors>) => EOption; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const { theme } = useControls();
  useEffect(() => {
    if (!host.current) return;
    const c = themeColors();
    const chart = echarts.init(host.current, undefined, { renderer: "canvas" });
    chart.setOption({
      backgroundColor: "transparent",
      textStyle: { color: c.text, fontSize: 11 },
      tooltip: { trigger: "item" },
      ...build(c),
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(host.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [build, theme]);
  return <div ref={host} className="chart" style={{ height }} />;
}

export function histogram(values: number[], bins = 30): { centers: number[]; counts: number[]; width: number } {
  if (!values.length) return { centers: [], counts: [], width: 0 };
  const lo = Math.min(...values), hi = Math.max(...values);
  const width = hi > lo ? (hi - lo) / bins : 1;
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
  return { centers: counts.map((_, i) => lo + (i + 0.5) * width), counts, width };
}
