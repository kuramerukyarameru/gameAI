#pragma once
#include "engine.hpp"
#include "model.hpp"
namespace laser {
// All searches operate on private state copies. Only Engine::play changes a game.
inline int randomAI(const State& s,Context& c){return c.rng.below(s.mirrorCount);}
struct Ranked {int move;double value;};
inline void insertRank(Ranked* a,int& n,int cap,int m,double v){
    int k=n;if(k>=cap){if(v<=a[cap-1].value)return;k=cap-1;}else n++;
    while(k>0&&v>a[k-1].value){a[k]=a[k-1];k--;}a[k]={m,v};
}
inline int rankMoves(const State& s,Context& c,Ranked* out,int cap,int root=-1,bool learned=false){
    if(root<0)root=s.turn%2;
    int order[MAX_MIRRORS],n=0;shuffle(order,s.mirrorCount,c.rng);
    for(int i=0;i<s.mirrorCount&&c.more();i++){
        State t;if(!simulate(s,order[i],t,c))break;
        double v;
        if(learned&&!finished(t)){
            // Training labels use the player-to-move viewpoint.
            // Predict in that same viewpoint, then convert to the root player.
            int perspective=t.turn%2;
            double f[FEATURE_COUNT];features(t,perspective,f);c.stats.traceCalls++;c.stats.evaluations++;
            v=0;for(int j=0;j<FEATURE_COUNT;j++)v+=LEARNED_WEIGHTS[j]*f[j];
            v=(perspective==root?1:-1)*clamp(v,-.99,.99)*1000;
        }else v=evaluate(t,root,c);
        insertRank(out,n,cap,order[i],v);
    }
    return n;
}
inline int greedyAI(const State& s,Context& c){
    Ranked a[MAX_MIRRORS];int n=rankMoves(s,c,a,s.mirrorCount);
    for(int i=0;i<n;i++)c.stats.ratings[a[i].move]=(int)(a[i].value*100);
    c.stats.considered=n;c.stats.depth=1;return n?a[0].move:0;
}
inline int learnedAI(const State& s,Context& c){
    Ranked a[MAX_MIRRORS];int n=rankMoves(s,c,a,s.mirrorCount,-1,true);
    for(int i=0;i<n;i++)c.stats.ratings[a[i].move]=(int)(a[i].value*100);
    c.stats.considered=n;c.stats.depth=1;return n?a[0].move:0;
}
inline int rushAI(const State& s,Context& c){
    Plan paths[3];
    for(int k=0;k<3&&c.more();k++){
        paths[k]=plan(s,k);c.stats.graphVisits+=paths[k].visited;
        c.stats.nodes+=paths[k].simulations;c.stats.traceCalls+=paths[k].simulations;
    }
    int order[MAX_MIRRORS];shuffle(order,s.mirrorCount,c.rng);
    int root=s.turn%2,bestMove=order[0];double best=-1e30;
    int replyCap=(c.budget-c.stats.nodes-s.mirrorCount)/s.mirrorCount;
    if(replyCap<0)replyCap=0;if(replyCap>s.mirrorCount)replyCap=s.mirrorCount;
    for(int i=0;i<s.mirrorCount&&c.more();i++){
        int m=order[i];State t;if(!simulate(s,m,t,c))break;
        int reply=0,gain=t.score[root]-s.score[root],distance=99;
        for(int k=0;k<3;k++)if(t.owner[k]<0&&paths[k].count<99){
            int d=0;for(int p=0;p<CELLS;p++)if(paths[k].desired[p]&&t.board[p]!=paths[k].desired[p])d++;
            if(d<distance)distance=d;
        }
        for(int j=0;j<replyCap&&!finished(t)&&c.more();j++){
            State u;if(!simulate(t,order[(i+j)%s.mirrorCount],u,c))break;
            int r=u.score[1-root]-t.score[1-root];if(r>reply)reply=r;
        }
        double v=evaluate(t,root,c)+30*gain-110*reply-(distance<99?2*distance:25);
        if(t.score[root]>=2)v+=5000;if(t.score[1-root]+reply>=2)v-=5000;
        c.stats.ratings[m]=(int)(v*100);c.stats.considered++;
        if(v>best){best=v;bestMove=m;}
    }
    c.stats.depth=2;return bestMove;
}
// Complete random playouts are used by AI03, without a heuristic leaf score.
inline double rollout(State s,int root,Context& c,bool& complete,int* actions=nullptr,int* seats=nullptr,int* used=nullptr){
    while(!finished(s)){
        int m=c.rng.below(s.mirrorCount),player=s.turn%2;State t;
        if(!simulate(s,m,t,c)){complete=false;return unitValue(s,root,c);}
        if(actions&&used&&*used<LIMIT){actions[*used]=m;seats[*used]=player;(*used)++;}
        s=t;
    }
    complete=true;c.stats.rollouts++;return terminalReward(s,root);
}
inline int monteCarloAI(const State& s,Context& c){
    int order[MAX_MIRRORS],visits[MAX_MIRRORS]={};double sums[MAX_MIRRORS]={};
    shuffle(order,s.mirrorCount,c.rng);int root=s.turn%2;
    // Round-robin, rather than exhausting the budget on the first candidate.
    int round=0;
    while(c.more()){
        bool progress=false;
        for(int i=0;i<s.mirrorCount&&c.more();i++){
            int m=order[(i+round)%s.mirrorCount];State t;
            if(!simulate(s,m,t,c))break;
            bool complete=false;double v=rollout(t,root,c,complete);
            if(complete){visits[m]++;sums[m]+=v;progress=true;}
        }
        round++;if(!progress)break;
    }
    int best=order[0];double score=-1;
    for(int i=0;i<s.mirrorCount;i++){
        int m=order[i];if(visits[m]){double v=sums[m]/visits[m];c.stats.ratings[m]=(int)(v*10000);c.stats.considered++;if(v>score){score=v;best=m;}}
    }
    return best;
}
// Shared, full-width minimax. With negamax=false it is explicitly max/min.
// AI05 never prunes actions; AI14 disables alpha-beta, not game rules.
struct SearchResult {double value;bool complete;};
inline SearchResult minimax(const State& s,int depth,int root,double alpha,double beta,Context& c,bool pruning){
    if(finished(s)||depth==0)return {evaluate(s,root,c),true};
    if(!c.more())return {0,false};
    bool maxing=s.turn%2==root;double best=maxing?-1e30:1e30;
    for(int m=0;m<s.mirrorCount;m++){
        State t;if(!simulate(s,m,t,c))return {0,false};
        auto r=minimax(t,depth-1,root,alpha,beta,c,pruning);if(!r.complete)return r;
        if(maxing){best=maxD(best,r.value);alpha=maxD(alpha,best);}else{best=minD(best,r.value);beta=minD(beta,best);}
        if(pruning&&alpha>=beta)break;
    }
    return {best,true};
}
inline SearchResult negamax(const State& s,int depth,Context& c){
    if(finished(s)||depth==0)return {evaluate(s,s.turn%2,c),true};
    double best=-1e30;
    for(int m=0;m<s.mirrorCount;m++){
        State t;if(!simulate(s,m,t,c))return {0,false};
        auto r=negamax(t,depth-1,c);if(!r.complete)return r;best=maxD(best,-r.value);
    }
    return {best,true};
}
inline int depthSearch(const State& s,Context& c,bool iterative,bool plainNegamax=false){
    int order[MAX_MIRRORS];shuffle(order,s.mirrorCount,c.rng);
    int fallback=order[0],root=s.turn%2,baselineCount=0;double fallbackScore=-1e30;
    // A complete one-ply baseline remains available if a deeper pass aborts.
    for(int i=0;i<s.mirrorCount&&c.more();i++){
        State t;if(!simulate(s,order[i],t,c))break;double v=evaluate(t,root,c);
        baselineCount++;if(v>fallbackScore){fallbackScore=v;fallback=order[i];}
    }
    int best=fallback;c.stats.depth=baselineCount==s.mirrorCount?1:0;
    int start=iterative?2:c.maxDepth;
    for(int depth=start;depth<=c.maxDepth&&c.more();depth++){
        double value=-1e30,alpha=-1e30;int candidate=best,done=0;bool complete=true;
        int ratings[MAX_MIRRORS]={};
        for(int i=0;i<s.mirrorCount;i++){
            int m=order[i];State t;if(!simulate(s,m,t,c)){complete=false;break;}
            SearchResult r=plainNegamax?negamax(t,depth-1,c):minimax(t,depth-1,root,alpha,1e30,c,true);
            if(!r.complete){complete=false;break;}
            double v=plainNegamax?-r.value:r.value;ratings[m]=(int)(v*100);done++;
            if(v>value){value=v;candidate=m;}alpha=maxD(alpha,value);
        }
        if(complete){best=candidate;c.stats.depth=depth;c.stats.considered=done;for(int m=0;m<s.mirrorCount;m++)c.stats.ratings[m]=ratings[m];}
        else break;
        if(!iterative)break;
    }
    return best;
}
inline int alphaBetaAI(const State& s,Context& c){return depthSearch(s,c,false);}
inline int iterativeAI(const State& s,Context& c){return depthSearch(s,c,true);}
inline int negamaxAI(const State& s,Context& c){return depthSearch(s,c,false,true);}
// Beam-minimax retains top-k immediate children PER NODE, at both players.
// This is selective adversarial search, not optimal full-width minimax.
inline SearchResult beamValue(const State& s,int depth,int root,Context& c,bool hybrid=false,bool laserAware=false){
    if(finished(s))return {evaluate(s,root,c),true};
    if(depth==0){
        if(!hybrid)return {evaluate(s,root,c),true};
        double v=0;int n=0;for(int i=0;i<3&&c.more();i++){bool ok;v+=rollout(s,root,c,ok);n++;}
        return {n?(v/n-.5)*400:evaluate(s,root,c),n>0};
    }
    Ranked ranked[MAX_MIRRORS];int cap=c.width;if(cap>s.mirrorCount)cap=s.mirrorCount;
    int n=rankMoves(s,c,ranked,cap);
    if(!n)return {0,false};
    if(laserAware){
        // Keep one off-beam preparatory move, not just currently lit mirrors.
        Trace tr;trace(s,&tr);c.stats.traceCalls++;
        int order[MAX_MIRRORS];shuffle(order,s.mirrorCount,c.rng);
        for(int i=0;i<s.mirrorCount;i++)if(!tr.touched[s.mirrors[order[i]]]){
            bool exists=false;for(int j=0;j<n;j++)if(ranked[j].move==order[i])exists=true;
            if(!exists)ranked[n-1]={order[i],0};break;
        }
    }
    bool maxing=s.turn%2==root;double best=maxing?-1e30:1e30;
    for(int i=0;i<n;i++){
        State t;if(!simulate(s,ranked[i].move,t,c))return {0,false};
        auto r=beamValue(t,depth-1,root,c,hybrid,laserAware);if(!r.complete)return r;
        best=maxing?maxD(best,r.value):minD(best,r.value);
    }
    return {best,true};
}
inline int beamSearch(const State& s,Context& c,bool hybrid=false,bool laserAware=false){
    Ranked ranked[MAX_MIRRORS];int n=rankMoves(s,c,ranked,s.mirrorCount);
    if(!n)return 0;int best=ranked[0].move,root=s.turn%2;
    if(laserAware){
        Trace tr;trace(s,&tr);c.stats.traceCalls++;
        Plan ps[3];bool useful[CELLS]={};
        for(int k=0;k<3&&c.more();k++){
            ps[k]=plan(s,k);c.stats.graphVisits+=ps[k].visited;c.stats.nodes+=ps[k].simulations;
            for(int p=0;p<CELLS;p++)useful[p]|=ps[k].desired[p]>0;
        }
        for(int i=0;i<n;i++)ranked[i].value+=(tr.touched[s.mirrors[ranked[i].move]]?2:0)+(useful[s.mirrors[ranked[i].move]]?4:0);
        for(int i=1;i<n;i++){Ranked t=ranked[i];int j=i;while(j&&t.value>ranked[j-1].value){ranked[j]=ranked[j-1];j--;}ranked[j]=t;}
    }
    int k=c.width;if(k>n)k=n;c.stats.considered=k;c.stats.depth=1;
    // Grow depth only after every retained root candidate has been searched.
    for(int depth=2;depth<=c.maxDepth&&c.more();depth++){
        bool complete=true;double value=-1e30;int candidate=best;
        for(int i=0;i<k;i++){
            State t;if(!simulate(s,ranked[i].move,t,c)){complete=false;break;}
            auto r=beamValue(t,depth-1,root,c,hybrid,laserAware);
            if(!r.complete){complete=false;break;}
            c.stats.ratings[ranked[i].move]=(int)(r.value*100);
            if(r.value>value){value=r.value;candidate=ranked[i].move;}
        }
        if(complete){best=candidate;c.stats.depth=depth;}else break;
    }
    return best;
}
inline int beamAI(const State& s,Context& c){return beamSearch(s,c);}
inline int hybridAI(const State& s,Context& c){return beamSearch(s,c,true);}
inline int laserAwareAI(const State& s,Context& c){return beamSearch(s,c,false,true);}
// Expectimax: the opponent is explicitly modeled as UNIFORM RANDOM.
inline SearchResult expectValue(const State& s,int depth,int root,Context& c){
    if(!depth||finished(s))return {evaluate(s,root,c),true};
    bool own=s.turn%2==root;double value=own?-1e30:0;
    for(int m=0;m<s.mirrorCount;m++){
        State t;if(!simulate(s,m,t,c))return {0,false};auto r=expectValue(t,depth-1,root,c);if(!r.complete)return r;
        value=own?maxD(value,r.value):value+r.value;
    }
    return {own?value:value/s.mirrorCount,true};
}
inline int expectimaxAI(const State& s,Context& c){
    Ranked a[MAX_MIRRORS];int n=rankMoves(s,c,a,s.mirrorCount);if(!n)return 0;
    int best=a[0].move;c.stats.depth=1;
    for(int depth=2;depth<=c.maxDepth&&c.more();depth++){
        double value=-1e30;int candidate=best;bool complete=true;
        for(int i=0;i<n;i++){
            State t;if(!simulate(s,a[i].move,t,c)){complete=false;break;}
            auto r=expectValue(t,depth-1,s.turn%2,c);if(!r.complete){complete=false;break;}
            if(r.value>value){value=r.value;candidate=a[i].move;}
        }
        if(complete){best=candidate;c.stats.depth=depth;}else break;
    }
    c.stats.considered=n;return best;
}
// Rolling-horizon genomes encode OWN future moves. Opponents remain random.
// Every objective evaluation resets the opponent seed (common random numbers).
constexpr int HORIZON=6, POPULATION=12;
inline double genomeValue(const State& initial,const int* genes,int root,u32 scenario,Context& c,bool& complete){
    State s=initial;Rng opponent(scenario);int own=0;
    while(!finished(s)){
        int m=s.turn%2==root&&own<HORIZON?genes[own++]:opponent.below(s.mirrorCount);
        State t;if(!simulate(s,m,t,c)){complete=false;return 0;}s=t;
    }
    complete=true;c.stats.rollouts++;
    return terminalReward(s,root)+.01*(s.score[root]-s.score[1-root]);
}
inline int sequenceAI(const State& s,Context& c,int mode){
    int root=s.turn%2;u32 scenario=c.rng.next();
    int best[HORIZON];for(int i=0;i<HORIZON;i++)best[i]=c.rng.below(s.mirrorCount);
    bool ok;double bestV=genomeValue(s,best,root,scenario,c,ok);if(!ok)return best[0];
    if(mode==0){
        int pop[POPULATION][HORIZON];double score[POPULATION];
        for(int p=0;p<POPULATION;p++){
            for(int i=0;i<HORIZON;i++)pop[p][i]=c.rng.below(s.mirrorCount);
            score[p]=genomeValue(s,pop[p],root,scenario,c,ok);if(!ok)return best[0];
            if(score[p]>bestV){bestV=score[p];for(int i=0;i<HORIZON;i++)best[i]=pop[p][i];}
        }
        while(c.more()){
            // Tournament selection, one-point crossover, per-gene mutation.
            auto parent=[&](){int a=c.rng.below(POPULATION),b=c.rng.below(POPULATION);return score[a]>score[b]?a:b;};
            int a=parent(),b=parent(),cut=1+c.rng.below(HORIZON-1),child[HORIZON];
            for(int i=0;i<HORIZON;i++)child[i]=c.rng.below(100)<20?c.rng.below(s.mirrorCount):(i<cut?pop[a][i]:pop[b][i]);
            double v=genomeValue(s,child,root,scenario,c,ok);if(!ok)break;
            int worst=0;for(int p=1;p<POPULATION;p++)if(score[p]<score[worst])worst=p;
            if(v>=score[worst]){score[worst]=v;for(int i=0;i<HORIZON;i++)pop[worst][i]=child[i];}
            if(v>bestV){bestV=v;for(int i=0;i<HORIZON;i++)best[i]=child[i];}
        }
    }else{
        int current[HORIZON];for(int i=0;i<HORIZON;i++)current[i]=best[i];double currentV=bestV;int iterations=0,stale=0;
        while(c.more()){
            int candidate[HORIZON];for(int i=0;i<HORIZON;i++)candidate[i]=current[i];
            if(mode==2&&stale>=24){for(int i=0;i<HORIZON;i++)candidate[i]=c.rng.below(s.mirrorCount);stale=0;currentV=-2;}
            else candidate[c.rng.below(HORIZON)]=c.rng.below(s.mirrorCount);
            double v=genomeValue(s,candidate,root,scenario,c,ok);if(!ok)break;
            double temperature=.35/(1+iterations*.035);
            bool accept=v>=currentV||(mode==1&&double(c.rng.next())/4294967296.0<exp((v-currentV)/temperature));
            if(accept){for(int i=0;i<HORIZON;i++)current[i]=candidate[i];currentV=v;}
            if(v>bestV){bestV=v;for(int i=0;i<HORIZON;i++)best[i]=candidate[i];stale=0;}else stale++;
            iterations++;
        }
    }
    c.stats.ratings[best[0]]=(int)(bestV*10000);c.stats.considered=s.mirrorCount;c.stats.depth=HORIZON;return best[0];
}
inline int geneticAI(const State& s,Context& c){return sequenceAI(s,c,0);}
inline int annealingAI(const State& s,Context& c){return sequenceAI(s,c,1);}
inline int hillAI(const State& s,Context& c){return sequenceAI(s,c,2);}
// Exact-key transposition table. Full orientation bits and metadata are checked;
// an index hash collision cannot masquerade as an identical state.
constexpr int TT_SIZE=8192;
struct Key {u32 bits[7];int turn,score0,score1,owners;};
struct TTEntry {Key key;int generation=0,depth=0,flag=0;double value=0;};
static TTEntry tt[TT_SIZE];static int ttGeneration=0;
inline Key keyOf(const State& s){Key k{};for(int i=0;i<s.mirrorCount;i++)if(s.board[s.mirrors[i]]==SLASH)k.bits[i/32]|=1u<<(i%32);k.turn=s.turn;k.score0=s.score[0];k.score1=s.score[1];for(int i=0;i<3;i++)k.owners=k.owners*3+s.owner[i]+1;return k;}
inline bool sameKey(const Key&a,const Key&b){for(int i=0;i<7;i++)if(a.bits[i]!=b.bits[i])return false;return a.turn==b.turn&&a.score0==b.score0&&a.score1==b.score1&&a.owners==b.owners;}
inline int keyHash(const Key&k){u32 h=2166136261u;for(int i=0;i<7;i++)h=(h^k.bits[i])*16777619u;h=(h^k.turn)*16777619u;h=(h^k.owners)*16777619u;return h%TT_SIZE;}
inline SearchResult ttValue(const State& s,int depth,int root,double alpha,double beta,Context& c){
    if(!depth||finished(s))return {evaluate(s,root,c),true};if(!c.more())return {0,false};
    Key key=keyOf(s);int index=keyHash(key);TTEntry& entry=tt[index];double a0=alpha,b0=beta;
    if(entry.generation==ttGeneration&&entry.depth>=depth&&sameKey(entry.key,key)){
        c.stats.ttHits++;if(entry.flag==0)return {entry.value,true};
        if(entry.flag==1)alpha=maxD(alpha,entry.value);else beta=minD(beta,entry.value);
        if(alpha>=beta)return {entry.value,true};
    }
    bool own=s.turn%2==root;double best=own?-1e30:1e30;
    for(int m=0;m<s.mirrorCount;m++){
        State t;if(!simulate(s,m,t,c))return {0,false};auto r=ttValue(t,depth-1,root,alpha,beta,c);if(!r.complete)return r;
        if(own){best=maxD(best,r.value);alpha=maxD(alpha,best);}else{best=minD(best,r.value);beta=minD(beta,best);}if(alpha>=beta)break;
    }
    entry.key=key;entry.generation=ttGeneration;entry.depth=depth;entry.value=best;entry.flag=best<=a0?2:best>=b0?1:0;
    return {best,true};
}
inline int transpositionAI(const State& s,Context& c){
    if(++ttGeneration>1000000000){for(auto& e:tt)e.generation=0;ttGeneration=1;}
    Ranked a[MAX_MIRRORS];int n=rankMoves(s,c,a,s.mirrorCount);if(!n)return 0;
    int best=a[0].move;c.stats.depth=1;
    for(int depth=2;depth<=c.maxDepth&&c.more();depth++){
        double value=-1e30,alpha=-1e30;bool ok=true;int candidate=best;
        for(int i=0;i<n;i++){
            State t;if(!simulate(s,a[i].move,t,c)){ok=false;break;}
            auto r=ttValue(t,depth-1,s.turn%2,alpha,1e30,c);if(!r.complete){ok=false;break;}
            if(r.value>value){value=r.value;candidate=a[i].move;}alpha=maxD(alpha,value);
        }
        if(ok){best=candidate;c.stats.depth=depth;}else break;
    }
    c.stats.considered=n;return best;
}
inline int threatAI(const State& s,Context& c){
    Ranked a[MAX_MIRRORS];int n=rankMoves(s,c,a,s.mirrorCount);if(!n)return 0;
    int best=a[0].move,root=s.turn%2;double value=-1e30;
    // Completed candidates only. Report explored count, not a forced proof.
    for(int i=0;i<n&&c.more();i++){
        State t;if(!simulate(s,a[i].move,t,c))break;
        double worst=evaluate(t,root,c);bool complete=true;
        if(!finished(t)){
            worst=1e30;
            for(int m=0;m<s.mirrorCount;m++){
                State u;if(!simulate(t,m,u,c)){complete=false;break;}
                double v=evaluate(u,root,c);worst=minD(worst,v);
            }
        }
        if(!complete)break;c.stats.considered++;c.stats.ratings[a[i].move]=(int)(worst*100);
        if(worst>value){value=worst;best=a[i].move;}
    }
    c.stats.depth=c.stats.considered?2:1;return best;
}
// Memory-bounded MCTS implementation shared by five explicitly different policies.
constexpr int TREE_CAP=4096;
struct Node {int parent,move,first=-1,next=-1,children=0,visits=0,depth=0;double sum=0,prior=0;int offset=0;};
static Node tree[TREE_CAP];
static unsigned short raveN[TREE_CAP][MAX_MIRRORS];
static float raveS[TREE_CAP][MAX_MIRRORS];
inline void initNode(int i,int parent,int m,int depth,int offset,bool rave){
    tree[i]=Node{};tree[i].parent=parent;tree[i].move=m;tree[i].depth=depth;tree[i].offset=offset;
    if(rave)for(int j=0;j<MAX_MIRRORS;j++){raveN[i][j]=0;raveS[i][j]=0;}
}
// mode 0: epsilon-greedy; 1: UCT; 2: progressive widening; 3: RAVE; 4: PUCT.
inline int treeAI(const State& initial,Context& c,int mode){
    bool rave=mode==3;int root=initial.turn%2,count=1,order[MAX_MIRRORS];shuffle(order,initial.mirrorCount,c.rng);
    initNode(0,-1,-1,0,0,rave);
    while(c.more()){
        State s=initial;int n=0,path[LIMIT+1]={},pathN=1,actions[LIMIT],seats[LIMIT],used=0;bool interrupted=false;
        while(!finished(s)){
            Node& node=tree[n];int allowed=s.mirrorCount;
            if(mode==2){allowed=2+(int)(1.7*sqrt(node.visits+1.0));if(allowed>s.mirrorCount)allowed=s.mirrorCount;}
            if(node.children<allowed&&count<TREE_CAP){
                int m=order[(node.offset+node.children)%s.mirrorCount],child=count++;
                int player=s.turn%2;State t;if(!simulate(s,m,t,c)){count--;interrupted=true;break;}
                initNode(child,n,m,node.depth+1,c.rng.below(s.mirrorCount),rave);
                tree[child].next=node.first;node.first=child;node.children++;
                actions[used]=m;seats[used++]=player;s=t;n=child;path[pathN++]=n;break;
            }
            // Tree memory is full: the current leaf is still a valid place
            // for a rollout. Keep using the allocated tree until the time
            // budget expires instead of giving up at TREE_CAP.
            if(node.first<0)break;
            int chosen=-1;double best=-1e30;bool maximize=s.turn%2==root;
            Trace tr;double priorTotal=0,priors[MAX_MIRRORS]={};
            if(mode==4){
                trace(s,&tr);c.stats.traceCalls++;
                for(int m=0;m<s.mirrorCount;m++){
                    int p=s.mirrors[m],distance=30;
                    for(int k=0;k<3;k++)if(s.owner[k]<0){int d=absI(p%N-s.core[k]%N)+absI(p/N-s.core[k]/N);if(d<distance)distance=d;}
                    priors[m]=(tr.touched[p]?3.0:1.0)+2.0/(1+distance);priorTotal+=priors[m];
                }
            }
            bool explore=mode==0&&c.rng.below(100)<20;int pick=explore?c.rng.below(node.children):-1,ix=0;
            for(int child=node.first;child>=0;child=tree[child].next,ix++){
                Node& q=tree[child];double mean=q.visits?q.sum/q.visits:.5;
                if(rave&&raveN[n][q.move]){
                    double beta=raveN[n][q.move]/(raveN[n][q.move]+q.visits+.01*raveN[n][q.move]*q.visits+1.0);
                    mean=(1-beta)*mean+beta*raveS[n][q.move]/raveN[n][q.move];
                }
                double val=maximize?mean:1-mean;
                if(mode==4)val+=1.5*(priors[q.move]/priorTotal)*sqrt(node.visits+1.0)/(1+q.visits);
                else if(mode!=0)val+=1.41421356237*sqrt(log(node.visits+1.0)/(q.visits+1e-9));
                if(explore)val=ix==pick?1e10:-1e10;
                if(val>best){best=val;chosen=child;}
            }
            if(chosen<0){interrupted=true;break;}
            int player=s.turn%2,m=tree[chosen].move;State t;if(!simulate(s,m,t,c)){interrupted=true;break;}
            actions[used]=m;seats[used++]=player;s=t;n=chosen;path[pathN++]=n;
        }
        if(interrupted)break;
        bool complete=false;double reward=rollout(s,root,c,complete,actions,seats,&used);if(!complete)break;
        for(int j=0;j<pathN;j++){
            int id=path[j];tree[id].visits++;tree[id].sum+=reward;
            if(rave){
                bool seen[MAX_MIRRORS]={};int player=(initial.turn+tree[id].depth)%2;
                for(int k=tree[id].depth;k<used;k++)if(seats[k]==player&&!seen[actions[k]]){
                    int m=actions[k];seen[m]=true;
                    if(raveN[id][m]<65000){raveN[id][m]++;raveS[id][m]+=(float)reward;}
                }
            }
        }
        if(tree[n].depth>c.stats.depth)c.stats.depth=tree[n].depth;
    }
    int best=order[0],visits=-1;double tie=-1;
    for(int n=tree[0].first;n>=0;n=tree[n].next){
        Node& q=tree[n];double v=q.visits?q.sum/q.visits:.5;c.stats.ratings[q.move]=(int)(v*10000);c.stats.considered++;
        if(q.visits>visits||(q.visits==visits&&v>tie)){visits=q.visits;tie=v;best=q.move;}
    }
    c.stats.treeNodes=count;return best;
}
inline int mctsAI(const State& s,Context& c){return treeAI(s,c,0);}
inline int uctAI(const State& s,Context& c){return treeAI(s,c,1);}
inline int wideningAI(const State& s,Context& c){return treeAI(s,c,2);}
inline int raveAI(const State& s,Context& c){return treeAI(s,c,3);}
inline int puctAI(const State& s,Context& c){return treeAI(s,c,4);}
// A portfolio with one shared budget; not three full independent budgets.
inline int ensembleAI(const State& s,Context& c){
    int originalBudget=c.budget,remaining=originalBudget-c.stats.nodes;
    double originalDeadline=c.deadline;
    int chosen[3];
    for(int i=0;i<3;i++){
        int part=remaining/(3-i);c.budget=c.stats.nodes+part;
        if(originalDeadline>0)c.deadline=lab_now()+(originalDeadline-lab_now())/(3-i);
        chosen[i]=i==0?monteCarloAI(s,c):i==1?beamAI(s,c):iterativeAI(s,c);
        remaining=originalBudget-c.stats.nodes;
    }
    c.budget=originalBudget;c.deadline=originalDeadline;
    if(chosen[0]==chosen[1]||chosen[0]==chosen[2])return chosen[0];
    if(chosen[1]==chosen[2])return chosen[1];
    return chosen[2];
}
// Genuine proof-number OR/AND search. Draws disprove STRICT victory.
// Unknown resource-limited leaves always stay (1,1); never false proofs.
constexpr int PROOF_INF=100000000;
struct ProofNode {int parent,move,first=-1,next=-1,pn=1,dn=1,depth=0;bool expanded=false;};
static ProofNode proofTree[TREE_CAP];
inline int cappedAdd(int a,int b){return a>=PROOF_INF-b?PROOF_INF:a+b;}
inline void proofUpdate(int n,int rootTurn){
    auto& q=proofTree[n];if(!q.expanded)return;
    bool own=q.depth%2==0;int pn=own?PROOF_INF:0,dn=own?0:PROOF_INF;
    for(int ch=q.first;ch>=0;ch=proofTree[ch].next){
        if(own){if(proofTree[ch].pn<pn)pn=proofTree[ch].pn;dn=cappedAdd(dn,proofTree[ch].dn);}
        else{pn=cappedAdd(pn,proofTree[ch].pn);if(proofTree[ch].dn<dn)dn=proofTree[ch].dn;}
    }
    q.pn=pn;q.dn=dn;
}
inline int proofAI(const State& initial,Context& c){
    proofTree[0]=ProofNode{};proofTree[0].parent=-1;proofTree[0].move=-1;
    int count=1,root=initial.turn%2;int order[MAX_MIRRORS];shuffle(order,initial.mirrorCount,c.rng);
    while(c.more()&&proofTree[0].pn&&proofTree[0].dn){
        State s=initial;int n=0;bool interrupted=false;
        while(proofTree[n].expanded){
            int best=-1,value=PROOF_INF+1;bool own=proofTree[n].depth%2==0;
            for(int ch=proofTree[n].first;ch>=0;ch=proofTree[ch].next){int v=own?proofTree[ch].pn:proofTree[ch].dn;if(v<value){value=v;best=ch;}}
            if(best<0){interrupted=true;break;}
            State t;if(!simulate(s,proofTree[best].move,t,c)){interrupted=true;break;}s=t;n=best;
        }
        if(interrupted)break;
        if(finished(s)){
            bool win=terminalReward(s,root)==1;proofTree[n].pn=win?0:PROOF_INF;proofTree[n].dn=win?PROOF_INF:0;
        }else{
            if(count+s.mirrorCount>TREE_CAP||c.budget-c.stats.nodes<s.mirrorCount)break;
            // Expand atomically; a timeout must not omit possible opponent moves.
            int firstCount=count,head=-1;bool complete=true;
            for(int i=0;i<s.mirrorCount;i++){
                State t;int m=order[i];if(!simulate(s,m,t,c)){complete=false;break;}
                int child=count++;proofTree[child]=ProofNode{};auto& q=proofTree[child];
                q.parent=n;q.move=m;q.depth=proofTree[n].depth+1;q.next=head;head=child;
                if(finished(t)){bool win=terminalReward(t,root)==1;q.pn=win?0:PROOF_INF;q.dn=win?PROOF_INF:0;}
            }
            if(!complete){count=firstCount;break;}
            proofTree[n].first=head;proofTree[n].expanded=true;
        }
        int depth=proofTree[n].depth;if(depth>c.stats.depth)c.stats.depth=depth;
        for(int p=n;p>=0;p=proofTree[p].parent)proofUpdate(p,root);
    }
    c.stats.treeNodes=count;c.stats.proof=proofTree[0].pn==0?1:proofTree[0].dn==0?-1:0;
    int best=order[0],value=PROOF_INF+1;
    for(int ch=proofTree[0].first;ch>=0;ch=proofTree[ch].next){if(proofTree[ch].pn<value){value=proofTree[ch].pn;best=proofTree[ch].move;}c.stats.considered++;}
    return best;
}
// Two-player nested rollout: limited sample width, alternating max/min, with
// lower-level simulations used recursively. Not canonical single-player NMCS.
inline SearchResult nestedValue(const State& s,int level,int root,Context& c){
    if(!level||finished(s)){bool ok;double v=rollout(s,root,c,ok);return {v,ok};}
    int order[MAX_MIRRORS];shuffle(order,s.mirrorCount,c.rng);int width=c.width;if(width>s.mirrorCount)width=s.mirrorCount;
    bool own=s.turn%2==root;double best=own?-1:2;int complete=0;
    for(int i=0;i<width&&c.more();i++){
        State t;if(!simulate(s,order[i],t,c))break;auto r=nestedValue(t,level-1,root,c);if(!r.complete)break;
        best=own?maxD(best,r.value):minD(best,r.value);complete++;
    }
    return {best,complete>0};
}
inline int nestedAI(const State& s,Context& c){
    int order[MAX_MIRRORS],n[MAX_MIRRORS]={};double values[MAX_MIRRORS]={};shuffle(order,s.mirrorCount,c.rng);
    int root=s.turn%2,best=order[0];double bestV=-1;
    for(int round=0;c.more();round++){
        bool progress=false;
        for(int i=0;i<s.mirrorCount&&c.more();i++){
            int m=order[(i+round)%s.mirrorCount];State t;if(!simulate(s,m,t,c))break;
            auto r=nestedValue(t,1,root,c);if(!r.complete)break;n[m]++;values[m]+=r.value;progress=true;
        }
        if(!progress)break;
    }
    for(int i=0;i<s.mirrorCount;i++){int m=order[i];if(n[m]){double v=values[m]/n[m];c.stats.ratings[m]=(int)(v*10000);c.stats.considered++;if(v>bestV){bestV=v;best=m;}}}
    c.stats.depth=2;return best;
}
}
