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
// Learnset-constrained, role-coherent LOCAL hypotheses. Not Smogon statistics,
// a trained posterior, a reconstruction of the player's set, or a source of
// equipment for the real battle. Input is the sanitized observation only.
import {sampleWorld,statsFor} from './model.mjs?v=20261118-ai-elite-v3&cmd=kanto-crown-v72';
import {id} from './battle-view.mjs?v=20261118-ai-elite-v3&cmd=kanto-crown-v72';
import {canLearn,partner,usage} from './circuit/meta.mjs?v=crown-72';
import {inferSet} from './circuit/posterior.mjs?v=crown-72';
const pick=(xs,rng)=>xs[Math.floor(rng()*xs.length)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function draw(xs,rng){const sum=xs.reduce((n,x)=>n+x.weight,0);let n=rng()*sum;for(const x of xs){n-=x.weight;if(n<=0)return x.id;}return xs.at(-1)?.id;}
function poolFor(species,level,known,db,wild){
 const learn=db.learnsets[species]||{},sp=db.dex[species];
 return Object.entries(learn).filter(([mid,v])=>db.moves[mid]&&canLearn(v,level)&&(!wild||v[0]>0&&!/[ME]/.test(String(v[1]||'')))&&(known.includes(mid)||!db.supportedMoves||db.supportedMoves.has(mid))).map(([mid])=>({id:mid,m:db.moves[mid],stab:sp.types.includes(db.moves[mid].type)}));
}
export function coherentSet(visible,species,level,db,rng,{wild=false,usageRow=null}={}){
 const sp=db.dex[species],revealed=visible.moves||[],known=[...new Set(revealed.map(m=>id(m.id)).filter(mid=>db.moves[mid]&&!db.moves[mid].isZ&&!/^(?:max|gmax)/.test(mid)))].slice(0,4);
 const pool=poolFor(species,level,known,db,wild),attackSum={Physical:0,Special:0};
 for(const mid of known){const m=db.moves[mid];if(m.category!=='Status')attackSum[m.category]+=(m.basePower||60);}
 const physical=attackSum.Physical>attackSum.Special?true:attackSum.Special>attackSum.Physical?false:sp.baseStats.atk>=sp.baseStats.spa;
 const category=physical?'Physical':'Special',offStat=physical?'atk':'spa';
 const bulky=sp.baseStats.hp+(sp.baseStats.def+sp.baseStats.spd)/2>=190;
 const hasHeal=pool.some(x=>x.m.heal),role=wild?'wild':bulky&&hasHeal&&rng()<.55?'bulky':rng()<.35?'setup':'attacker';
 const nature=wild?'serious':role==='bulky'?(physical?'impish':'calm'):pick([physical?'adamant':'modest',physical?'jolly':'timid','serious'],rng);
 const investment=wild?0:pick([0,128,252],rng),evs=role==='bulky'?{hp:investment,[sp.baseStats.def<sp.baseStats.spd?'def':'spd']:investment}:{[offStat]:investment,spe:investment};
 const chosen=known.slice();
 const add=(filter,weight=()=>1)=>{
  const options=pool.filter(x=>!chosen.includes(x.id)&&filter(x)).map(x=>({id:x.id,weight:Math.max(.001,weight(x))*(usageRow&& !wild?(.22+2.8*Math.sqrt((usageRow[1][x.id]||0)/1000)):1)}));
  if(options.length&&chosen.length<4)chosen.push(draw(options,rng));
 };
 const attackWeight=x=>Math.min(x.m.basePower||55,120)*(x.m.category===category?1.8:.55)*(x.stab?1.8:1)*(x.m.accuracy===true?1:(x.m.accuracy||100)/100)*(x.m.selfdestruct ? .1 : 1);
 // Guarantee a usable attack if the public learnset permits one, not four
 // independently drawn redundant STAB moves / four arbitrary status moves.
 if(!chosen.some(mid=>db.moves[mid].category!=='Status'))add(x=>x.m.category!=='Status'&&x.stab,attackWeight);
 if(!chosen.some(mid=>db.moves[mid].category!=='Status'))add(x=>x.m.category!=='Status',attackWeight);
 if(role==='bulky'&&!chosen.some(mid=>db.moves[mid].heal))add(x=>!!x.m.heal);
 if(role==='setup'&&!chosen.some(mid=>db.moves[mid].boosts?.[offStat]>0))add(x=>x.m.target==='self'&&(x.m.boosts?.[offStat]>0||x.m.boosts?.spe>0));
 if(chosen.length<4&&rng()<.8){const types=new Set(chosen.map(mid=>db.moves[mid]).filter(m=>m.category!=='Status').map(m=>m.type));add(x=>x.m.category!=='Status'&&!types.has(x.m.type),attackWeight);}
 while(chosen.length<4){
  const old=chosen.length;
  add(x=>true,x=>x.m.category!=='Status'?attackWeight(x):x.m.heal?(role==='bulky'?100:25):x.m.boosts?(role==='setup'?70:15):x.m.status?55:x.m.sideCondition?40:8);
  if(chosen.length===old)break;
 }
 if(!chosen.length)chosen.push('tackle');
 let item=visible.itemKnown?(visible.item||'none'):'none';
 if(!visible.itemKnown&&!wild&&rng()<.45){
  const support=chosen.some(mid=>db.moves[mid]?.category==='Status');
  item=role==='bulky'?pick(['leftovers','sitrusberry','heavydutyboots'],rng):support?pick(['leftovers','lifeorb','sitrusberry','focussash'],rng):pick(['lifeorb',physical?'choiceband':'choicespecs','choicescarf','focussash'],rng);
 }
 const stats=statsFor(sp,level,nature,evs);
 return{role,nature,evs,ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31},stats,item,moves:chosen.map(mid=>({id:mid,ppLeft:Math.max(0,(db.moves[mid]?.pp||20)-(revealed.find(m=>id(m.id)===mid)?.used||0))}))};
}
// 宝可梦大师: the hypothesis IS the player's real team (configuration + current state).
function oracleWorld(view,db,rng){
 const world=sampleWorld(view,db,rng,{setsFilledLater:true,unseen:()=>''});
 world.teams[1]=view.oracle.team.map(p=>({...p,species:id(p.species||p.speciesId),types:[...p.types],stats:{...p.stats},stages:{...p.stages},volatile:{...p.volatile},nature:p.nature||'serious',weight:db.dex[id(p.species||p.speciesId)]?.weightkg||10,moves:p.moves.map(m=>({...m}))}));
 world.mechanicUsed[1]={...(view.oracle.mechanicUsed||{})};world.oracle=true;return world;
}
export function sampleBeliefWorld(view,db,rng){
 if(view.profile?.master&&Array.isArray(view.oracle?.team)&&view.oracle.team.length===view.opponent.length)return oracleWorld(view,db,rng);
 const used=new Set(view.opponent.map(p=>p.species).filter(Boolean));const world=sampleWorld(view,db,rng,{setsFilledLater:true,unseen:()=>{const id=partner(view,db,rng,used);if(id)used.add(id);return id;}});
 // Z/Max animations are public evidence, not permanent learned moves. Infer
 // only ALREADY OBSERVED resource use, never the player's unannounced gear.
 const observed={...(view.mechanicUsed?.[1]||{})};
 for(const p of view.opponent){
  if(p.isMega)observed.mega=true;if(p.terastallized)observed.tera=true;if(p.dynamaxed)observed.dynamax=true;
  for(const m of p.moves||[]){if(db.moves[id(m.id)]?.isZ)observed.z=true;if(/^(?:max|gmax)/.test(id(m.id)))observed.dynamax=true;}
 }
 world.mechanicUsed[1]=observed;
 world.teams[1]=world.teams[1].map((p,i)=>{
  const visible=view.opponent[i],baseline=coherentSet(visible,p.species,p.level,db,rng,{wild:view.encounterType==='wild',usageRow:usage(view,p.species)}),set=inferSet(view,i,p,db,rng,baseline),fraction=visible.unseen?1:clamp(Number(visible.hpPercent||0)/100,0,1);
  // Revealed forms/types/abilities/items always win over a local prior.
  const scale=p.dynamaxed?2:1,maxHp=set.stats.hp*scale;
  return{...p,...set,maxHp,hp:fraction>0?Math.max(1,Math.round(maxHp*fraction)):0,normalMaxHp:p.dynamaxed?set.stats.hp:undefined,originalSpeciesId:p.isMega?(db.dex[p.species]?.baseSpecies?id(db.dex[p.species].baseSpecies):p.species):p.species};
 });return world;
}
