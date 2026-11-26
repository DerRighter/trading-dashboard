import fs from "node:fs";
import path from "node:path";
import { parseWeights } from "../src/data/allocation";
import { parseEquity, parseTrades, readParquet } from "../src/data/load";
import type { IndexFile, Run } from "../src/data/types";

export const DATA = path.resolve(__dirname, "..", "data");

export function index(): IndexFile {
  return JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
}

function ab(p: string): ArrayBuffer {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** Lecture d'un run exporté depuis le disque (mêmes parseurs que le front). */
export async function readRun(runPath: string): Promise<Run> {
  const d = path.join(DATA, runPath);
  const manifest = JSON.parse(fs.readFileSync(path.join(d, "manifest.json"), "utf8"));
  const wp = path.join(d, "weights.parquet");
  return {
    manifest,
    metrics: JSON.parse(fs.readFileSync(path.join(d, "metrics.json"), "utf8")),
    equity: parseEquity(await readParquet(ab(path.join(d, "equity.parquet")))),
    trades: parseTrades(await readParquet(ab(path.join(d, "trades.parquet")))),
    weights: manifest.schema_version === 3
      ? parseWeights(await readParquet(ab(wp)), manifest.symbols ?? [manifest.symbol]) : null,
  };
}

export function find(strategy: string, symbol: string) {
  const r = index().runs.find((x) => x.strategy_id === strategy && x.symbol === symbol);
  if (!r) throw new Error(`${strategy} ${symbol} absent de data/index.json`);
  return r;
}
