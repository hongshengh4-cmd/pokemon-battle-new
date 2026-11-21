// SPDX-License-Identifier: GPL-3.0-only
// Stand-alone message-based AI worker. Readable corresponding sources shipped.
// Foul Play policy port is GPL-3.0-only; poke-engine, PS and independent helpers
// retain MIT notices. See licenses/ and the delivered source/research notes.
import init,{search,catalog} from './wasm/poke-search.mjs?v=20261118-foulplay-browser-ai-v1';
import {AI_BUILD,NATIVE_BUILD,TIERS} from './profile.mjs?v=20261118-ai-elite-v3';
import {tacticalPolicy,TACTICS_BUILD} from './tactical-policy.mjs?v=20261118-ai-elite-v3';
import {id,seeded,hash,actionKey} from './battle-view.mjs?v=20261118-ai-elite-v3';
import {sampleWorld,compatibilityReasons,engineRequest} from './model.mjs?v=20261118-ai-elite-v3';
import {sampleBeliefWorld} from './belief-model.mjs?v=20261118-ai-elite-v3';
import {compatibilitySearch} from './compatibility.mjs?v=20261118-ai-elite-v3';
import {aggregatePolicies,samplePolicy} from './foulplay-policy.mjs?v=20261118-foulplay-browser-ai-v1';
let readyPromise,environment;
export async function boot(){
 if(readyPromise)return readyPromise;
 readyPromise=(async()=>{
  const [dex,moves,learnsets]=await Promise.all(['pokedex','moves','learnsets'].map(async name=>{const r=await fetch(new URL(`../data/${name}.json`,import.meta.url));if(!r.ok)throw Error(name+': HTTP '+r.status);return r.json();}));
  let native=null,catalogSets=null,wasmError=null,canonical=null,canonicalError=null,canonicalCommit=null;
  try{await init({module_or_path:new URL('./wasm/poke-search_bg.wasm?v='+NATIVE_BUILD,import.meta.url)});native=search;const raw=JSON.parse(catalog());catalogSets=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,new Set(v.map(id))]));}catch(e){wasmError=String(e.message||e);}
  try{
   const module=await import('./canonical-search.mjs?v='+AI_BUILD);
   if(module.SEARCH_BUILD!==AI_BUILD)throw Error('规则前瞻模块版本不匹配');
   module.bootCanonical();canonical=module.canonicalSearch;canonicalCommit=module.CANONICAL_COMMIT;
  }catch(e){canonicalError=String(e.message||e);}
  environment={db:{dex,moves,learnsets,supportedMoves:catalogSets?.moves},native,catalog:catalogSets,wasmError,canonical,canonicalError,canonicalCommit};return environment;
 })();return readyPromise;
}
function styleWeight(actions,view,db){const style=view.profile.style;if(style==='balanced')return 1;let weight=1;for(let slot=0;slot<actions.length;slot++){const a=actions[slot];if(a.kind!=='move'){if(style==='defensive')weight*=1.05;continue;}const p=view.own[view.active[0][slot]],m=db.moves[p?.moves[a.index]?.id];if(!m)continue;if(style==='aggressive'&&m.category!=='Status'||style==='defensive'&&(m.heal||m.volatileStatus==='protect')||style==='setup'&&m.boosts||style==='disruptive'&&(m.status||m.sideCondition))weight*=1.12;}return weight;}
export function decide(view,env,{seed=hash(JSON.stringify(view)),iterations=0}={}){
 if(!view||!Array.isArray(view.own)||!view.own.length||view.own.length>6||!Array.isArray(view.opponent)||!view.opponent.length||view.opponent.length>6)throw Error('invalid observation');
 // Never trust a caller-provided search budget. Only registered scene tiers.
 const tier=TIERS[view.profile?.tier]?view.profile.tier:'regular';
 view={...view,profile:{...view.profile,tier,label:TIERS[tier].label,settings:{...TIERS[tier]}}};
 const {db}=env,rng=seeded(seed),settings=view.profile.settings,started=performance.now(),deadline=started+settings.milliseconds;
 let reasons=compatibilityReasons(view,db,env.catalog);if(!env.native)reasons.push('WASM不可用：'+(env.wasmError||'not loaded'));
 if(view.legal.some(xs=>xs.some(a=>a.struggle)))reasons.push('挣扎行动兼容');
 let mode='poke-engine',worlds=0,totalVisits=0,nodes=0,policy=null,actionMap=new Map(),canonicalInfo=null;
 const wantsCanonical=!!settings.canonical&&typeof env.canonical==='function';
 if(!reasons.length){
  try{
   const results=[],nativeBudget=wantsCanonical?Math.max(80,Math.floor(settings.milliseconds*.3)):settings.milliseconds;
   for(let i=0;i<settings.worlds;i++){
    // New high-tier hypotheses keep role, EVs, item and moves coherent. The
    // existing, conservative low-tier sampler remains available unchanged.
    const world=(wantsCanonical?sampleBeliefWorld:sampleWorld)(view,db,rng),remaining=nativeBudget-(performance.now()-started),ms=Math.max(2,Math.round(remaining/(settings.worlds-i)));
    const request=engineRequest(world,view,ms);if(iterations>0)request.iterations=Math.min(250000,iterations);
    const response=JSON.parse(env.native(JSON.stringify(request)));if(response.error)throw Error(response.error);if(response.build!==NATIVE_BUILD)throw Error('WASM构建版本不匹配');
    if(!(response.totalVisits>0)||!response.options?.length)throw Error('上游未返回有效搜索策略');
    response.weight=1;results.push(response);worlds++;totalVisits+=response.totalVisits;
    if(performance.now()-started>=nativeBudget)break;
   }
   policy=aggregatePolicies(results);for(const a of view.legal[0])actionMap.set(actionKey(a),[a]);
   policy=policy.filter(p=>actionMap.has(p.key)).map(p=>({...p,weight:p.weight*styleWeight(actionMap.get(p.key),view,db)}));
   if(!policy.length)throw Error('上游策略与当前合法行动不匹配');
  }catch(e){if(/unreachable|out of bounds|RuntimeError/.test(String(e))){env.native=null;env.wasmError='上游WASM执行异常，后续使用规则前瞻/兼容策略';}reasons.push('搜索适配降级：'+String(e.message||e));policy=null;worlds=0;}
 }
 if(wantsCanonical){
  try{
   const result=env.canonical(view,db,{seed,deadline,nativePrior:policy||[]});
   if(result.build!==AI_BUILD||result.commit!==env.canonicalCommit)throw Error('规则前瞻构建标识不匹配');
   if(!result.policy?.length)throw Error('规则前瞻未返回策略');
   canonicalInfo=result.info;policy=result.policy;actionMap=result.actionMap;nodes=result.info.nodes;mode=totalVisits>0?'hybrid-search':'showdown-search';
   // Earlier reasons describe why native MCTS alone cannot represent this
   // position, NOT that canonical rule execution has been replaced by a fake.
   reasons=reasons.map(s=>s.replace('（兼容决策）','（改用Showdown规则前瞻）'));
  }catch(error){reasons.push('规则前瞻降级：'+String(error.message||error));}
 }else if(settings.canonical&&env.canonicalError)reasons.push('规则前瞻不可用：'+env.canonicalError);
 if(!policy){
  mode='compatibility';actionMap=new Map();const weights=new Map(),count=Math.min(settings.worlds,3),fallbackDeadline=Math.min(deadline,performance.now()+350);
  for(let i=0;i<count;i++){
   const world=sampleWorld(view,db,rng),res=compatibilitySearch(world,view,db,{deadline:fallbackDeadline});nodes+=res.nodes;worlds++;
   const sum=res.choices.reduce((s,c)=>s+c.weight,0)||1;
   for(const c of res.choices){const key=c.actions.map(actionKey).join('|');actionMap.set(key,c.actions);weights.set(key,(weights.get(key)||0)+c.weight/sum*styleWeight(c.actions,view,db));}
   if(performance.now()>fallbackDeadline)break;
  }
  policy=[...weights].map(([key,weight])=>({key,weight:weight/(worlds||1)})).sort((a,b)=>b.weight-a.weight);
 }
 // Canonical root guards/tempo costs were incorporated BEFORE solving the
 // simultaneous game. Do not multiply its equilibrium distribution afterward
 // or trim it to a visit-share window: genuine mixed strategies need support.
 let tacticalNotes=[];
 if(!canonicalInfo){const guarded=tacticalPolicy(policy,actionMap,view,db);policy=guarded.policy;tacticalNotes=guarded.notes;}
 else tacticalNotes=['双方同时决策；跨隐藏假设共享己方根策略','特殊机制与行动顺序由固定版Showdown执行',...canonicalInfo.notes];
 const key=samplePolicy(policy,canonicalInfo?{window:0,mistake:settings.mistake}:settings,rng),actions=actionMap.get(key);if(!actions)throw Error('no legal AI decision');
 return{build:AI_BUILD,mode,actions,info:{mode,tacticsBuild:TACTICS_BUILD,tacticalNotes,tier,label:settings.label,worlds:canonicalInfo?.worlds||worlds,nativeWorlds:worlds,visits:totalVisits,nodes,elapsed:Math.round(performance.now()-started),canonical:canonicalInfo?{commit:env.canonicalCommit,...canonicalInfo}:null,reasons:[...new Set(reasons)].slice(0,12),policy:policy.slice(0,12).map(p=>({key:p.key,weight:Math.round(p.weight*10000)/10000}))}};
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function'&&typeof document==='undefined'){
 self.onmessage=async event=>{
  const {requestId,type,observation,seed}=event.data||{};
  try{
   const env=await boot();
   if(type==='init'){self.postMessage({requestId,build:AI_BUILD,ready:true,native:!!env.native,wasmError:env.wasmError,canonical:!!env.canonical,canonicalCommit:env.canonicalCommit,canonicalError:env.canonicalError});return;}
   if(type!=='decide')throw Error('unknown worker request');
   self.postMessage({requestId,...decide(observation,env,{seed})});
  }catch(e){self.postMessage({requestId,build:AI_BUILD,error:String(e.message||e)});}
 };
}
