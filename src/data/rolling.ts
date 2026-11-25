// Fenêtres glissantes : écart de rendement ANNUALISÉ stratégie − référence
// sur N ans, pour chaque date de départ (pas mensuel).
//
// Définition (identique à scripts/rolling_reference.py, vérifiée par test) :
// - séances communes aux deux indices TWR ;
// - départs : première séance de chaque mois civil ;
// - fin visée = départ + N ans (même jour, même mois) ; fenêtre retenue si
//   fin visée <= dernière séance ; fin = dernière séance <= fin visée ;
// - rendement de la clôture du départ à la clôture de la fin :
//   annualisé = (I_fin / I_départ)^(1/N) − 1 ; écart = ann_strat − ann_réf.
import type { Series } from "./series";

export interface Window {
  start: number;      // secondes UTC
  end: number;
  annStrategy: number;
  annReference: number;
  delta: number;
}

export function align(a: Series, b: Series): { t: number[]; a: number[]; b: number[] } {
  const mb = new Map(b.t.map((t, i) => [t, b.v[i]]));
  const t: number[] = [], va: number[] = [], vb: number[] = [];
  a.t.forEach((x, i) => {
    const y = mb.get(x);
    if (y !== undefined) { t.push(x); va.push(a.v[i]); vb.push(y); }
  });
  return { t, a: va, b: vb };
}

export function rollingWindows(strategy: Series, reference: Series, years: number): Window[] {
  const { t, a, b } = align(strategy, reference);
  const out: Window[] = [];
  if (!t.length) return out;
  const last = t[t.length - 1];
  let j = 0;
  for (let i = 0; i < t.length; i++) {
    const d = new Date(t[i] * 1000);
    if (i > 0) {
      const p = new Date(t[i - 1] * 1000);
      if (p.getUTCFullYear() === d.getUTCFullYear() && p.getUTCMonth() === d.getUTCMonth()) continue;
    }
    const target = Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()) / 1000;
    if (target > last) break;
    if (j < i) j = i;
    while (j + 1 < t.length && t[j + 1] <= target) j++;
    const annS = Math.pow(a[j] / a[i], 1 / years) - 1;
    const annR = Math.pow(b[j] / b[i], 1 / years) - 1;
    out.push({ start: t[i], end: t[j], annStrategy: annS, annReference: annR, delta: annS - annR });
  }
  return out;
}

export function summarize(ws: Window[]) {
  const d = ws.map((w) => w.delta).sort((x, y) => x - y);
  const n = d.length;
  return {
    n,
    winShare: n ? d.filter((x) => x > 0).length / n : NaN,
    mean: n ? d.reduce((s, x) => s + x, 0) / n : NaN,
    median: n ? (n % 2 ? d[(n - 1) / 2] : (d[n / 2 - 1] + d[n / 2]) / 2) : NaN,
    min: n ? d[0] : NaN,
    max: n ? d[n - 1] : NaN,
  };
}
