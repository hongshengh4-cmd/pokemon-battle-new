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
// Browser-native belief ensemble + simultaneous-move matrix search. Independent
// implementation, informed by public multi-determinization / pooled-root ideas
// (see the delivered research notes). NOT Laplace, alpha-poke, a neural agent,
// or full ISMCTS. All sampled turns use the site's unmodified PS rule callbacks.
import {seeded,hash,actionKey} from './battle-view.mjs?v=20261118-ai-elite-v3&cmd=kanto-crown-v72';
import {actionAssessment} from './tactical-policy.mjs?v=20261118-ai-elite-v3';
import {sampleBeliefWorld} from './belief-model.mjs?v=20261118-ai-elite-v3&cmd=kanto-crown-v72';
import {bootCanonical,createSimulation,saveSimulation,restoreSimulation,simulationMenus,jointActions,rankedJointActions,actionPrior,jointPrior,executeChoices,settleReplacements,evaluateSimulation,REPLACEMENT_BUILD,RUNTIME_COMMAND,CANONICAL_COMMIT} from './canonical-runtime.mjs?v=20261118-ai-elite-v3&cmd=kanto-crown-v72';
export {bootCanonical,CANONICAL_COMMIT,REPLACEMENT_BUILD};
export const SEARCH_BUILD='20261118-ai-elite-v3', COMMAND_BUILD='kanto-crown-v72';
if(RUNTIME_COMMAND!==COMMAND_BUILD||REPLACEMENT_BUILD!=='public-reserves-v71')throw Error('规则推演与联赛替补版本不匹配');
import {isCrown,replyPriors,studyRoots} from './circuit/crown.mjs?v=crown-72';
import {simReplyPrior,exploitMix,exploitAlpha,crownReadWeight} from './expert/human-prior.mjs?v=human-prior-v2';
import {valueBlend} from './expert/value-model.mjs?v=value-v1';
const keyOf=xs=>xs.map(actionKey).join('|');
const normalized=xs=>{const sum=xs.reduce((n,x)=>n+Math.max(0,x),0);return sum>0?xs.map(x=>Math.max(0,x)/sum):xs.map(()=>1/xs.length);};
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
// One SHARED policy for our hidden-information root. Each world has its own
// opponent distribution, because the opponent knows its own set. Neither side
// receives the other's just-selected command. Averaging per-world argmaxes is
// intentionally NOT used: that would allow incompatible, clairvoyant plans.
export function solveBeliefGame(matrices,{iterations=1200,prior=null}={}){
 if(!matrices.length||!matrices[0].length)throw Error('empty simultaneous game');
 const rows=matrices[0].length,worlds=matrices.length,p0=normalized(prior?.length===rows?prior:Array(rows).fill(1));
 // Remove only PURE rows strictly worse in EVERY retained world/reply. This
 // is game-theoretic dominance before solving, not post-solve reweighting.
 // A tiny RM exploration floor must not retain a provably useless Z/idle
 // option forever just because several terminal outcomes are near-ties.
 const kept=Array.from({length:rows},(_,i)=>i).filter(i=>!Array.from({length:rows},(_,k)=>k).some(k=>k!==i&&matrices.every(m=>m[i].every((v,j)=>m[k][j]>v+1e-9))));
 if(kept.length&&kept.length<rows){
  const game=solveBeliefGame(matrices.map(m=>kept.map(i=>m[i])),{iterations,prior:kept.map(i=>p0[i])}),policy=Array(rows).fill(0);
  kept.forEach((row,i)=>policy[row]=game.policy[i]);
  return{...game,policy,dominatedRows:Array.from({length:rows},(_,i)=>i).filter(i=>!kept.includes(i))};
 }
 let p=p0.slice(),qs=matrices.map(m=>Array(m[0].length).fill(1/m[0].length));
 const regrets=Array(rows).fill(0),oppRegrets=qs.map(q=>q.map(()=>0)),pSum=Array(rows).fill(0),qSum=qs.map(q=>q.map(()=>0));let count=0;
 for(let t=0;t<iterations;t++){
  const rowValues=Array(rows).fill(0),colValues=matrices.map((m,w)=>m[0].map((_,j)=>m.reduce((n,row,i)=>n+p[i]*row[j],0)));
  for(let w=0;w<worlds;w++)for(let i=0;i<rows;i++)rowValues[i]+=dot(matrices[w][i],qs[w])/worlds;
  const value=dot(p,rowValues);
  for(let i=0;i<rows;i++)regrets[i]=Math.max(0,regrets[i]+rowValues[i]-value);
  for(let w=0;w<worlds;w++){const v=dot(qs[w],colValues[w]);for(let j=0;j<qs[w].length;j++)oppRegrets[w][j]=Math.max(0,oppRegrets[w][j]+v-colValues[w][j]);}
  // Regret-matching+ with a vanishing exploration floor, not a "best move
  // plus opponent perfect reply" sequential minimax.
  const epsilon=.025/(1+t/60);p=normalized(regrets.map((r,i)=>r+epsilon*p0[i]));qs=oppRegrets.map(q=>normalized(q.map(r=>r+epsilon/q.length)));
  if(t>=iterations/3){for(let i=0;i<rows;i++)pSum[i]+=p[i];for(let w=0;w<worlds;w++)for(let j=0;j<qs[w].length;j++)qSum[w][j]+=qs[w][j];count++;}
 }
 p=normalized(pSum);qs=qSum.map(normalized);
 const lower=matrices.reduce((n,m)=>n+Math.min(...m[0].map((_,j)=>m.reduce((v,row,i)=>v+p[i]*row[j],0))),0)/worlds;
 const upper=Math.max(...Array.from({length:rows},(_,i)=>matrices.reduce((n,m,w)=>n+dot(m[i],qs[w]),0)/worlds));
 return{policy:p,opponentPolicies:qs,value:lower,exploitability:Math.max(0,upper-lower),iterations,count};
}
const seedArray=n=>{const r=seeded(n);return Array.from({length:4},()=>Math.floor(r()*65536));};
class BudgetStop extends Error{}
function checkBudget(ctx){if(performance.now()>=ctx.deadline)throw new BudgetStop();}
function play(b,ours,theirs,ctx){
 checkBudget(ctx);executeChoices(b,ours,theirs);settleReplacements(b,ctx);ctx.nodes++;
}
function futureValue(b,depth,ctx,{width=1}={}){
 const leaf=evaluateSimulation(b,ctx);if(b.ended||Math.abs(leaf)===1||b.requestState!=='move')return leaf;
 if(!depth){
  // A bounded duel extension: do not value a boost (or an apparent trade) only at the horizon.
  // Symmetric for both root choices, in hypothesis space, and for singles last-pair races ONLY.
  if(!ctx.duelTail||b.gameType!=='singles'||b.sides.some(s=>s.pokemon.filter(p=>p.hp>0&&!p.fainted).length!==1))return leaf;
  const act=b.sides.map(s=>s.active[0]);if(act.some(p=>!p||p.fainted)||!act.some(p=>p.hp/p.maxhp<.62||['atk','spa','spe'].some(k=>p.boosts[k]>0)))return leaf;
  checkBudget(ctx);const next=b.sides.map((_,side)=>rankedJointActions(b,side,{perSlot:5,joints:1})[0]?.actions);if(next.some(x=>!x))return leaf;
  play(b,next[0],next[1],ctx);ctx.duelTails++;return .30*leaf+.70*evaluateSimulation(b,ctx);
 }
 checkBudget(ctx);
 const menus=[0,1].map(s=>rankedJointActions(b,s,{perSlot:b.gameType==='doubles'?3:4,joints:width}));
 if(!menus[0].length||!menus[1].length)return leaf;
 if(width===1){play(b,menus[0][0].actions,menus[1][0].actions,ctx);return futureValue(b,depth-1,ctx);}
 const json=saveSimulation(b),matrix=[];
 // Tiny simultaneous response game at the next ply; afterwards use bounded
 // rollouts. This makes the refinement an actual branching search, not merely
 // a longer single scripted line.
 for(const a of menus[0]){const row=[];for(const c of menus[1]){
  const next=restoreSimulation(json);
  try{play(next,a.actions,c.actions,ctx);row.push(futureValue(next,depth-1,ctx));}finally{next.destroy();}
 }matrix.push(row);}
 const game=solveBeliefGame([matrix],{iterations:180});return game.value;
}
function resourceCost(actions){return actions.reduce((n,a)=>n+(a.kind==='switch' ? .008 : 0)+(a.mechanic==='z' ? .025 : a.mechanic==='dynamax' ? .022 : a.mechanic==='tera' ? .025 : 0),0);}
export function boundedSearchValue(immediate,continuation,adjustment=0){
 const terminal=Math.abs(immediate)===1?immediate:Math.abs(continuation)>=.999?Math.sign(continuation):null;
 const primary=terminal??Math.max(-.95,Math.min(.95,.1*immediate+.9*continuation));
 // Lexicographic-scale tie-break: apply the SAME bounded tactical cost to
 // immediate AND eventual terminals. A later inevitable loss gets no horizon
 // reward; among equally losing/winning plans, don't Protect pointlessly or
 // waste Z into immunity. The <=.004 secondary can never outrank a terminal
 // with a nonterminal evaluation, or create a >1 "more-than-certain" win.
 const secondary=Math.max(-.004,Math.min(.004,adjustment*.01));
 return primary*.99+secondary;
}
function evaluateCell(record,ours,theirs,view,ctx,salt,width){
 const b=restoreSimulation(record.snapshot,seedArray(record.seed^salt));
 try{
  play(b,ours,theirs,ctx);const immediate=evaluateSimulation(b,ctx);
  const next=Math.abs(immediate)===1?immediate:futureValue(b,ctx.depth-1,ctx,{width});
  // Terminal results may not be diluted by a style, switch or resource prior.
  // Never discount a later terminal loss into an apparent improvement: that
  // horizon bug rewards pointless Protect loops simply for postponing defeat.
  return boundedSearchValue(immediate,next,-resourceCost(ours)+resourceCost(theirs)-(ctx.penalties.get(keyOf(ours))||0));
 }finally{b.destroy();}
}
function rootCandidates(b,view,db,nativePrior){
 const groups=view.legal.map((menu,slot)=>{
  let xs=menu.map(a=>({a,factor:actionAssessment(view,slot,a,db).factor,score:actionPrior(b,0,slot,a)}));
  const valid=xs.filter(x=>x.factor>0);if(valid.length)xs=valid;
  xs.sort((a,c)=>c.score-a.score||actionKey(a.a).localeCompare(actionKey(c.a)));
  // Singles retain EVERY non-vetoed legal root action. Doubles require bounded
  // joint pruning, but retain ordinary alternatives and each eligible gimmick.
  if(!view.double)return xs.map(x=>x.a);
  const picked=xs.slice(0,5);
  for(const candidate of [xs.find(x=>!x.a.mechanic),...['mega','z','dynamax','tera'].map(k=>xs.find(x=>x.a.mechanic===k))])if(candidate&&!picked.includes(candidate))picked.push(candidate);
  return picked.map(x=>x.a);
 });
 let out=jointActions(groups).map(actions=>({actions,key:keyOf(actions),score:jointPrior(b,0,actions)}));
 out.sort((a,c)=>c.score-a.score||a.key.localeCompare(c.key));
 if(view.double&&out.length>20){
  const selected=out.slice(0,14);
  for(const kind of ['mega','z','dynamax','tera'])for(let slot=0;slot<2;slot++){
   const c=out.find(x=>x.actions[slot]?.mechanic===kind);if(c&&!selected.includes(c))selected.push(c);
  }
  out=selected.slice(0,20);
 }
 const priors=new Map((nativePrior||[]).map(p=>[p.key,p.weight]));
 return out.map(x=>({...x,prior:Math.max(.015,priors.get(x.key)||0)}));
}
export function canonicalSearch(view,db,{seed=hash(JSON.stringify(view)),deadline=performance.now()+view.profile.settings.milliseconds,nativePrior=[],maxWorlds=view.profile.settings.worlds,maxRefinements=Infinity}={}){
 bootCanonical();const started=performance.now(),rng=seeded(seed^0x83171c29),notes=new Set(),settings=view.profile.settings;
 const ctx={deadline,depth:Math.max(1,Math.min(4,settings.lookahead||2)),firstFaintLoses:!!view.firstFaintLoses,nodes:0,penalties:new Map(),matchCache:new Map(),valueBlend:view.double?0:valueBlend(view.profile.tier)};
 const upper=isCrown(view.profile.tier),fullDepth=ctx.depth;ctx.duelTail=upper;ctx.duelTails=0;if(upper)ctx.depth=Math.min(2,ctx.depth);
 const fullDb={...db,supportedMoves:null},records=[];let roots=null,incomplete=0,refined=0,failures=0,checkpoint=null,rescued=false;
 // At least two complete common-opponent matrices before deeper refinement.
 // A deadline NEVER produces an unfair "only the first root actions searched"
 // ranking: a partially computed WORLD is discarded in its entirety.
 const worldLimit=Math.max(1,Math.min(20,maxWorlds||1));
 for(let i=0;i<worldLimit;i++){
  if(records.length>=2){const average=(performance.now()-started)/records.length;if(performance.now()+average*1.25>started+(deadline-started)*(upper?.56:.78))break;}
  let b;
  try{
   checkBudget(ctx);const world=sampleBeliefWorld(view,fullDb,rng),created=createSimulation(world,view,seedArray(seed+i*7879));b=created.battle;
   for(const note of created.notes)notes.add(note);
   if(!roots){roots=rootCandidates(b,view,db,nativePrior);for(const root of roots)ctx.penalties.set(root.key,root.actions.reduce((n,a,slot)=>n+.022*Math.max(0,-Math.log(Math.max(.03,actionAssessment(view,slot,a,db).factor))),0));}
   if(!roots.length)throw Error('canonical root has no legal action');
   let opp=rankedJointActions(b,1,{perSlot:upper&&!view.double?12:6,joints:upper&&!view.double?12:(view.double?6:7)});
   if(upper&&!view.double&&opp.length>7){const take=opp.slice(0,6);const reply=opp.find(z=>z.actions.some(a=>a.kind==='switch')&&!take.some(x=>x.actions.some(a=>a.kind==='switch')));take.push(reply||opp[6]);opp=take;}
   if(!opp.length)throw Error('canonical opponent has no legal action');
   // Human-expert opponent model: make sure the replies strong ladder players actually choose are columns,
   // and remember their predicted frequencies for the "read" mix after solving.
   let qh=null;const alpha=exploitAlpha(view.profile.tier);
   if(alpha&&!view.double&&!view.firstFaintLoses){try{const pool=rankedJointActions(b,1,{perSlot:16,joints:24}),qp=simReplyPrior(b,1,pool.map(x=>x.actions),fullDb);
    if(qp){const has=new Set(opp.map(x=>keyOf(x.actions)));let added=0;for(const [x] of pool.map((x,j)=>[x,qp[j]]).sort((u,v)=>v[1]-u[1]).slice(0,3)){if(added<2&&!has.has(keyOf(x.actions))){opp.push(x);has.add(keyOf(x.actions));added++;}}qh=simReplyPrior(b,1,opp.map(x=>x.actions),fullDb);}
   }catch(error){notes.add('高分应对模型跳过：'+String(error.message||error).slice(0,100));}}
   // Crown tiers: the reply model used by the crown review is the plausibility heuristic blended with
   // the ladder-human model (already re-shaped by this player's in-battle read). Security floor unchanged.
   let replyPrior=upper?replyPriors(opp.map(x=>x.score)):null;
   const hRead=crownReadWeight();if(replyPrior&&qh&&qh.length===replyPrior.length&&hRead>0){const h=hRead;replyPrior=replyPrior.map((x,j)=>(1-h)*x+h*qh[j]);const z=replyPrior.reduce((n,x)=>n+x,0);replyPrior=replyPrior.map(x=>x/z);}
   const record={snapshot:saveSimulation(b),seed:(seed+i*104729)>>>0,opponent:opp.map(x=>x.actions),replyPrior,matrix:[],samples:1,qh};
   b.destroy();b=null;
   // Shuffle work order using the private SEARCH seed, not the live battle
   // PRNG. All rows and columns still finish before accepting this world.
   const rows=roots.map((_,j)=>j).sort((a,c)=>((a+i)%roots.length)-((c+i)%roots.length));
   // Complete a comparable one-turn matrix before risking a deep pass on a slow device. No
   // partial rows may enter the solver. Deep complete worlds take precedence; this is insurance.
   if(!checkpoint&&!records.length&&ctx.depth>1){const saved=ctx.depth,short=[];ctx.depth=1;
    try{for(const r of rows){const vs=[];for(const theirs of record.opponent)vs.push(evaluateCell(record,roots[r].actions,theirs,view,ctx,0,1));short[r]=vs;}
     checkpoint={...record,matrix:short};}finally{ctx.depth=saved;}}
   for(const r of rows){const values=[];for(const theirs of record.opponent)values.push(evaluateCell(record,roots[r].actions,theirs,view,ctx,0,1));record.matrix[r]=values;}
   records.push(record);
  }catch(error){if(error instanceof BudgetStop){incomplete++;break;}failures++;notes.add('规则前瞻样本被弃用：'+String(error.message||error).slice(0,140));if(failures>=3)break;}
  finally{b?.destroy();}
 }
 if(!records.length&&checkpoint){records.push(checkpoint);ctx.depth=1;rescued=true;notes.add('时限内保留完整一层行动×应对矩阵，未用未完成的深搜行');}
 if(!records.length)throw Error('规则前瞻没有完整样本：'+[...notes].join('; '));
 // Re-search complete worlds with a branching simultaneous response at ply 2
 // and a fresh chance seed. Do not selectively deepen just the attractive row.
 for(const record of records){
  if(rescued||refined>=maxRefinements)break;
  const fresh=[];if(upper)ctx.depth=fullDepth;
  try{
   for(let r=0;r<roots.length;r++){const row=[];for(const theirs of record.opponent)row.push(evaluateCell(record,roots[r].actions,theirs,view,ctx,0x6a09e667,2));fresh.push(row);}
   record.matrix=record.matrix.map((row,i)=>row.map((v,j)=>upper?.30*v+.70*fresh[i][j]:(v+fresh[i][j])/2));record.samples++;refined++;
  }catch(error){if(error instanceof BudgetStop){incomplete++;break;}notes.add('深层样本被弃用：'+String(error.message||error).slice(0,140));}
 }
 const game=solveBeliefGame(records.map(r=>r.matrix),{iterations:1600,prior:roots.map(r=>r.prior)});
 let finalPolicy=game.policy,humanModel=null;const alphaH=exploitAlpha(view.profile.tier);
 if(alphaH&&!rescued&&records.every(r=>r.qh&&r.qh.length===r.opponent.length)){const mix=exploitMix(game.policy,records.map(r=>r.matrix),records.map(r=>r.qh),alphaH);
  if(mix){const dom=new Set(game.dominatedRows||[]);finalPolicy=mix.policy.map((x,i)=>dom.has(i)?0:x);humanModel={alpha:+alphaH.toFixed(3),worlds:records.length,readBest:roots[mix.values.indexOf(Math.max(...mix.values))]?.key};}}
 let policy=roots.map((root,i)=>({key:root.key,weight:finalPolicy[i]})).filter(p=>p.weight>=.004);
 if(!policy.length)policy=[{key:roots[finalPolicy.indexOf(Math.max(...finalPolicy))].key,weight:1}];
 const sum=policy.reduce((n,p)=>n+p.weight,0);policy=policy.map(p=>({...p,weight:p.weight/sum})).sort((a,b)=>b.weight-a.weight||a.key.localeCompare(b.key));
 return{build:SEARCH_BUILD,commandVersion:COMMAND_BUILD,replacementBuild:REPLACEMENT_BUILD,commit:CANONICAL_COMMIT,rootStudy:upper?studyRoots(roots,records,game):null,policy,actionMap:new Map(roots.map(r=>[r.key,r.actions])),info:{humanModel,valueBlend:ctx.valueBlend||0,worlds:records.length,nodes:ctx.nodes,depth:upper&&!refined?(rescued?1:Math.min(2,fullDepth)):ctx.depth,refinedWorlds:refined,...(upper?{duelExtensions:ctx.duelTails}:{}),checkpointUsed:rescued,incompleteWorlds:incomplete,rootActions:roots.length,opponentActions:records.map(r=>r.opponent.length),value:Math.round(game.value*10000)/10000,exploitability:Math.round(game.exploitability*10000)/10000,elapsed:Math.round(performance.now()-started),notes:[...notes].slice(0,8)}};
}
