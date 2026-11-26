// Logique pure de la vue Sensibilité (testée sans navigateur).
import type { IndexRun, Metrics, ViewKey } from "./types";

export const fmt = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));

export function groupSweeps(runs: IndexRun[]): Map<string, IndexRun[]> {
  const m = new Map<string, IndexRun[]>();
  for (const r of runs) {
    if (r.origin === "sweep" && r.sweep_id) m.set(r.sweep_id, [...(m.get(r.sweep_id) ?? []), r]);
  }
  return m;
}

/** Paramètres qui varient dans le sweep (mode exclu). */
export function varyingKeys(runs: IndexRun[]): string[] {
  return [...new Set(runs.flatMap((r) => Object.keys(r.params)))]
    .filter((k) => k !== "mode" && new Set(runs.map((r) => fmt(r.params[k]))).size > 1).sort();
}

export function paramValues(runs: IndexRun[], k: string): string[] {
  return [...new Set(runs.map((r) => fmt(r.params[k])))]
    .sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b));
}

/** Runs d'une coupe : symbole donné, axes x/y libres, autres paramètres
 *  fixés (par défaut : leur première valeur). */
export function slice(runs: IndexRun[], symbol: string, x: string, y: string,
                      fixed: Record<string, string>): IndexRun[] {
  const keys = varyingKeys(runs);
  return runs.filter((r) => r.symbol === symbol && keys.every((k) =>
    k === x || k === y || fmt(r.params[k]) === (fixed[k] ?? paramValues(runs, k)[0])));
}

export function cells(runs: IndexRun[], sel: IndexRun[], metrics: Map<string, Metrics>, x: string, y: string,
                      vk: ViewKey, metric: "cagr" | "sharpe" | "max_drawdown" | "twr_total"): [number, number, number][] {
  const xs = paramValues(runs, x), ys = paramValues(runs, y);
  const out: [number, number, number][] = [];
  for (const r of sel) {
    const v = metrics.get(r.run_id)?.views[vk][metric];
    if (v == null) continue;
    out.push([xs.indexOf(fmt(r.params[x])), ys.indexOf(fmt(r.params[y])), v]);
  }
  return out;
}

/** Bornes de l'échelle de couleur de la heatmap. null sans valeur (sélection
 *  en cours de chargement : Math.min() vaudrait +Infinity et ferait planter
 *  ECharts) ; une seule valeur distincte : bornes élargies (min < max). */
export function valueRange(vals: number[]): { min: number; max: number } | null {
  const v = vals.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const min = Math.min(...v), max = Math.max(...v);
  if (max > min) return { min, max };
  const pad = Math.abs(min) * 1e-6 || 1e-9;
  return { min: min - pad, max: max + pad };
}
