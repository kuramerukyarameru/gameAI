// Single source of truth for the browser game and every built-in AI.
#include "cpp/engine.hpp"
#include "cpp/registry.hpp"
extern "C" void* memset(void* p,int v,unsigned long n){volatile unsigned char* a=(volatile unsigned char*)p;for(unsigned long i=0;i<n;i++)a[i]=(unsigned char)v;return p;}
extern "C" void* memcpy(void* p,const void* q,unsigned long n){volatile unsigned char* a=(volatile unsigned char*)p;const volatile unsigned char* b=(const volatile unsigned char*)q;for(unsigned long i=0;i<n;i++)a[i]=b[i];return p;}
using namespace laser;
static State state;static Trace shot;static Diagnostics diagnostics;
static int certificate[3][202],packedTrace[5500],generationAttempts=0;
static double featureBuffer[FEATURE_COUNT];static char manifest[16384];
static char* put(char* p,const char* s){while(*s)*p++=*s++;return p;}
#define API extern "C" __attribute__((visibility("default")))
API int state_ptr(){return (int)(unsigned long)&state;}
API int state_size(){return sizeof(State)/sizeof(int);}
API int trace_ptr(){return (int)(unsigned long)packedTrace;}
API int diagnostics_ptr(){return (int)(unsigned long)&diagnostics;}
API int certificate_ptr(){return (int)(unsigned long)certificate;}
API int generation_attempts(){return generationAttempts;}
API int validate_state(){return valid(state);}
API int is_finished(){return finished(state);}
static void pack(){int* o=packedTrace;*o++=shot.hits;for(int i=0;i<3;i++){*o++=shot.length[i];*o++=shot.stop[i];for(int j=0;j<shot.length[i];j++){*o++=shot.xy[i][j][0];*o++=shot.xy[i][j][1];}}}
API int fire(){shot=Trace{};int hit=trace(state,&shot);pack();return hit;}
API int play(int move){shot=Trace{};int hit=apply(state,move,&shot);if(hit>=0)pack();return hit;}
API int make_board(unsigned int seed,int count){if(!generate(state,seed,count,generationAttempts,certificate))return 0;fire();return 1;}
API int choose_ai(int index,unsigned int seed,int budget,int millis,int depth,int width){
    diagnostics=Diagnostics{};
    if(index<0||index>=AGENT_COUNT||budget<1000||budget>2000000||millis<0||millis>10000||depth<1||depth>10||width<1||width>MAX_MIRRORS||finished(state)||!valid(state))return -1;
    Context c(seed,budget,millis,depth,width,diagnostics);diagnostics.move=AGENTS[index].choose(state,c);return diagnostics.move;
}
API int feature_ptr(int root){features(state,root,featureBuffer);return (int)(unsigned long)featureBuffer;}
API int agent_manifest(){
    char* p=manifest;p=put(p,"{\"engine\":\"2.0.0\",\"generator\":\"density-certified-v2\",\"agents\":[");
    for(int i=0;i<AGENT_COUNT;i++){if(i)*p++=',';p=put(p,"{\"id\":\"");p=put(p,AGENTS[i].id);p=put(p,"\",\"name\":\"");p=put(p,AGENTS[i].name);p=put(p,"\",\"version\":\"2.0.0\"}");}
    p=put(p,"]}");*p=0;return (int)(unsigned long)manifest;
}
