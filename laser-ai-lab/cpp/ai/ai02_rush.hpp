#pragma once
namespace laser {
// A deliberately explainable baseline, not a solved/optimal player.
// Immediate captures + one opponent reply + verified route alignment.
inline int rushAI(const State& s,Context& ctx){
    if(finished(s))return -1;
    Plan paths[3];int rootDistance=99;
    for(int c=0;c<3;c++){
        paths[c]=plan(s,c);ctx.stats.graphVisits+=paths[c].visited;ctx.stats.simulations+=paths[c].simulations;
        if(paths[c].count<rootDistance)rootDistance=paths[c].count;
    }
    int order[MIRRORS];for(int i=0;i<MIRRORS;i++)order[i]=i;
    for(int i=MIRRORS-1;i>0;i--){int j=ctx.rng.below(i+1),t=order[i];order[i]=order[j];order[j]=t;}
    int player=s.turn%2,best=-2000000000,chosen=order[0];
    // Divide the remaining simulation budget evenly across candidates.
    int replyLimit=(ctx.budget-ctx.stats.simulations-MIRRORS)/MIRRORS;
    if(replyLimit<0)replyLimit=0;if(replyLimit>MIRRORS)replyLimit=MIRRORS;
    for(int index=0;index<MIRRORS;index++){
        int m=order[index];State next;int mask=simulate(s,m,next,ctx),gain=bits(mask),reply=0;
        if(!finished(next)){
            for(int j=0;j<replyLimit;j++){
                State after;int r=bits(simulate(next,order[(j+index)%MIRRORS],after,ctx));
                if(r>reply)reply=r;
                if(reply==3-next.score[0]-next.score[1])break;
            }
            if(replyLimit<MIRRORS)ctx.stats.budgetHit=1;
        }
        int distance=99;
        for(int c=0;c<3;c++)if(next.owner[c]<0&&paths[c].count<99){
            int remaining=0;
            for(int p=0;p<CELLS;p++)if(paths[c].desired[p]&&next.board[p]!=paths[c].desired[p])remaining++;
            if(remaining<distance)distance=remaining;
        }
        int own=next.score[player],opp=next.score[1-player]+reply;
        int score=(own-opp)*100000+gain*10000;
        if(own>=2)score+=10000000;
        if(opp>=2)score-=10000000;
        if(distance<99)score+=(rootDistance-distance)*300-distance*100;
        ctx.stats.ratings[m]=score;ctx.stats.considered++;
        if(score>best){best=score;chosen=m;ctx.stats.planSteps=distance;ctx.stats.immediate=gain;ctx.stats.reply=reply;}
    }
    return chosen;
}
}
