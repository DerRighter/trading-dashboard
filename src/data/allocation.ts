// Allocation d'un run portefeuille (résultats v3, weights.parquet) : poids de
// chaque titre en fin de séance, et part du cash (1 − somme des poids).
import { SchemaError } from "./guards";

export interface Weights {
  t: number[];                       // secondes UTC
  symbols: string[];
  w: number[][];                     // w[k][i] : poids du titre k à la séance i
}

export interface AllocationSeries {
  name: string;
  data: [number, number][];          // [ms, poids en %]
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "bigint" ? Number(v) : (v as number));

export function parseWeights(rows: Row[], symbols: string[]): Weights {
  if (!rows.length) throw new SchemaError("weights.parquet vide");
  const cols = Object.keys(rows[0]).filter((c) => c !== "date");
  if (JSON.stringify(cols) !== JSON.stringify(symbols))
    throw new SchemaError(`weights.parquet : colonnes ${cols.join(", ")} différentes de manifest.symbols`);
  return {
    t: rows.map((r) => Math.floor((r.date as Date).getTime() / 1000)),
    symbols,
    w: symbols.map((s) => rows.map((r) => num(r[s]))),
  };
}

/** Séries empilées : un titre par série (0 à 100 %), puis le cash. Le cash
 *  est le complément (jamais négatif à l'affichage, arrondis compris). */
export function allocationSeries(w: Weights): AllocationSeries[] {
  const out = w.symbols.map((s, k) => ({
    name: s,
    data: w.t.map((t, i) => [t * 1000, w.w[k][i] * 100] as [number, number]),
  }));
  const cash = w.t.map((t, i) => {
    const used = w.w.reduce((acc, col) => acc + col[i], 0);
    return [t * 1000, Math.max(0, (1 - used) * 100)] as [number, number];
  });
  return [...out, { name: "cash", data: cash }];
}
