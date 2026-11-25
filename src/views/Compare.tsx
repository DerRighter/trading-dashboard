import { useMemo } from "react";
import { Legend, LineChart, type LineSpec } from "../charts/LineChart";
import { loadIndex, loadTrials } from "../data/load";
import { twr, viewKey } from "../data/series";
import { loadEntry, type Loaded } from "../data/useRun";
import {
  Loading, NetNotice, num, pct, Problem, SplitBadge, TrialsBadge, useAsync,
} from "../ui/components";
import { href, useControls } from "../ui/state";
import { MAX_COMPARE } from "./RunList";

export function Compare({ ids }: { ids: string[] }) {
  const { ccy, net } = useControls();
  const key = ids.slice(0, MAX_COMPARE).join(",");
  const { data, error } = useAsync(async () => {
    const [index, trials] = await Promise.all([loadIndex(), loadTrials()]);
    const runs = await Promise.all(key.split(",").filter(Boolean).map((id) => loadEntry(index, id)));
    return { trials, runs };
  }, [key]);

  const { lines, missing } = useMemo(() => {
    const lines: LineSpec[] = [];
    const missing: string[] = [];
    for (const l of data?.runs ?? []) {
      const s = twr(l.run, ccy, net);
      const name = `${l.entry.strategy_id} · ${l.entry.symbol}`;
      if (s.ok) lines.push({ name, t: s.series.t, v: s.series.v.map((x) => x * 100) });
      else missing.push(`${name} : ${s.reason}`);
    }
    return { lines, missing };
  }, [data, ccy, net]);

  if (!ids.length) return <p className="muted">Sélectionner jusqu'à {MAX_COMPARE} runs dans la <a href="#/">liste</a>.</p>;
  if (error) return <Problem error={error} />;
  if (!data) return <Loading what="runs à comparer" />;
  const vk = viewKey(ccy, net);
  const periods = new Set(data.runs.map((l) => `${l.entry.first_session}→${l.entry.last_session}`));

  return (
    <>
      {ids.length > MAX_COMPARE && <p className="notice">Seuls les {MAX_COMPARE} premiers runs sont comparés.</p>}
      <NetNotice />
      <section className="card">
        <h2>Indices TWR superposés (base 100)</h2>
        {periods.size > 1 && <p className="notice">Périodes différentes : chaque courbe part de 100 à sa propre première séance.</p>}
        <Legend items={lines} />
        <LineChart lines={lines} logScale />
        {missing.map((m) => <p key={m} className="notice">{m}</p>)}
      </section>
      <section className="card">
        <h2>Métriques côte à côte ({vk.replace("_", " ")})</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Run</th><th>Essais</th><th className="num">CAGR</th><th className="num">TWR total</th>
                <th className="num">Max DD</th><th className="num">Sharpe</th><th className="num">Sortino</th>
                <th className="num">TRI</th><th className="num">Trades/an</th><th className="num">Exposition</th></tr>
            </thead>
            <tbody>
              {data.runs.map((l: Loaded) => {
                const p = l.run.metrics.views[vk];
                return (
                  <tr key={l.entry.run_id} className={l.entry.split === "validation" ? "validation-frame" : undefined}>
                    <td><a href={href("run", l.entry.run_id)}>{l.entry.strategy_id} · {l.entry.symbol}</a>{" "}
                      <SplitBadge split={l.entry.split} /></td>
                    <td><TrialsBadge strategy={l.entry.strategy_id} trials={data.trials} /></td>
                    <td className="num">{pct(p.cagr)}</td><td className="num">{pct(p.twr_total, 0)}</td>
                    <td className="num">{pct(p.max_drawdown)}</td><td className="num">{num(p.sharpe)}</td>
                    <td className="num">{num(p.sortino)}</td><td className="num">{pct(p.irr)}</td>
                    <td className="num">{num(l.run.metrics.trades_per_year)}</td>
                    <td className="num">{pct(l.run.metrics.exposure_mean, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
