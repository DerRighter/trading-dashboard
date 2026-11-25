// Garde de version : une version inconnue affiche un message, jamais un
// graphique faux (spec, règles d'affichage).

export const INDEX_SCHEMA = 1;
export const RESULTS_SCHEMA = 2;
export const TRIALS_SCHEMA = 1;
export const FREQUENCIES = ["daily", "weekly"] as const;

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export function checkIndex(doc: { schema_version?: unknown; results_schema_version?: unknown }): void {
  if (doc.schema_version !== INDEX_SCHEMA)
    throw new SchemaError(`index.json : schema_version ${String(doc.schema_version)} inconnue (supportée : ${INDEX_SCHEMA}).`);
  if (doc.results_schema_version !== RESULTS_SCHEMA)
    throw new SchemaError(`index.json : schéma de résultats v${String(doc.results_schema_version)} inconnu (supporté : v${RESULTS_SCHEMA}).`);
}

export function checkTrials(doc: { schema_version?: unknown }): void {
  if (doc.schema_version !== TRIALS_SCHEMA)
    throw new SchemaError(`trials.json : schema_version ${String(doc.schema_version)} inconnue (supportée : ${TRIALS_SCHEMA}).`);
}

export function checkRun(runId: string, manifest: { schema_version?: unknown; equity_frequency?: unknown },
                         metrics: { schema_version?: unknown }): void {
  if (manifest.schema_version !== RESULTS_SCHEMA)
    throw new SchemaError(`${runId} : manifest en schema_version ${String(manifest.schema_version)}, inconnue (supportée : ${RESULTS_SCHEMA}). Données non affichées.`);
  if (metrics.schema_version !== RESULTS_SCHEMA)
    throw new SchemaError(`${runId} : metrics en schema_version ${String(metrics.schema_version)}, inconnue. Données non affichées.`);
  if (!FREQUENCIES.includes(manifest.equity_frequency as (typeof FREQUENCIES)[number]))
    throw new SchemaError(`${runId} : equity_frequency « ${String(manifest.equity_frequency)} » inconnue. Données non affichées.`);
}

export const EQUITY_COLUMNS = [
  "date", "equity_usd", "equity_eur", "equity_usd_net", "equity_eur_net", "twr_index",
  "twr_index_eur", "twr_index_eur_net", "regime", "exposure", "flow_usd", "flow_eur",
  "invested_eur", "tax_paid_eur",
] as const;
