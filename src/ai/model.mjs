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
// Local, learnset-constrained hypotheses, NOT Foul Play's Smogon/team-dataset
// inference. Only receives the sanitized observation, never the actual set.
import {id} from './battle-view.mjs?v=20261118-ai-elite-v3';
const keys=['hp','atk','def','spa','spd','spe'];
const natures={adamant:['atk','spa'],modest:['spa','atk'],jolly:['spe','spa'],timid:['spe','atk'],bold:['def','atk'],calm:['spd','atk'],impish:['def','spa'],careful:['spd','spa']};
const choose=(xs,rng)=>xs[Math.floor(rng()*xs.length)];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function statsFor(sp,level,nature='serious',evs={}){const stats={};for(const k of keys){const b=sp?.baseStats?.[k]||70,e=Math.floor((evs[k]||0)/4);stats[k]=k==='hp'?(b===1?1:Math.floor((2*b+31+e)*level/100)+level+10):Math.floor((2*b+31+e)*level/100)+5;}const [up,down]=natures[nature]||[];if(up)stats[up]=Math.floor(stats[up]*1.1);if(down)stats[down]=Math.floor(stats[down]*.9);return stats}
function weighted(xs,rng){const sum=xs.reduce((s,x)=>s+x.weight,0);let n=rng()*sum;for(const x of xs){n-=x.weight;if(n<=0)return x.id}return xs.at(-1)?.id}
export function plausibleMoves(species,level,revealed,db,rng,{wild=false}={}){
 const known=[...new Set((revealed||[]).map(m=>id(m.id)).filter(x=>x&&db.moves[x]))].slice(0,4);
 const sp=db.dex[species]||{},learn=db.learnsets[species]||{},physical=(sp.baseStats?.atk||70)>=(sp.baseStats?.spa||70);
 const pool=Object.entries(learn).filter(([mid,entry])=>db.moves[mid]&&(!entry[0]||entry[0]<=level)&&(!wild||entry[0]>0&&!String(entry[1]||'').match(/[ME]/))&&(known.includes(mid)||!db.supportedMoves||db.supportedMoves.has(mid))).map(([mid])=>{
  const m=db.moves[mid];let weight=1;if(m.category!=='Status'){weight=(Math.min(m.basePower||50,120)/45)*(sp.types?.includes(m.type)?2.8:1)*(m.category===(physical?'Physical':'Special')?1.5:.7);if((m.accuracy||100)<75)weight*=.6;if(m.basePower>140)weight*=.4;}
  else weight=m.heal?1.7:m.boosts?1.2:m.status?1.5:m.sideCondition?1.1:.35;
  return{id:mid,weight};
 });
 // A completely missing learnset is explicitly a neutral assumption, not a
 // read of the private roster. Tackle is only used when no public move exists.
 while(known.length<4){const candidates=pool.filter(p=>!known.includes(p.id));if(!candidates.length)break;known.push(weighted(candidates,rng))}
 if(!known.length)known.push('tackle');
 return known.map(mid=>{const used=(revealed||[]).find(m=>id(m.id)===mid)?.used||0;return{id:mid,ppLeft:Math.max(0,(db.moves[mid]?.pp||20)-used)}});
}
function hypothesize(visible,index,view,db,rng){
 const level=Math.round(view.opponent.filter(p=>!p.unseen).reduce((s,p,_,a)=>s+(p.level||50)/a.length,0))||view.own[0]?.level||50;
 const neutral=['pidgeot','raticate','fearow','arbok','pikachu','sandslash','ninetales','vileplume','golduck','primeape','arcanine','poliwrath','machamp','victreebel','tentacruel','golem','rapidash','slowbro','dodrio','dewgong','muk','cloyster','hypno','kingler','electrode','exeggutor','marowak','weezing','rhydon','tangela','seadra','seaking','scyther','pinsir','tauros','gyarados','lapras','snorlax'].filter(s=>db.dex[s]);
 const species=visible.unseen?choose(neutral,rng):id(visible.species),sp=db.dex[species];if(!sp)throw Error('缺少物种资料：'+species);
 const physical=sp.baseStats.atk>=sp.baseStats.spa,defensive=rng()<.3;
 const nature=choose(['serious','serious',physical?'adamant':'modest',physical?'jolly':'timid',physical?'impish':'calm'],rng);
 const ev=choose([0,0,128,252],rng),evs=defensive?{hp:ev,[physical?'def':'spd']:ev}:{[physical?'atk':'spa']:ev,spe:ev};
 const stats=statsFor(sp,visible.level||level,nature,evs),fraction=visible.unseen?1:clamp(Number(visible.hpPercent||0)/100,0,1);
 const wild=view.encounterType==='wild';
 const ability=visible.ability||id(choose(sp.abilities?.length?sp.abilities:['none'],rng));
 const item=visible.itemKnown?(visible.item||'none'):(wild||rng()<.6?'none':choose(['leftovers','sitrusberry','lifeorb',physical?'choiceband':'choicespecs','choicescarf','focussash'],rng));
 return{species,level:visible.level||level,maxHp:stats.hp,hp:fraction===0?0:Math.max(1,Math.round(stats.hp*fraction)),stats,types:visible.types||sp.types,ability,item,nature,moves:plausibleMoves(species,visible.level||level,visible.moves,db,rng,{wild}),stages:{...visible.stages},status:visible.status||null,sleepTurns:visible.status==='slp'?2:0,toxicCounter:visible.toxicCounter||1,volatile:{...visible.volatile},weight:sp.weightkg||10,lastMove:visible.lastMove,_protectStreak:visible.protectStreak||0,isMega:!!visible.isMega,terastallized:!!visible.terastallized,teraType:visible.terastallized?visible.types?.[0]:null,dynamaxed:!!visible.dynamaxed,dynamaxTurns:visible.dynamaxTurns||0,originalTypes:sp.types};
}
export function sampleWorld(view,db,rng){
 const own=view.own.map(p=>({...p,species:id(p.species||p.speciesId),types:[...p.types],stats:{...p.stats},stages:{...p.stages},volatile:{...p.volatile},nature:p.nature||'serious',weight:db.dex[id(p.species||p.speciesId)]?.weightkg||10,moves:p.moves.map(m=>({...m}))}));
 const foe=view.opponent.map((p,i)=>hypothesize(p,i,view,db,rng));
 return{teams:[own,foe],active:view.active.map(a=>a.slice()),conditions:[structuredClone(view.field.sides[1]),structuredClone(view.field.sides[0])],weather:view.weather,weatherId:view.weatherId,weatherTurns:view.weatherTurns,field:{...view.field},mechanicUsed:structuredClone(view.mechanicUsed),double:!!view.double,firstFaintLoses:!!view.firstFaintLoses};
}
const status={brn:'burn',par:'paralysis',psn:'poison',tox:'toxic',slp:'sleep',frz:'freeze'};
const volatileMap={confusion:'CONFUSION',taunt:'TAUNT',torment:'TORMENT',healblock:'HEALBLOCK',magnetrise:'MAGNETRISE',aquaring:'AQUARING',ingrain:'INGRAIN',focusenergy:'FOCUSENERGY',attract:'ATTRACT',saltcure:'SALTCURE',yawn:'YAWN',embargo:'EMBARGO',slowstart:'SLOWSTART',cannotEscape:'TRAPPED',octolock:'OCTOLOCK',nightmare:'NIGHTMARE',minimize:'MINIMIZE',defensecurl:'DEFENSECURL',curse:'CURSE',gastroacid:'GASTROACID',leechseed:'LEECHSEED',substitute:'SUBSTITUTE',recharging:'MUSTRECHARGE',encore:'ENCORE'};
// Unsupported persistent states must be visible as compatibility mode rather
// than silently flattened into a misleading "MCTS" result.
export function compatibilityReasons(view,db,catalog){
 const why=[];if(view.double)why.push('双打（上游为单打搜索）');if(view.firstFaintLoses)why.push('先倒一只即落败规则');
 for(const k of ['gravity','magicRoom','wonderRoom','futureMoves','echoedVoice'])if(view.field[k]>0)why.push(k+'状态');
 if(Object.values(view.field.pseudoWeather||{}).some(Boolean))why.push('特殊场地状态');
 const sideKeys=new Set(['reflect','lightscreen','auroraveil','tailwind','safeguard','mist','spikes','toxicspikes','stealthrock','stickyweb','wideguard','quickguard','matblock']);
 for(const s of view.field.sides)for(const [k,v]of Object.entries(s))if(v&&!sideKeys.has(k))why.push('未映射队伍状态：'+k);
 // PS's stall is already represented by _protectStreak -> native protectCount;
 // treating its mere existence as an unknown state needlessly disabled MCTS.
 const knownVol=new Set([...Object.keys(volatileMap),'protect','endure','stall','disableMove','disableTurns','critBoost']);
 for(const [side,team]of [view.own,view.opponent].entries())for(const p of team){if(p.unseen)continue;const sp=id(p.species||p.speciesId);
  if(p.dynamaxed||p.terastallized||p.isMega)why.push('已发动特殊变身');
  if(side===0&&p.mechanic&&!view.mechanicUsed[0]?.[p.mechanic])why.push('可发动'+p.mechanic+'（兼容决策）');
  if(catalog&&!catalog.species.has(sp))why.push('物种未被上游支持：'+sp);
  if(side===0&&catalog){if(!catalog.abilities.has(id(p.ability)||'none'))why.push('特性未被上游支持：'+p.ability);if(!catalog.items.has(id(p.item)||'none'))why.push('道具未被上游支持：'+p.item)}
  for(const m of p.moves||[])if(catalog&&!catalog.moves.has(id(m.id)))why.push('招式未被上游支持：'+m.id);
  for(const [k,v]of Object.entries(p.volatile||{}))if(v&&!knownVol.has(k))why.push('未映射持续状态：'+k);
  if(p.status==='slp')why.push('睡眠回合计数规则差异');
  if(p.volatile?.encore)why.push('再来一次的锁定状态');
 }
 return [...new Set(why)];
}
export function engineRequest(world,view,milliseconds=100){
 const team=(list,side)=>list.map(p=>{
  const vol=p.volatile||{},last=p.moves.findIndex(m=>m.id===(p._lastMoveId||p.lastMove)),moves=p.moves.map(m=>({...m,disabled:m.ppLeft<=0||vol.disableMove===m.id||!!p.choiceLockedMove&&p.choiceLockedMove!==m.id}));
  return{...p,ability:id(p.ability)||'none',item:id(p.item)||'none',nature:id(p.nature)||'serious',status:status[p.status]||'none',teraType:'typeless',sleepTurns:p.sleepTurns||0,volatiles:Object.entries(volatileMap).filter(([k])=>!!vol[k]).map(([,v])=>v),lastMoveIndex:last>=0?last:null,protectCount:p._protectStreak||0,moves,volatile:{substitute:vol.substitute===true?Math.floor(p.maxHp/4):Number(vol.substitute)||0,confusion:vol.confusion===true?2:Number(vol.confusion)||0,taunt:vol.taunt===true?2:Number(vol.taunt)||0,yawn:vol.yawn===true?1:Number(vol.yawn)||0}};
 });
 return{sides:world.teams.map((t,i)=>({team:team(t,i),active:world.active[i][0],conditions:Object.fromEntries(Object.entries(world.conditions[i]).map(([k,v])=>[k,typeof v==='boolean'?(v?1:0):v])),trapped:i===0&&!view.legal[0].some(a=>a.kind==='switch')})),field:{weather:world.weather||'none',weatherTurns:world.weather?(world.weatherTurns||-1):0,terrain:world.field.terrain?world.field.terrain.replace(/terrain$/i,'')+'terrain':'none',terrainTurns:world.field.terrainTurns||0,trickRoom:world.field.trickRoom||0},allowed:view.legal[0].filter(a=>!a.struggle).map(a=>a.kind==='move'?`move:${a.index}${a.mechanic?':'+a.mechanic:''}`:a.kind==='switch'?`switch:${a.index}`:'pass'),milliseconds};
}
