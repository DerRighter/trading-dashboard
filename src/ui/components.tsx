import { useEffect, useState, type ReactNode } from "react";
import { SchemaError } from "../data/guards";
import { loadIndex, loadTrials } from "../data/load";
import type { IndexFile, IndexRun, Perf, TrialsFile } from "../data/types";
import { useControls } from "./state";

export const TAX_LABEL = "estimation pour comparaison, pas un calcul fiscal";

export function pct(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(digits)} %`;
}
export function num(x: number | null | undefined, digits = 2): string {
  return x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(digits);
}
export function money(x: number, ccy: string): string {
  return `${Math.round(x).toLocaleString("fr-FR")} ${ccy === "usd" ? "$" : "€"}`;
}

/** État asynchrone simple. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error } {
  const [s, setS] = useState<{ data?: T; error?: Error }>({});
  useEffect(() => {
    let live = true;
    setS({});
    fn().then((data) => live && setS({ data }), (error) => live && setS({ error }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return s;
}

export function useIndex() {
  return useAsync<[IndexFile, TrialsFile]>(() => Promise.all([loadIndex(), loadTrials()]), []);
}

export function Problem({ error }: { error: Error }) {
  const schema = error instanceof SchemaError;
  return (
    <div className={`problem ${schema ? "schema" : ""}`} role="alert">
      <strong>{schema ? "Version de données inconnue" : "Erreur de chargement"}</strong>
      <p>{error.message}</p>
      {schema && <p>Aucun graphique n'est affiché plutôt qu'un graphique faux.</p>}
    </div>
  );
}

export function Loading({ what = "données" }: { what?: string }) {
  return <p className="muted">Chargement des {what}…</p>;
}

/** Compteur d'essais : affiché à côté de toute métrique de performance. */
export function TrialsBadge({ strategy, trials }: { strategy: string; trials: TrialsFile }) {
  const n = trials.trials[strategy] ?? 0;
  const k = trials.checks[strategy] ?? 0;
  return (
    <span className="badge trials" title={`${trials.basis}\nPar split : ${SPLITS.map((s) => `${s} ${trials.trials_by_split[s]?.[strategy] ?? 0}`).join(" · ")}`}>
      {n} essai{n > 1 ? "s" : ""}{k ? ` (+${k} contrôle${k > 1 ? "s" : ""})` : ""}
    </span>
  );
}

const SPLITS = ["train", "exploration", "control", "validation"] as const;

export function SplitBadge({ split }: { split: string }) {
  if (split === "validation") return <span className="badge validation">VALIDATION</span>;
  if (split === "control") return <span className="badge control">CONTRÔLE 2017-2021</span>;
  return <span className="badge train">{split}</span>;
}

export function EligibilityBadge({ run }: { run: IndexRun }) {
  const e = run.eligible;
  if (e === true) return <span className="badge ok">éligible</span>;
  if (e === false) return <span className="badge ko">non éligible</span>;
  return <span className="badge neutral" title="Seuil d'éligibilité pas encore fixé (rapport d'opportunités)">éligibilité non fixée</span>;
}

export function FrequencyBadge({ frequency }: { frequency: string }) {
  return frequency === "weekly" ? <span className="badge neutral">données hebdomadaires</span> : null;
}

export function NetNotice() {
  const { net } = useControls();
  return net ? <p className="notice">Net : impôt estimé — {TAX_LABEL}.</p> : null;
}

export function ValidationFrame({ split, children }: { split: string; children: ReactNode }) {
  return <div className={split === "validation" ? "validation-frame" : undefined}>{children}</div>;
}

export function PerfCells({ p }: { p: Perf | undefined }) {
  return (
    <>
      <td className="num">{pct(p?.cagr)}</td>
      <td className="num">{pct(p?.max_drawdown)}</td>
      <td className="num">{num(p?.sharpe)}</td>
    </>
  );
}
