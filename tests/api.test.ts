import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api, AuthError, clearToken, entryFromResults, getToken, HEALTH_TIMEOUT_MS, probeHealth,
  rememberJob, runFromResults, sessionJobs, setToken, trialsFromStrategies,
  type ApiResults, type ApiStrategy,
} from "../src/data/api";
import { buildParams, coerce, defaults, fieldsFromSchema } from "../src/data/schemaForm";
import { DATA, index, readRun } from "./helpers";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

const HEALTH = {
  service: "trading-bot-api", version: "1.0.0", git_sha: "a".repeat(40), git_dirty: false,
  schema_versions: [2, 3], writes_schema_version: 3,
  period: { split: "exploration", start: "2008-01-01", end: "2016-12-31" },
};

let session: MemStorage;
let local: MemStorage;
beforeEach(() => {
  session = new MemStorage();
  local = new MemStorage();
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("localStorage", local);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("détection de l'API locale (lecture seule si arrêtée)", () => {
  it("API arrêtée : fetch rejeté -> null, sans exception", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(probeHealth(f)).resolves.toBeNull();
    expect(f).toHaveBeenCalledWith("http://127.0.0.1:8765/health", expect.anything());
  });
  it("API qui ne répond pas : abandon au bout du timeout d'une seconde", async () => {
    expect(HEALTH_TIMEOUT_MS).toBe(1000);
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const f = vi.fn((_u: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => { /* jamais résolu */ });
    });
    const p = probeHealth(f as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(p).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
  });
  it("réponse non 200 ou autre service -> null", async () => {
    const r500 = vi.fn().mockResolvedValue(new Response("x", { status: 500 }));
    await expect(probeHealth(r500)).resolves.toBeNull();
    const other = vi.fn().mockResolvedValue(Response.json({ service: "autre" }));
    await expect(probeHealth(other)).resolves.toBeNull();
    const bad = vi.fn().mockResolvedValue(new Response("pas du json", { status: 200 }));
    await expect(probeHealth(bad)).resolves.toBeNull();
  });
  it("API joignable -> santé", async () => {
    const ok = vi.fn().mockResolvedValue(Response.json(HEALTH));
    await expect(probeHealth(ok)).resolves.toMatchObject({ version: "1.0.0" });
  });
});

describe("jeton", () => {
  it("gardé en sessionStorage, jamais en localStorage", () => {
    expect(getToken()).toBeNull();
    setToken("  secret  ");
    expect(getToken()).toBe("secret");
    expect(local.length).toBe(0);
    rememberJob("j1");
    expect(sessionJobs()).toEqual(["j1"]);
    expect(local.length).toBe(0);
    clearToken();
    expect(getToken()).toBeNull();
  });
  it("envoyé en Bearer, jamais dans l'URL ; sans jeton : AuthError sans appel", async () => {
    const f = vi.fn().mockResolvedValue(Response.json({ strategies: [] }));
    vi.stubGlobal("fetch", f);
    await expect(api.strategies()).rejects.toBeInstanceOf(AuthError);
    expect(f).not.toHaveBeenCalled();
    setToken("secret");
    await api.strategies();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8765/strategies");
    expect(url).not.toContain("secret");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });
  it("401 -> AuthError", async () => {
    setToken("périmé");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "x" }, { status: 401 })));
    await expect(api.job("abc")).rejects.toBeInstanceOf(AuthError);
  });
  it("POST /runs : jamais de champ de période", async () => {
    setToken("t");
    const f = vi.fn().mockResolvedValue(Response.json({ id: "j", status: "queued" }, { status: 202 }));
    vi.stubGlobal("fetch", f);
    await api.submit({ strategy: "bh", params: { mode: "long_cash" }, symbol: "QQQ" });
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["params", "strategy", "symbol"]);
  });
});

const SCHEMA: ApiStrategy["params_schema"] = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["long_cash"], default: "long_cash" },
    lookback: { type: "integer", minimum: 5, maximum: 200, default: 20 },
    band: { type: "number", minimum: 0, maximum: 0.1, default: 0.02 },
    flag: { type: "boolean", default: true },
    start: { type: "string", default: "2008-01-01" },
  },
};

describe("formulaire depuis le JSON Schema", () => {
  it("types, bornes et défauts ; pas de champ de période", () => {
    const fields = fieldsFromSchema(SCHEMA);
    expect(fields.map((f) => [f.name, f.kind])).toEqual(
      [["mode", "enum"], ["lookback", "integer"], ["band", "number"], ["flag", "boolean"]]);
    const v = defaults(fields);
    expect(v).toEqual({ mode: "long_cash", lookback: "20", band: "0.02", flag: "true" });
    expect(buildParams(fields, v)).toEqual({
      params: { mode: "long_cash", lookback: 20, band: 0.02, flag: true }, errors: {} });
  });
  it("valeurs hors bornes refusées", () => {
    const [, lookback, band] = fieldsFromSchema(SCHEMA);
    expect(coerce(lookback, "4")).toEqual({ ok: false, error: "minimum 5" });
    expect(coerce(lookback, "201")).toEqual({ ok: false, error: "maximum 200" });
    expect(coerce(lookback, "20.5")).toEqual({ ok: false, error: "entier attendu" });
    expect(coerce(band, "0,05")).toEqual({ ok: true, value: 0.05 });
    expect(coerce(band, "")).toEqual({ ok: false, error: "valeur requise" });
  });
});

function b64(p: string) {
  return fs.readFileSync(p).toString("base64");
}

describe("résultats de l'API -> vues existantes", () => {
  it("mêmes séries que le run publié (Parquet base64)", async () => {
    const entry = index().runs.find((r) => r.portfolio) ?? index().runs[0];
    const d = path.join(DATA, entry.path);
    const manifest = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
    const metrics = JSON.parse(fs.readFileSync(path.join(d, "metrics.json"), "utf8"));
    const wp = path.join(d, "weights.parquet");
    const res = {
      run_id: manifest.run_id, manifest, metrics, encoding: "parquet+base64",
      equity: b64(path.join(d, "equity.parquet")), trades: b64(path.join(d, "trades.parquet")),
      weights: fs.existsSync(wp) ? b64(wp) : null,
    } as unknown as ApiResults;
    const run = await runFromResults(res);
    const ref = await readRun(entry.path);
    expect(run.equity.twr_index).toEqual(ref.equity.twr_index);
    expect(run.trades.length).toBe(ref.trades.length);
    expect(run.weights?.symbols).toEqual(ref.weights?.symbols);
    const e = entryFromResults(res);
    expect(e).toMatchObject({ run_id: entry.run_id, symbol: entry.symbol, split: entry.split,
                              first_session: entry.first_session, origin: "local" });
  });
  it("version de schéma inconnue refusée", async () => {
    const res = { run_id: "x", manifest: { schema_version: 9, equity_frequency: "daily" },
                  metrics: { schema_version: 9 } } as unknown as ApiResults;
    await expect(runFromResults(res)).rejects.toThrow(/schema_version 9/);
  });
  it("compteur d'essais tiré de /strategies", () => {
    const t = trialsFromStrategies([{ id: "bh", trials: 3, checks: 1 } as ApiStrategy], "s");
    expect(t.trials.bh).toBe(3);
    expect(t.checks.bh).toBe(1);
  });
});
