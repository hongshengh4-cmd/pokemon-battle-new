// SPDX-License-Identifier: MIT
// Independent bounded approximate lookahead. This is NOT poke-engine,
// Showdown, or a rules-complete battle simulator. Never writes to the game.
import {actionKey} from './battle-view.mjs?v=20261118-foulplay-browser-ai-v1';
const chart={Normal:{Rock:.5,Ghost:0,Steel:.5},Fire:{Fire:.5,Water:.5,Grass:2,Ice:2,Bug:2,Rock:.5,Dragon:.5,Steel:2},Water:{Fire:2,Water:.5,Grass:.5,Ground:2,Rock:2,Dragon:.5},Electric:{Water:2,Electric:.5,Grass:.5,Ground:0,Flying:2,Dragon:.5},Grass:{Fire:.5,Water:2,Grass:.5,Poison:.5,Ground:2,Flying:.5,Bug:.5,Rock:2,Dragon:.5,Steel:.5},Ice:{Fire:.5,Water:.5,Grass:2,Ice:.5,Ground:2,Flying:2,Dragon:2,Steel:.5},Fighting:{Normal:2,Ice:2,Poison:.5,Flying:.5,Psychic:.5,Bug:.5,Rock:2,Ghost:0,Dark:2,Steel:2,Fairy:.5},Poison:{Grass:2,Poison:.5,Ground:.5,Rock:.5,Ghost:.5,Steel:0,Fairy:2},Ground:{Fire:2,Electric:2,Grass:.5,Poison:2,Flying:0,Bug:.5,Rock:2,Steel:2},Flying:{Electric:.5,Grass:2,Fighting:2,Bug:2,Rock:.5,Steel:.5},Psychic:{Fighting:2,Poison:2,Psychic:.5,Dark:0,Steel:.5},Bug:{Fire:.5,Grass:2,Fighting:.5,Poison:.5,Flying:.5,Psychic:2,Ghost:.5,Dark:2,Steel:.5,Fairy:.5},Rock:{Fire:2,Ice:2,Fighting:.5,Ground:.5,Flying:2,Bug:2,Steel:.5},Ghost:{Normal:0,Psychic:2,Ghost:2,Dark:.5},Dragon:{Dragon:2,Steel:.5,Fairy:0},Dark:{Fighting:.5,Psychic:2,Ghost:2,Dark:.5,Fairy:.5},Steel:{Fire:.5,Water:.5,Electric:.5,Ice:2,Rock:2,Steel:.5,Fairy:2},Fairy:{Fire:.5,Fighting:2,Poison:.5,Dragon:2,Dark:2,Steel:.5}};
export const effectiveness=(type,types)=>(types||[]).reduce((m,t)=>m*(chart[type]?.[t]??1),1);
const clone=x=>structuredClone(x),alive=p=>p&&p.hp>0;
const stage=n=>n>=0?(2+Math.min(6,n))/2:2/(2-Math.max(-6,n));
function stat(p,k){let n=p.stats[k]*stage(p.stages?.[k]||0);if(k==='spe'&&p.status==='par')n*=.5;if((k==='atk'&&p.item==='choiceband')||(k==='spa'&&p.item==='choicespecs')||(k==='spe'&&p.item==='choicescarf'))n*=1.5;if(k==='atk'&&['hugepower','purepower'].includes(p.ability))n*=2;return n}
export function moveFor(p,a,db){const original=db.moves[p.moves[a.index]?.id]||db.moves.struggle||{type:'Normal',category:'Physical',basePower:50,accuracy:true,pp:1};let m={...original,id:p.moves[a.index]?.id||'struggle'};
 if(p.dynamaxed||a.mechanic==='dynamax'){m.category==='Status'?m={...m,volatileStatus:'protect',priority:4}:m={...m,basePower:Math.max(70,Math.min(150,90+Math.floor((m.basePower||60)/20)*10)),multihit:null,recoil:null,drain:null,secondary:null};}
 if(a.mechanic==='z'&&m.category!=='Status')m={...m,basePower:Math.min(200,100+Math.floor((m.basePower||50)/15)*10),multihit:null,recoil:null,secondary:null};
 return m;
}
export function damage(p,q,m,w){
 if(!alive(p)||!alive(q)||m.category==='Status')return 0;
 let eff=effectiveness(m.type,q.types);if(m.type==='Ground'&&q.ability==='levitate'&&!['moldbreaker','teravolt','turboblaze'].includes(p.ability))eff=0;
 if((m.type==='Water'&&['waterabsorb','stormdrain','dryskin'].includes(q.ability))||(m.type==='Fire'&&q.ability==='flashfire')||(m.type==='Electric'&&['voltabsorb','lightningrod','motordrive'].includes(q.ability)))eff=0;
 if(q.ability==='wonderguard'&&eff<=1)eff=0;if(!eff)return 0;
 if(['seismictoss','nightshade'].includes(m.id))return p.level;if(m.id==='dragonrage')return 40;if(m.id==='sonicboom')return 20;if(['superfang','naturesmadness','ruination'].includes(m.id))return q.hp/2;
 let bp=m.basePower||60;if(m.id==='eruption'||m.id==='waterspout')bp=Math.max(1,150*p.hp/p.maxHp);if(m.id==='gyroball')bp=Math.min(150,Math.floor(25*stat(q,'spe')/stat(p,'spe'))+1);
 const atk=stat(p,m.category==='Physical'?'atk':'spa'),def=stat(q,m.category==='Physical'?'def':'spd');let d=((2*p.level/5+2)*bp*atk/Math.max(1,def)/50+2)*eff*.925;
 if(p.types.includes(m.type))d*=p.ability==='adaptability'?2:1.5;
 if(p.status==='brn'&&m.category==='Physical'&&p.ability!=='guts')d*=.5;if(p.item==='lifeorb')d*=1.3;
 if(q.item==='eviolite')d/=1.5;if(q.ability==='multiscale'&&q.hp===q.maxHp)d*=.5;if(['filter','solidrock','prismarmor'].includes(q.ability)&&eff>1)d*=.75;
 if(w.weather==='sun'){if(m.type==='Fire')d*=1.5;if(m.type==='Water')d*=.5}if(w.weather==='rain'){if(m.type==='Water')d*=1.5;if(m.type==='Fire')d*=.5}
 if(m.multihit)d*=Array.isArray(m.multihit)?(p.ability==='skilllink'?m.multihit[1]:(m.multihit[0]+m.multihit[1])/2):m.multihit;
 d*=m.accuracy===true?1:(m.accuracy||100)/100;return Math.max(1,d);
}
function canStatus(p,status){if(p.status)return false;if(['psn','tox'].includes(status)&&(p.types.includes('Poison')||p.types.includes('Steel')||['immunity','pastelveil','purifyingsalt'].includes(p.ability)))return false;if(status==='brn'&&(p.types.includes('Fire')||p.ability==='waterveil'))return false;if(status==='par'&&(p.types.includes('Electric')||p.ability==='limber'))return false;if(status==='slp'&&['insomnia','vitalspirit','sweetveil','purifyingsalt','comatose'].includes(p.ability))return false;return true}
function current(w,s,slot){return w.teams[s][w.active[s][slot]]}
function targets(w,s,slot,a,m){const f=1-s,foes=w.active[f].map((_,i)=>[f,i]).filter(([t,i])=>alive(current(w,t,i))),allies=w.active[s].map((_,i)=>[s,i]).filter(([t,i])=>alive(current(w,t,i)));const target=m.target||'normal';
 if(target==='self'||target==='allySide'||target==='allyTeam')return[[s,slot]];if(target==='allies')return allies;
 if(target==='allAdjacent'||target==='all')return [...foes,...allies.filter(([,i])=>target==='all'||i!==slot)];if(target==='allAdjacentFoes')return foes;
 if(a.target){const t=1-a.target.side,i=a.target.slot;if(alive(current(w,t,i)))return[[t,i]]}
 if(target==='adjacentAlly'||target==='adjacentAllyOrSelf')return allies.filter(([,i])=>target==='adjacentAllyOrSelf'||i!==slot).slice(0,1);
 return foes.slice(0,1);
}
function switchIn(w,s,slot,index){const old=current(w,s,slot),p=w.teams[s][index];if(!alive(p)||w.active[s].includes(index))return;
 if(old){if(old.ability==='regenerator')old.hp=Math.min(old.maxHp,old.hp+old.maxHp/3);old.stages={};old.volatile={};}
 w.active[s][slot]=index;const c=w.conditions[s];let cost=0;if(c.stealthrock)cost+=effectiveness('Rock',p.types)/8;if(!p.types.includes('Flying')&&p.ability!=='levitate'){cost+=[0,1/8,1/6,1/4][Math.min(3,c.spikes||0)];if(c.stickyweb)p.stages.spe=(p.stages.spe||0)-1;if(c.toxicspikes&&!p.types.includes('Steel')&&!p.types.includes('Poison'))p.status=c.toxicspikes>=2?'tox':'psn';}
 if(p.item!=='heavydutyboots'&&p.ability!=='magicguard')p.hp=Math.max(0,p.hp-p.maxHp*cost);
}
function apply(w,s,slot,a,db){const p=current(w,s,slot);if(!alive(p)||a.kind!=='move')return;const m=moveFor(p,a,db);if(p.status==='slp'&&!['sleeptalk','snore'].includes(m.id))return;
 if(a.mechanic==='mega'&&p.megaForm&&db.dex[p.megaForm]){const f=db.dex[p.megaForm],base=db.dex[p.species];for(const k of ['atk','def','spa','spd','spe'])p.stats[k]*=f.baseStats[k]/Math.max(1,base.baseStats[k]);p.types=[...f.types];p.ability=String(f.abilities?.[0]||p.ability).toLowerCase().replace(/\W/g,'');}
 if(a.mechanic==='tera'&&p.teraType)p.types=[p.teraType];if(a.mechanic==='dynamax'&&!p.dynamaxed){p.dynamaxed=true;p.hp*=p.species==='shedinja'?1:2;p.maxHp*=p.species==='shedinja'?1:2;}
 if(p.moves[a.index]?.ppLeft>0)p.moves[a.index].ppLeft--;
 if(m.volatileStatus==='protect'||m.volatileStatus==='endure'||m.id==='maxguard'){p._protected=1/3**Math.min(6,p._protectStreak||0);p._protectStreak=(p._protectStreak||0)+1;return}p._protectStreak=0;
 const ts=targets(w,s,slot,a,m);let dealt=0;
 for(const [t,i]of ts){const q=current(w,t,i);if(!alive(q))continue;
  if(m.category!=='Status'){let d=damage(p,q,m,w);if(t!==s&&q._protected)d*=1-q._protected;const c=w.conditions[t];if(c.auroraveil||m.category==='Physical'&&c.reflect||m.category==='Special'&&c.lightscreen)d*=w.double?2/3:.5;if(w.double&&['allAdjacent','allAdjacentFoes'].includes(m.target)&&ts.length>1)d*=.75;d=Math.min(q.hp,d);q.hp-=d;dealt+=d;
   if(m.status&&canStatus(q,m.status)&&d>0)q.status=m.status;if(m.secondary?.status&&canStatus(q,m.secondary.status)&&d>0&&(m.secondary.chance||0)>=30)q.status=m.secondary.status;
  }else if(t!==s&&m.status&&canStatus(q,m.status)&&!(q._protected>=.5))q.status=m.status;
  if(m.boosts){for(const [k,v]of Object.entries(m.boosts))q.stages[k]=Math.max(-6,Math.min(6,(q.stages[k]||0)+v))}
  if(m.heal&&t===s)q.hp=Math.min(q.maxHp,q.hp+q.maxHp*m.heal[0]/m.heal[1]);
  if(m.volatileStatus==='helpinghand')q.stages.atk=(q.stages.atk||0)+1;
 }
 if(m.sideCondition){const c=w.conditions[m.target==='allySide'?s:1-s],k=m.sideCondition;c[k]=Math.min(['spikes','toxicspikes'].includes(k)?k==='spikes'?3:2:5,(c[k]||0)+1)}
 if(m.self?.boosts)for(const [k,v]of Object.entries(m.self.boosts))p.stages[k]=Math.max(-6,Math.min(6,(p.stages[k]||0)+v));
 if(m.drain)p.hp=Math.min(p.maxHp,p.hp+dealt*m.drain[0]/m.drain[1]);if(m.recoil&&p.ability!=='rockhead'&&p.ability!=='magicguard')p.hp=Math.max(0,p.hp-dealt*m.recoil[0]/m.recoil[1]);if(dealt>0&&p.item==='lifeorb'&&p.ability!=='magicguard'&&p.ability!=='sheerforce')p.hp=Math.max(0,p.hp-p.maxHp/10);
 p._lastMoveId=m.id;
}
function step(w,ours,theirs,db){w=clone(w);for(const p of w.teams.flat())delete p._protected;
 for(const [s,actions]of [[0,ours],[1,theirs]])actions.forEach((a,slot)=>{if(a?.kind==='switch')switchIn(w,s,slot,a.index)});
 const queue=[];for(const [s,actions]of [[0,ours],[1,theirs]])actions.forEach((a,slot)=>{if(a?.kind==='move'&&alive(current(w,s,slot))){const p=current(w,s,slot),m=moveFor(p,a,db);queue.push({s,slot,a,actor:p,prio:m.priority||0,speed:stat(p,'spe')})}});
 queue.sort((a,b)=>b.prio-a.prio||(w.field.trickRoom>0?a.speed-b.speed:b.speed-a.speed)||a.s-b.s);
 for(const q of queue)if(current(w,q.s,q.slot)===q.actor)apply(w,q.s,q.slot,q.a,db);
 for(const s of [0,1])for(const i of w.active[s]){const p=w.teams[s][i];if(!alive(p))continue;let cost=0;if(p.ability!=='magicguard'){if(p.status==='brn')cost+=1/16;if(p.status==='psn')cost+=1/8;if(p.status==='tox')cost+=Math.min(15,p.toxicCounter||1)/16;}
  p.hp=Math.max(0,p.hp-p.maxHp*cost);if(p.item==='leftovers'&&p.hp>0)p.hp=Math.min(p.maxHp,p.hp+p.maxHp/16);
 }
 return w;
}
function evaluate(w){let score=0;for(const s of [0,1]){let n=0,living=0;for(const p of w.teams[s]){if(!alive(p))continue;living++;n+=100+60*p.hp/p.maxHp-(p.status?10:0);for(const [k,v]of Object.entries(p.stages||{}))n+=v*(['atk','spa','spe'].includes(k)?3:1.5);}
  if(!living)n-=2000;if(w.firstFaintLoses&&w.active[s].some(i=>!alive(w.teams[s][i])))n-=2000;
  const c=w.conditions[s];n-=(c.stealthrock?5:0)+(c.spikes||0)*3+(c.toxicspikes||0)*2+(c.stickyweb?4:0);if(c.reflect||c.lightscreen||c.auroraveil)n+=4;
  score+=(s===0?1:-1)*n;
 }return score}
function potential(w,s,slot,a,db){const p=current(w,s,slot);if(!alive(p))return-999;if(a.kind==='switch'){const q=w.teams[s][a.index],foe=current(w,1-s,0);if(!alive(q))return-999;return foe?Math.max(0,...q.moves.map((m,index)=>damage(q,foe,moveFor(q,{index},db),w)/Math.max(1,foe.maxHp)*15))-6:0;}
 const m=moveFor(p,a,db);let score=0;for(const [t,i]of targets(w,s,slot,a,m)){const q=current(w,t,i);if(!alive(q))continue;const d=damage(p,q,m,w);score+=(t===s?-1:1)*(Math.min(q.hp,d)/q.maxHp*60+(d>=q.hp&&d>0?100:0));if(m.heal&&t===s)score+=Math.min(q.maxHp-q.hp,q.maxHp*m.heal[0]/m.heal[1])/q.maxHp*60;if(m.status&&canStatus(q,m.status)&&t!==s)score+=12;if(m.boosts)for(const [k,v]of Object.entries(m.boosts))score+=v*(t===s?1:-1)*((q.stages[k]||0)>=4?1:4);}
 if(m.sideCondition){const target=m.target==='allySide'?s:1-s;score+=w.conditions[target][m.sideCondition]?0:10}if(a.mechanic)score+=3;return score;
}
function generic(w,s,slot,db){const p=current(w,s,slot);if(!alive(p))return[{kind:'pass'}];const actions=[];p.moves.forEach((m,index)=>{if(m.ppLeft<=0||p.volatile?.disableMove===m.id||p.choiceLockedMove&&p.choiceLockedMove!==m.id)return;const move=db.moves[m.id];if(!move)return;if(p.volatile?.taunt&&move.category==='Status')return;if(w.double&&['normal','adjacentFoe','any'].includes(move.target||'normal')){for(let t=0;t<w.active[1-s].length;t++)if(alive(current(w,1-s,t)))actions.push({kind:'move',index,target:{side:s,slot:t}})}else actions.push({kind:'move',index})});
 for(let i=0;i<w.teams[s].length;i++)if(alive(w.teams[s][i])&&!w.active[s].includes(i))actions.push({kind:'switch',index:i});return actions.length?actions:[{kind:'move',index:0,struggle:true}];
}
function combinations(groups){let out=[[]];for(const g of groups){const next=[];for(const x of out)for(const a of g){if(a.kind==='switch'&&x.some(b=>b.kind==='switch'&&b.index===a.index))continue;if(a.mechanic&&x.some(b=>b.mechanic===a.mechanic))continue;next.push([...x,a])}out=next}return out}
function candidates(w,s,db,legal=null,limit=3){const count=w.double?2:1;const groups=Array.from({length:count},(_,slot)=>(legal?.[slot]||generic(w,s,slot,db)).map(a=>({a,score:potential(w,s,slot,a,db)})).sort((a,b)=>b.score-a.score||actionKey(a.a).localeCompare(actionKey(b.a))).slice(0,limit).map(x=>x.a));return combinations(groups)}
export function compatibilitySearch(world,view,db,{deadline=Infinity}={}){
 const start=performance.now(),depth=view.profile.settings.nativeDepth||1,ours=candidates(world,0,db,view.legal,view.double?4:9),theirs=candidates(world,1,db,null,view.double?2:3),out=[];let nodes=0;
 for(const own of ours){let worst=Infinity;
  for(const opp of theirs){const next=step(world,own,opp,db);nodes++;let value=evaluate(next);
   if(depth>=2&&performance.now()<deadline){let best=-Infinity;for(const future of candidates(next,0,db,null,2)){let risk=Infinity;for(const response of candidates(next,1,db,null,2)){risk=Math.min(risk,evaluate(step(next,future,response,db)));nodes++}best=Math.max(best,risk)}if(Number.isFinite(best))value=.6*value+.4*best;}
   worst=Math.min(worst,value);
  }
  out.push({actions:own,score:worst});if(performance.now()>deadline&&out.length>=2)break;
 }
 out.sort((a,b)=>b.score-a.score);const top=out[0]?.score||0;return{mode:'compatibility',nodes,elapsed:performance.now()-start,choices:out.map(x=>({...x,weight:Math.exp(Math.max(-24,(x.score-top)/18))}))};
}
