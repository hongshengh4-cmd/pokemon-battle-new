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
// PRIVATE SIMULATIONS ONLY. This module never receives the real Battle, its PS
// snapshot, RNG or a player's command. All turns (including ties, priority,
// Trick Room, pivots and gimmicks) are executed by the existing pinned PS code.
import PS from './vendor/showdown-search.mjs?v=20261118-ai-elite-v3';
import {id,actionKey} from './battle-view.mjs?v=20261118-ai-elite-v3';
export const CANONICAL_COMMIT='5b88c476113d51a939bddbcd00b5cd182a5d8058';
const noop=()=>{},alive=p=>p&&p.hp>0&&!p.fainted;
const statKeys=['atk','def','spa','spd','spe'];
let ready=false;
export function bootCanonical(){
 if(ready)return PS;
 if(PS.commit!==CANONICAL_COMMIT)throw Error('AI用Showdown规则版本不匹配');
 PS.Dex.includeData();
 // Register transport format identities in the isolated Dex cache. The site's
 // bundle omits server format discovery; without this, fromJSON would silently
 // reconstruct a doubles format as default singles. Same empty ruleset and
 // gameType as the real adventure adapter, no new rule callbacks.
 for(const gameType of ['singles','doubles']){
  const format=new PS.Dex.Format({name:'PKM Custom '+gameType,id:'pkmcustom'+gameType,mod:'gen9',gameType,ruleset:[],debug:true});
  if(format.id!=='pkmcustom'+gameType)throw Error('AI规则赛制标识不匹配');
  PS.Dex.formats.rulesetCache.set(format.id,format);
 }
 const b=new PS.Battle({formatid:'pkmcustomsingles',seed:[1,2,3,4],send:noop});
 try{
  for(const s of ['p1','p2'])b.setPlayer(s,{name:s,team:[{species:'mew',moves:['tackle']}]});
  // The site's minified bundle has anonymous class names. PS's documented
  // serializer uses constructor.name for references; restore ONLY those names
  // in this isolated module instance. No rule callback / data is modified.
  const types={Battle:PS.Battle,Field:b.field.constructor,Side:b.sides[0].constructor,Pokemon:b.sides[0].pokemon[0].constructor,Species:PS.Dex.species.get('mew').constructor,Move:PS.Dex.moves.get('tackle').constructor,Item:PS.Dex.items.get('leftovers').constructor,Ability:PS.Dex.abilities.get('pressure').constructor,Condition:PS.Dex.conditions.get('brn').constructor};
  for(const [name,type]of Object.entries(types))Object.defineProperty(type,'name',{value:name,configurable:true});
  const copy=PS.Battle.fromJSON(JSON.stringify(b.toJSON()));
  try{if(copy.sides[0].active[0]?.species.id!=='mew')throw Error('AI规则快照自检失败');}finally{copy.destroy();}
  ready=true;return PS;
 }finally{b.destroy();}
}
const weatherId=x=>({sun:'sunnyday',rain:'raindance',snow:'snowscape',hail:'hail',sand:'sandstorm',strongwinds:'deltastream'}[x]||id(x));
function state(b,key,target,source,duration){
 const out=b.initEffectState({id:key,target,source:source||target,sourceSlot:(source||target)?.getSlot?.()});
 if(Number.isFinite(duration)&&duration>0)out.duration=duration;
 return out;
}
function configureGimmicks(b){
 for(const side of b.sides){
  // Same explicit cross-generation enablement as the real adventure adapter.
  // Every HP change, Max effect and resource consumption still belongs to PS.
  side.canDynamaxNow=function(){return !this.dynamaxUsed&&this.active.some(q=>q?.set._aiMechanic==='dynamax');};
 }
 b.send=noop;
}
function asSet(p,index){
 return{species:p.originalSpeciesId||p.species,name:'AI-'+index,level:p.level,moves:p.moves.map(m=>m.id),ability:'none',item:'',nature:p.nature||'Serious',ivs:p.ivs||{hp:31,atk:31,def:31,spa:31,spd:31,spe:31},evs:p.evs||{},gender:['M','F'].includes(p.gender)?p.gender:'N',happiness:p.happiness??255,teraType:p.teraType||p.types[0],gigantamax:p.dynamaxForm==='gmax',dynamaxLevel:10,_aiIndex:index,_aiMechanic:p.mechanic||null};
}
function restoreVolatiles(b,q,p,foe,notes){
 const vol=p.volatile||{};q.volatiles={};
 const aliases={recharging:'mustrecharge',cannotEscape:'trapped',critBoost:'focusenergy'};
 const special=new Set(['stall','protect','endure','disableMove','disableTurns','encore','chargingMove','moveChain','bideState','usedMoves','dynamax']);
 for(const [raw,value]of Object.entries(vol)){
  if(!value||special.has(raw)||raw.startsWith('_'))continue;
  const key=aliases[raw]||id(raw),condition=b.dex.conditions.get(key);
  if(!condition.exists){notes.add('未重建持续状态：'+raw);continue;}
  const duration=typeof value==='number'?value:condition.duration;
  const v=q.volatiles[key]=state(b,key,q,foe,duration);
  if(key==='substitute')v.hp=typeof value==='number'?value:Math.floor(q.maxhp/4);
  if(key==='confusion')v.time=typeof value==='number'?value:2;
  if(key==='partiallytrapped'){
   // The facade exposes the bind, not its hidden roll / originating move.
   // Use an explicit standard hypothesis; never dereference live PS state.
   v.sourceEffect=b.dex.moves.get('bind');v.boundDivisor=foe?.item==='bindingband'?6:8;
   notes.add('束缚持续时间/来源招式按公开近似重建');
  }
  if(key==='attract'&&typeof value==='object'){
   const sourceSide=1-Number(value.sourceSide);v.source=b.sides[sourceSide]?.pokemon.find(x=>x.set._aiIndex===value.sourceIndex)||foe;
  }
 }
 if(p._protectStreak>0)q.volatiles.stall={...state(b,'stall',q,q,2),counter:3**Math.min(6,p._protectStreak)};
 if(vol.disableMove)q.volatiles.disable={...state(b,'disable',q,foe,Number(vol.disableTurns)||3),move:vol.disableMove};
 if(vol.encore?.moveId)q.volatiles.encore={...state(b,'encore',q,foe,Number(vol.encore.turns)||2),move:vol.encore.moveId};
 if(p.choiceLockedMove)q.volatiles.choicelock={...state(b,'choicelock',q,q),move:p.choiceLockedMove};
 if(vol.chargingMove?.id){
  const mid=vol.chargingMove.id;q.volatiles.twoturnmove={...state(b,'twoturnmove',q,q,1),move:mid};
  q.volatiles[mid]={...state(b,mid,q,q,1),targetLoc:foe?q.getLocOf(foe):1};
  if(b.gameType==='doubles')notes.add('蓄力招式目标使用公开可见的当前对手槽位近似');
 }
 if(vol.moveChain?.id){
  const mid=vol.moveChain.id,remaining=Math.max(1,Number(vol.moveChain.remaining)||1);
  if(vol.moveChain.kind!=='rollout'&&!['rollout','iceball'].includes(mid)){
   q.volatiles.lockedmove={...state(b,'lockedmove',q,q,remaining),move:mid,trueDuration:remaining};
   notes.add('连续招式的剩余随机回合按公开近似重建');
  }
  q.lastMove=b.dex.moves.get(mid);
 }
 if(vol.bideState)notes.add('蓄力累计伤害只作公开近似');
 if(p.dynamaxed)q.volatiles.dynamax={...state(b,'dynamax',q,q),turns:p.dynamaxTurns||1};
}
export function createSimulation(world,view,seed=[1,2,3,4]){
 bootCanonical();
 const b=new PS.Battle({formatid:world.double?'pkmcustomdoubles':'pkmcustomsingles',seed,strictChoices:false,send:noop});
 const notes=new Set();
 try{
  // Inert construction avoids firing a second Intimidate / weather ability /
  // entry hazard when reconstructing an already active, public position.
  for(let s=0;s<2;s++){
   const lead=world.active[s].filter(i=>i>=0&&world.teams[s][i]?.hp>0),order=[...lead,...world.teams[s].map((_,i)=>i).filter(i=>!lead.includes(i))];
   b.setPlayer('p'+(s+1),{name:s===0?'AI':'Hypothesis',team:order.map(i=>asSet(world.teams[s][i],i))});
  }
  configureGimmicks(b);b.turn=Math.max(1,(view.turn||0)+1);b.ended=false;b.winner='';
  for(let s=0;s<2;s++){
   const side=b.sides[s],used=world.mechanicUsed?.[s]||{};
   for(const q of side.pokemon){
    const p=world.teams[s][q.set._aiIndex],sp=b.dex.species.get(p.species);if(!sp.exists)throw Error('AI规则缺少物种：'+p.species);
    q.species=sp;q.baseSpecies=b.dex.species.get(p.originalSpeciesId||p.species);q.weighthg=sp.weighthg;
    // The facade's types are the DISPLAYED Tera type. PS keeps pre-Tera types
    // internally for original STAB and overlays the defensive type in getTypes.
    q.baseTypes=[...(p.originalTypes||q.baseSpecies.types)];q.types=[...(p.terastallized?q.baseTypes:p.types)];q.addedType='';q.apparentType=p.types.join('/');
    q.baseAbility=q.ability=id(p.ability)||'none';q.abilityState=state(b,q.ability,q,q);q.item=id(p.item==='none'?'':p.item);q.itemState=state(b,q.item,q,q);
    q.maxhp=Math.max(1,Math.round(p.maxHp));q.baseMaxhp=p.dynamaxed?Math.round(p.normalMaxHp||p.maxHp/2):q.maxhp;q.hp=Math.max(0,Math.min(q.maxhp,Math.round(p.hp)));q.fainted=q.hp<=0;q.faintQueued=false;
    q.baseStoredStats=Object.fromEntries(statKeys.map(k=>[k,Math.max(1,Math.round(p.stats[k]))]));q.storedStats={...q.baseStoredStats};q.boosts={atk:0,def:0,spa:0,spd:0,spe:0,accuracy:0,evasion:0,...p.stages};
    q.status=p.status||'';q.statusState=state(b,q.status,q,q);
    if(q.status==='slp')q.statusState.time=q.statusState.startTime=p.sleepTurns||2;
    if(q.status==='tox')q.statusState.stage=Math.max(0,(p.toxicCounter||1)-1);
    for(let j=0;j<q.baseMoveSlots.length;j++){const raw=p.moves[j],m=q.baseMoveSlots[j];m.pp=Math.max(0,Number(raw?.ppLeft)||0);m.maxpp=Number(raw?.pp)||Math.max(m.pp,b.dex.moves.get(m.id).pp);m.disabled=false;m.used=!!raw?.used;}
    q.moveSlots=q.baseMoveSlots.slice();q.ppUps=q.moveSlots.map(()=>0);
    q.lastMove=q.lastMoveEncore=q.lastMoveUsed=p._lastMoveId||p.lastMove?b.dex.moves.get(p._lastMoveId||p.lastMove):null;
    q.activeTurns=p._enteredThisTurn?0:Math.max(1,b.turn-(Number(p.enteredTurn)||0));q.newlySwitched=false;q.trapped=false;q.maybeTrapped=false;
    q.canMegaEvo=p.mechanic==='mega'&&!p.isMega&&!used.mega?(p.megaForm||b.actions.canMegaEvo(q)):null;q.canMegaEvoX=q.canMegaEvoY=q.canUltraBurst=null;
    q.canTerastallize=p.mechanic==='tera'&&!used.tera&&!p.terastallized?p.teraType:null;q.teraType=p.teraType||p.types[0];q.terastallized=p.terastallized?q.teraType:'';
    if(p.isMega||sp.isMega)q.canMegaEvo=null;
   }
   side.pokemonLeft=side.pokemon.filter(alive).length;side.zMoveUsed=!!used.z;side.dynamaxUsed=!!used.dynamax;
  }
  for(let s=0;s<2;s++)for(const q of b.sides[s].pokemon)restoreVolatiles(b,q,world.teams[s][q.set._aiIndex],b.sides[1-s].active[0],notes);
  b.field.weather=weatherId(world.weatherId||world.weather);b.field.weatherState=state(b,b.field.weather,b.field,b.sides[0].active[0],world.weatherTurns||undefined);
  b.field.terrain=world.field.terrain?id(world.field.terrain).replace(/terrain$/,'')+'terrain':'';b.field.terrainState=state(b,b.field.terrain,b.field,b.sides[0].active[0],world.field.terrainTurns||undefined);
  b.field.pseudoWeather={};
  for(const [raw,duration]of Object.entries({...world.field.pseudoWeather,trickroom:world.field.trickRoom,gravity:world.field.gravity,magicroom:world.field.magicRoom,wonderroom:world.field.wonderRoom})){
   if(!duration)continue;const key=id(raw);if(!b.dex.conditions.get(key).exists){notes.add('未重建场地状态：'+raw);continue;}b.field.pseudoWeather[key]=state(b,key,b.field,b.sides[0].active[0],typeof duration==='number'?duration:undefined);
  }
  for(let s=0;s<2;s++){
   b.sides[s].sideConditions={};
   for(const [raw,value]of Object.entries(world.conditions[s]||{})){
    if(!value)continue;const key=id(raw),condition=b.dex.conditions.get(key);if(!condition.exists){notes.add('未重建队伍状态：'+key);continue;}
    const v=b.sides[s].sideConditions[key]=state(b,key,b.sides[s],b.sides[1-s].active[0],condition.duration?(typeof value==='number'?value:condition.duration):undefined);
    if(['spikes','toxicspikes'].includes(key))v.layers=Number(value)||1;
   }
  }
  b._aiFaintBaseline=b.sides.map(s=>s.pokemon.filter(p=>p.fainted).length);
  // Rebuilding an existing position skips PS's turn-start loop. Re-run only
  // its request/legality events, NOT entry abilities, counters, or residuals.
  for(const q of b.getAllActive()){
   q.trapped=q.maybeTrapped=q.maybeDisabled=q.maybeLocked=false;
   for(const m of q.moveSlots){m.disabled=false;m.disabledSource='';}
   b.runEvent('DisableMove',q);
   for(const slot of q.moveSlots){const m=b.dex.getActiveMove(slot.id);b.singleEvent('DisableMove',m,null,q);if(m.flags.cantusetwice&&q.lastMove?.id===m.id)q.disableMove(m.id);}
   b.runEvent('TrapPokemon',q);if(!q.knownType||b.dex.getImmunity('trapped',q))b.runEvent('MaybeTrapPokemon',q);
  }
  b.queue.list=[];b.faintQueue=[];b.midTurn=false;b.requestState='move';b.updateSpeed();b.makeRequest('move');clearLogs(b);
  return{battle:b,notes:[...notes]};
 }catch(error){b.destroy();throw error;}
}
export function clearLogs(b){b.log=[];b.inputLog=[];b.messageLog=[];b.sentLogPos=0;b.sentEnd=false;}
export function saveSimulation(b){clearLogs(b);return JSON.stringify(b.toJSON());}
export function restoreSimulation(json,seed){
 const b=PS.Battle.fromJSON(json);configureGimmicks(b);if(seed)b.resetRNG(seed);b.makeRequest(b.requestState);clearLogs(b);return b;
}
export function commandFor(b,side,actions){
 const s=b.sides[side];return actions.map((a,slot)=>{
  if(!a||a.kind==='pass')return'pass';
  if(a.kind==='switch'){const index=s.pokemon.findIndex(q=>q.set._aiIndex===a.index);return'switch '+(index+1);}
  const q=s.active[slot];if(q?.getLockedMove())return'move 1';
  const move=a.struggle?'struggle':q?.moveSlots[a.index]?.id||'struggle',req=q?.getMoveRequestData(),raw=b.dex.moves.get(move);
  let target=a.target?` ${(1-a.target.side===side?-1:1)*(a.target.slot+1)}`:'';
  let targetType=req?.moves.find(x=>x.id===move)?.target||raw.target;
  if(a.mechanic==='z')targetType=req?.canZMove?.[a.index]?.target||targetType;
  if(a.mechanic==='dynamax'||q?.volatiles.dynamax)targetType=req?.maxMoves?.maxMoves?.[a.index]?.target||b.actions.getMaxMove(raw,q)?.target||targetType;
  if(!target&&b.activePerHalf>1&&['normal','adjacentFoe','any','adjacentAlly','adjacentAllyOrSelf'].includes(targetType)){
   const ts=['adjacentAlly','adjacentAllyOrSelf'].includes(targetType)?side:1-side,index=b.sides[ts].active.findIndex(p=>alive(p)&&(ts!==side||p!==q||targetType==='adjacentAllyOrSelf'));
   if(index>=0)target=` ${(ts===side?-1:1)*(index+1)}`;
  }
  const special=a.mechanic?{mega:' mega',z:' zmove',dynamax:' dynamax',tera:' terastallize'}[a.mechanic]||'':'';
  return`move ${move}${target}${special}`;
 }).join(', ');
}
function expandTargets(b,side,slot,a,target){
 if(b.activePerHalf===1||!['normal','adjacentFoe','any','adjacentAlly','adjacentAllyOrSelf'].includes(target))return[a];
 const sides=['adjacentAlly','adjacentAllyOrSelf'].includes(target)?[side]:target==='any'?[1-side,side]:[1-side],out=[];
 for(const t of sides)for(let i=0;i<b.sides[t].active.length;i++)if(alive(b.sides[t].active[i])&&!(t===side&&i===slot&&target!=='adjacentAllyOrSelf'))out.push({...a,target:{side:1-t,slot:i}});
 return out.length?out:[a];
}
export function jointActions(groups,limit=Infinity){
 let out=[[]];for(const group of groups){const next=[];for(const prefix of out)for(const a of group){if(a.kind==='switch'&&prefix.some(x=>x.kind==='switch'&&x.index===a.index))continue;if(a.mechanic&&prefix.some(x=>x.mechanic===a.mechanic))continue;next.push([...prefix,a]);}out=next;}
 return out.slice(0,limit);
}
export function simulationMenus(b,side){
 const s=b.sides[side],r=s.activeRequest;if(!r||r.wait)return[[{kind:'pass'}]];
 return s.active.map((q,slot)=>{
  if(r.forceSwitch&&!r.forceSwitch[slot])return[{kind:'pass'}];
  const swaps=s.pokemon.filter(p=>alive(p)&&!s.active.includes(p)).map(p=>({kind:'switch',index:p.set._aiIndex,slot}));
  if(r.forceSwitch?.[slot])return swaps.length?(r.forceSwitch.filter(Boolean).length>swaps.length?[...swaps,{kind:'pass'}]:swaps):[{kind:'pass'}];
  if(!alive(q))return[{kind:'pass'}];
  const req=r.active?.[slot]||q.getMoveRequestData(),out=[];
  for(let i=0;i<(req.moves||[]).length;i++){
   const m=req.moves[i];if(m.disabled||m.pp===0&&m.id!=='struggle')continue;
   const base={kind:'move',index:Math.max(0,q.moveSlots.findIndex(x=>x.id===m.id)),slot,...(m.id==='struggle'?{struggle:true}:{})};
   out.push(...expandTargets(b,side,slot,base,q.volatiles.dynamax?req.maxMoves?.maxMoves?.[i]?.target||m.target:m.target));
   if(req.canMegaEvo)out.push(...expandTargets(b,side,slot,{...base,mechanic:'mega'},m.target));
   if(req.canTerastallize)out.push(...expandTargets(b,side,slot,{...base,mechanic:'tera'},m.target));
   if(req.canZMove?.[i])out.push(...expandTargets(b,side,slot,{...base,mechanic:'z'},req.canZMove[i].target));
   if(req.canDynamax)out.push(...expandTargets(b,side,slot,{...base,mechanic:'dynamax'},req.maxMoves?.maxMoves?.[i]?.target||m.target));
  }
  if(!req.trapped&&!q.trapped)out.push(...swaps);
  return out.length?out:[{kind:'move',index:0,struggle:true,slot}];
 });
}
function targetOf(b,side,slot,a,m){
 if(a.target)return b.sides[1-a.target.side]?.active[a.target.slot];
 return ['self','allySide','allyTeam','allies'].includes(m.target)?b.sides[side].active[slot]:b.sides[1-side].active.find(alive);
}
function expectedDamage(b,p,q,m){
 // PURE candidate-ordering heuristic, never damage applied to a battle. PS's
 // getDamage is NOT a read-only estimator: active move data, RNG, Stellar STAB
 // and some item callbacks mutate. Calling it here either throws on a frozen
 // Dex move or silently changes the position before search. Actual lookahead
 // HP/PP/damage/accuracy always come from executeChoices and unmodified PS.
 if(!p||!q||m.category==='Status'||!b.dex.getImmunity(m.type,q))return 0;
 const absorb={Electric:['voltabsorb','lightningrod','motordrive'],Water:['waterabsorb','stormdrain','dryskin'],Fire:['flashfire','wellbakedbody'],Grass:['sapsipper'],Ground:['levitate']};
 if(absorb[m.type]?.includes(q.ability)&&!['moldbreaker','teravolt','turboblaze'].includes(p.ability))return 0;
 const accuracy=m.accuracy===true?1:(m.accuracy||100)/100;
 if(m.damage==='level')return p.level*accuracy;
 if(typeof m.damage==='number')return m.damage*accuracy;
 if(['superfang','naturesmadness','ruination'].includes(m.id))return Math.max(1,q.hp/2)*accuracy;
 if(m.ohko)return q.hp*Math.max(.01,Math.min(1,(m.accuracy||30)/100+(p.level-q.level)/100));
 const scaled=(mon,key)=>{const n=mon.boosts[key]||0;return Math.max(1,(mon.storedStats[key]||80)*(n>=0?(2+n)/2:2/(2-n)));};
 let power=m.basePower||50;
 if(['eruption','waterspout','dragonenergy'].includes(m.id))power=150*p.hp/p.maxhp;
 if(m.id==='gyroball')power=Math.min(150,25*scaled(q,'spe')/scaled(p,'spe')+1);
 if(m.id==='electroball'){const ratio=scaled(p,'spe')/scaled(q,'spe');power=ratio>=4?150:ratio>=3?120:ratio>=2?80:ratio>=1?60:40;}
 const physical=m.category==='Physical',off=m.id==='bodypress'?'def':physical?'atk':'spa',def=m.id==='psyshock'||m.id==='psystrike'?'def':physical?'def':'spd';
 let attack=scaled(m.id==='foulplay'?q:p,off),defense=scaled(q,def);
 if(physical&&['hugepower','purepower'].includes(p.ability))attack*=2;
 if((p.item==='choiceband'&&physical)||(p.item==='choicespecs'&&!physical))attack*=1.5;
 if(q.item==='assaultvest'&&!physical)defense*=1.5;
 let damage=((2*p.level/5+2)*power*attack/defense/50+2)*.925;
 const original=p.types.includes(m.type),tera=p.terastallized;
 if(original||tera===m.type)damage*=original&&tera===m.type?2:1.5;
 if(physical&&p.status==='brn'&&p.ability!=='guts'&&m.id!=='facade')damage*=.5;
 damage*=2**b.dex.getEffectiveness(m.type,q);
 if(p.item==='lifeorb')damage*=1.3;
 const weather=b.field.effectiveWeather();if(['sunnyday','desolateland'].includes(weather))damage*=m.type==='Fire'?1.5:m.type==='Water'?.5:1;if(['raindance','primordialsea'].includes(weather))damage*=m.type==='Water'?1.5:m.type==='Fire'?.5:1;
 if(m.multihit)damage*=typeof m.multihit==='number'?m.multihit:p.ability==='skilllink'?m.multihit[1]:p.item==='loadeddice'?4.5:3.1;
 return Number.isFinite(damage)?damage*accuracy:0;
}
export function actionPrior(b,side,slot,a){
 const p=b.sides[side].active[slot];if(!alive(p))return a.kind==='pass'?0:-1000;
 const foes=b.sides[1-side].active.filter(alive);
 if(a.kind==='pass')return-100;
 if(a.kind==='switch'){
  const q=b.sides[side].pokemon.find(x=>x.set._aiIndex===a.index);if(!alive(q))return-1000;
  let threat=0,old=0,attack=0;
  for(const f of foes){for(const x of f.moveSlots){const m=b.dex.moves.get(x.id);if(x.pp>0){threat=Math.max(threat,expectedDamage(b,f,q,m)/q.maxhp);old=Math.max(old,expectedDamage(b,f,p,m)/p.maxhp);}}for(const x of q.moveSlots)if(x.pp>0)attack=Math.max(attack,expectedDamage(b,q,f,b.dex.moves.get(x.id))/f.maxhp);}
  const c=b.sides[side].sideConditions;let hazard=0;if(q.item!=='heavydutyboots'&&q.ability!=='magicguard'){if(c.stealthrock)hazard+=Math.pow(2,b.dex.getEffectiveness('Rock',q))/8;if(q.isGrounded())hazard+=[0,.125,1/6,.25][c.spikes?.layers||0];}
  return(old-threat)*45+attack*15-12-hazard*90+(p.ability==='regenerator'&&p.hp<p.maxhp*.6?12:0);
 }
 let m=b.dex.moves.get(p.moveSlots[a.index]?.id||'struggle');
 if(a.mechanic==='z')m=b.actions.getActiveZMove(m,p);
 if(a.mechanic==='dynamax'||p.volatiles.dynamax)m=b.actions.getActiveMaxMove(m,p);
 const q=targetOf(b,side,slot,a,m);let score=0;
 if(m.category!=='Status'&&q){const d=expectedDamage(b,p,q,m);score+=(q.side.n===side?-1:1)*(Math.min(d,q.hp)/q.maxhp*75+(d>=q.hp&&d>0?75:0));}
 if(m.heal)score+=Math.min(p.maxhp-p.hp,p.maxhp*m.heal[0]/m.heal[1])/p.maxhp*80;
 if(['recover','roost','slackoff','softboiled','milkdrink','synthesis','morningsun','moonlight','shoreup','rest'].includes(m.id)&&p.hp>=p.maxhp*.98)score-=100;
 if(m.boosts)for(const [key,n]of Object.entries(m.boosts)){const target=q||p,sign=target.side.n===side?1:-1,available=n>0?Math.max(0,6-target.boosts[key]):Math.max(0,6+target.boosts[key]);score+=sign*Math.sign(n)*Math.min(available,Math.abs(n))*(key==='accuracy'||key==='evasion'?4:10);}
 if(m.status&&q&&!q.status&&q.runStatusImmunity(m.status==='tox'?'psn':m.status))score+=m.status==='slp'?28:20;
 if(m.sideCondition){const s=['allySide','allyTeam'].includes(m.target)?side:1-side;if(!b.sides[s].sideConditions[m.sideCondition])score+=18;}
 if(m.stallingMove||m.id==='protect'||m.id==='detect'||m.id==='maxguard'){
  const chip=foes.some(f=>['psn','tox','brn'].includes(f.status)||f.volatiles.leechseed),heal=p.item==='leftovers'&&p.hp<p.maxhp*.9;
  score+=(chip||heal||b.gameType==='doubles'?12:-15)/(p.volatiles.stall?.counter||1);
 }
 if(a.mechanic==='mega')score+=8;
 if(a.mechanic==='tera')score+=m.type===p.teraType?5:0;
 if(a.mechanic==='z')score-=3;
 return Number.isFinite(score)?score:-1000;
}
export function rankedJointActions(b,side,{perSlot=4,joints=10}={}){
 const groups=simulationMenus(b,side).map((menu,slot)=>menu.map(a=>({a,score:actionPrior(b,side,slot,a)})).sort((a,c)=>c.score-a.score||actionKey(a.a).localeCompare(actionKey(c.a))).slice(0,perSlot));
 return jointActions(groups.map(g=>g.map(x=>x.a))).map(actions=>({actions,score:actions.reduce((n,a,slot)=>n+actionPrior(b,side,slot,a),0)})).sort((a,c)=>c.score-a.score||a.actions.map(actionKey).join('|').localeCompare(c.actions.map(actionKey).join('|'))).slice(0,joints);
}
export function executeChoices(b,ours,theirs){
 const commands=[commandFor(b,0,ours),commandFor(b,1,theirs)],required=b.sides.map(s=>!!s.activeRequest&&!s.activeRequest.wait);
 // choose() commits immediately once all REQUIRED sides are done. During a
 // pivot only one side chooses; do not inspect the OTHER side's NEW next-turn
 // request after that commit and accidentally submit a stale pass/move to it.
 for(let s=0;s<2;s++)if(required[s]){if(!b.choose('p'+(s+1),commands[s]))throw Error('AI模拟非法行动：'+commands[s]+' / '+b.sides[s].choice.error);}
}
export function settleReplacements(b,{firstFaintLoses=false,max=8}={}){
 for(let i=0;i<max&&!b.ended&&b.requestState==='switch';i++){
  if(firstFaintLoses&&b.sides.some((s,i)=>s.pokemon.filter(p=>p.fainted).length>(b._aiFaintBaseline?.[i]||0)))return;
  // Both replacement policies are computed BEFORE either command is submitted.
  const actions=b.sides.map((_,s)=>rankedJointActions(b,s,{perSlot:3,joints:1})[0]?.actions||[{kind:'pass'}]);
  executeChoices(b,actions[0],actions[1]);
 }
 if(!b.ended&&b.requestState==='switch'&&!firstFaintLoses)throw Error('AI模拟替换未收敛');
}
export function evaluateSimulation(b,{firstFaintLoses=false}={}){
 if(firstFaintLoses){const gone=b.sides.map((s,i)=>s.pokemon.filter(p=>p.fainted).length>(b._aiFaintBaseline?.[i]||0));if(gone[0]||gone[1])return gone[0]===gone[1]?0:gone[0]?-1:1;}
 if(b.ended)return b.winner===b.sides[0].name?1:b.winner===b.sides[1].name?-1:0;
 const values=b.sides.map(s=>{
  let value=0;
  for(const p of s.pokemon){if(!alive(p))continue;value+=100+70*p.hp/p.maxhp;
   if(p.status==='slp')value-=18;if(p.status==='par')value-=p.species.baseStats.spe>=80?18:10;
   if(p.status==='brn'&&p.ability!=='guts'&&p.moveSlots.some(x=>b.dex.moves.get(x.id).category==='Physical'))value-=18;
   if(p.status==='tox')value-=12+Math.min(24,(p.statusState.stage||0)*4);if(p.status==='psn')value-=10;if(p.status==='frz')value-=25;
   if(p.isActive){const physical=p.moveSlots.some(x=>x.pp>0&&b.dex.moves.get(x.id).category==='Physical'),special=p.moveSlots.some(x=>x.pp>0&&b.dex.moves.get(x.id).category==='Special');
    for(const [k,n]of Object.entries(p.boosts)){const weight=k==='atk'?(physical?13:1):k==='spa'?(special?13:1):k==='spe'?9:k==='def'||k==='spd'?6:4;value+=Math.sign(n)*Math.log2(1+Math.abs(n))*weight;}
    if(p.volatiles.substitute)value+=15;if(p.volatiles.leechseed)value-=10;if(p.volatiles.perishsong)value-=20/Math.max(1,p.volatiles.perishsong.duration||1);
   }
  }
  const benched=s.pokemon.filter(p=>alive(p)&&!s.active.includes(p));
  for(const p of benched)if(p.item!=='heavydutyboots'&&p.ability!=='magicguard'){
   if(s.sideConditions.stealthrock)value-=Math.pow(2,b.dex.getEffectiveness('Rock',p))*5;
   if(p.isGrounded())value-=(s.sideConditions.spikes?.layers||0)*3;
  }
  if(s.sideConditions.reflect)value+=5;if(s.sideConditions.lightscreen)value+=5;if(s.sideConditions.auroraveil)value+=8;if(s.sideConditions.tailwind)value+=5;
  return value;
 });
 return Math.tanh((values[0]-values[1])/170)*.94;
}
export {PS};
