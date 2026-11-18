// SPDX-License-Identifier: GPL-3.0-only
// Stand-alone message-based AI worker. Its JS sources are shipped readable.
// Foul Play policy port is GPL-3.0-only; poke-engine and other new helpers
// retain their MIT notices. See licenses/ and the separate corresponding source.
import init,{search,catalog} from './wasm/poke-search.mjs?v=20261118-foulplay-browser-ai-v1';
import {AI_BUILD,TIERS} from './profile.mjs?v=20261118-foulplay-browser-ai-v1';
import {id,seeded,hash,actionKey} from './battle-view.mjs?v=20261118-foulplay-browser-ai-v1';
import {sampleWorld,compatibilityReasons,engineRequest} from './model.mjs?v=20261118-foulplay-browser-ai-v1';
import {compatibilitySearch} from './compatibility.mjs?v=20261118-foulplay-browser-ai-v1';
import {aggregatePolicies,samplePolicy} from './foulplay-policy.mjs?v=20261118-foulplay-browser-ai-v1';
let readyPromise,environment;
export async function boot(){
 if(readyPromise)return readyPromise;
 readyPromise=(async()=>{
  const [dex,moves,learnsets]=await Promise.all(['pokedex','moves','learnsets'].map(async name=>{const r=await fetch(new URL(`../data/${name}.json`,import.meta.url));if(!r.ok)throw Error(name+': HTTP '+r.status);return r.json()}));
  let native=null,catalogSets=null,wasmError=null;
  try{await init({module_or_path:new URL('./wasm/poke-search_bg.wasm?v='+AI_BUILD,import.meta.url)});native=search;const raw=JSON.parse(catalog());catalogSets=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,new Set(v.map(id))]));}catch(e){wasmError=String(e.message||e)}
  environment={db:{dex,moves,learnsets,supportedMoves:catalogSets?.moves},native,catalog:catalogSets,wasmError};return environment;
 })();
 return readyPromise;
}
function styleWeight(actions,view,db){const style=view.profile.style;if(style==='balanced')return 1;let weight=1;for(let slot=0;slot<actions.length;slot++){const a=actions[slot];if(a.kind!=='move'){if(style==='defensive')weight*=1.05;continue}const p=view.own[view.active[0][slot]],m=db.moves[p?.moves[a.index]?.id];if(!m)continue;if(style==='aggressive'&&m.category!=='Status'||style==='defensive'&&(m.heal||m.volatileStatus==='protect')||style==='setup'&&m.boosts||style==='disruptive'&&(m.status||m.sideCondition))weight*=1.12;}return weight}
export function decide(view,env,{seed=hash(JSON.stringify(view)),iterations=0}={}){
 if(!view||!Array.isArray(view.own)||!view.own.length||view.own.length>6||!Array.isArray(view.opponent)||!view.opponent.length||view.opponent.length>6)throw Error('invalid observation');
 // Never trust caller-provided arbitrary search budgets.
 view={...view,profile:{...view.profile,settings:{...(TIERS[view.profile?.tier]||TIERS.regular)}}};
 const {db}=env,rng=seeded(seed),settings=view.profile.settings,started=performance.now();
 let reasons=compatibilityReasons(view,db,env.catalog);if(!env.native)reasons.push('WASM不可用：'+(env.wasmError||'not loaded'));
 if(view.legal.some(xs=>xs.some(a=>a.struggle)))reasons.push('挣扎行动兼容');
 let results=[],mode='poke-engine',worlds=0,totalVisits=0,nodes=0,policy,actionMap=new Map();
 if(!reasons.length){
  try{
   for(let i=0;i<settings.worlds;i++){
    const w=sampleWorld(view,db,rng),remaining=settings.milliseconds-(performance.now()-started),ms=Math.max(2,Math.round(remaining/(settings.worlds-i)));
    const request=engineRequest(w,view,ms);if(iterations>0)request.iterations=Math.min(250000,iterations);
    const response=JSON.parse(env.native(JSON.stringify(request)));if(response.error)throw Error(response.error);if(response.build!==AI_BUILD)throw Error('WASM构建版本不匹配');
    if(!(response.totalVisits>0)||!response.options?.length)throw Error('上游未返回有效搜索策略');
    response.weight=1;results.push(response);worlds++;totalVisits+=response.totalVisits;
    if(performance.now()-started>settings.milliseconds*1.6)break;
   }
   policy=aggregatePolicies(results);for(const a of view.legal[0])actionMap.set(actionKey(a),[a]);
   policy=policy.filter(p=>actionMap.has(p.key)).map(p=>({...p,weight:p.weight*styleWeight(actionMap.get(p.key),view,db)}));
   if(!policy.length)throw Error('上游策略与当前合法行动不匹配');
  }catch(e){if(/unreachable|out of bounds|RuntimeError/.test(String(e))){env.native=null;env.wasmError='上游WASM执行异常，后续使用兼容策略';}reasons.push('搜索适配降级：'+String(e.message||e));policy=null;results=[];worlds=0;}
 }
 if(!policy){
  mode='compatibility';actionMap=new Map();const weights=new Map(),count=Math.min(settings.worlds,3),deadline=performance.now()+Math.min(350,settings.milliseconds);
  for(let i=0;i<count;i++){
   const world=sampleWorld(view,db,rng),res=compatibilitySearch(world,view,db,{deadline});nodes+=res.nodes;worlds++;
   const sum=res.choices.reduce((s,c)=>s+c.weight,0)||1;
   for(const c of res.choices){const key=c.actions.map(actionKey).join('|');actionMap.set(key,c.actions);weights.set(key,(weights.get(key)||0)+c.weight/sum*styleWeight(c.actions,view,db));}
   if(performance.now()>deadline)break;
  }
  policy=[...weights].map(([key,weight])=>({key,weight:weight/(worlds||1)})).sort((a,b)=>b.weight-a.weight);
 }
 const key=samplePolicy(policy,settings,rng),actions=actionMap.get(key);if(!actions)throw Error('no legal AI decision');
 return{build:AI_BUILD,mode,actions,info:{mode,tier:view.profile.tier,label:view.profile.label,worlds,visits:mode==='poke-engine'?totalVisits:0,nodes,elapsed:Math.round(performance.now()-started),reasons:[...new Set(reasons)].slice(0,12),policy:policy.slice(0,10).map(p=>({key:p.key,weight:Math.round(p.weight*10000)/10000}))}};
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function'&&typeof document==='undefined'){
 self.onmessage=async event=>{
  const {requestId,type,observation,seed}=event.data||{};
  try{
   const env=await boot();
   if(type==='init'){self.postMessage({requestId,build:AI_BUILD,ready:true,native:!!env.native,wasmError:env.wasmError});return}
   if(type!=='decide')throw Error('unknown worker request');
   self.postMessage({requestId,...decide(observation,env,{seed})});
  }catch(e){self.postMessage({requestId,build:AI_BUILD,error:String(e.message||e)})}
 };
}
