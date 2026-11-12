/** Copy, rename, import in custom.js. No build is required for a JS AI. */
export default {
  id: 'AI03', name: 'My algorithm', version: '0.1.0',
  description: 'Replace this with a description of your method.',
  choose(state, context) {
    // state: a private Int32Array copy. See runtime/engine.js (ABI).
    // context.engine: the SAME C++ rule engine used by all other agents.
    // context.simulate(state, mirrorId): counted simulation, budget enforced.
    // context.budget: maximum number of calls to simulate per decision.
    // context.random(): a reproducible unsigned 32-bit integer.
    // Return either a mirror index (0..99) or {move, ...diagnostics}.
    // Do not use Math.random() or wall-clock stopping for reproducible tests.
    return context.random() % 100;
  },
};
