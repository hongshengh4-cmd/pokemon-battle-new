// SPDX-License-Identifier: MIT
// Main-thread coordinator. The worker is a separate message endpoint. Only
// observation() is sent, never a Battle, roster save, RNG, or player command.
import {AI_BUILD,TIERS,resolveTrainerAI} from './profile.mjs?v=20261118-foulplay-browser-ai-v1';
import {observation,rememberPublic,legalActions,quickChoice,actionKey,hash} from './battle-view.mjs?v=20261118-foulplay-browser-ai-v1';
export {AI_BUILD,resolveTrainerAI};
export function profileForBattle(cfg,difficulty,enemyKey){
 if(cfg?.aiProfile?.version===AI_BUILD&&TIERS[cfg.aiProfile.tier])return{...cfg.aiProfile,settings:{...TIERS[cfg.aiProfile.tier]}};
 return resolveTrainerAI({type:cfg?.encounter?.type==='wild'?'wild':enemyKey==='champion'?'champion':enemyKey==='gym'?'gym':'trainer',opponent:cfg?.rules?.opponent||enemyKey||'对手',ai:cfg?.ai,difficulty:cfg?cfg.difficulty:difficulty});
}
export class BrowserBattleAI{
 constructor({workerFactory=()=>new Worker(new URL('./search-worker.mjs?v='+AI_BUILD,import.meta.url),{type:'module',name:'Pokémon AI'}),timeout=5500,bootTimeout=12000}={}){
  this.workerFactory=workerFactory;this.timeout=timeout;this.bootTimeout=bootTimeout;this.worker=null;this.pending=new Map();this.serial=0;this.readyPromise=null;this.states=new WeakMap();
  const buffer=new Uint32Array(1);globalThis.crypto?.getRandomValues?.(buffer);this.salt=buffer[0]||hash(String(Date.now()));
 }
 _reset(error){const worker=this.worker;this.worker=null;this.readyPromise=null;worker?.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()}
 _ensure(){
  if(this.readyPromise)return this.readyPromise;
  try{
   const worker=this.workerFactory();this.worker=worker;
   worker.onmessage=e=>{const d=e.data||{},p=this.pending.get(d.requestId);if(!p)return;this.pending.delete(d.requestId);clearTimeout(p.timer);if(d.build!==AI_BUILD)p.reject(Error('AI版本不匹配，请完整覆盖文件并刷新'));else if(d.error)p.reject(Error(d.error));else p.resolve(d)};
   worker.onerror=e=>{if(this.worker!==worker)return;e.preventDefault?.();this._reset(Error('后台AI线程加载失败'))};
   this.readyPromise=this._rpc('init',{},this.bootTimeout).catch(error=>{if(this.worker===worker)this._reset(error);throw error});
  }catch(error){return Promise.reject(error)}
  return this.readyPromise;
 }
 _rpc(type,data,timeout=this.timeout){
  return new Promise((resolve,reject)=>{if(!this.worker){reject(Error('浏览器不支持后台线程'));return}const requestId=++this.serial;
   const timer=setTimeout(()=>this._reset(Error('设备搜索超时，已终止后台计算')),timeout);this.pending.set(requestId,{resolve,reject,timer});
   try{this.worker.postMessage({type,requestId,...data})}catch(error){clearTimeout(timer);this.pending.delete(requestId);reject(error)}
  });
 }
 warm(){return this._ensure().catch(()=>null)}
 attach(b,profile,{onStatus=()=>{}}={}){
  if(!TIERS[profile?.tier])profile=resolveTrainerAI({});profile={...profile,settings:{...TIERS[profile.tier]}};
  if(this.activeBattle&&this.activeBattle!==b)this._reset(Error('已切换新对战'));this.activeBattle=b;
  const state={profile,onStatus,key:null,promise:null,result:null,turn:-1,active:null};this.states.set(b,state);
  b.aiProfile=profile;b.aiInfo={mode:'ready',tier:profile.tier,label:profile.label,build:AI_BUILD};
  b.aiController={consume:(slot,reserved)=>this.consume(b,slot,reserved),replacement:()=>this.replacement(b)};
  b.aiObserver={see:p=>{if(p?._side===0)rememberPublic(p)}};
  for(const p of b.activeMons(0))rememberPublic(p);
  onStatus(b.aiInfo,profile);void this.warm();return state;
 }
 async prepare(b){
  const s=this.states.get(b);if(!s||b.winner!==null||b.pendingSwitch!==null||b._turnState)return null;
  const view=observation(b,s.profile),key=JSON.stringify(view);
  if(s.key===key&&s.promise)return s.promise;
  s.key=key;s.result=null;s.turn=b.turnCount;s.active=b.activeSlots[1].join(',');
  const emit=info=>{if(s.key!==key)return;b.aiInfo={tier:s.profile.tier,label:s.profile.label,...info,build:AI_BUILD};s.onStatus(b.aiInfo,s.profile)};
  emit({mode:'thinking',tier:s.profile.tier,label:s.profile.label});
  const promise=(async()=>{
   let result;
   try{await this._ensure();result=await this._rpc('decide',{observation:view,seed:hash(key)^this.salt});if(!Array.isArray(result.actions)||result.actions.length!==(b.double?2:1))throw Error('AI未返回完整行动');}
   catch(error){const reserved=new Set(),actions=Array.from({length:b.double?2:1},(_,slot)=>{const a=quickChoice(b,slot,reserved);if(a.kind==='switch')reserved.add(a.index);return a});result={build:AI_BUILD,mode:'emergency',actions,info:{mode:'emergency',tier:s.profile.tier,label:s.profile.label,worlds:0,visits:0,reasons:[String(error.message||error)]}};}
   if(s.key===key&&b.turnCount===s.turn&&b.activeSlots[1].join(',')===s.active){s.result=result;emit(result.info)}
   return result;
  })();s.promise=promise;return promise;
 }
 consume(b,slot=0,reserved=new Set()){
  const s=this.states.get(b),legal=legalActions(b,1,slot,reserved);let action;
  if(s?.result&&s.turn===b.turnCount&&s.active===b.activeSlots[1].join(',')){
   const candidate=s.result.actions[slot];if(candidate)action=legal.find(a=>actionKey(a)===actionKey(candidate));
  }
  if(!action){action=quickChoice(b,slot,reserved);b.aiInfo={mode:'emergency',tier:s?.profile.tier,label:s?.profile.label,reasons:['同步安全策略：无可用的本回合搜索结果'],build:AI_BUILD};s?.onStatus(b.aiInfo,s.profile)}
  return{...action,...(action.target?{target:{...action.target}}:{})};
 }
 replacement(b){
  const effect=globalThis.PKMTypeChart.effectiveness,foes=b.activeMons(0);let best=-1,score=-Infinity;
  for(let i=0;i<b.teams[1].length;i++){
   const p=b.teams[1][i];if(p.fainted||p.hp<=0||b.activeSlots[1].includes(i))continue;
   const off=Math.max(0,...p.moves.filter(m=>m.ppLeft>0&&m.category!=='Status').flatMap(m=>foes.map(f=>effect(m.type,f.types)*(p.types.includes(m.type)?1.5:1))));
   const risk=Math.max(1,...foes.flatMap(f=>f.types.map(t=>effect(t,p.types))));
   const c=b.field.sides[1],hazard=(c.stealthrock?effect('Rock',p.types)/8:0)+(p.types.includes('Flying')?0:([0,.125,1/6,.25][Math.min(3,c.spikes||0)]));
   const v=off*1.5-risk*1.2+p.hp/p.maxHp*2-hazard*8;if(v>score){score=v;best=i}
  }return best;
 }
 dispose(){this._reset(Error('AI线程已关闭'))}
}
export function showAIStatus(element,info,profile){
 if(!element)return;const mode=info.mode||'ready',labels={ready:'剧情AI · 就绪',thinking:'剧情AI · 后台思考中', 'poke-engine':'Foul Play策略 · poke-engine搜索',compatibility:'兼容AI · 近似前瞻',emergency:'安全AI · 临时降级'};
 element.dataset.mode=mode;element.textContent=`${profile.label} · ${labels[mode]||mode}`;
 const intent={teaching:'指导赛',restrained:'收敛实力',casual:'非认真对战',serious:'认真对战'}[profile.intent]||'';
 element.title=[`人物档位：${TIERS[profile.storyTier]?.label||profile.label} → 本场：${profile.label}（${intent}）`,`依据：${profile.reason||profile.source||'默认'}`,info.worlds?`${info.worlds}组公开信息假设；${info.visits||0}次MCTS访问；${info.elapsed||0}毫秒`:'',...(info.reasons||[]),'不会改动数值；不会读取玩家未公开指令。双打和特殊机制不等同于原版Foul Play。'].filter(Boolean).join('\n');
}
