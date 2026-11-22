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
// Information boundary: no player private moves/item/ability/stats/IVs/EVs,
// pending command, or battle RNG crosses the Worker boundary.
import {tacticalPolicy} from './tactical-policy.mjs?v=20261118-ai-elite-v3';
export const id=x=>String(x??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function seeded(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296}}
export function hash(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export const actionKey=a=>a.kind==='move'?`move:${a.index}${a.struggle?':struggle':''}${a.mechanic?':'+a.mechanic:''}${a.target?`@${a.target.side}.${a.target.slot}`:''}`:a.kind==='switch'?`switch:${a.index}`:'pass';
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
// A public facade only; NEVER replace the real rule/stat object with its disguise.
export const publicAppearance=p=>p?.illusion?{...p,...p.illusion,originalSpeciesId:p.illusion.speciesId,illusion:null}:p;
export function legalActions(b,side=1,slot=0,reserved=new Set()){
 const p=b.cur(side,slot);if(!p||p.fainted||p.hp<=0||b.skipAction?.(p))return[{kind:'pass',slot}];const v=p.volatile||{};
 const lock=b.lockInfo?.(p);if(lock){const i=p.moves.findIndex(m=>m.id===lock.id);return[{kind:'move',index:Math.max(0,i),slot}]}
 const moves=[];
 for(let i=0;i<p.moves.length;i++){
  // The modern engine owns disable/choice/Encore/item-suppression/Max legality.
  // Old handwritten hints below are retained solely for old-engine compatibility.
  if(b.rulesEngine?.id==='pokemon-showdown'&&b.moveReason){
   const base={kind:'move',index:i,slot};if(!b.moveReason(p,i))moves.push(base);
   if(p.mechanic&&!b.mechanicReason(p,p.mechanic)&&!b.moveReason(p,i,p.mechanic))moves.push({...base,mechanic:p.mechanic});
   continue;
  }
  const m=p.moves[i];if(m.ppLeft<=0||v.disableMove===m.id||p.choiceLockedMove&&m.id!==p.choiceLockedMove||v.encore?.moveId&&m.id!==v.encore.moveId)continue;
  if((v.taunt||id(p.item)==='assaultvest')&&m.category==='Status')continue;
  if(v.torment&&p._lastMoveId===m.id)continue;if(v.healblock&&(m.heal||m.drain))continue;
  if(v.throatchop&&m.flags?.sound||b.field.gravity>0&&m.flags?.gravity)continue;
  const base={kind:'move',index:i,slot};moves.push(base);
  const used=b.mechanicUsed?.[side]||{},kind=p.mechanic;
  if(kind==='mega'&&!used.mega&&!p.isMega&&p.megaForm)moves.push({...base,mechanic:kind});
  if(kind==='dynamax'&&!used.dynamax&&!p.dynamaxed)moves.push({...base,mechanic:kind});
  if(kind==='tera'&&!used.tera&&!p.terastallized)moves.push({...base,mechanic:kind});
  if(kind==='z'&&!used.z&&p.zType===m.type)moves.push({...base,mechanic:kind});
 }
 if(!moves.length)moves.push({kind:'move',index:0,struggle:true,slot});
 if(b.double){
  const expanded=[];
  for(const a of moves){
   const raw=a.struggle?{id:'struggle',target:'normal',type:'Normal',category:'Physical',basePower:50}:p.moves[a.index];
   const m=globalThis.PKMBattle.transformMove(p,raw||{target:'normal'},a.mechanic),t=m.target||raw?.target||'normal';
   if(['normal','adjacentFoe','any','adjacentAlly','adjacentAllyOrSelf'].includes(t)){
    const sides=t==='adjacentAlly'||t==='adjacentAllyOrSelf'?[side]:[1-side];
    for(const ts of sides)for(let s=0;s<2;s++){const target=b.cur(ts,s);if(!target||target.fainted||target.hp<=0||ts===side&&s===slot&&t==='adjacentAlly')continue;expanded.push({...a,target:{side:ts,slot:s}})}
   }else expanded.push(a);
  }
  moves.splice(0,moves.length,...expanded);
 }
 // Do not inspect an unrevealed opposing trapping ability just to decide legality.
 const publicTrap=b.activeMons(1-side).some(q=>q._aiPublicAbility==='shadowtag'&&id(p.ability)!=='shadowtag'||q._aiPublicAbility==='magnetpull'&&p.types.includes('Steel')||q._aiPublicAbility==='arenatrap'&&!p.types.includes('Flying')&&id(p.ability)!=='levitate');
 const trapped=!p.types.includes('Ghost')&&id(p.item)!=='shedshell'&&(v.cannotEscape||v.octolock||v.partiallytrapped||v.trapped||v.jawlock||v.noretreat||v.ingrain||publicTrap)||b.field.pseudoWeather?.fairylock>0;
 // The facade's generic actionReason treats PS's trapped='hidden' as true.
 // Using it here would reveal an unannounced opposing Shadow Tag/Arena Trap
 // through our menu. Public switch attempts may fail at actual rule execution;
 // the planner must not receive that hidden legality oracle in advance.
 const maySwitch=b.rulesEngine?.id==='pokemon-showdown'||!b.actionReason?.(p,{kind:'switch'});
 if(!trapped&&maySwitch)for(let i=0;i<b.teams[side].length;i++){const q=b.teams[side][i];if(q.hp>0&&!q.fainted&&!b.activeSlots[side].includes(i)&&!reserved.has(i))moves.push({kind:'switch',index:i,slot})}
 return moves.length?moves:[{kind:'pass',slot}];
}
const ownFields=['_c6OwnImpact','_cmdMoveActions','speciesId','originalSpeciesId','originalTypes','name','level','hp','maxHp','stats','ivs','evs','gender','happiness','types','ability','item','nature','status','sleepTurns','toxicCounter','mechanic','megaForm','dynamaxForm','zType','teraType','isMega','terastallized','dynamaxed','dynamaxTurns','normalMaxHp','choiceLockedMove','stages','_lastMoveId','_protectStreak','enteredTurn','_enteredThisTurn'];
const transient=new Set(['usedMoves','protect','endure','followme','ragepowder','helpinghand','afteryou','quash']);
function safeVolatile(p,publicOnly=false){
 const v={};for(const [k,x]of Object.entries(p.volatile||{})){
  if(x==null||!x||transient.has(k)||k.startsWith('_'))continue;
  if(publicOnly&&typeof x==='number'){v[k]=true;continue;}
  if(['number','boolean','string'].includes(typeof x))v[k]=x;
  else if(['moveChain','chargingMove','bideState','furyCutter','encore','attract'].includes(k)){
   v[k]={};for(const key of ['id','moveId','hits','remaining','turns','semi','sourceSide','sourceIndex','lastTurn'])if(['number','string','boolean'].includes(typeof x[key])&&(!publicOnly||!['hits','remaining','turns','lastTurn'].includes(key)))v[k][key]=x[key];
  }else v[k]=true; // Existence only; NEVER recursively clone Pokemon pointers.
 }
 return v;
}
function own(p){const o={};for(const k of ownFields)if(p[k]!==undefined)o[k]=copy(p[k]);o.species=p.speciesId;o.moves=p.moves.map(m=>({id:m.id,ppLeft:m.ppLeft,pp:m.pp,usedThisStay:p._cmdOwnUsed?.includes(m.id)||false}));o.volatile=safeVolatile(p);o.revealed={moves:copy(p._aiPublicMoves||[]),ability:p._aiPublicAbility||null,item:p._aiPublicItem||null,itemKnown:!!p._aiPublicItemKnown};return o}
export function rememberPublic(p){
 if(!p?._participated)return;
 const visible=publicAppearance(p);
 p._aiPublicSnapshot={species:visible.speciesId,level:p.level,hpPercent:p.hp>0?Math.ceil(p.hp/p.maxHp*100):0,types:[...visible.types],status:p.status||null,stages:{...p.stages},moves:copy(p._aiPublicMoves||[]),ability:p._aiPublicAbility||null,item:p._aiPublicItem||null,itemKnown:!!p._aiPublicItemKnown,isMega:!!p.isMega,terastallized:!!p.terastallized,dynamaxed:!!p.dynamaxed,dynamaxTurns:p.dynamaxed?p.dynamaxTurns:0,volatile:safeVolatile(p,true),lastMove:p._aiPublicLastMove||null,protectStreak:p._aiPublicProtectStreak||0,rocksWitness:p._c6Rocks||null,circuitOrder:copy(p._c6Order)||null,circuitUsed:[...(p._c6GearUsed||[])],seenThisStay:[...(p._cmdPublicUsed||[])]};
}
// Deliberately a preference rather than a rules ban: a forced action or a Z/Max variant is still possible.
export function practicalMenu(p,menu){if(!p||p.dynamaxed)return menu;
 const kept=menu.filter(a=>{if(a.kind!=='move'||a.struggle||a.mechanic)return true;const m=p.moves[a.index];if(!m)return true;
 if(['fakeout','firstimpression','matblock'].includes(m.id)&&p._cmdMoveActions>0)return false;
 if(m.id==='lastresort'&&(p.moves.length<2||p.moves.some(x=>x.id!=='lastresort'&&!(x.usedThisStay||p._cmdOwnUsed?.includes(x.id)))))return false;
 return true;});return kept.length?kept:menu;}
function fieldView(field){
 const out={};for(const [k,v]of Object.entries(field)){
  if(k==='sides')out.sides=v.map(s=>Object.fromEntries(Object.entries(s).map(([a,b])=>[a,typeof b==='object'?!!b:b])));
  else if(k==='pseudoWeather')out[k]=Object.fromEntries(Object.entries(v||{}).map(([a,b])=>[a,Number(b)||0]));
  else if(['string','number','boolean'].includes(typeof v)||v==null)out[k]=v;
  else if(Array.isArray(v)?v.length:Object.keys(v).length)out[k]=true;
 }
 return out;
}
export function observation(b,profile,memory={}){
 for(const p of b.activeMons(0))rememberPublic(p);
 return{profile:{...profile,settings:{...profile.settings}},memory:copy(memory),turn:b.turnCount,double:!!b.double,firstFaintLoses:!!b.firstFaintLoses,own:b.teams[1].map(own),opponent:b.teams[0].map(p=>copy(p._aiPublicSnapshot)||{unseen:true}),active:[b.activeSlots[1].slice(),b.activeSlots[0].slice()],field:fieldView(b.field),weather:b.weather||null,weatherId:b.weatherId||null,weatherTurns:b.weatherTurns,mechanicUsed:[copy(b.mechanicUsed[1]),{}],encounterType:b.encounterType,legal:Array.from({length:b.double?2:1},(_,slot)=>practicalMenu(b.cur(1,slot),legalActions(b,1,slot)))};
}
// Separate phase boundary: never query normal move legality during a forced
// replacement. Refresh ONLY currently active public appearances, even fainted;
// never refresh a benched opponent's private regeneration/status/item changes.
export function replacementObservation(b,profile){
 for(const i of b.activeSlots[0]){const p=b.teams[0][i];if(p)rememberPublic(p);}
 return{profile:{...profile,settings:{...profile?.settings}},turn:b.turnCount,double:!!b.double,firstFaintLoses:!!b.firstFaintLoses,encounterType:b.encounterType,weatherTurns:b.weatherTurns,mechanicUsed:[copy(b.mechanicUsed[1]),{}],own:b.teams[1].map(own),opponent:b.teams[0].map(p=>copy(p._aiPublicSnapshot)||{unseen:true}),active:[b.activeSlots[1].slice(),b.activeSlots[0].slice()],field:fieldView(b.field),weather:b.weather||null,weatherId:b.weatherId||null};
}
// Emergency fallback deliberately uses species/type and displayed HP only.
// In particular it never calls estimateDamage against the actual private foe.
export function quickChoice(b,slot=0,reserved=new Set(),memory={}){
 const B=globalThis.PKMBattle,me=b.cur(1,slot),foes=b.activeMons(0).map(publicAppearance),legal=practicalMenu(me,legalActions(b,1,slot,reserved));if(!me)return legal[0];
 const effect=(m,f)=>globalThis.PKMTypeChart?.effectiveness(m.type,f.types)||0;
 const power=(p,f,m)=>{
  const sp=B._dex?.[f.speciesId],def=sp?.baseStats?.[m.category==='Physical'?'def':'spd']||80;
  let score=(m.basePower||(['seismictoss','nightshade'].includes(m.id)?p.level:40))*effect(m,f)*(p.types.includes(m.type)?1.5:1)*(m.accuracy===true?1:(m.accuracy||100)/100)*(p.stats[m.category==='Physical'?'atk':'spa']||80)/def;
  score/=Math.max(.05,Math.ceil(f.hp/f.maxHp*100)/100);return score;
 };
 const scored=[];let best=legal[0],value=-Infinity;
 for(const a of legal){let score=0;
  if(a.kind==='move'){const base=me.moves[a.index];if(!base)continue;const m=B.transformMove(me,base,a.mechanic),rawFoe=a.target?b.cur(a.target.side,a.target.slot):null,foe=rawFoe?(a.target.side===0?publicAppearance(rawFoe):rawFoe):foes[0];
   if(m.category!=='Status'&&foe)score=(a.target?.side===1?-1:1)*power(me,foe,m);
   else{score=2;if(m.heal)score=me.hp<me.maxHp*.5?100:0;if(m.boosts&&me.hp>me.maxHp*.65)score=Object.entries(m.boosts).reduce((n,[k,v])=>n+(v>0&&me.stages[k]<3?v*10:0),0);if(m.status&&foe&&!foe.status)score=30;if(m.sideCondition){const s=b.field.sides[m.target==='allySide'?1:0];score=s?.[m.sideCondition]?0:25}}
   if(a.mechanic)score+=4;
  }else if(a.kind==='switch'){const q=b.teams[1][a.index],f=foes[0];if(f)score=Math.max(0,...q.moves.map(m=>m.category!=='Status'?power(q,f,m)*.12:0));score-=12;}
  scored.push({a,score});if(score>value){value=score;best=a}
 }
 const map=new Map(scored.map(x=>[actionKey(x.a),[...Array.from({length:slot},()=>({kind:"pass"})),x.a]])),top=Math.max(...scored.map(x=>x.score));
 const policy=scored.map(x=>({key:actionKey(x.a),weight:Math.exp(Math.max(-24,(x.score-top)/20))}));
 const view=observation(b,b.aiProfile||{tier:"regular",style:"balanced"},memory);
 const ranked=tacticalPolicy(policy,map,view,{dex:B._dex,moves:B._moves}).policy;
 return{...(legal.find(a=>actionKey(a)===ranked[0]?.key)||best)};
}
