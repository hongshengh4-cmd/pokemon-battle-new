// SPDX-License-Identifier: MIT
// Select among server/rules-validated *own* reserves. This module accepts an observation and
// public species/move data only. Damage bands are predictions, never applied to the real game.
import {effectiveness} from './tactical-policy.mjs?v=kanto-crown-v72';
export const COMMAND_BUILD='kanto-crown-v72';
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const useItem=(p,v)=>v.field.magicRoom||p.ability==='klutz'||p.volatile?.embargo?'':p.item;
const grounded=(p,v)=>!!(v.field.gravity||p.volatile?.smackdown||p.volatile?.ingrain||useItem(p,v)==='ironball')||(!p.types.includes('Flying')&&p.ability!=='levitate'&&useItem(p,v)!=='airballoon'&&!p.volatile?.magnetrise&&!p.volatile?.telekinesis);
export function entryHealth(p,v){const c=v.field.sides[1]||{};if(p.ability==='magicguard'&&!p.abilitySuppressed||useItem(p,v)==='heavydutyboots')return p.hp;let cost=0;if(c.stealthrock)cost+=Math.max(1,Math.floor(p.maxHp*effectiveness('Rock',p.types)/8));if(c.spikes&&grounded(p,v))cost+=Math.max(1,Math.floor(p.maxHp*[0,1/8,1/6,1/4][clamp(+c.spikes,0,3)]));return Math.max(0,p.hp-cost);}
const absorb={Electric:['voltabsorb','motordrive','lightningrod'],Water:['dryskin','stormdrain','waterabsorb'],Grass:['sapsipper'],Fire:['flashfire','wellbakedbody'],Ground:['eartheater','levitate']};
function multiplier(a,b,m,v){let ts=b.types;if(m.type==='Ground'&&(grounded(b,v)||m.id==='thousandarrows'))ts=ts.filter(t=>t!=='Flying');let e=effectiveness(m.type,ts);const ab=b.abilitySuppressed?'':b.ability,ign=m.ignoreAbility||['moldbreaker','teravolt','turboblaze'].includes(a.ability);if(!ign&&absorb[m.type]?.includes(ab)&&!(ab==='levitate'&&(grounded(b,v)||m.id==='thousandarrows')))return 0;if(m.type==='Ground'&&useItem(b,v)==='airballoon'&&!grounded(b,v)&&m.id!=='thousandarrows')return 0;if(m.id==='freezedry'&&ts.includes('Water'))e*=4;return !ign&&ab==='wonderguard'&&e<=1?0:e;}
const stage=n=>n>0?(2+n)/2:2/(2-(n||0));
function stat(p,k,db){const base=db.dex[p.species]?.baseStats?.[k]||75;return (p.stats?.[k]||((2*base+31)*(p.level||50)/100+5))*stage(p.stages?.[k]);}
function maxHealth(p,db){if(p.maxHp)return p.maxHp;const h=db.dex[p.species]?.baseStats?.hp||75,l=p.level||50;return h===1?1:Math.floor((2*h+31)*l/100)+l+10;}
const situational=new Set(['counter','mirrorcoat','metalburst','focuspunch','dreameater','lastresort','suckerpunch','poltergeist','endeavor','belch']);
function hit(a,b,m,v,db){if(m.category==='Status'||m.selfdestruct||m.ohko)return 0;const e=multiplier(a,b,m,v);if(!e)return 0;
 if(m.damage==='level')return a.level;if(typeof m.damage==='number')return m.damage;
 if(!m.basePower)return 0;const physical=m.category==='Physical',A=m.id==='bodypress'?'def':physical?'atk':'spa',D=['psyshock','psystrike'].includes(m.id)?'def':physical?'def':'spd';let atk=stat(m.id==='foulplay'?b:a,A,db);if(physical&&['hugepower','purepower'].includes(a.ability))atk*=2;if(physical&&a.status==='brn'&&a.ability!=='guts'&&m.id!=='facade')atk*=.5;
 let p=m.basePower;if(m.multihit)p*=typeof m.multihit==='number'?m.multihit:a.ability==='skilllink'?m.multihit[1]:3;let d=((2*a.level/5+2)*p*atk/stat(b,D,db)/50+2)*.925*e*(a.types.includes(m.type)?1.5:1);if(situational.has(m.id))d*=.5;if(m.flags?.charge)d*=.6;return d*(m.accuracy===true?1:(m.accuracy||100)/100);}
function planMoves(p,db){return (p.moves||[]).filter(x=>x.ppLeft!==0).map(x=>({...db.moves[x.id],id:x.id})).filter(m=>m.type&&m.category!=='Status');}
function pressure(f,q,v,db){const seen=planMoves(f,db);let shown=Math.max(0,...seen.map(m=>hit(f,q,m,v,db)));if((f.moves||[]).length>=4)return shown;const phys=stat(f,'atk',db)>=stat(f,'spa',db);let likely=0;for(const type of f.types){likely=Math.max(likely,.68*hit(f,q,{type,category:phys?'Physical':'Special',basePower:75},v,db));}return Math.max(shown,likely);}
// Takes the real mandatory request's list of NATIVE team indexes, never PS queue entries.
export function chooseEntry(v,eligible,db,move=null){const live=v.active[1].map(i=>v.opponent[i]).filter(f=>f&&!f.unseen&&f.hpPercent>0),fs=live.length?live:v.opponent.filter(f=>!f.unseen&&f.hpPercent>0),ranks=[];const passer=v.own[v.active[0][0]];
 for(const i of eligible){const raw=v.own[i];if(!raw||raw.hp<=0)continue;const hp=entryHealth(raw,v),p=move==='batonpass'&&passer?{...raw,stages:{...passer.stages}}:raw;let offence=0,threat=0,revenge=0;
 for(const f of fs){const inj=pressure(f,p,v,db),rat=inj/Math.max(1,hp);threat=Math.max(threat,rat);const enemyHP=maxHealth(f,db)*f.hpPercent/100;for(const m of planMoves(p,db)){const d=hit(p,f,m,v,db),gain=d/Math.max(1,enemyHP);offence=Math.max(offence,Math.min(1.45,gain));const mySide=v.field.sides[1],theirSide=v.field.sides[0];const speed=(mon,c)=>stat(mon,'spe',db)*(mon.status==='par'&&mon.ability!=='quickfeet'?.5:1)*(c.tailwind?2:1)*(useItem(mon,v)==='choicescarf'?1.5:1);const ms=speed(p,mySide),es=speed(f,theirSide);let faster=v.field.trickRoom?ms<es*.9:ms>es*1.1;if(m.priority>0)faster=true;if(!move&&faster&&gain>1.12)revenge=Math.max(revenge,1.35);}}
 const chip=(raw.hp-hp)/raw.maxHp;let score=2.8*offence+revenge-2.45*Math.min(2.8,threat)+1.15*hp/raw.maxHp-3.5*chip;
 if(threat>=1&&!revenge)score-=1.9;if(hp<=0)score-=100; // Avoid throwing a reserve away on entry if anyone can survive.
 ranks.push({i,hp,score});}
 ranks.sort((a,b)=>b.score-a.score||a.i-b.i);return ranks[0]?.i??-1;}
