import { describe, expect, it } from "vitest";
import { allocationSeries, parseWeights } from "../src/data/allocation";
import { SchemaError } from "../src/data/guards";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("allocation (weights.parquet v3)", () => {
  it("séries empilées par titre puis cash = complément", () => {
    const w = parseWeights([{ date: d("2010-01-04"), A: 0.5, B: 0.3 },
                            { date: d("2010-01-05"), A: 0.6, B: 0.4 }], ["A", "B"]);
    const s = allocationSeries(w);
    expect(s.map((x) => x.name)).toEqual(["A", "B", "cash"]);
    expect(s[2].data[0][1]).toBeCloseTo(20, 9);
    expect(s[2].data[1][1]).toBe(0);
    expect(s[0].data[0][0]).toBe(d("2010-01-04").getTime());
  });
  it("refuse des colonnes différentes de manifest.symbols", () => {
    expect(() => parseWeights([{ date: d("2010-01-04"), A: 1 }], ["B"])).toThrow(SchemaError);
  });
});
