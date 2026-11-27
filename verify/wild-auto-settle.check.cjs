// 附近战斗自动结算：从 bridge.js 抽出新函数，在模拟的逐楼层变量上跑几种情形。
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(require('path').join(__dirname,'..','st-bridge','bridge.js'),'utf8');
const a=src.indexOf('function statSourceIdBefore('),b=src.indexOf('async function finishWildBatch(){');
const code=src.slice(a,b);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
function mk(){
  const S={chatArr:[],vars:{},generationInFlight:false,generationBaseline:null,generationSerial:0,injectionCutoff:Infinity,destroyed:false,timers:[],writes:0};
  const ctx={
    S,console,Set,Number,Array,JSON,Math,
    chat:()=>S.chatArr,getMsgVars:i=>S.vars[i],isStaleInitialSnapshot:()=>false,
    readPkm:()=>{for(let i=S.chatArr.length-1;i>=0;i--)if(S.vars[i]?.stat_data?.pkm)return JSON.parse(JSON.stringify(S.vars[i].stat_data.pkm));},
    writePkm:async fn=>{const id=S.chatArr.length-1;const p=ctx.readPkm();await fn(p);S.vars[id]={stat_data:{pkm:p}};S.writes++;},
    LOG:()=>{},SYNC_DELAYS:[2500,6000,12000],PKMBondSync:{textKey:t=>String(t)},
    setTimeout:(f)=>S.timers.push(f),
  };
  for(const k of ['generationInFlight','generationBaseline','generationSerial','injectionCutoff','destroyed'])Object.defineProperty(ctx,k,{get:()=>S[k],set:v=>S[k]=v});
  vm.createContext(ctx);vm.runInContext(code+';this.API={statSourceIdBefore,unsettledWild,wildBatchLines,autoWildSettlePrompt,scheduleWildAutoSettleCleanup,get plan(){return autoWildSettle}};',ctx);
  return ctx;
}
const item=(sp,floor,at)=>({floor,species:sp,level:5,outcome:'victory',turns:3,exp:[{name:'妙蛙种子',exp:40,from:10,to:11,share:'全额',evolutions:[],learnedMoves:['藤鞭'],pendingMoves:[]}],effort:[],warnings:[],log:'妙蛙种子使用了撞击',at});
const pkmWith=list=>({wild:{pendingResults:list}});
const flush=async c=>{const t=c.S.timers.splice(0);for(const f of t)f();await new Promise(r=>setImmediate(r));};

(async()=>{
 // 楼层：0 开场AI, 1 用户, 2 AI(刷了两场), 3 用户发下一条
 let c=mk(),S=c.S,A=c.API;
 S.chatArr=[{mes:'开场'},{is_user:true,mes:'去草丛'},{mes:'到了草丛'}];
 S.vars={0:{stat_data:{pkm:pkmWith([])}},2:{stat_data:{pkm:pkmWith([item('绿毛虫',2,111),item('波波',2,222)])}}};
 ok(A.unsettledWild(c.readPkm(),A.statSourceIdBefore()).length===2,'当前楼层显示 2 场待结算');
 S.chatArr.push({is_user:true,mes:'我们继续往前走'});
 S.generationInFlight=true;S.generationSerial=1;S.generationBaseline={type:'normal',lastAiId:2};
 let p=A.autoWildSettlePrompt(S.chatArr,c.readPkm());
 ok(p.includes('【附近战斗·后台自动结算】')&&p.includes('2 场')&&p.includes('野生绿毛虫')&&p.includes('野生波波')&&p.includes('学会藤鞭'),'发下一条消息时自动把 2 场汇总注入本轮');
 ok(p.includes('经过：妙蛙种子使用了撞击'),'场数少时附带战斗经过');
 ok(A.plan&&A.plan.count===2,'记录了本轮自动结算计划');
 // AI 回复楼层 4；MVU 把变量复制到 4（仍含旧记录）
 S.chatArr.push({mes:'一路上打了几场'});S.vars[4]={stat_data:{pkm:pkmWith([item('绿毛虫',2,111),item('波波',2,222)])}};
 S.generationInFlight=false;
 ok(A.unsettledWild(c.readPkm(),A.statSourceIdBefore()).length===0,'新一层出现后旧记录立即判为已结算（即使还没清理）');
 A.scheduleWildAutoSettleCleanup(4);await flush(c);
 ok(S.vars[4].stat_data.pkm.wild.pendingResults.length===0&&S.writes===1,'回复完成后自动清掉暂存记录');
 ok(S.vars[2].stat_data.pkm.wild.pendingResults.length===2,'历史楼层原样保留（重新生成时还能用）');
 // 下一轮不再注入
 S.chatArr.push({is_user:true,mes:'去下一个镇'});S.generationInFlight=true;S.generationSerial=2;S.generationBaseline={type:'normal',lastAiId:4};
 ok(A.autoWildSettlePrompt(S.chatArr,c.readPkm())==='','再下一层不会重复注入');
 // 重新生成楼层 4：cutoff=3
 c=mk();S=c.S;A=c.API;
 S.chatArr=[{mes:'开场'},{is_user:true,mes:'a'},{mes:'b'},{is_user:true,mes:'c'},{mes:'d'}];
 S.vars={2:{stat_data:{pkm:pkmWith([item('绿毛虫',2,111)])}},4:{stat_data:{pkm:pkmWith([])}}};
 S.generationInFlight=true;S.generationSerial=5;S.generationBaseline={type:'regenerate',lastAiId:4};S.injectionCutoff=3;
 const rp=A.autoWildSettlePrompt(S.chatArr.slice(0,4),(()=>JSON.parse(JSON.stringify(S.vars[2].stat_data.pkm)))());
 ok(rp.includes('野生绿毛虫'),'重新生成/滑动候选时同样带上这批汇总');
 // continue 不注入
 c=mk();S=c.S;A=c.API;
 S.chatArr=[{mes:'开场'},{is_user:true,mes:'a'},{mes:'b'}];S.vars={2:{stat_data:{pkm:pkmWith([item('绿毛虫',2,111)])}}};
 S.generationInFlight=true;S.generationSerial=1;S.generationBaseline={type:'continue',lastAiId:2};
 ok(A.autoWildSettlePrompt(S.chatArr,c.readPkm())==='','“继续”生成不插入战斗汇总');
 // 生成被中止：没有新 AI 楼层，下次发送仍会带上
 S.generationBaseline={type:'normal',lastAiId:2};S.chatArr.push({is_user:true,mes:'走吧'});
 ok(A.autoWildSettlePrompt(S.chatArr,c.readPkm()).includes('野生绿毛虫'),'生成中止后记录保留，下一次发送仍自动结算');
 // 玩家已手动提交
 S.chatArr[3]={is_user:true,mes:'<pkm_result>{"type":"wild-training-batch","count":1}</pkm_result>'};
 ok(A.autoWildSettlePrompt(S.chatArr,c.readPkm())==='','玩家手动提交过的不重复注入');
 // 旧存档（没有 floor）
 c=mk();S=c.S;A=c.API;
 const legacy=item('小拉达',undefined,333);delete legacy.floor;
 S.chatArr=[{mes:'开场'},{is_user:true,mes:'a'},{mes:'b'},{is_user:true,mes:'c'}];S.vars={2:{stat_data:{pkm:pkmWith([legacy])}}};
 S.generationInFlight=true;S.generationSerial=1;S.generationBaseline={type:'normal',lastAiId:2};
 ok(A.autoWildSettlePrompt(S.chatArr,c.readPkm()).includes('野生小拉达'),'旧版暂存记录（无楼层）也会自动结算');
 S.chatArr.push({mes:'回复'});S.vars[4]={stat_data:{pkm:pkmWith([legacy])}};S.generationInFlight=false;
 A.scheduleWildAutoSettleCleanup(4);await flush(c);
 ok(S.vars[4].stat_data.pkm.wild.pendingResults.length===0,'旧版记录在回复后按标识清掉');
 // 很多场时省略经过
 const many=Array.from({length:12},(_,i)=>item('绿毛虫',2,1000+i));
 ok(!A.wildBatchLines(many,many.length<=8).includes('经过：')&&A.wildBatchLines(many,true).includes('经过：'),'超过 8 场时只给摘要不附逐场经过');
 console.log(fails?`${fails} FAILED`:'ALL PASS');process.exit(fails?1:0);
})();
