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
// Independent bounded approximate lookahead. This is NOT poke-engine,
// Showdown, or a rules-complete battle simulator. Never writes to the game.
import {actionKey} from './battle-view.mjs?v=20261118-ai-elite-v3&cmd=kanto-crown-v72';
import {effectiveness,isGuardMove,actionAssessment} from './tactical-policy.mjs?v=20261118-ai-elite-v3';
export {effectiveness};
const clone=x=>structuredClone(x),alive=p=>p&&p.hp>0;
const stage=n=>n>=0?(2+Math.min(6,n))/2:2/(2-Math.max(-6,n));
function stat(p,k){let n=p.stats[k]*stage(p.stages?.[k]||0);if(k==='spe'&&p.status==='par')n*=.5;if((k==='atk'&&p.item==='choiceband')||(k==='spa'&&p.item==='choicespecs')||(k==='spe'&&p.item==='choicescarf'))n*=1.5;if(k==='atk'&&['hugepower','purepower'].includes(p.ability))n*=2;return n}
// Generic power defaults mirror the pinned MIT Showdown DexMove metadata.
// This does not make the surrounding bounded planner a complete rules engine.
function maxPower(m){if(m.maxMove?.basePower)return m.maxMove.basePower;const bp=m.basePower||0;if(!bp)return 100;const n=bp>=150?6:bp>=110?5:bp>=75?4:bp>=65?3:bp>=55?2:bp>=45?1:0;return (['Fighting','Poison'].includes(m.type)?[70,75,80,85,90,95,100]:[90,100,110,120,130,140,150])[n]}
function zPower(m){if(m.zMove?.basePower)return m.zMove.basePower;const bp=(m.basePower||0)*(Array.isArray(m.multihit)?3:1);return bp>=140?200:bp>=130?195:bp>=120?190:bp>=110?185:bp>=100?180:bp>=90?175:bp>=80?160:bp>=70?140:bp>=60?120:100}
export function moveFor(p,a,db){const original=db.moves[p.moves[a.index]?.id]||db.moves.struggle||{type:'Normal',category:'Physical',basePower:50,accuracy:true,pp:1};let m={...original,id:p.moves[a.index]?.id||'struggle'};
 const max=p.dynamaxed||a.mechanic==='dynamax',z=a.mechanic==='z';
 if(max&&m.category==='Status')return{...m,id:'maxguard',volatileStatus:'protect',priority:4,isMax:true};
 if((max||z)&&m.category!=='Status'&&m.id!=='struggle')m={...m,isMax:!!max,isZ:!!z,basePower:max?maxPower(m):zPower(m),target:'normal',accuracy:true,flags:{...m.flags,contact:0},multihit:null,recoil:null,drain:null,heal:null,damage:undefined,status:undefined,volatileStatus:undefined,boosts:undefined,self:undefined,sideCondition:undefined,selfSwitch:undefined,forceSwitch:undefined,secondary:null,secondaries:null};
 return m;
}
export function damage(p,q,m,w){
 if(!alive(p)||!alive(q)||m.category==='Status')return 0;
 let eff=effectiveness(m.type,q.types);if(m.type==='Ground'&&q.ability==='levitate'&&!['moldbreaker','teravolt','turboblaze'].includes(p.ability))eff=0;
 if((m.type==='Water'&&['waterabsorb','stormdrain','dryskin'].includes(q.ability))||(m.type==='Fire'&&q.ability==='flashfire')||(m.type==='Electric'&&['voltabsorb','lightningrod','motordrive'].includes(q.ability)))eff=0;
 if(q.ability==='wonderguard'&&eff<=1)eff=0;if(!eff)return 0;
 if(!m.isZ&&!m.isMax){if(['seismictoss','nightshade'].includes(m.id))return p.level;if(m.id==='dragonrage')return 40;if(m.id==='sonicboom')return 20;if(['superfang','naturesmadness','ruination'].includes(m.id))return q.hp/2;}
 let bp=m.basePower||60;if(!m.isZ&&!m.isMax){if(m.id==='eruption'||m.id==='waterspout')bp=Math.max(1,150*p.hp/p.maxHp);if(m.id==='gyroball')bp=Math.min(150,Math.floor(25*stat(q,'spe')/stat(p,'spe'))+1);}
 const atk=stat(p,m.category==='Physical'?'atk':'spa'),def=stat(q,m.category==='Physical'?'def':'spd');let d=((2*p.level/5+2)*bp*atk/Math.max(1,def)/50+2)*eff*.925;
 const original=p.originalTypes||p.types;
 if(p.terastallized){if(m.type===p.teraType)d*=original.includes(m.type)?(p.ability==='adaptability'?2.25:2):(p.ability==='adaptability'?2:1.5);else if(original.includes(m.type))d*=1.5;}
 else if(p.types.includes(m.type))d*=p.ability==='adaptability'?2:1.5;
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
 if(old){if(old.ability==='regenerator')old.hp=Math.min(old.maxHp,old.hp+old.maxHp/3);old.stages={};old.volatile={};old._protectStreak=0;}
 w.active[s][slot]=index;const c=w.conditions[s];let cost=0;if(c.stealthrock)cost+=effectiveness('Rock',p.types)/8;if(!p.types.includes('Flying')&&p.ability!=='levitate'){cost+=[0,1/8,1/6,1/4][Math.min(3,c.spikes||0)];if(c.stickyweb)p.stages.spe=(p.stages.spe||0)-1;if(c.toxicspikes&&!p.types.includes('Steel')&&!p.types.includes('Poison'))p.status=c.toxicspikes>=2?'tox':'psn';}
 if(p.item!=='heavydutyboots'&&p.ability!=='magicguard')p.hp=Math.max(0,p.hp-p.maxHp*cost);
}
// Activation precedes the approximate move queue too: otherwise the planner
// undervalues a Mega's Speed or a Dynamax user's HP before its first attack.
function activate(p,a,db){
 if(a.mechanic==='mega'&&!p.isMega&&p.megaForm&&db.dex[p.megaForm]){
  const f=db.dex[p.megaForm],base=db.dex[p.species];
  for(const k of ['atk','def','spa','spd','spe'])p.stats[k]*=f.baseStats[k]/Math.max(1,base.baseStats[k]);
  p.types=[...f.types];p.ability=String(f.abilities?.[0]||p.ability).toLowerCase().replace(/\W/g,'');p.isMega=true;
 }
 if(a.mechanic==='tera'&&!p.terastallized&&p.teraType){p.originalTypes=p.originalTypes||p.types.slice();p.types=[p.teraType];p.terastallized=true;}
 if(a.mechanic==='dynamax'&&!p.dynamaxed){p.normalMaxHp=p.maxHp;p.dynamaxed=true;p.dynamaxTurns=3;const scale=p.species==='shedinja'?1:2;p.hp*=scale;p.maxHp*=scale;}
}
function apply(w,s,slot,a,db){const p=current(w,s,slot);if(!alive(p)||a.kind!=='move')return;const m=moveFor(p,a,db);if(p.status==='slp'&&!['sleeptalk','snore'].includes(m.id))return;
 if(p.moves[a.index]?.ppLeft>0)p.moves[a.index].ppLeft--;
 if(isGuardMove(m)){
  const chance=1/3**Math.min(6,p._protectStreak||0);
  if(m.id==='endure')p._endured=chance;else{p._protected=chance;p._maxGuard=m.id==='maxguard';}
  p._protectStreak=(p._protectStreak||0)+1;p._lastMoveId=m.id;return;
 }p._protectStreak=0;
 const ts=targets(w,s,slot,a,m);let dealt=0;
 for(const [t,i]of ts){const q=current(w,t,i);if(!alive(q))continue;
  if(m.category!=='Status'){let d=damage(p,q,m,w);const bypass=m.breaksProtect||p.ability==='unseenfist'&&m.flags?.contact&&!q._maxGuard;if(t!==s&&q._protected&&!bypass)d*=1-q._protected*((m.isZ||m.isMax)&&!q._maxGuard ? .75 : 1);const c=w.conditions[t];if(c.auroraveil||m.category==='Physical'&&c.reflect||m.category==='Special'&&c.lightscreen)d*=w.double?2/3:.5;if(w.double&&['allAdjacent','allAdjacentFoes'].includes(m.target)&&ts.length>1)d*=.75;d=Math.min(q.hp,d);if(q._endured&&d>=q.hp)d-=q._endured;d=Math.max(0,d);q.hp-=d;dealt+=d;
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
function step(w,ours,theirs,db){w=clone(w);for(const p of w.teams.flat()){delete p._protected;delete p._endured;delete p._maxGuard;}
 for(const [s,actions]of [[0,ours],[1,theirs]])actions.forEach((a,slot)=>{if(a?.kind==='switch')switchIn(w,s,slot,a.index)});
 for(const [s,actions]of [[0,ours],[1,theirs]])actions.forEach((a,slot)=>{const p=current(w,s,slot);if(a?.kind==='move'&&alive(p))activate(p,a,db)});
 const queue=[];for(const [s,actions]of [[0,ours],[1,theirs]])actions.forEach((a,slot)=>{if(a?.kind==='move'&&alive(current(w,s,slot))){const p=current(w,s,slot),m=moveFor(p,a,db);queue.push({s,slot,a,actor:p,prio:m.priority||0,speed:stat(p,'spe')})}});
 queue.sort((a,b)=>b.prio-a.prio||(w.field.trickRoom>0?a.speed-b.speed:b.speed-a.speed)||a.s-b.s);
 for(const q of queue)if(current(w,q.s,q.slot)===q.actor)apply(w,q.s,q.slot,q.a,db);
 for(const s of [0,1])for(const i of w.active[s]){const p=w.teams[s][i];if(!alive(p))continue;let cost=0;if(p.ability!=='magicguard'){if(p.status==='brn')cost+=1/16;if(p.status==='psn')cost+=1/8;if(p.status==='tox')cost+=Math.min(15,p.toxicCounter||1)/16;}
  p.hp=Math.max(0,p.hp-p.maxHp*cost);if(p.item==='leftovers'&&p.hp>0)p.hp=Math.min(p.maxHp,p.hp+p.maxHp/16);
  if(p.dynamaxed&&--p.dynamaxTurns<=0){const normal=p.normalMaxHp||p.maxHp/2;p.hp=Math.ceil(p.hp*normal/p.maxHp);p.maxHp=normal;p.dynamaxed=false;}
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
function candidates(w,s,db,legal=null,limit=3,view=null){
 const groups=Array.from({length:w.double?2:1},(_,slot)=>{
  const menu=legal?.[slot]||generic(w,s,slot,db);
  let ranked=menu.map(a=>{const factor=view?actionAssessment(view,slot,a,db).factor:1;return{a,factor,score:potential(w,s,slot,a,db)+6*Math.log(Math.max(.001,factor))}});
  const valid=ranked.filter(x=>x.factor>0);if(valid.length)ranked=valid;
  ranked.sort((a,b)=>b.score-a.score||actionKey(a.a).localeCompare(actionKey(b.a)));
  const picked=ranked.slice(0,limit);
  // Root pruning must not erase every useful mechanic, or every ordinary
  // alternative in doubles (both slots cannot spend the same team resource).
  if(view){
   const special=ranked.find(x=>x.a.mechanic&&x.factor>=1.25);
   if(special&&!picked.includes(special))picked[picked.length-1]=special;
   const ordinary=ranked.find(x=>!x.a.mechanic);
   if(ordinary&&picked.every(x=>x.a.mechanic))picked[picked.length-1]=ordinary;
  }
  return picked.map(x=>x.a);
 });return combinations(groups);
}
export function compatibilitySearch(world,view,db,{deadline=Infinity}={}){
 const start=performance.now(),depth=view.profile.settings.nativeDepth||1,ours=candidates(world,0,db,view.legal,view.double?4:9,view),theirs=candidates(world,1,db,null,view.double?2:3),out=[];let nodes=0;
 for(const own of ours){let worst=Infinity;
  for(const opp of theirs){const next=step(world,own,opp,db);nodes++;let value=evaluate(next);
   if(depth>=2&&performance.now()<deadline){let best=-Infinity;for(const future of candidates(next,0,db,null,2)){let risk=Infinity;for(const response of candidates(next,1,db,null,2)){risk=Math.min(risk,evaluate(step(next,future,response,db)));nodes++}best=Math.max(best,risk)}if(Number.isFinite(best))value=.6*value+.4*best;}
   worst=Math.min(worst,value);
  }
  out.push({actions:own,score:worst-own.filter(a=>a.kind==='switch').length*3});if(performance.now()>deadline&&out.length>=2)break;
 }
 out.sort((a,b)=>b.score-a.score);const top=out[0]?.score||0;return{mode:'compatibility',nodes,elapsed:performance.now()-start,choices:out.map(x=>({...x,weight:Math.exp(Math.max(-24,(x.score-top)/18))}))};
}
