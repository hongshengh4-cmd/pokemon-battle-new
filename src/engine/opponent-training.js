/* SPDX-License-Identifier: MIT
 * v7: opponent-only, pre-battle EV allocation. No player, battle state, RNG or storage is an input.
 * Rank rates and manual-EV priority retained from tier-pokemon-ev-v71.
 */
(function(root){'use strict';
 const VERSION='tier-pokemon-ev-v71',KEYS=Object.freeze(['hp','atk','def','spa','spd','spe']);
 const RULES=Object.freeze(Object.fromEntries(Object.entries({wild:[0,0],novice:[2,96],regular:[4,192],veteran:[6,320],leader:[8,420],ace:[10,510],elite:[12,510],champion:[14,510]}).map(([k,[rate,cap]])=>[k,Object.freeze({rate,cap})])));
 const empty=()=>Object.fromEntries(KEYS.map(k=>[k,0])),sum=v=>Object.values(v).reduce((a,b)=>a+b,0),id=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,''),clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
 // Seven trainer ranks, and the level of THIS Pokémon only. No owner level, player data or RNG.
 function amount(level,tier='regular'){const rule=Object.hasOwn(RULES,tier)?RULES[tier]:null;if(!rule)throw Error('未知的敌方档位：'+tier);const L=Number(level);if(!Number.isInteger(L)||L<1||L>100)throw Error('宝可梦等级须为 1～100 的整数。');return {tier,level:L,rate:rule.rate,cap:rule.cap,budget:Math.min(rule.cap,L*rule.rate)};}
 const budget=(level,tier='regular')=>amount(level,tier).budget;
 function validateExplicit(x){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!KEYS.includes(k)))throw Error('手填努力值必须是 hp/atk/def/spa/spd/spe 数值对象。');const out=empty();for(const k of Object.keys(x)){const n=x[k];if(!Number.isInteger(n)||n<0||n>252)throw Error('手填努力值每项须为 0～252 的整数。');out[k]=n;}if(sum(out)>510)throw Error('手填努力值总和不能超过 510。');return out;}
 const fixed=new Set('foulplay nightshade seismictoss superfang naturesmadness ruination finalgambit endeavor dragonrage sonicboom psywave counter mirrorcoat metalburst comeuppance fissure sheercold guillotine horndrill'.split(' '));
 function roleFor(species,moves,db={},style='balanced',spec={}){const sp=db.dex?.[species]||{},bs=sp.baseStats||{},ms=moves.map(m=>id(typeof m==='object'?m.id:m)),ids=new Set(ms),item=id(spec.item);let atk=0,spa=0;for(const mid of ms){const m=db.moves?.[mid];if(!m||fixed.has(mid)||m.damage||m.ohko||mid==='bodypress')continue;const v=clamp(Number(m.basePower)||55,35,130);if(m.category==='Physical')atk+=v;if(m.category==='Special')spa+=v;}
  if(item==='choiceband'||ids.has('swordsdance')||ids.has('dragondance'))atk*=1.45;if(item==='choicespecs'||ids.has('nastyplot')||ids.has('quiverdance'))spa*=1.45;
  const bulk=(bs.def||75)<=(bs.spd||75)?'def':'spd',other=bulk==='def'?'spd':'def',slow=ids.has('trickroom')||ids.has('gyroball')||((bs.spe||75)<70&&item!=='choicescarf'&&!ids.has('shellsmash')&&!ids.has('dragondance')),off=atk===spa?((bs.atk||75)>=(bs.spa||75)?'atk':'spa'):atk>spa?'atk':'spa',alt=off==='atk'?'spa':'atk';let role,order,mixed=false;
  if(ids.has('bodypress')&&atk+spa<110){role='扑击防御输出';order=['def','hp','spd','spe',off,alt];}
  else if(!atk&&!spa||style==='defensive'){role=ids.has('trickroom')?'空间辅助':'耐久辅助';order=['hp',bulk,other,off,alt,'spe'];}
  else if(atk&&spa&&Math.min(atk,spa)>=.7*Math.max(atk,spa)&&Math.min(bs.atk||75,bs.spa||75)>=.65*Math.max(bs.atk||75,bs.spa||75)){role=slow?'耐久双刀':'高速双刀';mixed=true;order=[off,alt,slow?'hp':'spe',bulk,other,slow?'spe':'hp'];}
  else {role=(slow?'耐久':'高速')+(off==='atk'?'物攻':'特攻');order=[off,slow?'hp':'spe',slow?bulk:'hp',other,alt,slow?'spe':bulk];}
  if(species==='shedinja')order=order.filter(k=>k!=='hp');return {role,order:[...new Set([...order,...KEYS.filter(k=>k!=='hp'||species!=='shedinja')])],mixed};}
 // Apportion effective four-EV blocks first. When a target stat is full its
 // share flows to the next uncapped target. Even small budgets reflect the role.
 function allocate(total,r){const out=empty(),order=r.order,weights=r.mixed?[42,26,32]:r.role.includes('辅助')?[50,32,18]:r.role.includes('扑击')?[58,32,10]:[64,36];let blocks=Math.floor(total/4);
  for(let n=0;n<blocks;n++){let best=-1,score=-Infinity;for(let i=0;i<weights.length;i++){const k=order[i];if(out[k]>=252)continue;const s=(n+1)*weights[i]-25*out[k];if(s>score){score=s;best=i;}}const k=best<0?order.find(k=>out[k]<252):order[best];out[k]+=4;}
  const rem=total%4;if(rem)out[order.find(k=>out[k]+rem<=252)]+=rem;if(sum(out)!==total)throw Error('努力值分配未满足预算');return out;}
 function forSpec(spec={},species,moves=[],profile={},db={}){const a=amount(spec.level??spec.lv??50,profile.tier||'regular');if(spec.evs!==undefined&&spec.evs!==null){const evs=validateExplicit(spec.evs);return {evs,info:{version:VERSION,...a,source:'explicit',total:sum(evs),role:null}};}const r=roleFor(species,moves,db,profile.style,spec),evs=allocate(a.budget,r);return{evs,info:{version:VERSION,...a,source:a.tier==='wild'?'wild-zero':'tier-pokemon-default',role:r.role,total:sum(evs)}};}
 root.PKMOpponentTraining=Object.freeze({version:VERSION,RULES,KEYS,budget,amount,validateExplicit,roleFor,forSpec});if(typeof module!=='undefined'&&module.exports)module.exports=root.PKMOpponentTraining;
})(globalThis);
