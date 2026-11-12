#pragma once
namespace laser {
inline int randomAI(const State& s,Context& ctx){
    if(finished(s))return -1;
    ctx.stats.considered=MIRRORS;
    return ctx.rng.below(MIRRORS); // exactly uniform, rejection-sampled PRNG
}
}
