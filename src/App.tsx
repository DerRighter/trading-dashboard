import { Controls } from "./ui/Controls";
import { href, useRoute } from "./ui/state";
import { RunList } from "./views/RunList";
import { RunDetail } from "./views/RunDetail";
import { Compare } from "./views/Compare";
import { Rolling } from "./views/Rolling";
import { EntryPoint } from "./views/EntryPoint";
import { Sensitivity } from "./views/Sensitivity";
import { Market } from "./views/Market";

const TABS: [string, string][] = [["", "Runs"], ["compare", "Comparaison"], ["sensitivity", "Sensibilité"], ["market", "Marché"]];

export function App() {
  const route = useRoute();
  let view;
  switch (route.name) {
    case "run": view = <RunDetail id={route.params[0]} />; break;
    case "compare": view = <Compare ids={(route.query.get("ids") ?? "").split(",").filter(Boolean)} />; break;
    case "rolling": view = <Rolling id={route.params[0]} />; break;
    case "entry": view = <EntryPoint id={route.params[0]} />; break;
    case "sensitivity": view = <Sensitivity />; break;
    case "market": view = <Market symbol={route.params[0]} />; break;
    default: view = <RunList />;
  }
  return (
    <>
      <header className="top">
        <h1>Backtests swing</h1>
        <nav className="tabs">
          {TABS.map(([name, label]) => (
            <a key={name} href={name ? href(name) : "#/"} className={route.name === name ? "on" : ""}>{label}</a>
          ))}
        </nav>
        <Controls market={route.name === "market"} />
      </header>
      <main>{view}</main>
    </>
  );
}
