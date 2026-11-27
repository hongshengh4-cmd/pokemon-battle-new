/*
Replacement wiring revision: public-reserves-v71.
Original integration license retained below; revision changes are documented.
Browser AI integration helpers - MIT notice

MIT License

Copyright (c) 2026 Contributors to the browser AI integration

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// SPDX-License-Identifier: MIT
// Main-thread coordinator. The worker is a separate message endpoint. Only
// observation() is sent, never a Battle, roster save, RNG, or player command.
import {AI_BUILD,TIERS,searchTier,resolveTrainerAI,TIER_WIRING_BUILD} from './profile.mjs?v=npc-tier-wiring-v1&cmd=kanto-crown-v72';
import {observation,rememberPublic,legalActions,quickChoice,actionKey,hash,seeded,replacementObservation,publicAppearance} from './battle-view.mjs?v=20261118-ai-elite-v3&cmd=kanto-crown-v72';
import {COMMAND_BUILD} from './entry-command.mjs?v=kanto-crown-v72';
import {settleFoeRead,armFoeRead} from './expert/foe-reads.mjs?v=foe-reads-v1';
// The league remembers how YOU play: public reads carry over between battles on this device
// (Elite Four -> Champion). Only model candidates/logits and which public action you took; no team data.
const FOE_READS_KEY='pkm-ai-foe-reads-v1';
function loadFoeReads(){try{const x=JSON.parse(globalThis.localStorage?.getItem(FOE_READS_KEY)||'null');return Array.isArray(x?.reads)?x.reads.filter(r=>r&&typeof r.k==='string'&&Array.isArray(r.cands)).slice(-16):[];}catch(_){return [];}}
function saveFoeReads(reads){try{globalThis.localStorage?.setItem(FOE_READS_KEY,JSON.stringify({v:1,reads:reads.slice(-24)}));}catch(_){}}
import {chooseReserve} from './circuit/council.mjs?v=crown-72&expert=human-prior-v2';
import {laneCount,fuse} from './circuit/lanes.mjs?v=crown-72';
export {AI_BUILD,resolveTrainerAI,TIER_WIRING_BUILD,COMMAND_BUILD};
import {REPLACEMENT_BUILD,rankReplacementPlans,chooseReplacementPlan} from './replacement-policy.mjs?v=public-reserves-v71&expert=human-prior-v2';
export {REPLACEMENT_BUILD};
export function profileForBattle(cfg,difficulty,enemyKey){
 if(cfg?.aiProfile?.version===AI_BUILD&&cfg.aiProfile.wiringVersion===TIER_WIRING_BUILD&&TIERS[cfg.aiProfile.tier]){
  // Import only supported scene profile fields; unrelated old-card metadata must not
  // leak into the observation (or change the hash used for the search seed).
  const p=cfg.aiProfile,keys=['version','wiringVersion','tier','storyTier','characterTier','characterName','characterTierSource','characterTierStatus','tierWarnings','requestedIntent','intentReason','style','intent','source','reason','opponent','leagueStage','minimumTier'];return {...Object.fromEntries(keys.filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]])),label:TIERS[p.tier].label,settings:{...TIERS[p.tier]}};
 }
 const context={...(cfg||{}),...(cfg?.aiContext||{})};
 const owner=cfg?.p2?.entrants?.length===1?cfg.p2.entrants[0]:null;const type=context.type||cfg?.encounter?.type||'trainer';
 return resolveTrainerAI({...context,type,opponent:context.opponent||cfg?.rules?.opponent||owner?.name||(cfg?'对手':enemyKey)||'对手',trainerRank:context.trainerRank??owner?.trainerRank,ai:context.ai||cfg?.ai||owner?.ai,difficulty:cfg?.aiContext?cfg.aiContext.difficulty:context.difficulty??difficulty});
}
export class BrowserBattleAI{
 constructor({workerFactory=()=>new Worker(new URL('./search-worker.mjs?v='+AI_BUILD+'&cmd='+COMMAND_BUILD+'&replacement='+REPLACEMENT_BUILD+'&expert=human-prior-v2',import.meta.url),{type:'module',name:'Pokémon AI'}),timeout=3000,bootTimeout=20000}={}){
  this.aux=[];this.workerFactory=workerFactory;this.timeout=timeout;this.bootTimeout=bootTimeout;this.worker=null;this.pending=new Map();this.serial=0;this.readyPromise=null;this.states=new WeakMap();
  const buffer=new Uint32Array(1);globalThis.crypto?.getRandomValues?.(buffer);this.salt=buffer[0]||hash(String(Date.now()));
 }
 _reset(error){const worker=this.worker;this.worker=null;this.readyPromise=null;worker?.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()}
 _ensure(){
  if(this.readyPromise)return this.readyPromise;
  try{
   const worker=this.workerFactory();this.worker=worker;
   worker.onmessage=e=>{const d=e.data||{},p=this.pending.get(d.requestId);if(!p)return;this.pending.delete(d.requestId);clearTimeout(p.timer);if(d.build!==AI_BUILD||d.commandVersion!==COMMAND_BUILD||d.replacementBuild!==REPLACEMENT_BUILD)p.reject(Error('AI版本不匹配，请完整覆盖文件并刷新'));else if(d.error)p.reject(Error(d.error));else p.resolve(d)};
   worker.onerror=e=>{if(this.worker!==worker)return;e.preventDefault?.();this._reset(Error('后台AI线程加载失败'))};
   this.readyPromise=this._rpc('init',{},this.bootTimeout).catch(error=>{if(this.worker===worker)this._reset(error);throw error});
  }catch(error){return Promise.reject(error)}
  return this.readyPromise;
 }
 _rpc(type,data,timeout=this.timeout){
  return new Promise((resolve,reject)=>{if(!this.worker){reject(Error('浏览器不支持后台线程'));return}const requestId=++this.serial;
   const timer=setTimeout(()=>this._reset(Error('设备搜索超时，已终止后台计算')),timeout);this.pending.set(requestId,{resolve,reject,timer});
   try{this.worker.postMessage({type,requestId,...data,build:AI_BUILD,commandVersion:COMMAND_BUILD,replacementBuild:REPLACEMENT_BUILD})}catch(error){clearTimeout(timer);this.pending.delete(requestId);reject(error)}
  });
 }
 warm(){return this._ensure().catch(()=>null)}
 _configureLanes(tier){for(const x of this.aux)x.dispose();this.aux=[];if(typeof document==='undefined'||typeof Worker==='undefined')return;let setting='auto';try{setting=localStorage.getItem('kanto-circuit-workers')||'auto';}catch{}const n=laneCount(tier,{cpus:navigator.hardwareConcurrency||1,gb:navigator.deviceMemory||0,mobile:globalThis.matchMedia?.('(pointer: coarse)').matches||false,setting});for(let i=1;i<n;i++){const peer=new BrowserBattleAI({workerFactory:this.workerFactory,timeout:this.timeout,bootTimeout:this.bootTimeout});this.aux.push(peer);void peer.warm();}}
 async _pool(view,seed,ms){const start=performance.now(),limit=Math.max(this.timeout,ms+1500);const ok=[];const errors=[];const primary=this._rpc('decide',{observation:view,seed},limit);if(!this.aux.length){const r=await primary;r.info.lanes=1;return r;}
  const work=[primary,...this.aux.map((p,i)=>(async()=>{await p._ensure();if(p.pending.size||performance.now()-start>Math.min(180,ms*.15))return null;return await p._rpc('decide',{observation:view,expert:i===0?'native':'rules',seed:(seed^Math.imul(i+1,0x85ebca6b))>>>0},limit);})())].map((task,i)=>task.then(r=>{if(r)ok.push([i,r]);},e=>errors.push(e.message)));
  let timer;try{await Promise.race([Promise.all(work),new Promise(done=>{timer=setTimeout(done,ms+480);})]);}finally{clearTimeout(timer);}if(!ok.length){await work[0];if(!ok.length)throw Error('并行引擎均无结果：'+errors.join('；'));}return fuse(view,ok.sort((a,b)=>a[0]-b[0]).map(x=>x[1]),seed,performance.now()-start);
 }
 attach(b,profile,{onStatus=()=>{}}={}){
  if(b.rulesEngine?.id==='pokemon-showdown'&&(globalThis.PKMBattle?.replacementVersion!==REPLACEMENT_BUILD||globalThis.PKMBattle?.commandVersion!==COMMAND_BUILD))throw Error('补位AI与实战适配器版本不匹配，请完整覆盖运行文件并刷新。');
  if(!TIERS[profile?.tier])profile=resolveTrainerAI({});profile={...profile,settings:{...TIERS[profile.tier]}};
  if(this.activeBattle&&this.activeBattle!==b)this._reset(Error('已切换新对战'));this.activeBattle=b;
  const state={profile,onStatus,key:null,promise:null,result:null,turn:-1,active:null,memory:{at:b.turnCount,switchRuns:[0,0],recent:[],foeReads:[]},foeMem:{pending:null,reads:loadFoeReads()},planned:new Map()};state.memory.foeReads=state.foeMem.reads.slice(-24);this.states.set(b,state);
  b.aiProfile=profile;b.aiInfo={mode:'ready',tier:profile.tier,label:profile.label,build:AI_BUILD};
  b.aiController={consume:(slot,reserved)=>this.consume(b,slot,reserved),replacement:()=>this.replacement(b),replacements:request=>this.replacements(b,request),replacementFailure:reason=>this.replacementFailure(b,reason)};
  b.aiObserver={see:p=>{if(p?._side===0)rememberPublic(p)}};
  for(const p of b.activeMons(0))rememberPublic(p);
  onStatus(b.aiInfo,profile);this._configureLanes(searchTier(profile.tier));void this.warm();return state;
 }
 _syncMemory(b,s){
  if(!s||b.turnCount<=s.memory.at)return;
  const switched=[false,false],recent=[],consecutive=b.turnCount===s.memory.at+1;
  // Resolved turn -> public record of what the player chose (for the elite/champion in-battle read).
  try{if(consecutive&&!b.double){if(settleFoeRead(s.foeMem,b._ps,0))saveFoeReads(s.foeMem.reads);}else s.foeMem.pending=null;}catch(_){s.foeMem.pending=null;}
  for(const [slot,p]of s.planned){
   if(p.turn!==s.memory.at||!consecutive)continue;
   if(p.action.kind==='switch'&&b.activeSlots[1][slot]===p.action.index&&p.from!==p.action.index&&b.teams[1][p.from]?.hp>0){switched[slot]=true;recent.push({turn:p.turn,slot,kind:'switch',from:p.from,to:p.action.index});}
   else if(p.action.kind==='move')recent.push({turn:p.turn,slot,kind:'move',index:p.action.index});
  }
  const switchRuns=switched.map((yes,slot)=>yes?(s.memory.switchRuns[slot]||0)+1:0);
  s.memory={at:b.turnCount,switchRuns,recent:[...s.memory.recent,...recent].filter(r=>b.turnCount-r.turn<=4).slice(-12),foeReads:s.foeMem.reads.slice(-24)};s.planned.clear();
 }
 async prepare(b){
  const s=this.states.get(b);if(!s||b.winner!==null||b.pendingSwitch!==null||b._turnState)return null;
  this._syncMemory(b,s);
  const view=observation(b,s.profile,s.memory),key=JSON.stringify(view);
  if(s.key===key&&s.promise)return s.promise;
  s.key=key;s.result=null;s.turn=b.turnCount;s.active=b.activeSlots[1].join(',');
  const emit=info=>{if(s.key!==key)return;b.aiInfo={tier:s.profile.tier,label:s.profile.label,...info,build:AI_BUILD};s.onStatus(b.aiInfo,s.profile)};
  emit({mode:'thinking',tier:s.profile.tier,label:s.profile.label});
  const promise=(async()=>{
   let result;
   try{await this._ensure();result=await this._pool(view,hash(key)^this.salt,s.profile.settings.milliseconds);if(!Array.isArray(result.actions)||result.actions.length!==(b.double?2:1))throw Error('AI未返回完整行动');}
   catch(error){const reserved=new Set(),actions=Array.from({length:b.double?2:1},(_,slot)=>{const a=quickChoice(b,slot,reserved,s.memory);if(a.kind==='switch')reserved.add(a.index);return a});result={build:AI_BUILD,mode:'emergency',actions,info:{mode:'emergency',tier:s.profile.tier,label:s.profile.label,worlds:0,visits:0,reasons:[String(error.message||error)]}};}
   if(s.key===key&&b.turnCount===s.turn&&b.activeSlots[1].join(',')===s.active){s.result=result;emit(result.info)}
   return result;
  })();s.promise=promise;return promise;
 }
 consume(b,slot=0,reserved=new Set()){
  const s=this.states.get(b);this._syncMemory(b,s);
  const legal=legalActions(b,1,slot,reserved);let action;
  if(s?.result&&s.turn===b.turnCount&&s.active===b.activeSlots[1].join(',')){
   const candidate=s.result.actions[slot];if(candidate)action=legal.find(a=>actionKey(a)===actionKey(candidate));
   if(action&&slot===0&&s.result.info?.foePredict)try{armFoeRead(s.foeMem,s.result.info.foePredict,b._ps);}catch(_){}
  }
  if(!action){action=quickChoice(b,slot,reserved,s?.memory);b.aiInfo={mode:'emergency',tier:s?.profile.tier,label:s?.profile.label,reasons:['同步安全策略：无可用的本回合搜索结果'],build:AI_BUILD};s?.onStatus(b.aiInfo,s.profile)}
  if(s)s.planned.set(slot,{turn:b.turnCount,from:b.activeSlots[1][slot],action:{kind:action.kind,index:action.index}});
  return{...action,...(action.target?{target:{...action.target}}:{})};
 }
 replacements(b,request){
  const s=this.states.get(b),profile=s?.profile||resolveTrainerAI({}),view=replacementObservation(b,profile),B=globalThis.PKMBattle;
  if(!B?._dex||!B?._moves)throw Error('替补AI公开物种／招式资料尚未就绪');
  const db={dex:B._dex,moves:B._moves,learnsets:B._circuitLearnsets};
  const plans=rankReplacementPlans(view,request,db),seed=hash(JSON.stringify({view,request})),slot=request.slots[0];let review=null;
  // A reserve adviser may break a close SINGLES tie only among complete, legal,
  // non-lethal native plans. Doubles, passes and revives keep their joint planner.
  if(!view.double&&!view.firstFaintLoses&&request.totalSlots===1&&slot.kind==='switch'&&db.learnsets&&!['novice','wild'].includes(profile.tier)&&view.opponent[view.active[1][0]]?.hpPercent>0){
   const safe=plans.filter(x=>x.actions[0]?.kind==='switch'&&!x.details[0]?.entryDeath),near=safe.filter(x=>x.score>=safe[0].score-22);
   if(near.length>1){const ids=near.map(x=>x.actions[0].index),base=ids[0],move=slot.phase==='pivot'?(slot.relayMove||'pivot'):null;
    try{const pick=chooseReserve(view,db,ids,move,seed,base),row=near.find(x=>x.actions[0].index===pick);if(row&&pick!==base){row.score=safe[0].score+.01;plans.sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));row.details[0].reasons.push('联赛复核：依据公开配装假设，在合法近优后备中改选');}review={candidates:ids.length,changed:!!row&&pick!==base};}catch{review={candidates:ids.length,unavailable:true};}
   }
  }
  const plan=chooseReplacementPlan(plans,view.profile,{rng:seeded(seed^this.salt)});
  // A pending ordinary-turn result must never be reused across an interrupted
  // switch/revive phase. No player replacement choice is accepted here.
  if(s){s.key=null;s.result=null;s.promise=null;}
  b.aiReplacementInfo={build:REPLACEMENT_BUILD,mode:'public-replacement',tier:profile.tier,review,actions:plan.actions.map(a=>({...a})),reasons:[...new Set(plan.details.flatMap(x=>x?.reasons||[]))],candidates:plans.length};
  return plan.actions.map(a=>({...a}));
 }
 replacement(b){
  const candidates=b.teams[1].map((p,i)=>({p,i})).filter(({p,i})=>p.hp>0&&!p.fainted&&!b.activeSlots[1].includes(i)).map(({i})=>i);
  if(!candidates.length)return -1;
  const request={totalSlots:1,switchesLeft:1,passesLeft:0,slots:[{slot:0,kind:'switch',phase:'faint',candidates}]};
  return this.replacements(b,request).find(a=>a.kind==='switch')?.index??-1;
 }
 replacementFailure(b,reason){
  const s=this.states.get(b);b.aiReplacementInfo={build:REPLACEMENT_BUILD,mode:'fallback',reason:String(reason).slice(0,200)};
  b.aiInfo={...b.aiInfo,mode:'emergency',replacementBuild:REPLACEMENT_BUILD,reasons:['替补AI安全兜底：'+String(reason).slice(0,160)]};s?.onStatus(b.aiInfo,s.profile);
 }
 dispose(){for(const x of this.aux)x.dispose();this.aux=[];this._reset(Error('AI线程已关闭'))}
}
export function showAIStatus(element,info,profile){
 if(!element)return;const mode=info.mode||'ready',labels={ready:'剧情AI · 就绪',thinking:'剧情AI · 后台思考中', 'poke-engine':'Foul Play策略 · poke-engine搜索','hybrid-search':'WASM＋Showdown · 联合前瞻','showdown-search':'Showdown规则 · 多假设前瞻',compatibility:'兼容AI · 近似前瞻',emergency:'安全AI · 临时降级'};
 element.dataset.mode=mode;element.textContent=`${profile.label} · 联赛指挥 v7.2${info.lanes>1?' ×'+info.lanes:''} · ${labels[mode]||mode}`;
 const intent={teaching:'指导赛',restrained:'收敛实力',casual:'非认真对战',serious:'认真对战'}[profile.intent]||'';
 element.title=[info.master?.oracle?`宝可梦大师：已读取你的完整配置（${info.master.team} 只宝可梦的招式、道具、特性、性格／努力值／个体值、太晶属性、未出场队员与当前状态），每个推演世界都是真实队伍；不读取你本回合的指令，也不读取随机数`:'指挥策略：联赛指挥 v7.2（公开信息）',info.lanes?`本回合 ${info.lanes} 条独立搜索；按完整联合行动合票`:'' ,info.crown?`高档指挥：${info.crown.fused?'多路策略合并':info.crown.worlds+' 组规则矩阵'}；${info.crown.guarded||0} 个公开风险项；不读取对手指令`:'',info.humanPrior?`高分对局先验：Showdown 天梯 ≥1800 对局学习的出招模型，λ=${info.humanPrior.lambda}${info.humanPrior.top?`；高手倾向 ${String(info.humanPrior.top.key).replace(/^move:(\d+).*/,(_,i)=>`第${+i+1}个招式`).replace(/^switch:(\d+)/,(_,i)=>`换上${+i+1}号队员`)}（${Math.round(info.humanPrior.top.p*100)}%）`:''}`:info.canonical?.humanModel?`高分对局读招：按天梯≥1800玩家的应对习惯做最优反制，混合度 α=${info.canonical.humanModel.alpha}`:'',info.canonical?.valueBlend?`局势评估：${info.canonical.valueBlend>=1?"采用":`${Math.round(info.canonical.valueBlend*100)}% 融合`}从 1.28 万场天梯≥1800 对局胜负中学习的局势估值`:'',info.foeRead?`对手习惯读取：已观察你 ${info.foeRead.n} 次公开选择（换人倾向 ${info.foeRead.beta>0?'+':''}${info.foeRead.beta}，抢伤害倾向 ${info.foeRead.gamma>0?'+':''}${info.foeRead.gamma}，重复出招 ${info.foeRead.rho>0?'+':''}${info.foeRead.rho}），读招力度 ×${info.foeRead.alphaScale}`:'',info.circuit?`联赛复核：${info.circuit.worlds} 个假设／${info.circuit.calcCalls} 次伤害查询；配装来源 ${Object.keys(info.circuit.sources).join('、')}（F=对战工厂，R=随机单打，D=随机双打，local=自定义兜底）`:'',info.circuit?.verdict||'',`人物档位：${TIERS[profile.storyTier]?.label||profile.label} → 本场：${profile.label}（${intent}）`,`档位来源：${profile.source||'默认'}`,profile.reason?`配置理由：${profile.reason}`:'',profile.characterName?`人物资料：${profile.characterName} / ${profile.characterTier||profile.characterTierStatus||'未指定'} / ${profile.characterTierSource||'—'}`:'',...(profile.tierWarnings||[]),info.worlds?`${info.worlds}组公开信息假设；${info.visits||0}次MCTS访问；${info.nodes||0}次规则推演；${info.elapsed||0}毫秒`:'',...(info.reasons||[]),'开战时的敌方缺省努力值由培养模块生成；回合中不改面板，不读取玩家未公开指令。双打和特殊机制不等同于原版Foul Play。'].filter(Boolean).join('\n');
}
