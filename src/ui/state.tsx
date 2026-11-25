import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BenchmarkId, Ccy } from "../data/types";

export type Theme = "light" | "dark";

export interface Controls {
  ccy: Ccy;
  net: boolean;
  ref: BenchmarkId;
  theme: Theme;
  set: (patch: Partial<Omit<Controls, "set">>) => void;
}

const KEY = "trading-dashboard:controls";
const Ctx = createContext<Controls | null>(null);

function initial(): Omit<Controls, "set"> {
  const sys: Theme = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark" : "light";
  const base = { ccy: "eur" as Ccy, net: false, ref: "bh" as BenchmarkId, theme: sys };
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return base;
  }
}

export function ControlsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
  }, [state]);
  const value = useMemo<Controls>(() => ({ ...state, set: (p) => setState((s) => ({ ...s, ...p })) }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useControls(): Controls {
  const c = useContext(Ctx);
  if (!c) throw new Error("ControlsProvider manquant");
  return c;
}

/** Couleurs lues dans les variables CSS du thème courant (graphiques). */
export function themeColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    bg: v("--surface"), text: v("--text"), muted: v("--muted"), grid: v("--grid"),
    bear: v("--bear"), series: [1, 2, 3, 4, 5, 6].map((i) => v(`--s${i}`)),
    pos: v("--pos"), neg: v("--neg"),
  };
}

// ----------------------------------------------------------- routage hash

export interface Route {
  name: string;
  params: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] ?? "", params: parts.slice(1), query: new URLSearchParams(qs ?? "") };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return r;
}

export const href = (...parts: string[]) => `#/${parts.map(encodeURIComponent).join("/")}`;
