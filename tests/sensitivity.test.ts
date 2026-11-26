import { describe, expect, it } from "vitest";
import { cells, groupSweeps, paramValues, slice, varyingKeys } from "../src/data/sensitivity";
import type { IndexRun, Metrics } from "../src/data/types";
import { index } from "./helpers";

function run(id: string, params: Record<string, unknown>, symbol = "QQQ"): IndexRun {
  return { ...index().runs[0], run_id: id, origin: "sweep", sweep_id: "S1", strategy_id: "x",
           strategy_kind: "strategy", symbol, params: { mode: "long_cash", ...params } };
}

describe("sensibilité", () => {
  it("sweeps exportés : une stratégie par sweep, paramètres de la grille variables", () => {
    for (const [id, runs] of groupSweeps(index().runs)) {
      expect(new Set(runs.map((r) => r.strategy_id)).size, id).toBe(1);
      expect(runs.every((r) => r.origin === "sweep"), id).toBe(true);
      expect(varyingKeys(runs).length, id).toBeGreaterThan(0);
    }
  });

  it("heatmap 2 × 3 avec un troisième paramètre fixé", () => {
    const runs: IndexRun[] = [];
    let k = 0;
    for (const fast of [5, 10]) for (const slow of [20, 50, 100]) for (const z of [1, 2]) {
      runs.push(run(`r${k++}`, { fast, slow, z }));
    }
    runs.push(run("other", { fast: 5, slow: 20, z: 1 }, "NVDA"));
    const sw = groupSweeps(runs).get("S1")!;
    expect(varyingKeys(sw)).toEqual(["fast", "slow", "z"]);
    expect(paramValues(sw, "slow")).toEqual(["20", "50", "100"]);      // tri numérique
    const sel = slice(sw, "QQQ", "fast", "slow", {});                  // z fixé à 1 par défaut
    expect(sel).toHaveLength(6);
    expect(sel.every((r) => r.params.z === 1)).toBe(true);
    expect(slice(sw, "QQQ", "fast", "slow", { z: "2" }).every((r) => r.params.z === 2)).toBe(true);
    const metrics = new Map(sel.map((r) => [r.run_id, {
      views: { eur_gross: { cagr: Number(r.params.fast) / 100 + Number(r.params.slow) / 1000 } },
    } as unknown as Metrics]));
    const c = cells(sw, sel, metrics, "fast", "slow", "eur_gross", "cagr");
    expect(c).toHaveLength(6);
    expect(c).toContainEqual([1, 2, 0.1 + 0.1]);                       // fast 10, slow 100
  });
});
