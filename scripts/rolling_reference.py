"""Référence Python des fenêtres glissantes (vue 4), calcul INDÉPENDANT du TS.

    python scripts/rolling_reference.py   (pandas + pyarrow requis)

Écrit tests/fixtures/rolling_reference.json : pour ma200_long_cash vs bh sur
QQQ (indice TWR EUR brut), N = 1, 2, 3 ans, chaque fenêtre (départ, fin,
rendements annualisés, écart) et le résumé. tests/rolling.test.ts compare le
calcul TypeScript à cette référence.

Définition : départs = première séance de chaque mois ; fin visée = départ +
N ans (pd.DateOffset) ; fenêtre retenue si fin visée <= dernière séance ;
fin = dernière séance <= fin visée ; annualisé = (I_fin / I_départ)^(1/N) − 1.
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "tests" / "fixtures" / "rolling_reference.json"
COLUMN = "twr_index_eur"


def run_path(strategy: str, symbol: str) -> str:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    hits = sorted((r for r in index["runs"] if r["strategy_id"] == strategy and r["symbol"] == symbol),
                  key=lambda r: r["created_at"])
    return hits[-1]["path"]


def series(path: str) -> pd.Series:
    df = pd.read_parquet(DATA / path / "equity.parquet", columns=["date", COLUMN])
    return df.set_index("date")[COLUMN]


def windows(s: pd.Series, r: pd.Series, years: int) -> list[dict]:
    df = pd.concat({"s": s, "r": r}, axis=1, join="inner").sort_index()
    last = df.index[-1]
    starts = df.groupby([df.index.year, df.index.month]).head(1).index
    out = []
    for d0 in starts:
        target = d0 + pd.DateOffset(years=years)
        if target > last:
            break
        d1 = df.index[df.index <= target][-1]
        a = (df.at[d1, "s"] / df.at[d0, "s"]) ** (1 / years) - 1
        b = (df.at[d1, "r"] / df.at[d0, "r"]) ** (1 / years) - 1
        out.append({"start": d0.strftime("%Y-%m-%d"), "end": d1.strftime("%Y-%m-%d"),
                    "ann_strategy": a, "ann_reference": b, "delta": a - b})
    return out


def main() -> None:
    sp, rp = run_path("ma200_long_cash", "QQQ"), run_path("bh", "QQQ")
    s, r = series(sp), series(rp)
    doc = {"strategy_path": sp, "reference_path": rp, "column": COLUMN, "windows": {}}
    for n in (1, 2, 3):
        ws = windows(s, r, n)
        d = pd.Series([w["delta"] for w in ws])
        doc["windows"][str(n)] = {"n": len(ws), "win_share": float((d > 0).mean()),
                                  "mean": float(d.mean()), "median": float(d.median()),
                                  "items": ws}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1), encoding="utf-8")
    print(f"{OUT} : " + ", ".join(f"N={k} {v['n']} fenêtres, {v['win_share']:.1%} gagnantes"
                                  for k, v in doc["windows"].items()))


if __name__ == "__main__":
    main()
