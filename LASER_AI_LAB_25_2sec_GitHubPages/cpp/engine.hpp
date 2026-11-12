#pragma once
// LASER / AI LAB -- the single authoritative rules engine.
// No platform dependencies: compiled both to WebAssembly and native C++.
namespace laser {
using u32 = unsigned int;
constexpr int N=15, CELLS=225, MAX_MIRRORS=200, LIMIT=30;
constexpr int EMPTY=0, SLASH=1, BACKSLASH=2, SOURCE=3, CORE=4;
constexpr int DX[4]={0,1,0,-1}, DY[4]={-1,0,1,0};
constexpr const char* ENGINE_VERSION="2.0.0";
constexpr const char* GENERATOR_VERSION="density-certified-v2";
struct State {
    int turn, score[2], seed, mirrorCount, generatorKind;
    int board[CELLS];
    int mirrors[MAX_MIRRORS];
    int source[3], direction[3], core[3], owner[3];
};
static_assert(sizeof(State)==443*4,"State ABI must remain stable");
struct Rng {
    u32 state;
    explicit Rng(u32 s):state(s ? s : 0x9e3779b9u){}
    u32 next(){u32 x=state; x^=x<<13; x^=x>>17; x^=x<<5; return state=x;}
    int below(int n){const u32 bound=static_cast<u32>(n), threshold=(0u-bound)%bound; u32 x; do{x=next();}while(x<threshold); return static_cast<int>(x%bound);}
};
inline int bits(int x){return (x&1)+((x>>1)&1)+((x>>2)&1);}
inline bool inside(int x,int y){return x>=0&&x<N&&y>=0&&y<N;}
inline bool finished(const State& s){return s.turn>=LIMIT||s.score[0]+s.score[1]==3;}
inline int coreAt(const State& s,int p){for(int i=0;i<3;i++)if(s.core[i]==p)return i;return -1;}
struct Trace {
    int hits=0;
    int length[3]={}, stop[3]={}; // 1=edge, 2=core, 3=emitter, 4=cycle
    int xy[3][904][2];
    bool touched[CELLS]={};
};
// All three beams see the same pre-shot board. Captures are a set union.
// Destroyed cores are transparent on subsequent turns, not during this shot.
inline int trace(const State& s, Trace* output=nullptr) {
    int hits=0;
    for(int beam=0;beam<3;beam++) {
        bool visited[CELLS*4]={};
        int p=s.source[beam], x=p%N,y=p/N,d=s.direction[beam];
        if(output){output->length[beam]=1;output->xy[beam][0][0]=x;output->xy[beam][0][1]=y;}
        int stop=1;
        for(int guard=0;guard<902;guard++) {
            x+=DX[d];y+=DY[d];
            if(output){int q=output->length[beam]++;output->xy[beam][q][0]=x;output->xy[beam][q][1]=y;}
            if(!inside(x,y)){stop=1;break;}
            p=y*N+x;
            if(visited[p*4+d]){stop=4;break;}
            visited[p*4+d]=true;
            int kind=s.board[p];
            if(kind==SOURCE){stop=3;break;}
            if(kind==CORE){int c=coreAt(s,p);if(c>=0&&s.owner[c]<0){hits|=1<<c;stop=2;break;}}
            if(kind==SLASH||kind==BACKSLASH){if(output)output->touched[p]=true; d^=(kind==SLASH?1:3);}
        }
        if(output)output->stop[beam]=stop;
    }
    if(output)output->hits=hits;
    return hits;
}
inline int apply(State& s,int move,Trace* output=nullptr){
    if(move<0||move>=s.mirrorCount||finished(s))return -1;
    int p=s.mirrors[move];s.board[p]=3-s.board[p];
    int mask=trace(s,output), player=s.turn%2;
    for(int c=0;c<3;c++)if((mask&(1<<c))&&s.owner[c]<0){s.owner[c]=player;s.score[player]++;}
    s.turn++;
    return mask;
}
struct Plan {
    int count=99, moves[MAX_MIRRORS]={};
    int desired[CELLS]={};
    int visited=0, simulations=0;
};
// A 0-1 shortest-path relaxation over (cell, incoming direction).
// Re-entering a mirror could create inconsistent assignments. We explicitly
// reject those paths and verify every returned witness in the real engine.
// Thus a returned path is a valid witness, NOT a general optimality proof.
inline Plan plan(const State& s,int target){
    Plan result;
    if(target<0||target>=3||s.owner[target]>=0)return result;
    constexpr int V=CELLS*4, Q=8192;
    int dist[V],prev[V],orient[V];bool done[V]={};int queue[Q],head=Q/2,tail=head;
    for(int i=0;i<V;i++){dist[i]=100000;prev[i]=-2;orient[i]=0;}
    for(int b=0;b<3;b++){
        int p=s.source[b],d=s.direction[b],x=p%N+DX[d],y=p/N+DY[d];
        if(!inside(x,y))continue;
        int v=(y*N+x)*4+d;
        if(dist[v]>0){dist[v]=0;prev[v]=-1;queue[tail]=v;tail=(tail+1)%Q;}
    }
    int end=-1;
    while(head!=tail){
        int v=queue[head];head=(head+1)%Q;
        if(done[v])continue;done[v]=true;result.visited++;
        int p=v/4,d=v%4,k=s.board[p];
        if(k==CORE){int c=coreAt(s,p);if(c>=0&&s.owner[c]<0){if(c==target){end=v;break;}continue;}}
        if(k==SOURCE)continue;
        int choices=(k==SLASH||k==BACKSLASH)?2:1;
        for(int opt=0;opt<choices;opt++){
            int desired=choices==2?opt+1:0, nd=choices==2?(d^(desired==SLASH?1:3)):d;
            int x=p%N+DX[nd],y=p/N+DY[nd];if(!inside(x,y))continue;
            int u=(y*N+x)*4+nd,w=choices==2&&desired!=k;
            if(!done[u]&&dist[u]>dist[v]+w){
                dist[u]=dist[v]+w;prev[u]=v;orient[u]=desired;
                if(w){queue[tail]=u;tail=(tail+1)%Q;}else{head=(head-1+Q)%Q;queue[head]=u;}
                if(head==tail)return Plan{}; // defensive bound, never accept an unchecked path
            }
        }
    }
    if(end<0)return result;
    int v=end;
    while(prev[v]>=0){
        int parent=prev[v],p=parent/4,o=orient[v];
        if(o){if(result.desired[p]&&result.desired[p]!=o){result.count=99;return result;}result.desired[p]=o;}
        v=parent;
    }
    result.count=0;State check=s;
    for(int m=0;m<s.mirrorCount;m++){
        int p=s.mirrors[m];
        if(result.desired[p]&&s.board[p]!=result.desired[p]){result.moves[result.count++]=m;check.board[p]=result.desired[p];}
    }
    if(!(trace(check)&(1<<target))){result.count=99;return result;}
    // Verify the actual turn-by-turn witness, including intervening captures.
    check=s;
    int applied=0;
    for(int i=0;i<result.count&&!finished(check);i++){result.simulations++;apply(check,result.moves[i]);applied++;if(check.owner[target]>=0)break;}
    if(check.owner[target]<0)result.count=99;else result.count=applied;
    return result;
}
inline bool valid(const State& s){
    if(s.mirrorCount<6||s.mirrorCount>MAX_MIRRORS)return false;
    if(s.turn<0||s.turn>LIMIT||s.score[0]<0||s.score[1]<0)return false;
    bool occupied[CELLS]={};int scores[2]={};
    for(int m=0;m<s.mirrorCount;m++){int p=s.mirrors[m];if(p<0||p>=CELLS||occupied[p]||(s.board[p]!=1&&s.board[p]!=2))return false;occupied[p]=true;}
    for(int i=0;i<3;i++){
        int p=s.source[i];if(p<0||p>=CELLS||occupied[p]||s.board[p]!=SOURCE||s.direction[i]<0||s.direction[i]>3)return false;occupied[p]=true;
        p=s.core[i];if(p<0||p>=CELLS||occupied[p]||s.board[p]!=CORE||s.owner[i]<-1||s.owner[i]>1)return false;occupied[p]=true;
        if(s.owner[i]>=0)scores[s.owner[i]]++;
    }
    for(int p=0;p<CELLS;p++)if(!occupied[p]&&s.board[p]!=EMPTY)return false;
    return scores[0]==s.score[0]&&scores[1]==s.score[1];
}

inline int transformedCell(int p,int rotation,bool flip){
    int x=p%N,y=p/N;if(flip)x=N-1-x;
    for(int i=0;i<rotation;i++){int t=x;x=N-1-y;y=t;}
    return y*N+x;
}
// Compact two-switch lanes are a certified fallback for sparse/dense boards.
// No witness is trusted until replayed through the actual turn rules.
inline bool generate(State& s,u32 seed,int count,int& attempts,int cert[3][202]){
    if(count<6||count>MAX_MIRRORS)return false;
    Rng rng(seed); attempts=0;
    const int tries=(count<24||count>185)?24:160;
    for(int k=0;k<tries+512;k++){
        attempts++;
        s=State{};s.seed=static_cast<int>(seed);s.mirrorCount=count;
        bool used[CELLS]={};
        bool fallback=k>=tries;
        s.generatorKind=fallback?1:0;
        int essential[6]={},desired[6]={};
        if(!fallback){
            int omitted=rng.below(4),idx=0;
            for(int side=0;side<4;side++)if(side!=omitted){
                int a=2+rng.below(11),p=0,d=0;
                if(side==0){p=a;d=2;}if(side==1){p=a*N+14;d=3;}
                if(side==2){p=14*N+a;d=0;}if(side==3){p=a*N;d=1;}
                s.source[idx]=p;s.direction[idx]=d;s.board[p]=SOURCE;used[p]=true;idx++;
            }
            for(int c=0;c<3;c++){
                int p;do{p=(1+rng.below(13))*N+1+rng.below(13);}while(used[p]);
                used[p]=true;s.core[c]=p;s.board[p]=CORE;s.owner[c]=-1;
            }
        } else {
            int rot=rng.below(4);bool flip=rng.below(2);
            int d=(flip?3:1);d=(d+rot)%4;
            for(int c=0;c<3;c++){
                int r=1+c*5+rng.below(2);
                int a=1+c,b=5+rng.below(3);
                // Reserve the full path, including empty transit cells.
                for(int x=0;x<=a;x++)used[transformedCell(r*N+x,rot,flip)]=true;
                for(int x=a;x<=b;x++)used[transformedCell((r+1)*N+x,rot,flip)]=true;
                int src=transformedCell(r*N,rot,flip),core=transformedCell((r+1)*N+b,rot,flip);
                s.source[c]=src;s.direction[c]=d;s.board[src]=SOURCE;
                s.core[c]=core;s.owner[c]=-1;s.board[core]=CORE;
                for(int j=0;j<2;j++){
                    int pos=transformedCell((r+j)*N+a,rot,flip),m=2*c+j;
                    essential[m]=pos;s.mirrors[m]=pos;
                    int o=BACKSLASH;
                    if((rot%2)^flip)o=3-o;
                    desired[m]=o;s.board[pos]=3-o;
                }
            }
        }
        int free[CELLS],n=0;for(int p=0;p<CELLS;p++)if(!used[p])free[n++]=p;
        int first=fallback?6:0;
        if(n<count-first)continue;
        for(int i=n-1;i>0;i--){int j=rng.below(i+1),t=free[i];free[i]=free[j];free[j]=t;}
        for(int m=first;m<count;m++){int p=free[m-first];s.mirrors[m]=p;s.board[p]=1+rng.below(2);}
        if(trace(s))continue;
        bool ok=true;
        for(int c=0;c<3;c++){
            if(fallback){
                State check=s;apply(check,2*c);int length=1;
                if(check.owner[c]<0&&!finished(check)){apply(check,2*c+1);length=2;}
                if(check.owner[c]<0){ok=false;break;}
                cert[c][0]=length;cert[c][1]=2*c;cert[c][2]=2*c+1;
            }else{
                Plan w=plan(s,c);
                if(w.count<2||w.count>10){ok=false;break;}
                cert[c][0]=w.count;for(int i=0;i<w.count;i++)cert[c][i+1]=w.moves[i];
            }
        }
        if(ok){
            // Shuffle mirror IDs: lane/filler membership is not leaked by IDs.
            for(int i=count-1;i>0;i--){
                int j=rng.below(i+1),t=s.mirrors[i];s.mirrors[i]=s.mirrors[j];s.mirrors[j]=t;
                for(int c=0;c<3;c++)for(int q=1;q<=cert[c][0];q++){
                    if(cert[c][q]==i)cert[c][q]=j;else if(cert[c][q]==j)cert[c][q]=i;
                }
            }
            return valid(s);
        }
    }
    return false;
}

struct Diagnostics {
    int move=-1,nodes=0,evaluations=0,rollouts=0,depth=0,considered=0;
    int budgetHit=0,graphVisits=0,ttHits=0,proof=0,treeNodes=0,traceCalls=0;
    int ratings[MAX_MIRRORS]={};
};
extern "C" double lab_now();
extern "C" double log(double);
extern "C" double exp(double);
extern "C" double sqrt(double);
inline double minD(double a,double b){return a<b?a:b;}
inline double maxD(double a,double b){return a>b?a:b;}
inline int absI(int a){return a<0?-a:a;}
inline double clamp(double x,double lo,double hi){return x<lo?lo:x>hi?hi:x;}
struct Context {
    Rng rng;int budget,maxDepth,width;double deadline;Diagnostics& stats;
    Context(u32 seed,int b,int ms,int depth,int w,Diagnostics& d):rng(seed),budget(b),maxDepth(depth),width(w),deadline(ms>0?lab_now()+ms:0),stats(d){}
    bool more(){
        if(stats.nodes>=budget||(deadline>0&&lab_now()>=deadline)){stats.budgetHit=1;return false;}return true;
    }
};
inline bool simulate(const State& s,int m,State& out,Context& c){
    if(!c.more())return false;
    out=s;c.stats.nodes++;c.stats.traceCalls++;return apply(out,m)>=0;
}
inline void shuffle(int* a,int n,Rng& rng){for(int i=0;i<n;i++)a[i]=i;for(int i=n-1;i>0;i--){int j=rng.below(i+1),t=a[i];a[i]=a[j];a[j]=t;}}
inline double terminalReward(const State& s,int player){int d=s.score[player]-s.score[1-player];return d>0?1:d<0?0:.5;}
// Ten cheap, deterministic features. No hidden search/board mutation.
constexpr int FEATURE_COUNT=10;
inline void features(const State& s,int root,double* f){
    int side=s.turn%2==root?1:-1,remaining=3-s.score[0]-s.score[1];
    Trace tr;trace(s,&tr);
    double proximity=0,closest=0;int touched=0,slash=0;
    for(int m=0;m<s.mirrorCount;m++){touched+=tr.touched[s.mirrors[m]];slash+=s.board[s.mirrors[m]]==SLASH;}
    for(int c=0;c<3;c++)if(s.owner[c]<0){
        int best=30,cx=s.core[c]%N,cy=s.core[c]/N;
        for(int b=0;b<3;b++)for(int k=0;k<tr.length[b];k++){
            int d=absI(cx-tr.xy[b][k][0])+absI(cy-tr.xy[b][k][1]);if(d<best)best=d;
        }
        double p=1.0/(1+best);proximity+=p;if(p>closest)closest=p;
    }
    double diff=(s.score[root]-s.score[1-root])/3.0;
    f[0]=1;f[1]=diff;f[2]=side;f[3]=side*proximity/3;f[4]=side*closest;
    f[5]=side*double(touched)/s.mirrorCount;f[6]=diff*(LIMIT-s.turn)/LIMIT;
    f[7]=side*remaining/3.0;f[8]=side*double(slash)/s.mirrorCount;f[9]=side*double(s.turn)/LIMIT;
}
inline double evaluate(const State& s,int root,Context& c){
    c.stats.evaluations++;
    int diff=s.score[root]-s.score[1-root];
    if(finished(s))return (diff>0?10000:diff<0?-10000:0)+diff*100;
    double f[FEATURE_COUNT];features(s,root,f);c.stats.traceCalls++;
    return diff*100+8*f[3]+4*f[4]+f[5];
}
inline double unitValue(const State& s,int root,Context& c){
    if(finished(s))return terminalReward(s,root);
    return clamp(.5+evaluate(s,root,c)/650.0,.01,.99);
}
}
