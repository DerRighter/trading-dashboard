import { useState } from "react";
import {
  api, ApiError, entryFromResults, runFromResults, trialsFromStrategies,
} from "../data/api";
import { loadIndex } from "../data/load";
import { benchmarksFor, hasFlows } from "../data/series";
import type { IndexFile } from "../data/types";
import { loadEntry, type Bundle, type Loaded } from "../data/useRun";
import { Loading, Problem, useAsync } from "../ui/components";
import { TokenForm, useLocalApi } from "../ui/local";
import { RunDetailView } from "./RunDetail";

const EMPTY_INDEX: IndexFile = { schema_version: 3, results_schema_version: 3, generated_at: "",
                                 source: { repo: "", sha: "" }, runs: [] };

/** Run local (API) affiché avec les vues existantes ; benchmarks publiés
 *  de même symbole et période superposés s'ils existent. */
async function loadLocalBundle(jobId: string, sha: string | null): Promise<Bundle> {
  const [res, cat, index] = await Promise.all([
    api.results(jobId), api.strategies(), loadIndex().catch(() => EMPTY_INDEX)]);
  const run = await runFromResults(res);
  const entry = { ...entryFromResults(res), has_flows: hasFlows(run.equity) };
  const pairs = await Promise.all([...benchmarksFor(entry, index.runs).entries()]
    .map(async ([k, e]) => [k, await loadEntry(index, e.run_id).catch(() => null)] as const));
  const benchmarks = new Map(pairs.filter((p): p is readonly [string, Loaded] => p[1] !== null));
  return { index, trials: trialsFromStrategies(cat.strategies, sha), main: { entry, run }, benchmarks };
}

function PublishBar({ jobId }: { jobId: string }) {
  const [state, setState] = useState<{ busy?: boolean; commit?: string; error?: string }>({});
  const publish = async () => {
    if (!window.confirm("Publier ce run ? Export vers trading-dashboard/data et commit LOCAL "
                        + "(aucun push : à faire à la main après vérification).")) return;
    setState({ busy: true });
    try {
      const r = await api.publish(jobId);
      setState({ commit: r.commit });
    } catch (e) {
      setState({ error: e instanceof ApiError ? `${e.status} : ${e.message}` : (e as Error).message });
    }
  };
  return (
    <div className="local-bar">
      <span className="badge local">{state.commit ? "local, publié (commit non poussé)" : "local, non publié"}</span>
      {state.commit
        ? <span>Publié : commit local <code>{state.commit.slice(0, 10)}</code> dans trading-dashboard.
            Push manuel, puis rechargement pour le voir parmi les runs publiés.</span>
        : <button onClick={publish} disabled={state.busy}>{state.busy ? "Publication…" : "Publier"}</button>}
      {state.error && <span className="err">{state.error}</span>}
    </div>
  );
}

export function LocalRun({ jobId }: { jobId: string }) {
  const { mode, token, health } = useLocalApi();
  const ready = mode === "connected" && !!token;
  const { data: b, error } = useAsync<Bundle | null>(
    () => (ready ? loadLocalBundle(jobId, health?.git_sha ?? null) : Promise.resolve(null)),
    [jobId, ready]);
  if (mode === "probing") return <Loading what="informations de l'API locale" />;
  if (mode !== "connected")
    return <p className="notice">Run local : l'API locale n'est pas joignable (lecture seule).</p>;
  if (!token) return <TokenForm />;
  if (error) return <Problem error={error} />;
  if (!b) return <Loading what="résultats du run local" />;
  return <RunDetailView b={b} local><PublishBar jobId={jobId} /></RunDetailView>;
}
