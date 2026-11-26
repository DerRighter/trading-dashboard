import { useMemo, useState } from "react";
import { indexMetric } from "../data/series";
import type { IndexRun } from "../data/types";
import {
  EligibilityBadge, FrequencyBadge, Loading, Problem, SplitBadge, TrialsBadge, pct, useIndex,
} from "../ui/components";
import { href, useControls } from "../ui/state";

const FILTERS = [
  ["strategy_id", "Stratégie"], ["symbol", "Symbole"], ["mode", "Mode"],
  ["split", "Split"], ["origin", "Origine"],
] as const;
type FilterKey = (typeof FILTERS)[number][0];
export const MAX_COMPARE = 6;

/** Liste des runs : ne lit QUE index.json (et trials.json pour le compteur). */
export function RunList() {
  const { data, error } = useIndex();
  const { ccy, net } = useControls();
  const view = `${ccy.toUpperCase()} ${net ? "net" : "brut"}`;
  const [f, setF] = useState<Partial<Record<FilterKey, string>>>({});
  const [picked, setPicked] = useState<string[]>([]);

  const runs = data?.[0].runs ?? [];
  const options = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [
    k, [...new Set(runs.map((r) => String(r[k])))].sort()])) as Record<FilterKey, string[]>, [runs]);
  const shown = useMemo(() => runs
    .filter((r) => FILTERS.every(([k]) => !f[k] || String(r[k]) === f[k]))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.strategy_id.localeCompare(b.strategy_id)
      || b.created_at.localeCompare(a.created_at)), [runs, f]);

  if (error) return <Problem error={error} />;
  if (!data) return <Loading what="runs" />;
  const [index, trials] = data;
  const strategies = [...new Set(runs.map((r) => r.strategy_id))].sort();

  const toggle = (id: string) => setPicked((p) =>
    p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_COMPARE ? [...p, id] : p);

  return (
    <>
      <section className="card">
        <h2>Compteur d'essais par stratégie</h2>
        <div className="kv">
          {strategies.map((s) => <span key={s}><b>{s}</b> <TrialsBadge strategy={s} trials={trials} /></span>)}
        </div>
        <p className="muted">{trials.basis}. Export du {index.generated_at.slice(0, 10)} depuis
          trading-bot@{index.source.sha.slice(0, 7)}.</p>
      </section>

      <section className="card">
        <div className="filters">
          {FILTERS.map(([k, label]) => (
            <label key={k}>{label}
              <select value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value || undefined })}>
                <option value="">tous</option>
                {options[k].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
          <span className="muted">{shown.length} / {runs.length} runs</span>
          <a className={picked.length ? "" : "muted"} aria-disabled={!picked.length}
             href={picked.length ? `#/compare?ids=${picked.map(encodeURIComponent).join(",")}` : undefined}>
            Comparer la sélection ({picked.length}/{MAX_COMPARE})
          </a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th><th>Stratégie</th><th>Symbole</th><th>Mode</th><th>Split</th>
                <th>Période</th><th>Univers</th><th>Origine</th>
                <th className="num" title={`Vue ${view} (contrôles devise et brut/net)`}>CAGR <span className="muted">{view}</span></th>
                <th className="num" title={`Vue ${view} (contrôles devise et brut/net)`}>Max DD <span className="muted">{view}</span></th>
                <th>Essais</th><th>Éligibilité</th><th>Vues</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r: IndexRun) => (
                <tr key={r.run_id} className={r.split === "validation" ? "validation-frame" : undefined}>
                  <td><input type="checkbox" aria-label={`comparer ${r.run_id}`} checked={picked.includes(r.run_id)}
                             disabled={!picked.includes(r.run_id) && picked.length >= MAX_COMPARE}
                             onChange={() => toggle(r.run_id)} /></td>
                  <td><a href={href("run", r.run_id)} title={r.run_id}>{r.strategy_id}</a></td>
                  <td>{r.symbol}</td>
                  <td>{r.mode}</td>
                  <td><SplitBadge split={r.split} /><FrequencyBadge frequency={r.equity_frequency} /></td>
                  <td className="num">{r.first_session} → {r.last_session}</td>
                  <td>{r.universe_id} <span className="muted">({r.tax_regime})</span></td>
                  <td>{r.origin}{r.sweep_id ? <span className="muted"> · {r.sweep_id}</span> : null}</td>
                  <MetricCells run={r} ccy={ccy} net={net} />
                  <td><TrialsBadge strategy={r.strategy_id} trials={trials} /></td>
                  <td><EligibilityBadge run={r} /></td>
                  <td>
                    <a href={href("run", r.run_id)}>détail</a>{" · "}
                    <a href={href("rolling", r.run_id)}>fenêtres</a>{" · "}
                    <a href={href("entry", r.run_id)}>entrée</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">CAGR et max drawdown de la vue {view}, lus dans index.json (copiés de
          metrics.json) ; le détail de chaque run donne toutes les métriques. USD net d'un run avec
          apports : indisponible (—).</p>
      </section>
    </>
  );
}

function MetricCells({ run, ccy, net }: { run: IndexRun; ccy: "usd" | "eur"; net: boolean }) {
  const m = indexMetric(run, ccy, net);
  if (!m.ok) return <><td className="num muted" title={m.reason}>—</td><td className="num muted" title={m.reason}>—</td></>;
  return <><td className="num">{pct(m.value.cagr)}</td><td className="num">{pct(m.value.max_drawdown)}</td></>;
}
