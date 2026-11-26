import { useEffect, useRef } from "react";
import {
  ColorType, createChart, CrosshairMode, LineStyle, type IChartApi, type MouseEventParams,
  type Time, type UTCTimestamp,
} from "lightweight-charts";
import { themeColors, useControls } from "../ui/state";

export interface LineSpec {
  name: string;
  t: number[];
  v: number[];                        // NaN : pas de point (ex. MM200 pas encore définie)
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
  marker?: number | null;              // flèche sur la 1re série (point d'entrée)
  vlines?: VLine[];                    // lignes verticales libellées
  onClickTime?: (t: number) => void;
}

export interface VLine {
  t: number;                           // secondes UTC
  label: string;
}

/** Séries temporelles (Lightweight-charts) ; bandes de régime en
 *  histogramme sur une échelle de prix masquée. */
export function LineChart({ lines, zones, height = 320, format = "index", logScale, marker, vlines, onClickTime }: Props) {
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
      // ~3 500 séances : sans minBarSpacing bas, fitContent ne montre pas tout l'historique
      timeScale: { borderColor: c.grid, minBarSpacing: 0.01 },
      // la molette fait défiler la page, pas le graphique (glisser pour se déplacer)
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
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
      s.setData(l.t.map((t, j) => {
        const v = l.v[j];
        return !Number.isFinite(v) ? { time: t as UTCTimestamp } : { time: t as UTCTimestamp, value: v };
      }));
      if (i === 0 && marker != null) {
        s.setMarkers([{ time: marker as UTCTimestamp, position: "aboveBar", color: c.text,
                        shape: "arrowDown", text: "entrée" }]);
      }
    });
    // Lignes verticales : surcouche DOM recalée à chaque déplacement / redimensionnement
    // (lightweight-charts 4 n'a pas de ligne verticale native).
    const overlays = (vlines ?? []).map((vl) => {
      const t = snapTime(allT, vl.t);
      const div = document.createElement("div");
      div.className = "vline";
      div.style.borderLeftColor = c.text;
      const span = document.createElement("span");
      span.textContent = vl.label;
      span.style.color = c.text;
      span.style.background = c.bg;
      div.appendChild(span);
      el.appendChild(div);
      return { t, div };
    });
    const place = () => {
      for (const o of overlays) {
        const x = o.t === null ? null : chart.timeScale().timeToCoordinate(o.t as UTCTimestamp);
        o.div.style.display = x === null ? "none" : "block";
        if (x === null) continue;
        o.div.style.left = `${Math.round(x)}px`;
        // libellé à gauche de la ligne s'il déborderait du graphique
        const span = o.div.firstElementChild as HTMLElement;
        const flip = x + span.offsetWidth + 8 > el.clientWidth;
        span.style.left = flip ? "auto" : "4px";
        span.style.right = flip ? "4px" : "auto";
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(place);
    chart.timeScale().subscribeSizeChange(place);

    chart.timeScale().fitContent();
    const raf = requestAnimationFrame(() => { chart.timeScale().fitContent(); place(); });   // après autoSize

    const click = (p: MouseEventParams<Time>) => {
      if (onClickTime && typeof p.time === "number") onClickTime(p.time);
    };
    chart.subscribeClick(click);
    return () => {
      cancelAnimationFrame(raf);
      chart.unsubscribeClick(click);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(place);
      chart.timeScale().unsubscribeSizeChange(place);
      overlays.forEach((o) => o.div.remove());
      chart.remove();
    };
  }, [lines, zones, height, format, logScale, marker, vlines, onClickTime, theme]);

  return <div ref={host} className="chart" style={{ height, position: "relative" }} />;
}

/** Dernière séance <= t (une date hors séance se cale sur la séance précédente). */
export function snapTime(ts: number[], t: number): number | null {
  let lo = 0, hi = ts.length - 1, best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) { best = ts[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
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
