import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkIndex, checkRun, SchemaError } from "../src/data/guards";
import { benchmarksFor, drawdown, hasFlows, monthlyReturns, rebase, twr, USD_NET_FLOWS_REASON } from "../src/data/series";
import { DATA, find, index, readRun } from "./helpers";

describe("garde de version", () => {
  it("accepte l'export courant", () => {
    expect(() => checkIndex(index())).not.toThrow();
  });
  it("refuse une version inconnue avec un message clair", () => {
    expect(() => checkIndex({ schema_version: 1, results_schema_version: 2 })).toThrow(SchemaError);
    expect(() => checkIndex({ schema_version: 3, results_schema_version: 2 })).toThrow(SchemaError);
    expect(() => checkIndex({ schema_version: 2, results_schema_version: 3 })).toThrow(/v3 inconnu/);
    expect(() => checkRun("x", { schema_version: 1, equity_frequency: "daily" }, { schema_version: 2 }))
      .toThrow(/schema_version 1/);
    expect(() => checkRun("x", { schema_version: 2, equity_frequency: "monthly" }, { schema_version: 2 }))
      .toThrow(/monthly/);
  });
});

describe("indices TWR", () => {
  it("USD net reconstruit exactement pour un run sans apport", async () => {
    for (const s of ["bh", "ma200_long_cash"]) {
      const run = await readRun(find(s, "QQQ").path);
      expect(hasFlows(run.equity)).toBe(false);
      const r = twr(run, "usd", true);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const last = r.series.v[r.series.v.length - 1];
      expect(last - 1).toBeCloseTo(run.metrics.views.usd_net.twr_total, 9);
    }
  });
  it("USD net indisponible pour bh_dca (apports), jamais approché", async () => {
    const run = await readRun(find("bh_dca", "QQQ").path);
    expect(hasFlows(run.equity)).toBe(true);
    expect(twr(run, "usd", true)).toEqual({ ok: false, reason: USD_NET_FLOWS_REASON });
  });
  it("les trois indices exportés concordent avec metrics.json", async () => {
    const run = await readRun(find("bh_dca", "NVDA").path);
    for (const [ccy, net, key] of [["usd", false, "usd_gross"], ["eur", false, "eur_gross"], ["eur", true, "eur_net"]] as const) {
      const r = twr(run, ccy, net);
      if (!r.ok) throw new Error(r.reason);
      expect(r.series.v[r.series.v.length - 1] - 1).toBeCloseTo(run.metrics.views[key].twr_total, 9);
      const dd = Math.min(...drawdown(r.series).v);
      expect(dd).toBeCloseTo(run.metrics.views[key].max_drawdown, 9);
    }
  });
  it("rendements mensuels composés = TWR total ; rebase à 100", async () => {
    const run = await readRun(find("ma200_long_cash", "NVDA").path);
    const r = twr(run, "eur", false);
    if (!r.ok) throw new Error(r.reason);
    const m = monthlyReturns(r.series);
    expect(m.reduce((a, x) => a * (1 + x.r), 1) - 1).toBeCloseTo(run.metrics.views.eur_gross.twr_total, 9);
    const rb = rebase(r.series, r.series.t[100])!;
    expect(rb.v[0]).toBe(100);
    expect(rb.t[0]).toBe(r.series.t[100]);
  });
  it("benchmarks du même symbole, split et période", () => {
    const idx = index();
    const run = find("ma200_long_cash", "ASML");
    const b = benchmarksFor(run, idx.runs);
    expect([...b.keys()].sort()).toEqual(["bh", "bh_dca", "ma200_long_cash"]);
    expect([...b.values()].every((x) => x.symbol === "ASML")).toBe(true);
  });
});

describe("données servies", () => {
  it("data/ unique à la racine du repo, hors du projet Vite", () => {
    expect(fs.existsSync(path.join(DATA, "index.json"))).toBe(true);
    for (const dup of ["public/data", "src/data/index.json", "dummy-non-existing-folder"]) {
      expect(fs.existsSync(path.resolve(DATA, "..", dup))).toBe(false);
    }
  });
});
