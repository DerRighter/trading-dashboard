import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearToken, getToken, probeHealth, setToken, type Health } from "../data/api";

export type LocalMode = "probing" | "connected" | "readonly";

export interface LocalApi {
  mode: LocalMode;
  health: Health | null;
  token: string | null;
  saveToken: (t: string) => void;
  forgetToken: () => void;
  recheck: () => void;
}

const Ctx = createContext<LocalApi | null>(null);

/** Détecte l'API locale au chargement (GET /health, 1 s) ; échec = lecture seule, sans erreur. */
export function LocalApiProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [mode, setMode] = useState<LocalMode>("probing");
  const [token, setTok] = useState<string | null>(getToken);
  const recheck = useCallback(() => {
    let live = true;
    probeHealth().then((h) => {
      if (!live) return;
      setHealth(h);
      setMode(h ? "connected" : "readonly");
    });
    return () => { live = false; };
  }, []);
  useEffect(() => recheck(), [recheck]);
  const value = useMemo<LocalApi>(() => ({
    mode, health, token, recheck: () => { recheck(); },
    saveToken: (t) => { setToken(t); setTok(getToken()); },
    forgetToken: () => { clearToken(); setTok(null); },
  }), [mode, health, token, recheck]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocalApi(): LocalApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("LocalApiProvider manquant");
  return c;
}

export function ModeBadge() {
  const { mode, health } = useLocalApi();
  if (mode === "probing") return <span className="badge neutral">détection…</span>;
  if (mode === "connected")
    return <span className="badge ok" title={`API locale ${health?.version} · trading-bot@${health?.git_sha?.slice(0, 8) ?? "?"}`}>
      local connecté</span>;
  return <span className="badge neutral" title="API locale non détectée sur 127.0.0.1:8765">lecture seule</span>;
}

/** Saisie du jeton (une fois par session, sessionStorage). */
export function TokenForm() {
  const { saveToken } = useLocalApi();
  const [v, setV] = useState("");
  return (
    <form className="card token-form" onSubmit={(e) => { e.preventDefault(); if (v.trim()) saveToken(v); }}>
      <h2>Jeton de l'API locale</h2>
      <p className="muted">Affiché dans la console de <code>python -m api</code>. Gardé pour cette session
        d'onglet seulement (sessionStorage), jamais dans l'URL.</p>
      <input type="password" autoComplete="off" value={v} onChange={(e) => setV(e.target.value)}
             aria-label="Jeton" placeholder="jeton" />
      <button type="submit" disabled={!v.trim()}>Enregistrer</button>
    </form>
  );
}
