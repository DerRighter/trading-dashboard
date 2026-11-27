import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api, ApiError, AuthError, POLL_MS, rememberJob, sessionJobs,
  type ApiStrategy, type ApiUniverse, type Job,
} from "../data/api";
import { buildParams, defaults, fieldsFromSchema, type Field } from "../data/schemaForm";
import { Loading } from "../ui/components";
import { TokenForm, useLocalApi } from "../ui/local";
import { href } from "../ui/state";

interface Catalog { strategies: ApiStrategy[]; universes: ApiUniverse[] }

function useCatalog(token: string | null, refresh: number) {
  const [s, setS] = useState<{ data?: Catalog; error?: Error }>({});
  useEffect(() => {
    if (!token) return;
    let live = true;
    Promise.all([api.strategies(), api.universes()])
      .then(([a, b]) => live && setS({ data: { strategies: a.strategies, universes: b.universes } }),
            (error) => live && setS({ error }));
    return () => { live = false; };
  }, [token, refresh]);
  return s;
}

function FieldInput({ f, value, error, onChange }:
  { f: Field; value: string; error?: string; onChange: (v: string) => void }) {
  const bounds = [f.min !== undefined && `min ${f.min}`, f.max !== undefined && `max ${f.max}`]
    .filter(Boolean).join(" · ");
  let input;
  if (f.kind === "enum")
    input = <select value={value} onChange={(e) => onChange(e.target.value)}>
      {f.options?.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select>;
  else if (f.kind === "boolean")
    input = <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="true">oui</option><option value="false">non</option></select>;
  else
    input = <input type={f.kind === "string" ? "text" : "number"} value={value}
                   step={f.kind === "integer" ? 1 : "any"} min={f.min} max={f.max}
                   onChange={(e) => onChange(e.target.value)} />;
  return (
    <label className={`field${error ? " invalid" : ""}`}>
      <span>{f.name}</span>
      {input}
      <small className="muted">{f.description ?? ""}{bounds && ` (${bounds}, défaut ${String(f.default)})`}</small>
      {error && <small className="err">{error}</small>}
    </label>
  );
}

function JobRow({ job }: { job: Job }) {
  const target = job.symbol ?? job.universe;
  return (
    <tr>
      <td>{job.strategy}</td><td>{target}</td>
      <td><span className={`badge ${job.status === "done" ? "ok" : job.status === "failed" ? "ko" : "neutral"}`}>
        {job.status}</span> <span className="muted">{job.step}
        {job.queue_position ? ` (position ${job.queue_position})` : ""}</span>
        {job.error && <div className="err">{job.error}</div>}</td>
      <td>{job.status === "done" && <a href={href("local", job.id)}>afficher</a>}</td>
    </tr>
  );
}

export function Launch() {
  const { mode, health, token, forgetToken, recheck } = useLocalApi();
  const [refresh, setRefresh] = useState(0);
  const { data: cat, error } = useCatalog(token, refresh);
  const [sid, setSid] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [uni, setUni] = useState("");
  const [sym, setSym] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());
  const [busy, setBusy] = useState(false);

  const strat = cat?.strategies.find((s) => s.id === sid);
  const fields = useMemo(() => (strat ? fieldsFromSchema(strat.params_schema) : []), [strat]);
  useEffect(() => { setValues(defaults(fields)); }, [fields]);
  const { params, errors } = buildParams(fields, values);
  const universe = cat?.universes.find((u) => u.id === uni);

  // suivi par polling des jobs de la session (toutes les 2 s tant qu'un job tourne)
  const poll = useCallback(async () => {
    const ids = sessionJobs();
    const got = await Promise.all(ids.map((id) => api.job(id).catch(() => null)));
    setJobs((prev) => {
      const next = new Map<string, Job>();
      let finished = false;
      for (const j of got) {
        if (!j) continue;
        const before = prev.get(j.id);
        if (before && before.status !== j.status && (j.status === "done" || j.status === "failed")) finished = true;
        next.set(j.id, j);
      }
      if (finished) setRefresh((r) => r + 1);           // compteur d'essais à jour
      return next;
    });
  }, []);
  const active = [...jobs.values()].some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => { if (token && mode === "connected") void poll(); }, [token, mode, poll]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [active, poll]);

  if (mode === "probing") return <Loading what="informations de l'API locale" />;
  if (mode !== "connected")
    return (
      <section className="card">
        <h2>Lancer un run</h2>
        <p>API locale non détectée sur 127.0.0.1:8765 : le site est en lecture seule.
          Lancer <code>python -m api</code> dans trading-bot, puis <button onClick={recheck}>réessayer</button>.</p>
      </section>
    );
  if (!token) return <TokenForm />;
  if (error instanceof AuthError)
    return <section className="card"><p>Jeton refusé par l'API (redémarrée ?).</p>
      <button onClick={forgetToken}>Saisir un nouveau jeton</button></section>;
  if (error) return <section className="card"><p className="err">{error.message}</p></section>;
  if (!cat) return <Loading what="stratégies" />;

  const period = health?.period;
  const periodLabel = period ? `${period.start.slice(0, 4)}–${period.end.slice(0, 4)}` : "2008–2016";
  const runsOnUniverse = strat?.runs_on === "universe";
  const target = runsOnUniverse ? (universe?.portfolio_eligible ? uni : "") : sym;
  const canSubmit = !!strat && !!target && Object.keys(errors).length === 0 && !busy;

  const submit = async () => {
    if (!strat) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const job = await api.submit(runsOnUniverse
        ? { strategy: strat.id, params, universe: uni }
        : { strategy: strat.id, params, symbol: sym, universe: uni || undefined });
      rememberJob(job.id);
      setJobs((m) => new Map(m).set(job.id, job));
    } catch (e) {
      if (e instanceof AuthError) forgetToken();
      setSubmitError(e instanceof ApiError ? `${e.status} : ${e.message}` : String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const sessionList = sessionJobs().map((id) => jobs.get(id)).filter((j): j is Job => !!j);
  return (
    <>
      <section className="card launch">
        <h2>Lancer un run <span className="badge train">période d'exploration {periodLabel}</span></h2>
        <p className="muted">L'API locale ne lance que la période d'exploration : aucun choix de période,
          contrôle et validation impossibles depuis le front. Chaque run est inscrit au journal d'essais.</p>
        <div className="form-grid">
          <label className="field">
            <span>Stratégie</span>
            <select value={sid} onChange={(e) => { setSid(e.target.value); setSym(""); setUni(""); }}>
              <option value="">—</option>
              <optgroup label="Mono-titre">
                {cat.strategies.filter((s) => s.runs_on === "symbol").map((s) =>
                  <option key={s.id} value={s.id}>{s.id} ({s.kind})</option>)}
              </optgroup>
              <optgroup label="Portefeuille">
                {cat.strategies.filter((s) => s.runs_on === "universe").map((s) =>
                  <option key={s.id} value={s.id}>{s.id} ({s.kind})</option>)}
              </optgroup>
            </select>
            {strat && <small className="muted">{strat.description}</small>}
          </label>
          {strat && (
            <label className="field">
              <span>Univers</span>
              <select value={uni} onChange={(e) => { setUni(e.target.value); setSym(""); }}>
                <option value="">—</option>
                {cat.universes.map((u) => (
                  <option key={u.id} value={u.id} disabled={runsOnUniverse && !u.portfolio_eligible}>
                    {u.id} ({u.symbols.length} titre{u.symbols.length > 1 ? "s" : ""})
                    {runsOnUniverse && !u.portfolio_eligible ? " — non éligible" : ""}</option>))}
              </select>
            </label>
          )}
          {strat && !runsOnUniverse && universe && (
            <label className="field">
              <span>Symbole</span>
              <select value={sym} onChange={(e) => setSym(e.target.value)}>
                <option value="">—</option>
                {universe.symbols.map((s) => (
                  <option key={s.symbol} value={s.symbol} disabled={!s.train_eligible}>
                    {s.symbol}{s.last_date ? ` (cache → ${s.last_date})` : ""}
                    {!s.train_eligible ? (s.in_cache ? " — non éligible" : " — absent du cache") : ""}
                  </option>))}
              </select>
            </label>
          )}
        </div>
        {strat && (
          <div className="form-grid">
            {fields.map((f) => (
              <FieldInput key={f.name} f={f} value={values[f.name] ?? ""} error={errors[f.name]}
                          onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} />))}
          </div>
        )}
        <div className="submit-row">
          <button onClick={submit} disabled={!canSubmit}>{busy ? "Envoi…" : "Lancer"}</button>
          {strat && <span className="badge trials" title="Essais journalisés (journal local complet), contrôles à part">
            {strat.trials} essai{strat.trials > 1 ? "s" : ""}{strat.checks ? ` (+${strat.checks} contrôle${strat.checks > 1 ? "s" : ""})` : ""}
          </span>}
          {submitError && <span className="err">{submitError}</span>}
        </div>
      </section>
      {sessionList.length > 0 && (
        <section className="card">
          <h2>Runs de cette session</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Stratégie</th><th>Cible</th><th>Statut</th><th /></tr></thead>
              <tbody>{sessionList.map((j) => <JobRow key={j.id} job={j} />)}</tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
