import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { rollingWindows, summarize } from "../src/data/rolling";

const REF = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures", "rolling_reference.json"), "utf8"));
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

describe("fenêtres glissantes vs référence Python (scripts/rolling_reference.py)", () => {
  for (const n of [1, 2, 3]) {
    it(`N = ${n} an(s) : mêmes fenêtres, mêmes écarts`, () => {
      // séries embarquées dans la fixture (indices TWR EUR brut de ma200_long_cash et bh, QQQ)
      const ws = rollingWindows(REF.series.strategy, REF.series.reference, n);
      const ref = REF.windows[String(n)];
      expect(ws.length).toBe(ref.n);
      ws.forEach((w, i) => {
        const x = ref.items[i];
        expect(day(w.start)).toBe(x.start);
        expect(day(w.end)).toBe(x.end);
        expect(w.annStrategy).toBeCloseTo(x.ann_strategy, 12);
        expect(w.annReference).toBeCloseTo(x.ann_reference, 12);
        expect(w.delta).toBeCloseTo(x.delta, 12);
      });
      const sm = summarize(ws);
      expect(sm.winShare).toBeCloseTo(ref.win_share, 12);
      expect(sm.mean).toBeCloseTo(ref.mean, 12);
      expect(sm.median).toBeCloseTo(ref.median, 12);
    });
  }
});

describe("fenêtres glissantes : cas synthétique", () => {
  it("indice à +10 %/an contre une référence plate : écart constant de 10 %", () => {
    const t: number[] = [], v: number[] = [], f: number[] = [];
    const t0 = Date.UTC(2010, 0, 4) / 1000;
    for (let i = 0; i < 365 * 4; i++) {
      t.push(t0 + i * 86400);
      v.push(Math.pow(1.1, i / 365.25));
      f.push(1);
    }
    const ws = rollingWindows({ t, v }, { t, v: f }, 2);
    expect(ws.length).toBeGreaterThan(20);
    expect(ws[0].start).toBe(t0);                // première séance du premier mois
    ws.forEach((w, i) => {
      expect(w.annReference).toBe(0);
      expect(w.delta).toBeCloseTo(0.1, 2);      // à l'arrondi des jours près
      if (i > 0) expect(new Date(w.start * 1000).getUTCDate()).toBe(1);
    });
    expect(summarize(ws).winShare).toBe(1);
  });
});
