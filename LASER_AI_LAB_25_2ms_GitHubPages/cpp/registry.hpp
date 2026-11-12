#pragma once
#include "algorithms.hpp"
namespace laser {
using ChooseFunction=int(*)(const State&,Context&);
struct Agent {const char* id;const char* name;ChooseFunction choose;};
constexpr Agent AGENTS[]={
 {"AI01","Random",randomAI},{"AI02","Rush Planner",rushAI},
 {"AI03","Flat Monte Carlo",monteCarloAI},{"AI04","Beam Minimax",beamAI},
 {"AI05","Alpha-Beta",alphaBetaAI},{"AI06","Epsilon MCTS",mctsAI},
 {"AI07","Greedy",greedyAI},{"AI08","Iterative Alpha-Beta",iterativeAI},
 {"AI09","Beam + Rollout",hybridAI},{"AI10","Genetic Planner",geneticAI},
 {"AI11","Simulated Annealing",annealingAI},{"AI12","Hill Climbing",hillAI},
 {"AI13","Expectimax",expectimaxAI},{"AI14","Plain Negamax",negamaxAI},
 {"AI15","UCT-MCTS",uctAI},{"AI16","Progressive Widening",wideningAI},
 {"AI17","Transposition Alpha-Beta",transpositionAI},{"AI18","Threat Defense",threatAI},
 {"AI19","Laser-Aware Beam",laserAwareAI},{"AI20","Budgeted Ensemble",ensembleAI},
 {"AI21","Proof-Number Search",proofAI},{"AI22","Nested Rollout",nestedAI},
 {"AI23","RAVE-MCTS",raveAI},{"AI24","Heuristic PUCT",puctAI},
 {"AI25","Learned Linear Value",learnedAI}
};
constexpr int AGENT_COUNT=sizeof(AGENTS)/sizeof(Agent);
}
