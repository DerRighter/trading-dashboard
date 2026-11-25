import { useEffect, useRef } from "react";
import {
  ColorType, createChart, CrosshairMode, LineStyle, type IChartApi, type MouseEventParams,
  type Time, type UTCTimestamp,
} from "lightweight-charts";
import { themeColors, useControls } from "../ui/state";

export interface LineSpec {
  name: string;
  t: number[];
  v: number[];
  color?: string;
  width?: 1 | 2 | 3 | 4;
  dashed?: boolean;
}

interface Props {
  lines: LineSpec[];
  zones?: [number, number][];          // régime baissier : bandes grisées
  height?: number;
  format?: "index" | "pct" | "money";
  logScale?: boolean;
  marker?: number | null;              // ligne verticale (point d'entrée)
  onClickTime?: (t: number) => void;
}

/** Séries temporelles (Lightweight-charts) ; bandes de régime en
 *  histogramme sur une échelle de prix masquée. */
export function LineChart({ lines, zones, height = 320, format = "index", logScale, marker, onClickTime }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const { theme } = useControls();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const c = themeColors();
    const chart: IChartApi = createChart(el, {
      height,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, fontSize: 11 },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { mode: logScale ? 1 : 0, borderColor: c.grid },
      timeScale: { borderColor: c.grid },
      localization: {
        locale: "fr-FR",
        priceFormatter: (p: number) =>
          format === "pct" ? `${(p * 100).toFixed(1)} %` : format === "money"
            ? Math.round(p).toLocaleString("fr-FR") : p.toFixed(1),
      },
    });

    const allT = lines[0]?.t ?? [];
    if (zones?.length && allT.length) {
      const zs = chart.addHistogramSeries({
        priceScaleId: "zones", color: c.bear, priceLineVisible: false, lastValueVisible: false,
      });
      chart.priceScale("zones").applyOptions({ scaleMargins: { top: 0, bottom: 0 }, visible: false });
      let k = 0;
      zs.setData(allT.map((t) => {
        while (k < zones.length && zones[k][1] < t) k++;
        const on = k < zones.length && zones[k][0] <= t && t <= zones[k][1];
        return { time: t as UTCTimestamp, value: on ? 1 : 0 };
      }));
    }

    lines.forEach((l, i) => {
      const s = chart.addLineSeries({
        color: l.color ?? c.series[i % c.series.length], lineWidth: l.width ?? 2,
        lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, title: l.name,
        priceLineVisible: false,
      });
      s.setData(l.t.map((t, j) => ({ time: t as UTCTimestamp, value: l.v[j] })));
      if (i === 0 && marker != null) {
        s.setMarkers([{ time: marker as UTCTimestamp, position: "aboveBar", color: c.text,
                        shape: "arrowDown", text: "entrée" }]);
      }
    });
    chart.timeScale().fitContent();

    const click = (p: MouseEventParams<Time>) => {
      if (onClickTime && typeof p.time === "number") onClickTime(p.time);
    };
    chart.subscribeClick(click);
    return () => {
      chart.unsubscribeClick(click);
      chart.remove();
    };
  }, [lines, zones, height, format, logScale, marker, onClickTime, theme]);

  return <div ref={host} className="chart" style={{ height }} />;
}

export function Legend({ items }: { items: { name: string; color?: string }[] }) {
  const c = typeof document !== "undefined" ? themeColors() : null;
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={it.name}>
          <i style={{ background: it.color ?? c?.series[i % 6] }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}
