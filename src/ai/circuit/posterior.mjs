// SPDX-License-Identifier: MIT
// Complete-set prior conditioned on public evidence, never a copy of the player's set.
import {canLearn,usage} from './meta.mjs?v=crown-72';
import {damageBand} from './rolls.mjs?v=crown-72';
import {LIBRARY,COUNTS} from './book.mjs?v=crown-72';
const id=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const keys=['hp','atk','def','spa','spd','spe'];const choices=new Set(['choicescarf','choicespecs','choiceband']);
const pick=(xs,r)=>xs[Math.floor(r()*xs.length)];const times=new WeakMap();
const natureTable={hardy:[],lonely:['atk','def'],brave:['atk','spe'],adamant:['atk','spa'],naughty:['atk','spd'],bold:['def','atk'],docile:[],relaxed:['def','spe'],impish:['def','spa'],lax:['def','spd'],timid:['spe','atk'],hasty:['spe','def'],serious:[],jolly:['spe','spa'],naive:['spe','spd'],modest:['spa','atk'],mild:['spa','def'],quiet:['spa','spe'],bashful:[],rash:['spa','spd'],calm:['spd','atk'],gentle:['spd','def'],sassy:['spd','spe'],careful:['spd','spa'],quirky:[]};
export function statsAt(sp,lv,nature,evs,ivs){let o={};for(const k of keys){let v=Math.floor((2*sp.baseStats[k]+(ivs[k]??31)+Math.floor((evs[k]||0)/4))*lv/100);if(k==='hp')v=sp.baseStats.hp===1?1:v+lv+10;else{v+=5;const [up,down]=natureTable[nature]||[];if(k===up)v=Math.floor(v*110/100);else if(k===down)v=Math.floor(v*90/100);}o[k]=v;}return o;}
const uniq=xs=>[...new Set(xs)];function assign(slots,known,n=0,used=new Map()){if(n===known.length)return used;for(let i=0;i<slots.length;i++)if(!used.has(i)&&slots[i].includes(known[n])){const r=assign(slots,known,n+1,new Map([...used,[i,known[n]]]));if(r)return r;}return null;}
export function candidates(view,index,db,species){const f=view.opponent[index];if(!f||f.unseen||view.encounterType==='wild')return [];const sp=species||id(f.species),key=index+'/'+sp+'/'+(db.supportedMoves?'native':'all');let cache=times.get(view);if(!cache){cache=new Map();times.set(view,cache);}if(cache.has(key))return cache.get(key);
 const known=uniq((f.moves||[]).map(q=>id(q.id)).filter(m=>db.moves[m]&&!db.moves[m].isZ&&!/^(max|gmax)/.test(m))).slice(0,4),learn=db.learnsets[sp]||{},ls=new Set(known),lv=f.level||50;
 const ladder=usage(view,sp);const weights=view.double?{D9:1}:{F9:.43,R9:.43,F8:.08,R8:.06};const records=[];
 for(const row of LIBRARY[sp]||[]){const [src,weight,slots,items,abilities,nt,ev,iv]=row;if(!weights[src])continue;
 const validSlots=slots.map(ys=>ys.filter(m=>ls.has(m)||db.moves[m]&&canLearn(learn[m],lv)&&(!db.supportedMoves||db.supportedMoves.has(m))));if(validSlots.some(xs=>!xs.length))continue;
 const given=assign(validSlots,known);if(!given)continue;
 const ab=f.ability,gear=f.itemKnown?f.item:null;if(ab&&abilities.length&&!abilities.includes(ab)||gear&&items.length&&!items.includes(gear))continue;
 const usableItems=items.filter(x=>!choices.has(x)||(f.circuitUsed||f.seenThisStay||[]).length<=1||f.itemKnown);if(items.length&&!usableItems.length)continue;
 records.push({src,w:weights[src]*weight*(ladder?.[1]?(.35+1.8*validSlots.reduce((n,ms)=>n+Math.max(...ms.map(mid=>(ladder[1][mid]||0)/1000)),0)/4):1),slots:validSlots,given,items:usableItems,abilities,nt,ev,iv});}
 cache.set(key,records);return records;}
function sampleRow(rows,r){let t=r()*rows.reduce((z,x)=>z+x.w,0);for(const x of rows)if((t-=x.w)<=0)return x;return rows.at(-1);}
function acc(x,v,vis){const e=vis.circuitOrder,p=v.own[v.active[0][0]];if(!e||!p||v.double||p.species!==e.vs||v.turn-e.t>4||p.volatile?.unburden||p.stages?.spe||p.status==='par'||p.ability==='quickfeet'||['laggingtail','fullincense','ironball'].includes(p.item)||!p.stats?.spe)return 1;
 // Public relative order is soft evidence, never categorical proof of a hidden Scarf.
 const mine=p.stats.spe*(p.item==='choicescarf'?1.5:1),other=x.stats.spe*(x.item==='choicescarf'?1.5:1);return e.first?(other>=mine?1:.14):(other<=mine?1:.14);}
const variable=/^(?:eruption|waterspout|dragonenergy|electroball|gyroball|acrobatic|knockoff|brine|flail|reversal|crushgrip|wringout|hex|assurance|avalanche|revenge|facade|lashout|payback|ragefist|lastrespects|pursuit|retaliate|rollout|iceball|tripleaxel|triplekick|storedpower|punishment|lowkick|heatcrash|heavyslam)$/;
function impact(v,p,vis){const q=v.own[v.active[0][0]],h=q?._c6OwnImpact;if(!h||h.from!==vis.species||v.turn-h.t>3||v.double||variable.test(h.move)||v.weather||v.field.terrain||v.field.magicRoom||v.field.wonderRoom||v.field.sides.some(s=>s.reflect||s.lightscreen||s.auroraveil)||vis.status||q.status||Object.values(vis.stages||{}).some(Boolean)||Object.values(q.stages||{}).some(Boolean)||p.terastallized||q.terastallized||q.dynamaxed||q.volatile?.transform||vis.volatile?.transform)return null;return{h,q};}
export function impactWeight(v,p,set,db,e){if(!e)return 1;const {h,q}=e,b=damageBand({...p,...set,hp:p.hp}, {...q,hp:h.before},h.move,v,db,false);if(!b||b.approx)return 1;const gap=Math.max(0,b.lo-h.loss,h.loss-b.hi),pad=Math.max(2,.06*h.loss);return gap<=pad?1:Math.max(.07,Math.exp(-(gap-pad)/(pad+1)));}
export function inferSet(v,i,p,db,r,local){const vis=v.opponent[i];if(vis.unseen||v.encounterType==='wild')return local;
 const stay=vis.circuitUsed||vis.seenThisStay||[],rows=candidates(v,i,db,p.species),known=(vis.moves||[]).filter(x=>db.moves[x.id]&&!db.moves[x.id]?.isZ&&!/^(max|gmax)/.test(x.id)).slice(0,4);let out={...local};
 if(rows.length&&r()<(known.length?.85:.73)){
  const ev=impact(v,p,vis),items=[];for(let trial=0;trial<(ev||vis.circuitOrder?6:1);trial++){
   const row=sampleRow(rows,r),taken=new Set(known.map(x=>x.id)),mids=[...taken];for(let s=0;s<4;s++)if(!row.given.has(s)){const valid=row.slots[s].filter(x=>!taken.has(x));if(!valid.length)continue;const mid=pick(valid,r);mids.push(mid);taken.add(mid);}
   if(mids.length!==4)continue;
   // A league set is evidence about utility, NOT the right to silently give every hypothetical story trainer 252 EVs and an item.
   const base=r(),g=base<.48?'story':base<.70?'balanced':'printed',evs=Object.fromEntries(keys.map((k,j)=>[k,g==='story'?0:g==='balanced'? (j===1&&!mids.some(m=>db.moves[m]?.category==='Physical')?0:84) : (row.ev[j]??84)])),ivs=Object.fromEntries(keys.map((k,j)=>[k,g==='printed'?(row.iv[j]??31):31]));const nature=g==='story'?'serious':pick(row.nt.length?row.nt:['serious'],r),ability=vis.ability||pick(row.abilities.length?row.abilities:[p.ability],r),item=vis.itemKnown?(vis.item||'none'):(r()<.42?'none':pick(row.items.length?row.items:['none'],r));
   const x={source:row.src,role:'book:'+row.src,nature,ability,item,evs,ivs,stats:statsAt(db.dex[p.species],p.level,nature,evs,ivs),moves:mids.map(mid=>({id:mid,ppLeft:Math.max(0,(db.moves[mid]?.pp||20)-(known.find(k=>k.id===mid)?.used||0))}))};items.push([x,acc(x,v,vis)*impactWeight(v,p,x,db,ev)]);}
  if(items.length){let t=r()*items.reduce((n,q)=>n+q[1],0);out=(items.find(q=>(t-=q[1])<=0)||items.at(-1))[0];}
 }
 if(!vis.itemKnown&&stay.length>1&&choices.has(out.item))out.item='none';
 if(!vis.itemKnown&&!v.field.magicRoom&&vis.rocksWitness&&out.ability!=='klutz'){
  if(vis.rocksWitness==='hit'&&out.item==='heavydutyboots')out.item='none';
  if(vis.rocksWitness==='no-chip'&&(vis.ability||out.ability||p.ability)!=='magicguard'&&r()<.92)out.item='heavydutyboots';
 }
 if(choices.has(out.item)&&stay.length===1&&stay[0]===vis.lastMove&&out.moves.some(m=>m.id===vis.lastMove)&&!v.field.magicRoom&&(out.ability||p.ability)!=='klutz'&&!vis.volatile?.embargo)out.choiceLockedMove=vis.lastMove;
 return out;}
export {COUNTS};
