// Formats produits par trading-bot (tools/export_results.py, résultats v2).

export type Ccy = "usd" | "eur";
export type StrategyKind = "benchmark" | "strategy";
export type Split = "train" | "validation";
export type Frequency = "daily" | "weekly";
export const BENCHMARKS = ["bh", "bh_dca", "ma200_long_cash"] as const;
export type BenchmarkId = (typeof BENCHMARKS)[number];

export interface IndexRun {
  run_id: string;
  path: string;
  strategy_id: string;
  strategy_kind: StrategyKind;
  mode: string;
  symbol: string;
  universe_id: string;
  tax_regime: "cto" | "pea";
  split: Split;
  origin: "local" | "sweep";
  sweep_id: string | null;
  params: Record<string, unknown>;
  first_session: string;
  last_session: string;
  created_at: string;
  regime_version: string;
  equity_frequency: Frequency;
  git_sha: string;
  data_hash: string;
  files: Record<string, string>;
  eligible?: boolean | null;          // absent de index.json v1 : « non fixée »
}

export interface IndexFile {
  schema_version: number;
  results_schema_version: number;
  generated_at: string;
  source: { repo: string; sha: string };
  runs: IndexRun[];
}

export type Counts = Record<string, number>;
export interface TrialsFile {
  schema_version: number;
  generated_at: string;
  source: { repo: string; sha: string };
  basis: string;
  trials: Counts;
  checks: Counts;
  trials_by_split: { train: Counts; validation: Counts };
}

export interface Perf {
  twr_total: number;
  cagr: number;
  sharpe: number | null;
  sortino: number | null;
  max_drawdown: number;
  irr: number | null;
  capital_invested: number;
  final_value: number;
  gain: number;
}
export type ViewKey = "usd_gross" | "eur_gross" | "usd_net" | "eur_net";
export interface RegimeBlock {
  sessions: number;
  share: number;
  ann_return: number | null;
  ann_vol: number | null;
  sharpe: number | null;
  exposure_mean: number | null;
}
export interface Delta { cagr: number | null; sharpe: number | null; max_drawdown: number | null; twr_total: number | null }

export interface Metrics {
  schema_version: number;
  run_id: string;
  views: Record<ViewKey, Perf>;
  trades_total: number;
  trades_per_year: number;
  exposure_mean: number;
  gross_pnl_usd: number;
  costs_usd: number;
  edge_to_cost_ratio: number | null;
  tax: { label: string; regime: string; mode: string; total_tax_eur: number; terminal_tax_eur: number };
  by_regime: Record<"usd_gross" | "eur_gross" | "eur_net", Record<"bull" | "bear" | "undefined", RegimeBlock>>;
  benchmark_deltas: Record<string, Record<ViewKey, Delta>>;
  opportunities: { entries_total: number; entries_per_year_mean: number; eligible: boolean | null; threshold: number | null };
}

export interface Manifest {
  run_id: string;
  schema_version: number;
  strategy_id: string;
  strategy_kind: StrategyKind;
  params: Record<string, unknown>;
  mode: string;
  symbol: string;
  universe: { id: string; name: string; version: number; tax_regime: string };
  regime: { id: string; version: number; regime_version: string };
  period: { start: string; end: string | null; first_session: string; last_session: string };
  split: Split;
  origin: string;
  sweep_id: string | null;
  equity_frequency: Frequency;
  engine: { initial_eur: number };
  tax: { label: string };
}

/** Colonnes de equity.parquet (v2), en tableaux parallèles. */
export interface Equity {
  date: Date[];
  t: number[];                        // date en secondes UTC (axe des graphiques)
  equity_usd: number[];
  equity_eur: number[];
  equity_usd_net: number[];
  equity_eur_net: number[];
  twr_index: number[];
  twr_index_eur: number[];
  twr_index_eur_net: number[];
  regime: (number | null)[];
  exposure: number[];
  flow_usd: number[];
  flow_eur: number[];
  invested_eur: number[];
  tax_paid_eur: number[];
}

export interface Trade {
  entry_date: Date;
  exit_date: Date;
  quantity: number;
  gross_pnl_usd: number;
  costs_usd: number;
  pnl_usd: number;
  pnl_eur: number;
  regime_at_entry: number | null;
  exit_reason: string;
  open_at_end: boolean;
}

export interface Run {
  manifest: Manifest;
  metrics: Metrics;
  equity: Equity;
  trades: Trade[];
}
