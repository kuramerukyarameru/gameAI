#pragma once
#include "ai/ai01_random.hpp"
#include "ai/ai02_rush.hpp"
// #include "ai/ai03_template.hpp"
namespace laser {
using ChooseFunction=int(*)(const State&,Context&);
struct Agent {const char* id;const char* name;const char* description;const char* version;ChooseFunction choose;};
constexpr Agent AGENTS[]={
    {"AI01","Random","Uniform random mirror selection. A reproducible baseline.","1.0.0",randomAI},
    {"AI02","Rush Planner","Capture now, check opponent replies, then align a short verified laser route. No optimality guarantee.","1.0.0",rushAI},
    // {"AI03","My AI","Describe the method here.","1.0.0",exampleAI},
};
constexpr int AGENT_COUNT=sizeof(AGENTS)/sizeof(AGENTS[0]);
}
