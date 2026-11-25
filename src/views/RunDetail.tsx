import { useCallback, useMemo } from "react";
import { EChart, histogram } from "../charts/EChart";
import { Legend, LineChart, type LineSpec } from "../charts/LineChart";
import { bearZones, drawdown, hasFlows, monthlyReturns, twr, viewKey } from "../data/series";
import type { Run, TrialsFile, ViewKey } from "../data/types";
import { useRunBundle, type Bundle } from "../data/useRun";
import {
  FrequencyBadge, Loading, money, NetNotice, num, pct, Problem, SplitBadge, TAX_LABEL, TrialsBadge,
  ValidationFrame,
} from "../ui/components";
import { href, useControls } from "../ui/state";

const VIEWS: [ViewKey, string][] = [["usd_gross", "USD brut"], ["eur_gross", "EUR brut"],
                                    ["usd_net", "USD net"], ["eur_net", "EUR net"]];
const MONTHS = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];

export function RunHeader({ b, children }: { b: Bundle; children?: React.ReactNode }) {
  const { entry, run } = b.main;
  const m = run.manifest;
  return (
    <section className="card">
      <h2>{m.strategy_id} · {m.symbol} <SplitBadge split={m.split} /><FrequencyBadge frequency={m.equity_frequency} />
        <TrialsBadge strategy={m.strategy_id} trials={b.trials} /></h2>
      <div className="kv">
        <span><b>Période</b> {m.period.first_session} → {m.period.last_session}</span>
        <span><b>Mode</b> {m.mode}</span>
        <span><b>Univers</b> {m.universe.id} ({m.universe.tax_regime})</span>
        <span><b>Paramètres</b> {JSON.stringify(m.params)}</span>
        <span><b>Régime</b> {m.regime.regime_version}</span>
        <span className="muted" title={entry.git_sha}>{m.run_id}</span>
      </div>
      <p>
        <a href={href("run", m.run_id)}>détail</a>{" · "}
        <a href={href("rolling", m.run_id)}>fenêtres glissantes</a>{" · "}
        <a href={href("entry", m.run_id)}>point d'entrée</a>
      </p>
      {children}
    </section>
  );
}

/** Lignes TWR du run et de ses benchmarks pour la vue courante. */
export function useTwrLines(b: Bundle | undefined) {
  const { ccy, net, ref } = useControls();
  return useMemo(() => {
    if (!b) return { lines: [] as LineSpec[], missing: [] as string[], mainReason: null as string | null };
    const lines: LineSpec[] = [];
    const missing: string[] = [];
    const main = twr(b.main.run, ccy, net);
    if (main.ok) lines.push({ name: `${b.main.entry.strategy_id} (run)`, ...main.series, width: 3 });
    for (const [id, l] of b.benchmarks) {
      if (l.entry.run_id === b.main.entry.run_id) continue;
      const s = twr(l.run, ccy, net);
      if (s.ok) lines.push({ name: id + (id === ref ? " (référence)" : ""), ...s.series,
                             width: id === ref ? 2 : 1, dashed: id !== ref });
      else missing.push(`${id} : ${s.reason}`);
    }
    return { lines, missing, mainReason: main.ok ? null : main.reason };
  }, [b, ccy, net, ref]);
}

function MetricsTable({ run, trials, refId }: { run: Run; trials: TrialsFile; refId: string }) {
  const { ccy, net } = useControls();
  const cur = viewKey(ccy, net);
  const d = run.metrics.benchmark_deltas[refId];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Vue <TrialsBadge strategy={run.manifest.strategy_id} trials={trials} /></th>
            <th className="num">CAGR</th><th className="num">TWR total</th><th className="num">Max DD</th>
            <th className="num">Sharpe</th><th className="num">Sortino</th><th className="num">TRI</th>
            <th className="num">Investi</th><th className="num">Final</th>
            <th className="num">Δ CAGR vs {refId}</th><th className="num">Δ max DD</th></tr>
        </thead>
        <tbody>
          {VIEWS.map(([k, label]) => {
            const p = run.metrics.views[k];
            const c = k.startsWith("usd") ? "usd" : "eur";
            return (
              <tr key={k} style={k === cur ? { fontWeight: 700 } : undefined}>
                <td>{label}</td>
                <td className="num">{pct(p.cagr)}</td><td className="num">{pct(p.twr_total, 0)}</td>
                <td className="num">{pct(p.max_drawdown)}</td><td className="num">{num(p.sharpe)}</td>
                <td className="num">{num(p.sortino)}</td><td className="num">{pct(p.irr)}</td>
                <td className="num">{money(p.capital_invested, c)}</td><td className="num">{money(p.final_value, c)}</td>
                <td className="num">{pct(d?.[k]?.cagr)}</td><td className="num">{pct(d?.[k]?.max_drawdown)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">Métriques calculées par le moteur sur le quotidien (TWR), nettes de coûts.
        Net = après impôt estimé ({TAX_LABEL}).</p>
    </div>
  );
}

function RegimeTable({ run }: { run: Run }) {
  const { ccy, net } = useControls();
  const key = net ? (ccy === "eur" ? "eur_net" : null) : (ccy === "eur" ? "eur_gross" : "usd_gross");
  if (!key) return <p className="muted">Ventilation par régime non exportée pour USD net (disponible : USD brut, EUR brut, EUR net).</p>;
  const br = run.metrics.by_regime[key];
  return (
    <table>
      <thead><tr><th>Régime ({key})</th><th className="num">Séances</th><th className="num">Part</th>
        <th className="num">Rdt annualisé</th><th className="num">Vol.</th><th className="num">Sharpe</th>
        <th className="num">Exposition</th></tr></thead>
      <tbody>
        {(["bull", "bear", "undefined"] as const).map((r) => (
          <tr key={r}><td>{{ bull: "haussier", bear: "baissier", undefined: "indéfini" }[r]}</td>
            <td className="num">{br[r].sessions}</td><td className="num">{pct(br[r].share)}</td>
            <td className="num">{pct(br[r].ann_return)}</td><td className="num">{pct(br[r].ann_vol)}</td>
            <td className="num">{num(br[r].sharpe)}</td><td className="num">{pct(br[r].exposure_mean, 0)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Monthly({ run }: { run: Run }) {
  const { ccy, net } = useControls();
  const s = useMemo(() => twr(run, ccy, net), [run, ccy, net]);
  const build = useCallback((c: ReturnType<typeof import("../ui/state").themeColors>) => {
    if (!s.ok) return {};
    const m = monthlyReturns(s.series);
    const years = [...new Set(m.map((x) => x.year))];
    const lim = Math.max(0.05, ...m.map((x) => Math.abs(x.r)));
    return {
      tooltip: { formatter: (p: { value: [number, number, number] }) =>
        `${MONTHS[p.value[0]]} ${years[p.value[1]]} : ${(p.value[2] * 100).toFixed(1)} %` },
      grid: { left: 50, right: 20, top: 10, bottom: 60 },
      xAxis: { type: "category", data: MONTHS, axisLabel: { color: c.muted } },
      yAxis: { type: "category", data: years.map(String), axisLabel: { color: c.muted } },
      visualMap: { min: -lim, max: lim, calculable: false, orient: "horizontal", left: "center", bottom: 0,
                   inRange: { color: [c.neg, c.bg, c.pos] }, textStyle: { color: c.muted },
                   formatter: (v: number) => `${(v * 100).toFixed(0)} %` },
      series: [{ type: "heatmap", data: m.map((x) => [x.month - 1, years.indexOf(x.year), x.r]),
                 label: { show: false } }],
    };
  }, [s]);
  if (!s.ok) return <div className="unavailable">{s.reason}</div>;
  return <EChart build={build} height={Math.max(220, 24 * 16 + 80)} />;
}

function TradesHist({ run }: { run: Run }) {
  const { ccy } = useControls();
  const values = useMemo(() => run.trades.map((t) => (ccy === "usd" ? t.pnl_usd : t.pnl_eur)), [run, ccy]);
  const build = useCallback((c: ReturnType<typeof import("../ui/state").themeColors>) => {
    const h = histogram(values, Math.min(40, Math.max(8, Math.round(Math.sqrt(values.length) * 2))));
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 50, right: 20, top: 10, bottom: 40 },
      xAxis: { type: "category", data: h.centers.map((x) => Math.round(x).toLocaleString("fr-FR")),
               axisLabel: { color: c.muted } },
      yAxis: { type: "value", axisLabel: { color: c.muted }, splitLine: { lineStyle: { color: c.grid } } },
      series: [{ type: "bar", data: h.counts.map((n, i) => ({ value: n,
        itemStyle: { color: h.centers[i] >= 0 ? c.pos : c.neg } })), barCategoryGap: "5%" }],
    };
  }, [values]);
  return (
    <>
      <EChart build={build} />
      <p className="muted">{run.trades.length} lignes de trades (PnL {ccy.toUpperCase()} avant impôt, après coûts ;
        positions ouvertes en fin de période valorisées au dernier cours).</p>
    </>
  );
}

function InvestedVsValue({ run }: { run: Run }) {
  const { ccy, net } = useControls();
  const eq = run.equity;
  const lines = useMemo<LineSpec[]>(() => {
    let cum = run.metrics.views.usd_gross.capital_invested - eq.flow_usd.reduce((a, x) => a + x, 0);
    const invested = ccy === "eur" ? eq.invested_eur : eq.flow_usd.map((f) => (cum += f));
    const value = ccy === "eur" ? (net ? eq.equity_eur_net : eq.equity_eur) : (net ? eq.equity_usd_net : eq.equity_usd);
    return [{ name: "valeur", t: eq.t, v: value }, { name: "capital investi", t: eq.t, v: invested, dashed: true }];
  }, [run, ccy, net, eq]);
  return (
    <section className="card">
      <h2>Capital investi vs valeur ({ccy.toUpperCase()}{net ? " net" : ""})</h2>
      <Legend items={lines} />
      <LineChart lines={lines} format="money" height={260} />
      <p className="muted">Les apports font monter cette courbe de valeur : la performance se lit sur l'indice TWR.</p>
    </section>
  );
}

export function RunDetail({ id }: { id: string }) {
  const { data: b, error } = useRunBundle(id);
  const { ref } = useControls();
  const { lines, missing, mainReason } = useTwrLines(b);
  const zones = useMemo(() => (b ? bearZones(b.main.run.equity) : []), [b]);
  const dd = useMemo<LineSpec[]>(() => (lines[0] ? [{ ...lines[0], ...drawdown(lines[0]), name: "drawdown" }] : []),
                                    [lines]);
  const scaled = useMemo(() => lines.map((l) => ({ ...l, v: l.v.map((x) => x * 100) })), [lines]);
  if (error) return <Problem error={error} />;
  if (!b) return <Loading what="données du run" />;
  const run = b.main.run;
  return (
    <ValidationFrame split={run.manifest.split}>
      <RunHeader b={b} />
      <NetNotice />
      <section className="card">
        <h2>Indice TWR (base 100 avant la première séance) vs benchmarks</h2>
        {mainReason ? <div className="unavailable">{mainReason}</div> : (
          <>
            <Legend items={lines} />
            <LineChart lines={scaled} zones={zones} logScale />
            <p className="muted">Zones grisées : régime MM200 baissier (colonne regime, effectif à J).
              Échelle logarithmique.</p>
            {missing.map((m) => <p key={m} className="notice">{m}</p>)}
            <h3>Drawdown</h3>
            <LineChart lines={dd} zones={zones} format="pct" height={200} />
          </>
        )}
      </section>
      {hasFlows(run.equity) && <InvestedVsValue run={run} />}
      <section className="card">
        <h2>Métriques <TrialsBadge strategy={run.manifest.strategy_id} trials={b.trials} /></h2>
        <MetricsTable run={run} trials={b.trials} refId={ref} />
        <div className="kv">
          <span><b>Trades</b> {run.metrics.trades_total} ({num(run.metrics.trades_per_year, 2)}/an)</span>
          <span><b>Exposition moyenne</b> {pct(run.metrics.exposure_mean, 0)}</span>
          <span><b>Coûts</b> {money(run.metrics.costs_usd, "usd")}</span>
          <span><b>Edge brut / coûts</b> {num(run.metrics.edge_to_cost_ratio, 1)}</span>
          <span><b>Impôt estimé</b> {money(run.metrics.tax.total_tax_eur, "eur")}</span>
        </div>
        <h3>Par régime</h3>
        <RegimeTable run={run} />
      </section>
      <div className="grid2">
        <section className="card"><h2>Rendements mensuels (TWR)</h2><Monthly run={run} /></section>
        <section className="card"><h2>Distribution des trades</h2><TradesHist run={run} /></section>
      </div>
    </ValidationFrame>
  );
}
