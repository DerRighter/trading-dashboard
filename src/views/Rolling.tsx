import { useCallback, useMemo, useState } from "react";
import { EChart, histogram } from "../charts/EChart";
import { Legend, LineChart, type LineSpec } from "../charts/LineChart";
import { rollingWindows, summarize } from "../data/rolling";
import { twr } from "../data/series";
import { useRunBundle } from "../data/useRun";
import { Loading, NetNotice, pct, Problem, TrialsBadge, ValidationFrame } from "../ui/components";
import { useControls, type themeColors } from "../ui/state";
import { RunHeader } from "./RunDetail";

export function Rolling({ id }: { id: string }) {
  const { data: b, error } = useRunBundle(id);
  const { ccy, net, ref } = useControls();
  const [years, setYears] = useState(1);

  const res = useMemo(() => {
    if (!b) return null;
    const refRun = b.benchmarks.get(ref);
    if (!refRun) return { error: `Benchmark de référence ${ref} absent pour ce symbole et cette période.` };
    if (refRun.entry.run_id === b.main.entry.run_id)
      return { error: `Le run est lui-même la référence (${ref}) : choisir une autre référence.` };
    const s = twr(b.main.run, ccy, net), r = twr(refRun.run, ccy, net);
    if (!s.ok) return { error: s.reason };
    if (!r.ok) return { error: `${ref} : ${r.reason}` };
    const ws = rollingWindows(s.series, r.series, years);
    return { ws, sm: summarize(ws) };
  }, [b, ccy, net, ref, years]);

  const lines = useMemo<LineSpec[]>(() => {
    if (!res || !("ws" in res) || !res.ws) return [];
    const t = res.ws.map((w) => w.start);
    return [{ name: `écart annualisé sur ${years} an(s)`, t, v: res.ws.map((w) => w.delta) },
            { name: "zéro", t, v: t.map(() => 0), width: 1, dashed: true }];
  }, [res, years]);

  const build = useCallback((c: ReturnType<typeof themeColors>) => {
    const deltas = res && "ws" in res && res.ws ? res.ws.map((w) => w.delta) : [];
    const h = histogram(deltas, 30);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 20, top: 10, bottom: 40 },
      xAxis: { type: "category", data: h.centers.map((x) => `${(x * 100).toFixed(1)} %`), axisLabel: { color: c.muted } },
      yAxis: { type: "value", axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } },
      series: [{ type: "bar", barCategoryGap: "5%", data: h.counts.map((n, i) => ({
        value: n, itemStyle: { color: h.centers[i] >= 0 ? c.pos : c.neg } })) }],
    };
  }, [res]);

  if (error) return <Problem error={error} />;
  if (!b || !res) return <Loading what="données du run" />;
  const m = b.main.run.manifest;
  return (
    <ValidationFrame split={m.split}>
      <RunHeader b={b} />
      <NetNotice />
      <section className="card">
        <h2>Fenêtres glissantes : {m.strategy_id} − {ref} <TrialsBadge strategy={m.strategy_id} trials={b.trials} /></h2>
        <div className="filters">
          <label>Durée
            <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n} an{n > 1 ? "s" : ""}</option>)}
            </select>
          </label>
          <span className="muted">départ : première séance de chaque mois ; écart des rendements
            annualisés (indices TWR {ccy.toUpperCase()} {net ? "net" : "brut"})</span>
          {m.equity_frequency === "weekly" && <span className="notice">données hebdomadaires</span>}
        </div>
        {"error" in res ? <div className="unavailable">{res.error}</div> : (
          <>
            <div className="kv">
              <span><b>Fenêtres</b> {res.sm!.n}</span>
              <span><b>Gagnantes</b> <span className={res.sm!.winShare >= 0.5 ? "pos" : "neg"}>{pct(res.sm!.winShare)}</span></span>
              <span><b>Écart moyen</b> {pct(res.sm!.mean)}</span>
              <span><b>Médian</b> {pct(res.sm!.median)}</span>
              <span><b>Min / max</b> {pct(res.sm!.min)} / {pct(res.sm!.max)}</span>
            </div>
            <Legend items={lines} />
            <LineChart lines={lines} format="pct" height={280} />
            <h3>Distribution des écarts</h3>
            <EChart build={build} height={240} />
          </>
        )}
      </section>
    </ValidationFrame>
  );
}
