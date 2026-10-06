// Web Worker: runs Scenario Lab simulations off the main thread.
import { simulateMatches, type Pack, type Scenario } from "./sim.ts";
import { summarizeLab } from "./summary.ts";

type Req = { id: number; pack: Pack; scenario: Scenario; n: number; seed: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, pack, scenario, n, seed } = e.data;
  try {
    const t0 = performance.now();
    const sims = simulateMatches(pack, n, scenario, seed);
    (self as unknown as Worker).postMessage({ id, summary: summarizeLab(pack, sims), ms: performance.now() - t0 });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
