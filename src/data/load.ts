// Chargement des données exportées. La liste des runs ne lit QUE index.json
// (et trials.json pour le compteur) ; les fichiers d'un run (manifest,
// metrics, Parquet) ne sont lus qu'à l'ouverture de ce run.
import { parquetReadObjects } from "hyparquet";
import {
  checkIndex, checkMarketIndex, checkRun, checkTrials, EQUITY_COLUMNS, MARKET_COLUMNS, PRICE_COLUMNS,
  SchemaError,
} from "./guards";
import type {
  Equity, IndexFile, Manifest, Market, MarketIndex, Metrics, Run, Trade, TrialsFile,
} from "./types";

export const DATA_URL = `${import.meta.env?.BASE_URL ?? "/"}data/`;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res;
}

async function json<T>(url: string): Promise<T> {
  return (await fetchOk(url)).json() as Promise<T>;
}

let indexPromise: Promise<IndexFile> | null = null;
export function loadIndex(): Promise<IndexFile> {
  indexPromise ??= json<IndexFile>(`${DATA_URL}index.json`).then((d) => {
    checkIndex(d);
    return d;
  });
  return indexPromise;
}

let trialsPromise: Promise<TrialsFile> | null = null;
export function loadTrials(): Promise<TrialsFile> {
  trialsPromise ??= json<TrialsFile>(`${DATA_URL}trials.json`).then((d) => {
    checkTrials(d);
    return d;
  });
  return trialsPromise;
}

type Row = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === "bigint" ? Number(v) : (v as number));
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? null : num(v);

export function parseEquity(rows: Row[]): Equity {
  const missing = EQUITY_COLUMNS.filter((c) => rows.length && !(c in rows[0]));
  if (missing.length) throw new SchemaError(`equity.parquet : colonnes absentes ${missing.join(", ")}`);
  const col = (k: string) => rows.map((r) => num(r[k]));
  const date = rows.map((r) => r.date as Date);
  return {
    date,
    t: date.map((d) => Math.floor(d.getTime() / 1000)),
    equity_usd: col("equity_usd"),
    equity_eur: col("equity_eur"),
    equity_usd_net: col("equity_usd_net"),
    equity_eur_net: col("equity_eur_net"),
    twr_index: col("twr_index"),
    twr_index_eur: col("twr_index_eur"),
    twr_index_eur_net: col("twr_index_eur_net"),
    regime: rows.map((r) => numOrNull(r.regime)),
    exposure: col("exposure"),
    flow_usd: col("flow_usd"),
    flow_eur: col("flow_eur"),
    invested_eur: col("invested_eur"),
    tax_paid_eur: col("tax_paid_eur"),
  };
}

export function parseTrades(rows: Row[]): Trade[] {
  return rows.map((r) => ({
    entry_date: r.entry_date as Date,
    exit_date: r.exit_date as Date,
    quantity: num(r.quantity),
    gross_pnl_usd: num(r.gross_pnl_usd),
    costs_usd: num(r.costs_usd),
    pnl_usd: num(r.pnl_usd),
    pnl_eur: num(r.pnl_eur),
    regime_at_entry: numOrNull(r.regime_at_entry),
    exit_reason: String(r.exit_reason),
    open_at_end: Boolean(r.open_at_end),
  }));
}

export async function readParquet(buf: ArrayBuffer, columns?: string[]): Promise<Row[]> {
  return (await parquetReadObjects({ file: buf, columns })) as Row[];
}

const metricsCache = new Map<string, Promise<Metrics>>();
/** metrics.json seul (vue Sensibilité : pas de Parquet). */
export function loadMetrics(runId: string, path: string): Promise<Metrics> {
  let p = metricsCache.get(runId);
  if (!p) {
    p = json<Metrics>(`${DATA_URL}${path}/metrics.json`).then((m) => {
      if (m.schema_version !== 2) throw new SchemaError(`${runId} : metrics en schema_version ${m.schema_version}, inconnue.`);
      return m;
    });
    p.catch(() => metricsCache.delete(runId));
    metricsCache.set(runId, p);
  }
  return p;
}

const runCache = new Map<string, Promise<Run>>();
export function loadRun(runId: string, path: string): Promise<Run> {
  let p = runCache.get(runId);
  if (!p) {
    p = (async () => {
      const base = `${DATA_URL}${path}/`;
      const [manifest, metrics] = await Promise.all([
        json<Manifest>(`${base}manifest.json`), json<Metrics>(`${base}metrics.json`)]);
      checkRun(runId, manifest, metrics);           // avant toute lecture de séries
      const [eq, tr] = await Promise.all([
        fetchOk(`${base}equity.parquet`).then((r) => r.arrayBuffer()),
        fetchOk(`${base}trades.parquet`).then((r) => r.arrayBuffer())]);
      return {
        manifest, metrics,
        equity: parseEquity(await readParquet(eq, [...EQUITY_COLUMNS])),
        trades: parseTrades(await readParquet(tr)),
      };
    })();
    p.catch(() => runCache.delete(runId));
    runCache.set(runId, p);
  }
  return p;
}

// ------------------------------------------------------------ vue marché
// Cours seuls, aucune stratégie : data/market/ est indépendant des runs.

let marketIndexPromise: Promise<MarketIndex> | null = null;
export function loadMarketIndex(): Promise<MarketIndex> {
  marketIndexPromise ??= json<MarketIndex>(`${DATA_URL}market/index.json`).then((d) => {
    checkMarketIndex(d);
    return d;
  });
  marketIndexPromise.catch(() => { marketIndexPromise = null; });
  return marketIndexPromise;
}

export function parseMarket(rows: Row[]): Market {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const priceCols = cols.filter((c) => (PRICE_COLUMNS as readonly string[]).includes(c.toLowerCase()));
  if (priceCols.length) throw new SchemaError(`vue marché : colonnes de prix refusées ${priceCols.join(", ")}`);
  const missing = MARKET_COLUMNS.filter((c) => rows.length && !(c in rows[0]));
  if (missing.length) throw new SchemaError(`vue marché : colonnes absentes ${missing.join(", ")}`);
  return {
    t: rows.map((r) => Math.floor((r.date as Date).getTime() / 1000)),
    index_usd: rows.map((r) => num(r.index_usd)),
    index_eur: rows.map((r) => num(r.index_eur)),
    ma200_index: rows.map((r) => numOrNull(r.ma200_index)),
    regime: rows.map((r) => numOrNull(r.regime)),
  };
}

const marketCache = new Map<string, Promise<Market>>();
export function loadMarket(symbol: string, path: string): Promise<Market> {
  let p = marketCache.get(symbol);
  if (!p) {
    p = fetchOk(`${DATA_URL}${path}`).then((r) => r.arrayBuffer())
      .then((buf) => readParquet(buf)).then(parseMarket);
    p.catch(() => marketCache.delete(symbol));
    marketCache.set(symbol, p);
  }
  return p;
}
