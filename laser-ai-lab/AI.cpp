// Public WebAssembly ABI. The UI and every AI use this same C++ engine.
#include "cpp/engine.hpp"
#include "cpp/registry.hpp"
extern "C" void* memset(void* p,int v,unsigned long n){volatile unsigned char* a=(volatile unsigned char*)p;for(unsigned long i=0;i<n;i++)a[i]=(unsigned char)v;return p;}
extern "C" void* memcpy(void* p,const void* q,unsigned long n){volatile unsigned char* a=(volatile unsigned char*)p;const volatile unsigned char* b=(const volatile unsigned char*)q;for(unsigned long i=0;i<n;i++)a[i]=b[i];return p;}
using namespace laser;
static State state;
static Trace shot;
static Diagnostics diagnostics;
static int certificate[3][102];
static int packedTrace[5500];
static int generationAttempts=0;
static char manifest[16384];
static char* put(char* p,const char* s){while(*s)*p++=*s++;return p;}
static char* jsonString(char* p,const char* s){*p++='"';while(*s){if(*s=='"'||*s=='\\')*p++='\\';if((unsigned char)*s>=32)*p++=*s;s++;}*p++='"';return p;}
#define API extern "C" __attribute__((visibility("default")))
API int state_ptr(){return (int)(unsigned long)&state;}
API int state_size(){return sizeof(State)/sizeof(int);}
API int trace_ptr(){return (int)(unsigned long)packedTrace;}
API int diagnostics_ptr(){return (int)(unsigned long)&diagnostics;}
API int certificate_ptr(){return (int)(unsigned long)certificate;}
API int generation_attempts(){return generationAttempts;}
API int validate_state(){return valid(state);}
API int is_finished(){return finished(state);}
static void pack(){
    int* o=packedTrace;*o++=shot.hits;
    for(int i=0;i<3;i++){*o++=shot.length[i];*o++=shot.stop[i];for(int j=0;j<shot.length[i];j++){*o++=shot.xy[i][j][0];*o++=shot.xy[i][j][1];}}
}
API int fire(){shot=Trace{};int hit=trace(state,&shot);pack();return hit;}
API int play(int move){shot=Trace{};int hit=apply(state,move,&shot);if(hit>=0)pack();return hit;}
API int make_board(unsigned int seed){
    if(!generate(state,seed,generationAttempts))return 0;
    for(int c=0;c<3;c++){Plan p=plan(state,c);certificate[c][0]=p.count;for(int i=0;i<p.count;i++)certificate[c][i+1]=p.moves[i];}
    fire();return 1;
}
API int choose_ai(int index,unsigned int seed,int budget){
    diagnostics=Diagnostics{};
    if(index<0||index>=AGENT_COUNT||budget<1000||budget>10000000||finished(state)||!valid(state))return -1;
    Context ctx(seed,budget,diagnostics);
    diagnostics.move=AGENTS[index].choose(state,ctx);
    return diagnostics.move;
}
API int agent_manifest(){
    char* p=manifest;p=put(p,"{\"engine\":\"1.0.0\",\"generator\":\"certified-random-v1\",\"agents\":[");
    for(int i=0;i<AGENT_COUNT;i++){
        if(i)*p++=',';
        p=put(p,"{\"id\":");p=jsonString(p,AGENTS[i].id);
        p=put(p,",\"name\":");p=jsonString(p,AGENTS[i].name);
        p=put(p,",\"description\":");p=jsonString(p,AGENTS[i].description);
        p=put(p,",\"version\":");p=jsonString(p,AGENTS[i].version);*p++='}';
    }
    p=put(p,"]}");*p=0;return (int)(unsigned long)manifest;
}
