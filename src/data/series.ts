// Séries de performance. Toute courbe de performance repose sur un indice
// TWR (rendement pondéré dans le temps) : les apports de bh_dca faussent une
// courbe de valeur.
//
// Indices disponibles dans equity.parquet (v2) : USD brut (twr_index), EUR
// brut (twr_index_eur), EUR net (twr_index_eur_net). USD net n'y est pas :
// - run SANS apport : reconstruit exactement, equity_usd_net / capital
//   initial USD (l'impôt est une perte, pas un retrait : le TWR télescope) ;
// - run AVEC apports (bh_dca) : NON reconstructible sans la valeur à
//   l'ouverture (non exportée) -> combinaison indisponible, jamais approchée.
import type { Ccy, Equity, IndexRun, Run, ViewKey } from "./types";

export interface Series {
  t: number[];
  v: number[];
}
export type SeriesResult = { ok: true; series: Series } | { ok: false; reason: string };

export const USD_NET_FLOWS_REASON =
  "USD net indisponible pour un run avec apports : l'indice TWR USD net ne peut pas être " +
  "reconstruit sans ambiguïté depuis equity.parquet (valeur à l'ouverture non exportée).";

export function viewKey(ccy: Ccy, net: boolean): ViewKey {
  return `${ccy}_${net ? "net" : "gross"}` as ViewKey;
}

export function hasFlows(eq: Equity): boolean {
  return eq.flow_eur.some((f) => f !== 0);
}

/** Indice TWR (base 1 avant la première séance) pour la vue demandée. */
export function twr(run: Run, ccy: Ccy, net: boolean): SeriesResult {
  const eq = run.equity;
  if (ccy === "usd" && !net) return { ok: true, series: { t: eq.t, v: eq.twr_index } };
  if (ccy === "eur" && !net) return { ok: true, series: { t: eq.t, v: eq.twr_index_eur } };
  if (ccy === "eur" && net) return { ok: true, series: { t: eq.t, v: eq.twr_index_eur_net } };
  if (hasFlows(eq)) return { ok: false, reason: USD_NET_FLOWS_REASON };
  const initial = run.metrics.views.usd_gross.capital_invested;     // = capital initial USD
  return { ok: true, series: { t: eq.t, v: eq.equity_usd_net.map((x) => x / initial) } };
}

export function drawdown(s: Series): Series {
  let peak = 1;
  return { t: s.t, v: s.v.map((x) => { peak = Math.max(peak, x); return x / peak - 1; }) };
}

export function rebase(s: Series, fromT: number, base = 100): Series | null {
  const i = s.t.findIndex((t) => t >= fromT);
  if (i < 0) return null;
  const ref = s.v[i];
  return { t: s.t.slice(i), v: s.v.slice(i).map((x) => (x / ref) * base) };
}

/** Rendements mensuels du TWR : fin de mois / fin du mois précédent (base 1). */
export function monthlyReturns(s: Series): { year: number; month: number; r: number }[] {
  const out: { year: number; month: number; r: number }[] = [];
  let prev = 1;
  for (let i = 0; i < s.t.length; i++) {
    const d = new Date(s.t[i] * 1000);
    const nxt = i + 1 < s.t.length ? new Date(s.t[i + 1] * 1000) : null;
    if (!nxt || nxt.getUTCMonth() !== d.getUTCMonth() || nxt.getUTCFullYear() !== d.getUTCFullYear()) {
      out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, r: s.v[i] / prev - 1 });
      prev = s.v[i];
    }
  }
  return out;
}

/** Plages de régime baissier [début, fin] (colonne regime = -1). */
export function bearZones(eq: Equity): [number, number][] {
  const zones: [number, number][] = [];
  let start: number | null = null;
  eq.regime.forEach((r, i) => {
    if (r === -1 && start === null) start = eq.t[i];
    if (r !== -1 && start !== null) { zones.push([start, eq.t[i - 1]]); start = null; }
  });
  if (start !== null) zones.push([start, eq.t[eq.t.length - 1]]);
  return zones;
}

/** Benchmarks du même symbole, split et période (le plus récent par id). */
export function benchmarksFor(run: IndexRun, runs: IndexRun[]): Map<string, IndexRun> {
  const out = new Map<string, IndexRun>();
  for (const r of runs) {
    if (r.strategy_kind !== "benchmark" || r.symbol !== run.symbol || r.split !== run.split
        || r.first_session !== run.first_session || r.last_session !== run.last_session) continue;
    const prev = out.get(r.strategy_id);
    if (!prev || r.created_at > prev.created_at) out.set(r.strategy_id, r);
  }
  return out;
}
