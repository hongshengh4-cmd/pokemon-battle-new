/*
Runtime-only repackaging: license embedded here instead of a separate file.
No executable logic changed.
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
// Own-team/public-information tactical prior. No Battle/PS object, opponent
// private set, player command, storage or battle RNG is accepted by this module.
export const TACTICS_BUILD='20261118-ai-elite-v3';
const chart={Normal:{Rock:.5,Ghost:0,Steel:.5},Fire:{Fire:.5,Water:.5,Grass:2,Ice:2,Bug:2,Rock:.5,Dragon:.5,Steel:2},Water:{Fire:2,Water:.5,Grass:.5,Ground:2,Rock:2,Dragon:.5},Electric:{Water:2,Electric:.5,Grass:.5,Ground:0,Flying:2,Dragon:.5},Grass:{Fire:.5,Water:2,Grass:.5,Poison:.5,Ground:2,Flying:.5,Bug:.5,Rock:2,Dragon:.5,Steel:.5},Ice:{Fire:.5,Water:.5,Grass:2,Ice:.5,Ground:2,Flying:2,Dragon:2,Steel:.5},Fighting:{Normal:2,Ice:2,Poison:.5,Flying:.5,Psychic:.5,Bug:.5,Rock:2,Ghost:0,Dark:2,Steel:2,Fairy:.5},Poison:{Grass:2,Poison:.5,Ground:.5,Rock:.5,Ghost:.5,Steel:0,Fairy:2},Ground:{Fire:2,Electric:2,Grass:.5,Poison:2,Flying:0,Bug:.5,Rock:2,Steel:2},Flying:{Electric:.5,Grass:2,Fighting:2,Bug:2,Rock:.5,Steel:.5},Psychic:{Fighting:2,Poison:2,Psychic:.5,Dark:0,Steel:.5},Bug:{Fire:.5,Grass:2,Fighting:.5,Poison:.5,Flying:.5,Psychic:2,Ghost:.5,Dark:2,Steel:.5,Fairy:.5},Rock:{Fire:2,Ice:2,Fighting:.5,Ground:.5,Flying:2,Bug:2,Steel:.5},Ghost:{Normal:0,Psychic:2,Ghost:2,Dark:.5},Dragon:{Dragon:2,Steel:.5,Fairy:0},Dark:{Fighting:.5,Psychic:2,Ghost:2,Dark:.5,Fairy:.5},Steel:{Fire:.5,Water:.5,Electric:.5,Ice:2,Rock:2,Steel:.5,Fairy:2},Fairy:{Fire:.5,Fighting:2,Poison:.5,Dragon:2,Dark:2,Steel:.5}};
export const effectiveness=(type,types)=>(types||[]).reduce((m,t)=>m*(chart[type]?.[t]??1),1);
const id=x=>String(x??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const guards=new Set(['protect','detect','endure','kingsshield','spikyshield','banefulbunker','obstruct','silktrap','burningbulwark','maxguard']);
export const isGuardMove=m=>!!m&&(guards.has(id(m.id))||guards.has(id(m.volatileStatus))||!!m.stallingMove);
const active=(v,slot)=>v.own[v.active[0][slot]];
const foesOf=v=>v.active[1].map(i=>v.opponent[i]).filter(p=>p&&!p.unseen&&p.hpPercent>0);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fraction=p=>p?.maxHp>0?clamp(p.hp/p.maxHp,0,1):0;
const grounded=p=>!p.types?.includes('Flying')&&p.ability!=='levitate'&&p.item!=='airballoon'&&!p.volatile?.magnetrise;
function effectivenessOn(type,p){
 if(type==='Ground'&&!grounded(p))return 0;
 if(type==='Water'&&['waterabsorb','stormdrain','dryskin'].includes(p.ability)||type==='Fire'&&p.ability==='flashfire'||type==='Electric'&&['voltabsorb','lightningrod','motordrive'].includes(p.ability)||type==='Grass'&&p.ability==='sapsipper')return 0;
 return effectiveness(type,p.types);
}
function pressure(p,foes,db){let value=0;for(const f of foes){const seen=(f.moves||[]).map(x=>db.moves[x.id]).filter(m=>m&&m.category!=='Status');const types=[...new Set([...(f.types||[]),...seen.map(m=>m.type)])];for(const t of types)value=Math.max(value,effectivenessOn(t,p));}return value||.125;}
export function entryCost(p,v){
 if(!p||p.item==='heavydutyboots')return 0;const c=v.field.sides[1]||{};
 if(p.ability==='magicguard')return 0;
 return (c.stealthrock?effectiveness('Rock',p.types)/8:0)+(grounded(p)?[0,1/8,1/6,1/4][clamp(Number(c.spikes)||0,0,3)]:0);
}
// Rough offensive opportunity from own stats and the foe's public species;
// this is not a damage oracle and never reads the opponent's actual defenses.
function offense(p,foes,db){
 let best=0;
 for(const x of p.moves||[]){
  if(x.ppLeft<=0||p.choiceLockedMove&&x.id!==p.choiceLockedMove||p.volatile?.disableMove===x.id)continue;
  const m=db.moves[x.id];if(!m||m.category==='Status')continue;
  const k=m.category==='Physical'?'atk':'spa',d=m.category==='Physical'?'def':'spd',n=p.stages?.[k]||0,stage=n>=0?(2+n)/2:2/(2-n);
  for(const f of foes){const known={...f,ability:f.ability||'',item:f.itemKnown?f.item:''},def=db.dex[f.species]?.baseStats?.[d]||80;
   best=Math.max(best,(m.basePower||50)*(p.stats?.[k]||80)*stage/def*effectivenessOn(m.type,known)*(p.types.includes(m.type)?1.5:1));
  }
 }return best;
}
const moveData=(p,a,db)=>({...db.moves[p.moves[a.index]?.id],id:p.moves[a.index]?.id});
function canHit(p,m,foes){return !!m&&!!m.category&&m.category!=='Status'&&foes.some(f=>effectivenessOn(m.type,{...f,ability:f.ability||'',item:f.itemKnown?f.item:''})>0);}
const actionFoes=(v,a)=>a.target?(a.target.side===0?[v.opponent[v.active[1][a.target.slot]]].filter(Boolean):[]):foesOf(v);
function alternatives(p,slot,v,db){return (v.legal[slot]||[]).some(a=>a.kind==='move'&&((canHit(p,moveData(p,a,db),foesOf(v)))||!!moveData(p,a,db).heal&&fraction(p)<.8));}
function protectPurpose(p,v,m){
 const fs=foesOf(v),f=fraction(p),chip=fs.some(q=>['psn','tox','brn'].includes(q.status)||q.volatile?.leechseed||q.volatile?.perishsong);
 const passiveHeal=p.item==='leftovers'||p.item==='blacksludge'&&p.types.includes('Poison')||p.ability==='poisonheal'&&['psn','tox'].includes(p.status)||p.ability==='raindish'&&v.weather==='rain'||p.ability==='icebody'&&['hail','snow'].includes(v.weather);
 const recover=f<.9&&(passiveHeal||p.volatile?.aquaring||p.volatile?.ingrain||p._lastMoveId==='wish');
 const timer=fs.some(q=>q.dynamaxed&&q.dynamaxTurns>0)||v.field.trickRoom===1||v.field.sides[0]?.tailwind===1;
 const growth=p.ability==='speedboost'&&(p.stages?.spe||0)<2;
 const endurePlan=m.id==='endure'&&(p.moves.some(x=>['reversal','flail','endeavor'].includes(x.id))||['salacberry','custapberry','liechiberry','petayaberry'].includes(p.item));
 // Doubles protects have positional value; repeats are still probability-discounted.
 return {productive:chip||recover||timer||growth||endurePlan||v.double,chip,recover,timer,growth,endurePlan};
}
export function actionAssessment(v,slot,a,db){
 const p=active(v,slot);if(!p)return{factor:1,reasons:[]};const fs=foesOf(v),reasons=[];
 if(a.kind==='switch'){
  const q=v.own[a.index];if(!q||q.hp<=0)return{factor:0,reasons:['换入目标不可战斗']};
  const cost=entryCost(q,v),before=pressure(p,fs,db),after=pressure(q,fs,db),f=fraction(p);
  const safeEntry=fraction(q)>cost,defenseGain=after<before*.55;
  const attackGain=after<=before*1.25&&fraction(q)>.45&&offense(q,fs,db)>Math.max(35,offense(p,fs,db)*1.8),improves=defenseGain||attackGain;
  const escape=!!(p.volatile?.perishsong||p.volatile?.yawn||p.volatile?.encore&&p.moves.every(m=>!canHit(p,db.moves[m.id],fs)));
  const regen=p.ability==='regenerator'&&f<.55,hasAttack=alternatives(p,slot,v,db);
  if(!safeEntry&&hasAttack)return{factor:0,reasons:['主动换入会被公开入场伤害击倒']};
  let factor=improves?1.15:.6;
  if(cost>0)factor*=Math.max(.12,1-cost*2.5);
  if((p.stages?.atk||0)+(p.stages?.spa||0)+(p.stages?.spe||0)>=2&&!improves)factor*=.5;
  if(escape||regen)factor=Math.max(factor,1.1);
  const recent=(v.memory?.recent||[]).filter(r=>r.kind==='switch'&&r.slot===slot&&v.turn-r.turn<=3);
  const reverse=recent.some(r=>r.from===a.index&&r.to===v.active[0][slot]);
  const run=v.memory?.switchRuns?.[slot]||0;
  if(!improves&&!escape&&!regen&&hasAttack){
   if(reverse){factor*=.15;reasons.push('无明显收益的原路换回');}
   if(run>=1)factor*=.25;
   if(run>=2){factor=0;reasons.push('停止无收益的连续主动轮换');}
  }
  // This is a preference, not a battle-rule ban; forced replacements bypass it.
  return{factor,reasons:[...reasons,defenseGain?'公开抗性/免疫风险明显改善':attackGain?'公开属性与自身能力支持明显进攻改善':escape?'解除公开持续威胁':'计入换人让出的行动与入场代价']};
 }
 if(a.kind!=='move')return{factor:1,reasons};
 const m=moveData(p,a,db),maxGuard=(p.dynamaxed||a.mechanic==='dynamax')&&m.category==='Status';
 if(isGuardMove(m)||maxGuard){
  const n=Math.max(0,p._protectStreak||0),chance=1/3**Math.min(6,n); // Actual success remains the kernel's decision.
  const purpose=protectPurpose(p,v,m),other=alternatives(p,slot,v,db);
  let factor=purpose.productive?1.1:.25;
  if(n>0){factor*=Math.pow(chance,1.5);reasons.push(`已计入连守概率约${Math.round(chance*100)}%`);if(!purpose.productive&&other){factor=0;reasons.push('没有拖回合收益，不继续连守');}}
  if(a.mechanic)factor*=.18; // Do not spend a fresh transformation just to idle behind a guard.
  return{factor,reasons};
 }
 let factor=m.category==='Status'?1:1.15;
 if(a.mechanic){
  const selected=actionFoes(v,a),useful=canHit(p,m,selected),hp=fraction(p),kind=a.mechanic;
  if(kind==='mega')factor*=useful?3:m.heal&&hp<.6?1.3:1.1;
  else if(kind==='z'){
   // Reserve a one-use nuke against a target already in trivial KO range.
   const tiny=fs.length&&fs.every(q=>q.hpPercent<=12),fixed=!!m.damage||['seismictoss','nightshade','dragonrage','sonicboom','superfang','naturesmadness','ruination','endeavor'].includes(m.id);
   factor*=m.category==='Status'?1:!useful?.08:tiny?.25:fixed?.7:3.5;
  }else if(kind==='dynamax')factor*=useful?(hp>=.35?3:.9):.15;
  else if(kind==='tera'){
   const original=p.originalTypes||db.dex[id(p.originalSpeciesId||p.species)]?.types||p.types;
   const offense=useful&&m.type===p.teraType,oldRisk=pressure(p,fs,db),newRisk=pressure({...p,types:[p.teraType]},fs,db),defense=newRisk<oldRisk*.6;
   factor*=offense?(original.includes(m.type)?3:2.6):defense?2.5:newRisk>oldRisk*1.5?.12:.45;
  }
  reasons.push('合法特殊机制按进攻/防守收益择机使用');
 }
 return{factor,reasons};
}
export function tacticalPolicy(policy,actionMap,view,db){
 const notes=new Set(),assess=actions=>{
  if(!actions)return 0;let factor=1;
  actions.forEach((a,slot)=>{const r=actionAssessment(view,slot,a,db);factor*=r.factor;for(const s of r.reasons)notes.add(s)});
  return factor;
 },valid=xs=>xs.filter(p=>Number.isFinite(p.weight)&&p.weight>0).sort((a,b)=>b.weight-a.weight||a.key.localeCompare(b.key));
 let adjusted=valid(policy.map(p=>({...p,weight:p.weight*assess(actionMap.get(p.key))})));
 // Native search may give every visit to the very loop we just rejected. A
 // legal alternative with zero visits must not resurrect that rejected loop.
 if(!adjusted.length)adjusted=valid([...actionMap].map(([key,actions])=>({key,weight:assess(actions)})));
 // Sole-action/all-guard requests still keep a legal choice, never an empty menu.
 const kept=adjusted.length?adjusted:policy,total=kept.reduce((n,p)=>n+p.weight,0)||1;
 return{policy:kept.map(p=>({...p,weight:p.weight/total})),notes:[...notes].slice(0,8)};
}
