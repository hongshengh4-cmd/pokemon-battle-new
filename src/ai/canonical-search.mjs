// SPDX-License-Identifier: MIT
// Browser-native belief ensemble + simultaneous-move matrix search. Independent
// implementation, informed by public multi-determinization / pooled-root ideas
// (see the delivered research notes). NOT Laplace, alpha-poke, a neural agent,
// or full ISMCTS. All sampled turns use the site's unmodified PS rule callbacks.
import {seeded,hash,actionKey} from './battle-view.mjs?v=20261118-ai-elite-v3';
import {actionAssessment} from './tactical-policy.mjs?v=20261118-ai-elite-v3';
import {sampleBeliefWorld} from './belief-model.mjs?v=20261118-ai-elite-v3';
import {bootCanonical,createSimulation,saveSimulation,restoreSimulation,simulationMenus,jointActions,rankedJointActions,actionPrior,executeChoices,settleReplacements,evaluateSimulation,CANONICAL_COMMIT} from './canonical-runtime.mjs?v=20261118-ai-elite-v3';
export {bootCanonical,CANONICAL_COMMIT};
export const SEARCH_BUILD='20261118-ai-elite-v3';
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
 const leaf=evaluateSimulation(b,ctx);if(!depth||b.ended||Math.abs(leaf)===1||b.requestState!=='move')return leaf;
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
 let out=jointActions(groups).map(actions=>({actions,key:keyOf(actions),score:actions.reduce((n,a,slot)=>n+actionPrior(b,0,slot,a),0)}));
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
 const ctx={deadline,depth:Math.max(1,Math.min(4,settings.lookahead||2)),firstFaintLoses:!!view.firstFaintLoses,nodes:0,penalties:new Map()};
 const fullDb={...db,supportedMoves:null},records=[];let roots=null,incomplete=0,refined=0,failures=0;
 // At least two complete common-opponent matrices before deeper refinement.
 // A deadline NEVER produces an unfair "only the first root actions searched"
 // ranking: a partially computed WORLD is discarded in its entirety.
 const worldLimit=Math.max(1,Math.min(20,maxWorlds||1));
 for(let i=0;i<worldLimit;i++){
  if(records.length>=2){const average=(performance.now()-started)/records.length;if(performance.now()+average*1.25>started+(deadline-started)*.78)break;}
  let b;
  try{
   checkBudget(ctx);const world=sampleBeliefWorld(view,fullDb,rng),created=createSimulation(world,view,seedArray(seed+i*7879));b=created.battle;
   for(const note of created.notes)notes.add(note);
   if(!roots){roots=rootCandidates(b,view,db,nativePrior);for(const root of roots)ctx.penalties.set(root.key,root.actions.reduce((n,a,slot)=>n+.022*Math.max(0,-Math.log(Math.max(.03,actionAssessment(view,slot,a,db).factor))),0));}
   if(!roots.length)throw Error('canonical root has no legal action');
   const opp=rankedJointActions(b,1,{perSlot:6,joints:view.double?6:7});
   if(!opp.length)throw Error('canonical opponent has no legal action');
   const record={snapshot:saveSimulation(b),seed:(seed+i*104729)>>>0,opponent:opp.map(x=>x.actions),matrix:[],samples:1};
   b.destroy();b=null;
   // Shuffle work order using the private SEARCH seed, not the live battle
   // PRNG. All rows and columns still finish before accepting this world.
   const rows=roots.map((_,j)=>j).sort((a,c)=>((a+i)%roots.length)-((c+i)%roots.length));
   for(const r of rows){const values=[];for(const theirs of record.opponent)values.push(evaluateCell(record,roots[r].actions,theirs,view,ctx,0,1));record.matrix[r]=values;}
   records.push(record);
  }catch(error){if(error instanceof BudgetStop){incomplete++;break;}failures++;notes.add('规则前瞻样本被弃用：'+String(error.message||error).slice(0,140));if(failures>=3)break;}
  finally{b?.destroy();}
 }
 if(!records.length)throw Error('规则前瞻没有完整样本：'+[...notes].join('; '));
 // Re-search complete worlds with a branching simultaneous response at ply 2
 // and a fresh chance seed. Do not selectively deepen just the attractive row.
 for(const record of records){
  if(refined>=maxRefinements)break;
  const fresh=[];
  try{
   for(let r=0;r<roots.length;r++){const row=[];for(const theirs of record.opponent)row.push(evaluateCell(record,roots[r].actions,theirs,view,ctx,0x6a09e667,2));fresh.push(row);}
   record.matrix=record.matrix.map((row,i)=>row.map((v,j)=>(v+fresh[i][j])/2));record.samples++;refined++;
  }catch(error){if(error instanceof BudgetStop){incomplete++;break;}notes.add('深层样本被弃用：'+String(error.message||error).slice(0,140));}
 }
 const game=solveBeliefGame(records.map(r=>r.matrix),{iterations:1600,prior:roots.map(r=>r.prior)});
 let policy=roots.map((root,i)=>({key:root.key,weight:game.policy[i]})).filter(p=>p.weight>=.004);
 if(!policy.length)policy=[{key:roots[game.policy.indexOf(Math.max(...game.policy))].key,weight:1}];
 const sum=policy.reduce((n,p)=>n+p.weight,0);policy=policy.map(p=>({...p,weight:p.weight/sum})).sort((a,b)=>b.weight-a.weight||a.key.localeCompare(b.key));
 return{build:SEARCH_BUILD,commit:CANONICAL_COMMIT,policy,actionMap:new Map(roots.map(r=>[r.key,r.actions])),info:{worlds:records.length,nodes:ctx.nodes,depth:ctx.depth,refinedWorlds:refined,incompleteWorlds:incomplete,rootActions:roots.length,opponentActions:records.map(r=>r.opponent.length),value:Math.round(game.value*10000)/10000,exploitability:Math.round(game.exploitability*10000)/10000,elapsed:Math.round(performance.now()-started),notes:[...notes].slice(0,8)}};
}
