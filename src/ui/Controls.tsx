import { BENCHMARKS } from "../data/types";
import { TAX_LABEL } from "./components";
import { useControls } from "./state";

function Seg<T extends string>({ value, options, onChange, label }:
  { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} className={v === value ? "on" : ""} aria-pressed={v === value}
                onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function Controls() {
  const c = useControls();
  return (
    <div className="controls">
      <Seg label="Devise" value={c.ccy} options={[["usd", "USD"], ["eur", "EUR"]]}
           onChange={(ccy) => c.set({ ccy })} />
      <Seg label="Brut ou net" value={c.net ? "net" : "gross"} options={[["gross", "Brut"], ["net", "Net"]]}
           onChange={(v) => c.set({ net: v === "net" })} />
      <label className="ref">
        Référence
        <select value={c.ref} onChange={(e) => c.set({ ref: e.target.value as typeof c.ref })}>
          {BENCHMARKS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <button className="theme" onClick={() => c.set({ theme: c.theme === "dark" ? "light" : "dark" })}
              aria-label="Basculer le thème">{c.theme === "dark" ? "☀ clair" : "☾ sombre"}</button>
      {c.net && <span className="net-label" title={TAX_LABEL}>net : {TAX_LABEL}</span>}
    </div>
  );
}
