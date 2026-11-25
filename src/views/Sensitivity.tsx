import { useCallback, useEffect, useMemo, useState } from "react";
import { EChart } from "../charts/EChart";
import { loadMetrics } from "../data/load";
import { cells, groupSweeps, paramValues, slice, varyingKeys } from "../data/sensitivity";
import { viewKey } from "../data/series";
import type { Metrics } from "../data/types";
import { Loading, NetNotice, Problem, TrialsBadge, useAsync, useIndex } from "../ui/components";
import { useControls, type themeColors } from "../ui/state";

const METRICS = [["cagr", "CAGR", true], ["sharpe", "Sharpe", false], ["max_drawdown", "Max DD", true],
                 ["twr_total", "TWR total", true]] as const;
type MetricKey = (typeof METRICS)[number][0];

export const NO_SWEEP = "Aucun sweep exporté : rien à afficher. La vue se remplira dès qu'un sweep sera " +
  "exporté (tools/export_results.py --sweep <sweep_id>).";

/** Sensibilité : heatmap de 2 paramètres d'un sweep, métrique au choix, les
 *  autres paramètres fixés par sélecteurs. Ne lit que metrics.json. */
export function Sensitivity() {
  const { data, error } = useIndex();
  const { ccy, net } = useControls();
  const sweeps = useMemo(() => groupSweeps(data?.[0].runs ?? []), [data]);
  const [sweep, setSweep] = useState("");
  const [symbol, setSymbol] = useState("");
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [metric, setMetric] = useState<MetricKey>("cagr");
  const [fixed, setFixed] = useState<Record<string, string>>({});

  const sid = sweep || [...sweeps.keys()][0] || "";
  const runs = useMemo(() => sweeps.get(sid) ?? [], [sweeps, sid]);
  const symbols = [...new Set(runs.map((r) => r.symbol))].sort();
  const sym = symbols.includes(symbol) ? symbol : symbols[0] ?? "";
  const keys = useMemo(() => varyingKeys(runs), [runs]);
  const px = keys.includes(x) ? x : keys[0] ?? "";
  const py = keys.includes(y) && y !== px ? y : keys.find((k) => k !== px) ?? "";
  useEffect(() => setFixed({}), [sid]);

  const selected = useMemo(() => slice(runs, sym, px, py, fixed), [runs, sym, px, py, fixed]);
  const sel = selected.map((r) => r.run_id).join(",");
  const metrics = useAsync<Map<string, Metrics>>(async () => new Map(await Promise.all(
    selected.map(async (r) => [r.run_id, await loadMetrics(r.run_id, r.path)] as const))), [sel]);

  const build = useCallback((c: ReturnType<typeof themeColors>) => {
    const xs = paramValues(runs, px), ys = paramValues(runs, py);
    const data = cells(runs, selected, metrics.data ?? new Map(), px, py, viewKey(ccy, net), metric);
    const vals = data.map((cl) => cl[2]);
    const isPct = METRICS.find((m) => m[0] === metric)![2];
    const f = (v: number) => (isPct ? `${(v * 100).toFixed(1)} %` : v.toFixed(2));
    return {
      tooltip: { formatter: (p: { value: [number, number, number] }) =>
        `${px} = ${xs[p.value[0]]}, ${py} = ${ys[p.value[1]]} : ${f(p.value[2])}` },
      grid: { left: 70, right: 20, top: 10, bottom: 70 },
      xAxis: { type: "category", name: px, data: xs, axisLabel: { color: c.muted } },
      yAxis: { type: "category", name: py, data: ys, axisLabel: { color: c.muted } },
      visualMap: { min: Math.min(...vals), max: Math.max(...vals), orient: "horizontal", left: "center",
                   bottom: 0, inRange: { color: [c.neg, c.bg, c.pos] }, textStyle: { color: c.muted },
                   formatter: (v: number) => f(v) },
      series: [{ type: "heatmap", data, label: { show: true, color: c.text,
                 formatter: (p: { value: number[] }) => f(p.value[2]) } }],
    };
  }, [runs, selected, metrics.data, px, py, metric, ccy, net]);

  if (error) return <Problem error={error} />;
  if (!data) return <Loading what="runs" />;
  if (!sweeps.size) {
    return <section className="card"><h2>Sensibilité</h2><div className="unavailable">{NO_SWEEP}</div></section>;
  }
  const strategy = runs[0]?.strategy_id ?? "";
  return (
    <section className="card">
      <h2>Sensibilité · {strategy} <TrialsBadge strategy={strategy} trials={data[1]} /></h2>
      <NetNotice />
      <div className="filters">
        <label>Sweep<select value={sid} onChange={(e) => setSweep(e.target.value)}>
          {[...sweeps.keys()].map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>Symbole<select value={sym} onChange={(e) => setSymbol(e.target.value)}>
          {symbols.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Métrique<select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)}>
          {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Axe X<select value={px} onChange={(e) => setX(e.target.value)}>
          {keys.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>Axe Y<select value={py} onChange={(e) => setY(e.target.value)}>
          {keys.filter((k) => k !== px).map((k) => <option key={k}>{k}</option>)}</select></label>
        {keys.filter((k) => k !== px && k !== py).map((k) => (
          <label key={k}>{k}<select value={fixed[k] ?? paramValues(runs, k)[0]}
                                    onChange={(e) => setFixed({ ...fixed, [k]: e.target.value })}>
            {paramValues(runs, k).map((v) => <option key={v}>{v}</option>)}</select></label>
        ))}
      </div>
      {keys.length < 2 ? <div className="unavailable">Ce sweep fait varier moins de 2 paramètres : pas de heatmap.</div>
        : metrics.error ? <Problem error={metrics.error} />
        : !metrics.data ? <Loading what="métriques du sweep" />
        : <EChart build={build} height={420} />}
    </section>
  );
}
