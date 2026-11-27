// Client de l'API locale de trading-bot (spec dashboard-v1, étape 5).
// - Détection au chargement : GET /health, timeout 1 s ; tout échec = mode
//   lecture seule, SANS erreur (probeHealth ne lève jamais).
// - Jeton saisi une fois, gardé en sessionStorage uniquement (jamais
//   localStorage, jamais dans l'URL).
// - L'API ne lance que la période d'exploration : aucun champ de période
//   n'est envoyé (le serveur refuserait en 422).
import { parseWeights } from "./allocation";
import { checkRun, EQUITY_COLUMNS } from "./guards";
import { parseEquity, parseTrades, readParquet } from "./load";
import type { IndexRun, Manifest, Metrics, Run, TrialsFile, ViewKey } from "./types";

export const API_URL = "http://127.0.0.1:8765";
export const HEALTH_TIMEOUT_MS = 1000;
export const POLL_MS = 2000;
const TOKEN_KEY = "trading-dashboard:api-token";
const JOBS_KEY = "trading-dashboard:local-jobs";

export interface Health {
  service: "trading-bot-api";
  version: string;
  git_sha: string | null;
  git_dirty: boolean | null;
  schema_versions: number[];
  writes_schema_version: number;
  period: { split: "exploration"; start: string; end: string };
}

export interface JsonSchemaProp {
  type?: string | string[];
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  description?: string;
  title?: string;
}
export interface ApiStrategy {
  id: string;
  description: string;
  kind: "benchmark" | "strategy";
  modes: string[];
  params_schema: { type: "object"; properties?: Record<string, JsonSchemaProp>; required?: string[] };
  runs_on: "symbol" | "universe";
  trials: number;
  checks: number;
}
export interface ApiSymbol {
  symbol: string;
  in_cache: boolean;
  train_eligible: boolean;
  quality_status: string | null;
  last_date: string | null;
  tax_regime: string;
}
export interface ApiUniverse {
  id: string;
  name: string;
  version: number;
  selection: string | null;
  symbols: ApiSymbol[];
  portfolio_eligible: boolean;
}
export type JobStatus = "queued" | "running" | "done" | "failed";
export interface Job {
  id: string;
  kind: "single" | "portfolio";
  strategy: string;
  params: Record<string, unknown>;
  symbol: string | null;
  universe: string | null;
  status: JobStatus;
  step: string;
  queue_position: number | null;
  submitted_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_run_id: string | null;
  error: string | null;
}
export interface ApiResults {
  run_id: string;
  job: Job;
  manifest: Manifest & { git_sha: string; data_hash: string; created_at: string; schema_version: number };
  metrics: Metrics;
  encoding: "parquet+base64";
  equity: string;
  trades: string;
  weights: string | null;
}
export interface RunRequest {
  strategy: string;
  params: Record<string, unknown>;
  symbol?: string;
  universe?: string;
}

export class AuthError extends Error {
  constructor() {
    super("jeton refusé par l'API locale");
    this.name = "AuthError";
  }
}
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ------------------------------------------------------------ stockage

function session(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  try { return session()?.getItem(TOKEN_KEY) ?? null; } catch { return null; }
}
export function setToken(token: string): void {
  try { session()?.setItem(TOKEN_KEY, token.trim()); } catch { /* stockage indisponible */ }
}
export function clearToken(): void {
  try { session()?.removeItem(TOKEN_KEY); } catch { /* idem */ }
}

/** Identifiants des jobs lancés dans cette session (pas de secret). */
export function sessionJobs(): string[] {
  try { return JSON.parse(session()?.getItem(JOBS_KEY) ?? "[]"); } catch { return []; }
}
export function rememberJob(id: string): void {
  try { session()?.setItem(JOBS_KEY, JSON.stringify([id, ...sessionJobs().filter((x) => x !== id)].slice(0, 20))); }
  catch { /* idem */ }
}

// ------------------------------------------------------------- appels

type Fetch = typeof fetch;

/** GET /health avec timeout : renvoie null en cas d'échec, ne lève jamais. */
export async function probeHealth(fetchImpl: Fetch = fetch, timeoutMs = HEALTH_TIMEOUT_MS,
                                  base = API_URL): Promise<Health | null> {
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => { ctl?.abort(); resolve(null); }, timeoutMs);
    });
    const req = fetchImpl(`${base}/health`, { signal: ctl?.signal, cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Health) : null))
      .catch(() => null);
    const h = await Promise.race([req, timeout]);
    return h && h.service === "trading-bot-api" ? h : null;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function call<T>(path: string, init: RequestInit = {}, fetchImpl: Fetch = fetch): Promise<T> {
  const token = getToken();
  if (!token) throw new AuthError();
  const res = await fetchImpl(`${API_URL}${path}`, {
    ...init, cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}),
               Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (res.status === 401) throw new AuthError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = (body as { detail?: unknown }).detail;
    throw new ApiError(res.status, typeof d === "string" ? d : JSON.stringify(d ?? res.statusText));
  }
  return body as T;
}

export const api = {
  strategies: () => call<{ strategies: ApiStrategy[] }>("/strategies"),
  universes: () => call<{ universes: ApiUniverse[] }>("/universes"),
  submit: (req: RunRequest) => call<Job>("/runs", { method: "POST", body: JSON.stringify(req) }),
  job: (id: string) => call<Job>(`/runs/${encodeURIComponent(id)}`),
  results: (id: string) => call<ApiResults>(`/runs/${encodeURIComponent(id)}/results`),
  publish: (id: string) => call<{ run_id: string; commit: string; pushed: false }>(
    `/runs/${encodeURIComponent(id)}/publish`, { method: "POST" }),
};

// ------------------------------------------------- résultats -> vues

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Résultats de l'API -> Run, avec les mêmes gardes et parseurs que les runs publiés. */
export async function runFromResults(r: ApiResults): Promise<Run> {
  const { manifest, metrics } = r;
  checkRun(r.run_id, manifest, metrics);
  return {
    manifest, metrics,
    equity: parseEquity(await readParquet(b64ToBuffer(r.equity), [...EQUITY_COLUMNS])),
    trades: parseTrades(await readParquet(b64ToBuffer(r.trades))),
    weights: r.weights
      ? parseWeights(await readParquet(b64ToBuffer(r.weights)), manifest.symbols ?? [manifest.symbol])
      : null,
  };
}

const VIEW_KEYS: ViewKey[] = ["usd_gross", "eur_gross", "eur_net", "usd_net"];

/** Entrée d'index synthétique d'un run local (non publié). */
export function entryFromResults(r: ApiResults): IndexRun {
  const m = r.manifest;
  const metrics: Record<string, { cagr: number; max_drawdown: number } | null> = {};
  for (const k of VIEW_KEYS) {
    const p = r.metrics.views[k];
    metrics[k] = p ? { cagr: p.cagr, max_drawdown: p.max_drawdown } : null;
  }
  return {
    run_id: m.run_id, path: "", strategy_id: m.strategy_id, strategy_kind: m.strategy_kind,
    mode: m.mode, symbol: m.symbol, symbols: m.symbols, portfolio: m.portfolio,
    schema_version: m.schema_version, universe_id: m.universe.id,
    tax_regime: m.universe.tax_regime as "cto" | "pea", split: m.split, origin: "local",
    sweep_id: m.sweep_id, params: m.params, first_session: m.period.first_session,
    last_session: m.period.last_session, created_at: m.created_at,
    regime_version: m.regime.regime_version, equity_frequency: m.equity_frequency,
    git_sha: m.git_sha, data_hash: m.data_hash, files: {}, has_flows: false,
    metrics: metrics as IndexRun["metrics"], trades_per_year: r.metrics.trades_per_year,
    eligible: r.metrics.opportunities?.eligible ?? null,
  };
}

/** Compteur d'essais tiré de /strategies (journal local complet). */
export function trialsFromStrategies(strategies: ApiStrategy[], sha: string | null): TrialsFile {
  return {
    schema_version: 1, generated_at: new Date().toISOString(),
    source: { repo: "trading-bot (API locale)", sha: sha ?? "" },
    basis: "journal d'essais local complet (API), contrôles comptés à part",
    trials: Object.fromEntries(strategies.map((s) => [s.id, s.trials])),
    checks: Object.fromEntries(strategies.map((s) => [s.id, s.checks])),
    trials_by_split: { train: {}, validation: {} },
  };
}
