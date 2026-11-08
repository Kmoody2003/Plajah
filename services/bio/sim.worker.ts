// Runs Biology Lab simulations off the main thread, so sliders and the page stay responsive
// while a big model integrates. Messages carry plain data (a BioModel is plain JSON).

import { simulate, simulateStochastic, type BioModel, type SimOptions, type StochasticOptions } from './sbml';

export type SimRequest = { id: number; model: BioModel; mode: 'ode'; options: SimOptions } | { id: number; model: BioModel; mode: 'stochastic'; options: StochasticOptions };
export type SimReply = { id: number; ok: true; result: ReturnType<typeof simulate> & { events?: number } } | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const req = e.data;
  try {
    const result = req.mode === 'stochastic' ? simulateStochastic(req.model, req.options) : simulate(req.model, req.options);
    // Solution.y (raw state arrays) is not needed by the page and is the bulk of the data.
    (self as unknown as Worker).postMessage({ id: req.id, ok: true, result: { ...result, solution: { ...result.solution, y: [] } } } satisfies SimReply);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, error: (err as Error)?.message || String(err) } satisfies SimReply);
  }
};
