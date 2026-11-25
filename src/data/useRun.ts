import { useAsync } from "../ui/components";
import { loadIndex, loadRun, loadTrials } from "./load";
import { benchmarksFor } from "./series";
import type { IndexFile, IndexRun, Run, TrialsFile } from "./types";

export interface Loaded {
  entry: IndexRun;
  run: Run;
}
export interface Bundle {
  index: IndexFile;
  trials: TrialsFile;
  main: Loaded;
  benchmarks: Map<string, Loaded>;     // même symbole, split et période
}

export async function loadEntry(index: IndexFile, id: string): Promise<Loaded> {
  const entry = index.runs.find((r) => r.run_id === id);
  if (!entry) throw new Error(`run ${id} absent de index.json`);
  return { entry, run: await loadRun(entry.run_id, entry.path) };
}

export function useRunBundle(id: string) {
  return useAsync<Bundle>(async () => {
    const [index, trials] = await Promise.all([loadIndex(), loadTrials()]);
    const main = await loadEntry(index, id);
    const pairs = await Promise.all([...benchmarksFor(main.entry, index.runs).entries()]
      .map(async ([k, e]) => [k, await loadEntry(index, e.run_id)] as const));
    return { index, trials, main, benchmarks: new Map(pairs) };
  }, [id]);
}
