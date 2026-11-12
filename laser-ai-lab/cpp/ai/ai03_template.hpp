#pragma once
// 1. Copy this file and implement the function.
// 2. Include it in cpp/registry.hpp and add ONE descriptor row.
// 3. Run scripts/build.sh. All screens discover it automatically.
namespace laser {
inline int exampleAI(const State& state,Context& ctx){
    // Use apply(), trace(), plan(), and simulate(): never reimplement rules.
    // Every simulate() call is counted. Honor ctx.budget for fair comparisons.
    // Return a mirror ID in [0, 99], NOT a board-cell index.
    if(finished(state))return -1;
    return ctx.rng.below(MIRRORS);
}
}
