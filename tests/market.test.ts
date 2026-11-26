import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { snapTime } from "../src/charts/LineChart";
import { checkMarketIndex, PRICE_COLUMNS, SchemaError } from "../src/data/guards";
import { parseMarket, readParquet } from "../src/data/load";
import { bearZones, indexMetric, USD_NET_FLOWS_REASON } from "../src/data/series";
import type { MarketIndex } from "../src/data/types";
import { marketLines } from "../src/views/Market";
import { DATA, find, index } from "./helpers";

const marketIndex = (): MarketIndex =>
  JSON.parse(fs.readFileSync(path.join(DATA, "market", "index.json"), "utf8"));

function ab(p: string): ArrayBuffer {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("index v2 : métriques de la liste", () => {
  it("CAGR / max DD par vue = metrics.json ; USD net null avec apports", () => {
    for (const s of ["bh", "bh_dca", "ma200_long_cash"]) {
      const r = find(s, "QQQ");
      const m = JSON.parse(fs.readFileSync(path.join(DATA, r.path, "metrics.json"), "utf8"));
      for (const [ccy, net, key] of [["usd", false, "usd_gross"], ["eur", false, "eur_gross"], ["eur", true, "eur_net"]] as const) {
        const v = indexMetric(r, ccy, net);
        expect(v.ok).toBe(true);
        if (v.ok) expect(v.value).toEqual({ cagr: m.views[key].cagr, max_drawdown: m.views[key].max_drawdown });
      }
      const usdNet = indexMetric(r, "usd", true);
      if (s === "bh_dca") expect(usdNet).toEqual({ ok: false, reason: USD_NET_FLOWS_REASON });
      else expect(usdNet.ok && usdNet.value.cagr).toBe(m.views.usd_net.cagr);
    }
  });
  it("eligible : null pour les benchmarks, booléen pour les stratégies (seuil du critère)", () => {
    for (const r of index().runs) {
      if (r.strategy_kind === "benchmark") expect(r.eligible, r.run_id).toBeNull();
      else expect(typeof r.eligible, r.run_id).toBe("boolean");
    }
  });
});

describe("vue marché", () => {
  it("garde : index exporté accepté, version ou colonnes inconnues refusées", () => {
    expect(() => checkMarketIndex(marketIndex())).not.toThrow();
    expect(() => checkMarketIndex({ ...marketIndex(), schema_version: 2 })).toThrow(SchemaError);
    expect(() => checkMarketIndex({ ...marketIndex(), columns: ["date", "close"] })).toThrow(SchemaError);
  });
  it("QQQ, URTH et ai-semis exportés ; Parquet sans prix, rebasé à 100", async () => {
    const mi = marketIndex();
    const syms = mi.symbols.map((s) => s.symbol);
    expect(syms.slice(0, 2)).toEqual(["QQQ", "URTH"]);
    expect(syms).toContain("NVDA");
    const rows = await readParquet(ab(path.join(DATA, mi.symbols[0].path)));
    expect(Object.keys(rows[0]).sort()).toEqual(["date", "index_eur", "index_usd", "ma200_index", "regime"]);
    expect(Object.keys(rows[0]).some((c) => (PRICE_COLUMNS as readonly string[]).includes(c))).toBe(false);
    const m = parseMarket(rows);
    expect(m.index_usd[0]).toBe(100);
    expect(m.index_eur[0]).toBe(100);
    expect(m.t.length).toBe(mi.symbols[0].rows);
    expect(m.regime.every((r) => r === null || r === 1 || r === -1)).toBe(true);
    expect(m.ma200_index.slice(0, 199).every((x) => x === null)).toBe(true);
    expect(bearZones(m).length).toBeGreaterThan(0);
  });
  it("parseMarket refuse une colonne de prix", () => {
    const row = { date: new Date(0), index_usd: 100, index_eur: 100, ma200_index: null, regime: null, close: 412.3 };
    expect(() => parseMarket([row])).toThrow(/prix refusées/);
  });
  it("MM200 tracée en USD seulement ; trous en NaN", () => {
    const m = { t: [1, 2], index_usd: [100, 101], index_eur: [100, 99], ma200_index: [null, 100.5], regime: [null, 1] };
    expect(marketLines(m, "usd").map((l) => l.name)).toEqual(["indice USD (base 100)", "MM200"]);
    expect(marketLines(m, "usd")[1].v[0]).toBeNaN();
    expect(marketLines(m, "eur").map((l) => l.name)).toEqual(["indice EUR (base 100)"]);
  });
  it("ligne verticale calée sur la dernière séance <= date", () => {
    expect(snapTime([10, 20, 30], 25)).toBe(20);
    expect(snapTime([10, 20, 30], 30)).toBe(30);
    expect(snapTime([10, 20, 30], 5)).toBeNull();
  });
});
