/** Optional JavaScript agents: edit only this file; no Wasm rebuild required.
 * See docs/ADDING_AI.md. IDs must be unique (AI26, AI27, ...).
 * Keep export const extensions = [] when you do not need additional agents.
 */
export const extensions = [
  /*
  {
    id: 'AI26', name: 'My Agent', version: '1.0.0', family: 'custom',
    summary: 'Write your agent description here.',
    choose({ state, engine, rng, options, simulate, hasBudget }) {
      // state is a private Int32Array; info(state).mirrorCount gives M.
      // simulate(state, move) returns { state, hits }, counting the work.
      // hasBudget() is a cooperative time/node-budget check.
      // Return an integer mirror ID, or { move: integer, ...diagnostics }.
      return rng() % state[4];
    }
  }
  */
];
