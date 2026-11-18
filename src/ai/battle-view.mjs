// SPDX-License-Identifier: MIT
// Information boundary: no player private moves/item/ability/stats/IVs/EVs,
// pending command, or battle RNG crosses the Worker boundary.
export const id=x=>String(x??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function seeded(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296}}
export function hash(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export const actionKey=a=>a.kind==='move'?`move:${a.index}${a.struggle?':struggle':''}${a.mechanic?':'+a.mechanic:''}${a.target?`@${a.target.side}.${a.target.slot}`:''}`:a.kind==='switch'?`switch:${a.index}`:'pass';
const copy=x=>x==null?x:JSON.parse(JSON.stringify(x));
export function legalActions(b,side=1,slot=0,reserved=new Set()){
 const p=b.cur(side,slot);if(!p||p.fainted||p.hp<=0)return[{kind:'pass',slot}];const v=p.volatile||{};
 const lock=b.lockInfo?.(p);if(lock){const i=p.moves.findIndex(m=>m.id===lock.id);return[{kind:'move',index:Math.max(0,i),slot}]}
 const moves=[];
 for(let i=0;i<p.moves.length;i++){
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
 const publicTrap=b.activeMons(1-side).some(q=>q._aiPublicAbility==='shadowtag'||q._aiPublicAbility==='magnetpull'&&p.types.includes('Steel')||q._aiPublicAbility==='arenatrap'&&!p.types.includes('Flying')&&id(p.ability)!=='levitate');
 const trapped=!p.types.includes('Ghost')&&id(p.item)!=='shedshell'&&(v.cannotEscape||v.octolock||v.partiallytrapped||v.trapped||v.jawlock||v.noretreat||v.ingrain||publicTrap)||b.field.pseudoWeather?.fairylock>0;
 if(!trapped&&!b.actionReason?.(p,{kind:'switch'}))for(let i=0;i<b.teams[side].length;i++){const q=b.teams[side][i];if(q.hp>0&&!q.fainted&&!b.activeSlots[side].includes(i)&&!reserved.has(i))moves.push({kind:'switch',index:i,slot})}
 return moves.length?moves:[{kind:'pass',slot}];
}
const ownFields=['speciesId','originalSpeciesId','originalTypes','name','level','hp','maxHp','stats','types','ability','item','nature','status','sleepTurns','toxicCounter','mechanic','megaForm','dynamaxForm','zType','teraType','isMega','terastallized','dynamaxed','dynamaxTurns','normalMaxHp','choiceLockedMove','stages','_lastMoveId','_protectStreak','enteredTurn','_enteredThisTurn'];
const transient=new Set(['usedMoves','protect','endure','followme','ragepowder','helpinghand','afteryou','quash']);
function safeVolatile(p,publicOnly=false){
 const v={};for(const [k,x]of Object.entries(p.volatile||{})){
  if(x==null||!x||transient.has(k)||k.startsWith('_'))continue;
  if(publicOnly&&typeof x==='number'){v[k]=true;continue;}
  if(['number','boolean','string'].includes(typeof x))v[k]=x;
  else if(['moveChain','chargingMove','bideState','furyCutter','encore','attract'].includes(k)){
   v[k]={};for(const key of ['id','moveId','hits','remaining','semi','sourceSide','sourceIndex','lastTurn'])if(['number','string','boolean'].includes(typeof x[key])&&(!publicOnly||!['hits','remaining','lastTurn'].includes(key)))v[k][key]=x[key];
  }else v[k]=true; // Existence only; NEVER recursively clone Pokemon pointers.
 }
 return v;
}
function own(p){const o={};for(const k of ownFields)if(p[k]!==undefined)o[k]=copy(p[k]);o.species=p.speciesId;o.moves=p.moves.map(m=>({id:m.id,ppLeft:m.ppLeft,pp:m.pp}));o.volatile=safeVolatile(p);return o}
export function rememberPublic(p){
 if(!p?._participated)return;
 p._aiPublicSnapshot={species:p.speciesId,level:p.level,hpPercent:p.hp>0?Math.ceil(p.hp/p.maxHp*100):0,types:[...p.types],status:p.status||null,stages:{...p.stages},moves:copy(p._aiPublicMoves||[]),ability:p._aiPublicAbility||null,item:p._aiPublicItem||null,itemKnown:!!p._aiPublicItemKnown,isMega:!!p.isMega,terastallized:!!p.terastallized,dynamaxed:!!p.dynamaxed,dynamaxTurns:p.dynamaxed?p.dynamaxTurns:0,volatile:safeVolatile(p,true),lastMove:p._aiPublicLastMove||null,protectStreak:p._aiPublicProtectStreak||0};
}
function fieldView(field){
 const out={};for(const [k,v]of Object.entries(field)){
  if(k==='sides')out.sides=v.map(s=>Object.fromEntries(Object.entries(s).map(([a,b])=>[a,typeof b==='object'?!!b:b])));
  else if(k==='pseudoWeather')out[k]=Object.fromEntries(Object.entries(v||{}).map(([a,b])=>[a,Number(b)||0]));
  else if(['string','number','boolean'].includes(typeof v)||v==null)out[k]=v;
  else if(Array.isArray(v)?v.length:Object.keys(v).length)out[k]=true;
 }
 return out;
}
export function observation(b,profile){
 for(const p of b.activeMons(0))rememberPublic(p);
 return{profile:{...profile,settings:{...profile.settings}},turn:b.turnCount,double:!!b.double,firstFaintLoses:!!b.firstFaintLoses,own:b.teams[1].map(own),opponent:b.teams[0].map(p=>copy(p._aiPublicSnapshot)||{unseen:true}),active:[b.activeSlots[1].slice(),b.activeSlots[0].slice()],field:fieldView(b.field),weather:b.weather||null,weatherTurns:b.weatherTurns,mechanicUsed:[copy(b.mechanicUsed[1]),{}],encounterType:b.encounterType,legal:Array.from({length:b.double?2:1},(_,slot)=>legalActions(b,1,slot))};
}
// Emergency fallback deliberately uses species/type and displayed HP only.
// In particular it never calls estimateDamage against the actual private foe.
export function quickChoice(b,slot=0,reserved=new Set()){
 const B=globalThis.PKMBattle,me=b.cur(1,slot),foes=b.activeMons(0),legal=legalActions(b,1,slot,reserved);if(!me)return legal[0];
 const effect=(m,f)=>globalThis.PKMTypeChart?.effectiveness(m.type,f.types)||0;
 const power=(p,f,m)=>{
  const sp=B._dex?.[f.speciesId],def=sp?.baseStats?.[m.category==='Physical'?'def':'spd']||80;
  let score=(m.basePower||(['seismictoss','nightshade'].includes(m.id)?p.level:40))*effect(m,f)*(p.types.includes(m.type)?1.5:1)*(m.accuracy===true?1:(m.accuracy||100)/100)*(p.stats[m.category==='Physical'?'atk':'spa']||80)/def;
  score/=Math.max(.05,Math.ceil(f.hp/f.maxHp*100)/100);return score;
 };
 let best=legal[0],value=-Infinity;
 for(const a of legal){let score=0;
  if(a.kind==='move'){const base=me.moves[a.index];if(!base)continue;const m=B.transformMove(me,base,a.mechanic),foe=a.target?b.cur(a.target.side,a.target.slot):foes[0];
   if(m.category!=='Status'&&foe)score=(a.target?.side===1?-1:1)*power(me,foe,m);
   else{score=2;if(m.heal)score=me.hp<me.maxHp*.5?100:0;if(m.boosts&&me.hp>me.maxHp*.65)score=Object.entries(m.boosts).reduce((n,[k,v])=>n+(v>0&&me.stages[k]<3?v*10:0),0);if(m.status&&foe&&!foe.status)score=30;if(m.sideCondition){const s=b.field.sides[m.target==='allySide'?1:0];score=s?.[m.sideCondition]?0:25}}
   if(a.mechanic)score+=4;
  }else if(a.kind==='switch'){const q=b.teams[1][a.index],f=foes[0];if(f)score=Math.max(0,...q.moves.map(m=>m.category!=='Status'?power(q,f,m)*.12:0));score-=12;}
  if(score>value){value=score;best=a}
 }
 return{...best};
}
