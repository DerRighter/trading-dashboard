import { useMemo, useState } from "react";
import { Legend, LineChart, type LineSpec, type VLine } from "../charts/LineChart";
import { loadMarket, loadMarketIndex } from "../data/load";
import { bearZones } from "../data/series";
import type { Market as MarketData, MarketIndex } from "../data/types";
import { Loading, Problem, useAsync } from "../ui/components";
import { href, themeColors, useControls } from "../ui/state";

export const MARKET_BANNER = "Cours seuls, aucune stratégie";
export const TRAIN_END_LABEL = "fin de la période train";

/** Secondes UTC d'une date ISO (AAAA-MM-JJ). */
const isoToT = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);

/** Séries de la vue marché pour la devise : indice, et MM200 en USD seulement
 *  (calculée sur le cours USD, donc pas dans l'échelle de l'indice EUR). */
export function marketLines(m: MarketData, ccy: "usd" | "eur", colors?: string[]): LineSpec[] {
  const lines: LineSpec[] = [{ name: `indice ${ccy.toUpperCase()} (base 100)`, t: m.t,
    v: ccy === "usd" ? m.index_usd : m.index_eur, color: colors?.[0] }];
  if (ccy === "usd") lines.push({ name: "MM200", t: m.t, v: m.ma200_index.map((x) => x ?? NaN), color: colors?.[1], width: 1, dashed: true });
  return lines;
}

/** Vue « Marché » : cours seuls rebasés, MM200, régime baissier grisé.
 *  Aucune métrique de performance, aucun lien vers des runs. */
export function Market({ symbol }: { symbol?: string }) {
  const idx = useAsync<MarketIndex>(() => loadMarketIndex(), []);
  const entry = idx.data?.symbols.find((s) => s.symbol === (symbol ?? idx.data?.symbols[0]?.symbol));
  const series = useAsync<MarketData | undefined>(
    () => (entry ? loadMarket(entry.symbol, entry.path) : Promise.resolve(undefined)), [entry?.symbol]);
  const { ccy, theme } = useControls();
  const [log, setLog] = useState(true);

  const colors = useMemo(() => themeColors().series, [theme]);
  const lines = useMemo(() => (series.data ? marketLines(series.data, ccy, colors) : []), [series.data, ccy, colors]);
  const zones = useMemo(() => (series.data ? bearZones(series.data) : []), [series.data]);
  const vlines = useMemo<VLine[]>(() => (idx.data
    ? [{ t: isoToT(idx.data.train_period.train_end), label: `${TRAIN_END_LABEL} (${idx.data.train_period.train_end})` }]
    : []), [idx.data]);

  const banner = <div className="market-banner" role="note">{MARKET_BANNER}</div>;
  if (idx.error) return <>{banner}<Problem error={idx.error} /></>;
  if (!idx.data) return <>{banner}<Loading what="cours" /></>;
  if (!entry) return <>{banner}<Problem error={new Error(`Symbole « ${symbol} » absent de data/market/index.json.`)} /></>;

  return (
    <>
      {banner}
      <section className="card">
        <div className="filters">
          <label>Symbole
            <select value={entry.symbol} onChange={(e) => { location.hash = href("market", e.target.value); }}>
              {idx.data.symbols.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> échelle log</label>
          <span className="muted">{entry.first_date} → {entry.last_date}
            {entry.usable_from ? ` · utilisable dès ${entry.usable_from}` : ""}</span>
        </div>
        <h2>{entry.symbol} — indice {ccy.toUpperCase()} rebasé à 100 au {entry.first_date}</h2>
        {series.error ? <Problem error={series.error} /> : !series.data ? <Loading what="cours" /> : (
          <>
            <Legend items={lines} />
            <LineChart lines={lines} zones={zones} vlines={vlines} logScale={log} height={420} />
          </>
        )}
        <p className="muted">Zones grisées : régime MM200 baissier (valeur effective, appliquée à J ;
          {" "}{idx.data.regime_version}). Ligne verticale : {TRAIN_END_LABEL} ({idx.data.train_period.train_end}).
          {ccy === "eur" ? " MM200 et régime calculés sur le cours USD : la MM200 n'est tracée qu'en USD." : ""}
        </p>
        <p className="muted">Export du {idx.data.generated_at.slice(0, 10)} depuis trading-bot@{idx.data.source.sha.slice(0, 7)}.</p>
      </section>
    </>
  );
}
