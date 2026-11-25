import { useCallback, useMemo, useState } from "react";
import { Legend, LineChart, type LineSpec } from "../charts/LineChart";
import { rebase } from "../data/series";
import { useRunBundle } from "../data/useRun";
import { Loading, NetNotice, pct, Problem, TrialsBadge, ValidationFrame } from "../ui/components";
import { RunHeader, useTwrLines } from "./RunDetail";

const APPROX = "approximation : stratégie déjà en cours";
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

/** Point d'entrée : courbes rebasées à 100 à une date choisie sur le graphique. */
export function EntryPoint({ id }: { id: string }) {
  const { data: b, error } = useRunBundle(id);
  const { lines, missing, mainReason } = useTwrLines(b);
  const [entry, setEntry] = useState<number | null>(null);
  const onClick = useCallback((t: number) => setEntry(t), []);

  const shown = useMemo<LineSpec[]>(() => {
    if (entry === null) return lines.map((l) => ({ ...l, v: l.v.map((x) => x * 100) }));
    return lines.flatMap((l) => {
      const r = rebase(l, entry);
      return r ? [{ ...l, ...r }] : [];
    });
  }, [lines, entry]);

  if (error) return <Problem error={error} />;
  if (!b) return <Loading what="données du run" />;
  const m = b.main.run.manifest;
  const t = lines[0]?.t ?? [];
  const lastT = t[t.length - 1];
  const years = entry !== null && lastT ? (lastT - entry) / (365.25 * 86400) : 0;

  return (
    <ValidationFrame split={m.split}>
      <RunHeader b={b} />
      <NetNotice />
      <section className="card">
        <h2>Point d'entrée <TrialsBadge strategy={m.strategy_id} trials={b.trials} /></h2>
        {mainReason ? <div className="unavailable">{mainReason}</div> : (
          <>
            <div className="filters">
              <label>Date d'entrée
                <input type="date" min={t.length ? day(t[0]) : undefined} max={lastT ? day(lastT) : undefined}
                       value={entry !== null ? day(entry) : ""}
                       onChange={(e) => setEntry(e.target.value ? Date.parse(e.target.value) / 1000 : null)} />
              </label>
              {entry !== null && <button className="theme" onClick={() => setEntry(null)}>réinitialiser</button>}
              <span className="muted">ou cliquer sur le graphique</span>
            </div>
            <p className="notice"><strong>{APPROX}</strong> : les courbes reprennent la stratégie telle qu'elle
              tournait depuis le début de la période (positions déjà ouvertes, impôts déjà payés), rebasées à
              100 à la date choisie ; ce n'est pas un nouveau démarrage.</p>
            <Legend items={shown} />
            <LineChart lines={shown} logScale onClickTime={onClick} marker={entry} />
            {missing.map((x) => <p key={x} className="notice">{x}</p>)}
            {entry !== null && (
              <table>
                <thead><tr><th>Depuis le {day(entry)} ({years.toFixed(1)} ans)</th>
                  <th className="num">Valeur finale (base 100)</th><th className="num">Rendement total</th>
                  <th className="num">Annualisé</th></tr></thead>
                <tbody>
                  {shown.map((l) => {
                    const last = l.v[l.v.length - 1];
                    return (
                      <tr key={l.name}><td>{l.name}</td><td className="num">{last.toFixed(1)}</td>
                        <td className="num">{pct(last / 100 - 1)}</td>
                        <td className="num">{years > 0 ? pct(Math.pow(last / 100, 1 / years) - 1) : "—"}</td></tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </ValidationFrame>
  );
}
