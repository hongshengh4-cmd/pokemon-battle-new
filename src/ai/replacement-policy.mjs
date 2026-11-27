/* SPDX-License-Identifier: MIT
 * Original public-information replacement policy for this project's EXISTING
 * rules. This module does NOT execute battle rules, change HP/stats/equipment,
 * inspect a live Battle/PS queue, or import another card's code or mechanics.
 * Inputs are a sanitized observation, our own rule-request candidates, and the
 * project's existing public Dex. Damage/speed below are ordering ESTIMATES;
 * the unchanged pinned Showdown engine alone validates and resolves choices.
 */
import {replacementPrior} from './expert/human-prior.mjs?v=human-prior-v2';
import {effectiveness} from './tactical-policy.mjs?v=20261118-ai-elite-v3';
export const REPLACEMENT_BUILD='public-reserves-v71';
const id=x=>String(x??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const stage=n=>(n=clamp(n,-6,6),n>=0?(2+n)/2:2/(2-n));
const alive=p=>!!p&&p.hp>0&&!p.fainted;
const fraction=p=>p.maxHp>0?clamp(p.hp/p.maxHp,0,1):0;
const copyStages=p=>({atk:0,def:0,spa:0,spd:0,spe:0,...p});
const weather=v=>id(v.weatherId||v.weather);
const sun=v=>['sun','sunnyday','harshsun','desolateland'].includes(weather(v));
const rain=v=>['rain','raindance','heavyrain','primordialsea'].includes(weather(v));
const itemActive=(p,v)=>!v.field?.magicRoom&&!p.volatile?.embargo&&id(p.ability)!=='klutz';
const itemOf=(p,v)=>itemActive(p,v)?id(p.item):'';
const abilityOf=p=>p.abilitySuppressed?'':id(p.ability);
function baselineStats(sp,level){
 const out={};level=clamp(level||50,1,100);
 for(const k of ['hp','atk','def','spa','spd','spe']){const n=Math.floor((2*(sp?.baseStats?.[k]||80)+31)*level/100);out[k]=k==='hp'?(sp?.baseStats?.hp===1?1:n+level+10):n+5;}
 return out;
}
// This whitelist deliberately ignores any accidental foe.stats/ivs/evs/nature/
// private move set/item field. Only revealed moves/ability/item are accepted.
export function publicReplacementFoe(p,db){
 const species=id(p?.species),sp=db.dex?.[species]||{},stats=baselineStats(sp,p?.level),maxHp=stats.hp*(p?.dynamaxed?2:1);
 const item=p?.itemKnown?id(p.item):'';
 return {species,level:p?.level||50,types:[...(p?.types||sp.types||['Normal'])],stats,maxHp,hp:Math.max(0,Math.ceil(maxHp*clamp(p?.hpPercent,0,100)/100)),stages:copyStages(p?.stages),status:p?.status||null,ability:id(p?.ability),item,itemKnown:!!p?.itemKnown,volatile:{...p?.volatile},dynamaxed:!!p?.dynamaxed,terastallized:!!p?.terastallized,teraType:p?.terastallized?p?.types?.[0]:null,moves:(p?.moves||[]).map(m=>({id:id(m.id),used:Math.max(0,Number(m.used)||0)}))};
}
function grounded(p,v){
 if(v.field?.gravity>0||p.volatile?.ingrain||p.volatile?.smackdown||itemOf(p,v)==='ironball')return true;
 return !p.types?.includes('Flying')&&abilityOf(p)!=='levitate'&&itemOf(p,v)!=='airballoon'&&!p.volatile?.magnetrise&&!p.volatile?.telekinesis;
}
function hits(type,p,v,attacker){
 let e=effectiveness(type,p.types);const a=abilityOf(p),mold=['moldbreaker','teravolt','turboblaze'].includes(abilityOf(attacker));
 if(type==='Ground'&&!grounded(p,v)&&!(mold&&a==='levitate'&&!p.types.includes('Flying')&&itemOf(p,v)!=='airballoon'&&!p.volatile?.magnetrise&&!p.volatile?.telekinesis))return 0;
 if(!mold&&((type==='Water'&&['waterabsorb','stormdrain','dryskin'].includes(a))||(type==='Electric'&&['voltabsorb','lightningrod','motordrive'].includes(a))||(type==='Fire'&&['flashfire','wellbakedbody'].includes(a))||(type==='Grass'&&a==='sapsipper')))return 0;
 if(!mold&&a==='wonderguard'&&e<=1)return 0;
 return e;
}
export function replacementEntry(p,v){
 const c=v.field?.sides?.[1]||{},boots=itemOf(p,v)==='heavydutyboots',magic=abilityOf(p)==='magicguard',ground=grounded(p,v);
 let damage=0;
 if(!boots&&!magic){
  if(c.stealthrock)damage+=Math.max(1,Math.floor(p.maxHp*effectiveness('Rock',p.types)/8));
  if(ground&&c.spikes)damage+=Math.max(1,Math.floor(p.maxHp*[0,1/8,1/6,1/4][clamp(c.spikes,0,3)]));
 }
 const absorbsToxicSpikes=!boots&&ground&&p.types.includes('Poison')&&!!c.toxicspikes;
 const poison=!boots&&ground&&!!c.toxicspikes&&!p.status&&!p.types.some(t=>['Poison','Steel'].includes(t))&&!['immunity','pastelveil','purifyingsalt'].includes(abilityOf(p));
 const web=!boots&&ground&&!!c.stickyweb&&!['clearbody','whitesmoke','fullmetalbody'].includes(abilityOf(p));
 return {damage,afterHp:Math.max(0,p.hp-damage),poison,web,absorbsToxicSpikes};
}
function speed(p,v,side){
 let n=(p.stats.spe||80)*stage(p.stages?.spe),a=abilityOf(p),item=itemOf(p,v);
 if(p.status==='par'&&a!=='quickfeet')n*=.5;
 if(p.status&&a==='quickfeet')n*=1.5;
 if(item==='choicescarf')n*=1.5;
 if(['ironball','machobrace','poweranklet','powerband','powerbelt','powerbracer','powerlens','powerweight'].includes(item))n*=.5;
 if(v.field?.sides?.[side]?.tailwind)n*=2;
 if(a==='chlorophyll'&&sun(v)||a==='swiftswim'&&rain(v)||a==='sandrush'&&['sand','sandstorm'].includes(weather(v))||a==='slushrush'&&['snow','hail','snowscape'].includes(weather(v)))n*=2;
 if(a==='surgesurfer'&&id(v.field?.terrain).replace(/terrain$/,'')==='electric')n*=2;
 if(a==='unburden'&&p.volatile?.unburden)n*=2;
 if(p.volatile?.slowstart)n*=.5;
 return Math.max(1,n);
}
function priority(p,m){
 let n=Number(m.priority)||0;
 if(abilityOf(p)==='galewings'&&m.type==='Flying'&&p.hp===p.maxHp)n++;
 if(abilityOf(p)==='triage'&&m.flags?.heal)n+=3;
 return n;
}
function before(p,f,m,v){
 const own=priority(p,m),known=Math.max(0,...f.moves.map(x=>v.db.moves?.[x.id]).filter(x=>x&&x.category!=='Status').map(x=>priority(f,x)));
 if(own!==known)return own>known;
 const a=speed(p,v,1),b=speed(f,v,0);return v.field?.trickRoom>0?a<b:a>b;
}
function estimate(p,f,m,v){
 if(!m||m.category==='Status')return {damage:0,low:0,priority:0};
 const e=hits(m.type,f,v,p),pri=priority(p,m);
 if(!e||pri>0&&(grounded(f,v)&&id(v.field?.terrain).replace(/terrain$/,'')==='psychic'||['queenlymajesty','dazzling','armortail'].includes(abilityOf(f))))return {damage:0,low:0,priority:pri};
 let damage=0,lowRatio=.85/.925;
 if(m.damage==='level')damage=p.level;
 else if(typeof m.damage==='number')damage=m.damage;
 else if(['superfang','naturesmadness','ruination'].includes(m.id))damage=f.hp/2;
 else if(m.id==='endeavor')damage=Math.max(0,f.hp-p.hp);
 else if(m.ohko){damage=p.level>=f.level?f.hp*.3:0;lowRatio=0;}
 else{
  let power=Number(m.basePower)||50;
  if(['eruption','waterspout','dragonenergy'].includes(m.id))power=150*fraction(p);
  if(m.id==='gyroball')power=Math.min(150,25*speed(f,v,0)/speed(p,v,1)+1);
  if(m.id==='electroball'){const r=speed(p,v,1)/speed(f,v,0);power=r>=4?150:r>=3?120:r>=2?80:r>=1?60:40;}
  const phys=m.category==='Physical',ak=m.id==='bodypress'?'def':phys?'atk':'spa',dk=['psyshock','psystrike','secretsword'].includes(m.id)?'def':phys?'def':'spd',source=m.id==='foulplay'?f:p;
  let a=(source.stats[ak]||80)*stage(source.stages?.[ak]),d=(f.stats[dk]||80)*stage(f.stages?.[dk]);
  if(phys&&['hugepower','purepower'].includes(abilityOf(p)))a*=2;
  if(abilityOf(p)==='guts'&&p.status&&phys)a*=1.5;
  if(itemOf(p,v)==='choiceband'&&phys||itemOf(p,v)==='choicespecs'&&!phys)a*=1.5;
  if(itemOf(f,v)==='assaultvest'&&!phys)d*=1.5;
  if(itemOf(f,v)==='eviolite'&&v.db.dex?.[f.species]?.evos?.length)d*=1.5;
  damage=((2*p.level/5+2)*power*a/Math.max(1,d)/50+2)*.925;
  const original=(p.originalTypes||p.types).includes(m.type),tera=p.terastallized&&p.teraType===m.type;
  if(original||tera)damage*=original&&tera?2:1.5;
  if(phys&&p.status==='brn'&&abilityOf(p)!=='guts'&&m.id!=='facade')damage*=.5;
  damage*=e;
  if(itemOf(p,v)==='lifeorb')damage*=1.3;
  if(sun(v))damage*=m.type==='Fire'?1.5:m.type==='Water'?.5:1;
  if(rain(v))damage*=m.type==='Water'?1.5:m.type==='Fire'?.5:1;
  if(m.multihit){const count=typeof m.multihit==='number'?m.multihit:abilityOf(p)==='skilllink'?m.multihit[1]:itemOf(p,v)==='loadeddice'?4.5:3.1;damage*=count;}
 }
 let low=damage*lowRatio;
 if(m.damage||['superfang','naturesmadness','ruination','endeavor'].includes(m.id))low=damage;
 const accuracy=m.accuracy===true?1:clamp(m.accuracy||100,0,100)/100;
 damage*=accuracy;
 if(accuracy<.9)low=0;
 if(['suckerpunch','thunderclap','focuspunch','shelltrap','beakblast'].includes(m.id)){damage*=.65;low=0;}
 if((itemOf(f,v)==='focussash'||abilityOf(f)==='sturdy')&&f.hp===f.maxHp&&!m.multihit)low=Math.min(low,Math.max(0,f.hp-1));
 if(p.status==='slp'&&!['sleeptalk','snore'].includes(m.id)){damage*=.2;low=0;}
 return {damage:Math.max(0,damage),low:Math.max(0,low),priority:pri};
}
function knownThreats(f,db){
 const known=f.moves.map(x=>({...db.moves?.[x.id],id:x.id})).filter(m=>m.category&&m.category!=='Status');
 // Public species STAB is an EXPLICIT neutral prior, not a private set read.
 const category=f.stats.atk>=f.stats.spa?'Physical':'Special';
 return [...known,...f.types.map(type=>({id:'public-type-prior',type,category,basePower:75,accuracy:100,priority:0}))];
}
export function scoreReplacement(view,request,slot,index,db){
 const raw=view.own[index],kind=slot.kind||'switch';
 if(!raw)return {score:-Infinity,reasons:['目标不存在']};
 const p={...raw,species:id(raw.species||raw.speciesId),ability:id(raw.ability),item:id(raw.item),stats:{...raw.stats},types:[...(raw.types||['Normal'])],stages:copyStages(kind==='revive'?{}:slot.passStages),volatile:{},moves:(raw.moves||[]).map(x=>({...x})),level:raw.level||50};
 // A replacement starts without the outgoing mon's transient locks. Only an
 // explicit native Baton Pass request carries stages; never grant new boosts.
 if(kind==='revive'){if(alive(raw))return {score:-Infinity,reasons:['复生目标必须已倒下']};p.hp=Math.max(1,Math.floor(p.maxHp/2));p.fainted=false;}
 else if(!alive(raw)||view.active[0].includes(index))return {score:-Infinity,reasons:['替补必须存活且不在场']};
 const v={...view,db},entry=kind==='revive'?{damage:0,afterHp:p.hp,poison:false,web:false,absorbsToxicSpikes:false}:replacementEntry(p,v),reasons=[];
 p.hp=entry.afterHp;
 if(!p.hp)return {score:-1000-entry.damage/Math.max(1,p.maxHp),entryDeath:true,reasons:['公开入场伤害会击倒该替补'],targetScores:[]};
 if(entry.web)p.stages.spe=(p.stages.spe||0)+(abilityOf(p)==='contrary'?1:-1);
 let score=30*fraction(p)-65*entry.damage/p.maxHp-(entry.poison?12:0)+(entry.absorbsToxicSpikes?9:0);
 if(entry.damage)reasons.push('计入公开入场钉伤');
 if(entry.absorbsToxicSpikes)reasons.push('落地毒属性可吸收毒菱');
 const foes=view.active[1].map(i=>view.opponent[i]).filter(f=>f&&!f.unseen&&f.hpPercent>0).map(f=>publicReplacementFoe(f,db));
 const attacks=p.moves.filter(x=>(x.ppLeft??x.pp??0)>0).map(x=>({...db.moves?.[x.id],...x,id:id(x.id)})).filter(m=>m.category&&m.category!=='Status');
 let bestOffense=0,incoming=0;
 const targetScores=foes.map((f,foeSlot)=>{
  let best=0,canFinish=false,fastFinish=false;
  for(const m of attacks){
   const hit=estimate(p,f,m,v);let value=28*Math.min(hit.damage,f.hp)/Math.max(1,f.maxHp); // Do not reward wasted overkill.
   const kill=hit.low>=f.hp&&hit.low>0,fast=before(p,f,m,v);
   if(kill){value+=fast?42:12;canFinish=true;if(fast)fastFinish=true;}
   if(m.selfdestruct)value-=25*fraction(p);
   if(m.recoil)value-=8;
   if(value>best)best=value;
  }
  const reversed={...v,field:{...v.field,sides:[v.field?.sides?.[1]||{},v.field?.sides?.[0]||{}]}};
  const threat=Math.max(0,...knownThreats(f,db).map(m=>estimate(f,p,m,reversed).damage));
  incoming+=threat/Math.max(1,p.maxHp);bestOffense=Math.max(bestOffense,best);
  return {foeSlot,score:best,canFinish,fastFinish};
 });
 const pivot=slot.phase==='pivot';
 score+=bestOffense-(pivot?42:24)*Math.min(2,incoming);
 if(incoming>=fraction(p))score-=pivot?28:10;
 if(!attacks.length)score-=14;
 if(p.status==='slp'||p.status==='frz')score-=12;
 if(kind==='revive')score+=15; // Future member restored, not a free switch-in.
 if(targetScores.some(x=>x.fastFinish))reasons.push('按公开估计有先手／先制收割机会');
 if(pivot)reasons.push('折返接班计入本回合继续承伤风险，不读取排队指令');
 if(kind==='revive')reasons.push('按既有复生请求选择倒下队友，不额外治疗');
 if(!reasons.length)reasons.push('综合自身输出、估计速度、公开抗性及剩余体力');
 return {score,entryDeath:false,reasons,targetScores};
}
const planKey=actions=>actions.map(a=>a.kind==='switch'?`${a.slot}:${a.index}${a.revive?'r':''}`:`${a.slot}:pass`).join('|');
export function rankReplacementPlans(view,request,db,{limit=48}={}){
 let hp=null;try{if(!view.double&&view.profile?.tier&&view.profile.tier!=='wild'&&request.slots?.length===1&&request.slots[0].kind==='switch')hp=replacementPrior(view,db,[...new Set(request.slots[0].candidates||[])],request.slots[0].slot||0);}catch{}
 if(!Array.isArray(view?.own)||!Array.isArray(view?.opponent)||!Array.isArray(request?.slots))throw Error('替补请求缺少公开观察或候选');
 const total=request.totalSlots||view.active[0].length||1,slots=Array.from({length:total},(_,slot)=>request.slots.find(s=>s.slot===slot)||{slot,kind:'pass',candidates:[]}),out=[];
 const initialSwitches=Number.isInteger(request.switchesLeft)?request.switchesLeft:slots.filter(s=>s.kind==='switch').length,initialPasses=Number.isInteger(request.passesLeft)?request.passesLeft:0;
 function visit(at,actions,used,switches,passes,score,details){
  if(at===slots.length){if(switches>0)return;let bonus=0;const picks=details.flatMap(x=>x?.targetScores||[]),targets=new Set(picks.filter(x=>x.fastFinish).map(x=>x.foeSlot));if(total>1)bonus=Math.min(12,Math.max(0,targets.size-1)*8);out.push({actions,key:planKey(actions),score:score+bonus,details});return;}
  const s=slots[at];
  if(s.kind==='pass'){visit(at+1,[...actions,{kind:'pass',slot:s.slot}],used,switches,passes,score,[...details,null]);return;}
  for(const index of [...new Set(s.candidates||[])]){
   if(!Number.isInteger(index)||index<0||index>=view.own.length||(request.reserved||[]).includes(index)||s.kind!=='revive'&&used.has(index)||s.kind!=='revive'&&switches<=0)continue;
   const value=scoreReplacement(view,request,s,index,db);if(!Number.isFinite(value.score))continue;
   if(hp&&hp.has(index)){const bonus=12*Math.log(Math.max(.03,hp.get(index))*hp.size);value.score+=bonus;value.expertBonus=Math.round(bonus*10)/10;}
   const duplicate=s.kind==='revive'&&actions.some(a=>a.revive&&a.index===index),next=new Set(used);if(s.kind!=='revive')next.add(index);
   visit(at+1,[...actions,{kind:'switch',index,slot:s.slot,...(s.kind==='revive'?{revive:true}:{})}],next,Math.max(0,switches-1),passes,score+value.score-(duplicate?100:0),[...details,value]);
  }
  if(s.kind!=='revive'&&passes>0)visit(at+1,[...actions,{kind:'pass',slot:s.slot}],used,switches,passes-1,score,[...details,null]);
 }
 visit(0,[],new Set(request.reserved||[]),initialSwitches,initialPasses,0,[]);
 return out.sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).slice(0,Math.max(1,limit));
}
export function chooseReplacementPlan(plans,profile,{rng=()=>1}={}){
 if(!plans.length)throw Error('没有完整且符合规则请求的替补组合');
 const safe=plans.filter(p=>!p.details.some(x=>x?.entryDeath)),pool=safe.length?safe:plans;
 // Retain existing scene mistake rates; never use the real battle PRNG.
 if(pool.length>1&&(Number(profile?.settings?.mistake)||0)>0&&rng()<profile.settings.mistake){const near=pool.filter(p=>p.score>=pool[0].score-35);return near[Math.min(near.length-1,Math.floor(rng()*near.length))];}
 return pool[0];
}
