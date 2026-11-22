// SPDX-License-Identifier: MIT
// Kanto v7.2. Original decision layer. Inputs: public observation, own legal actions,
// and complete payoff matrices from sampled Showdown hypotheses. Never the live opponent or queued choices.
export const CROWN_BUILD='crown-review-72';
export const isCrown=t=>t==='elite'||t==='champion';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),sum=x=>x.reduce((n,v)=>n+v,0),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),norm=a=>{let n=sum(a);return n>0?a.map(x=>x/n):a.map(()=>1/a.length);};
// Plausibility model, not an observed opponent policy. Modest floors preserve novel moves and switches.
export function replyPriors(scores){const hi=Math.max(...scores);return norm(scores.map(v=>.11+Math.exp(clamp((v-hi)/29,-4,0))));}
export function studyRoots(roots,records,game){return {keys:roots.map(r=>r.key),reference:game.policy.slice(),worlds:records.map((r,i)=>({matrix:r.matrix,swap:r.opponent.map(as=>as.some(a=>a.kind==='switch')),prior:r.replyPrior||r.opponent.map(()=>1/r.opponent.length),opponent:game.opponentPolicies[i]}))};}
// Security value of one shared mixed policy. The hypothetical opponent can choose a different reply in each world,
// but cannot observe which action we are about to sample. This is only a bound ON THESE retained matrices.
export function security(p,worlds){return sum(worlds.map(({matrix:m})=>Math.min(...m[0].map((_,j)=>p.reduce((v,w,i)=>v+w*m[i][j],0)))))/worlds.length;}
export function safeBlend(proposal,anchor,worlds,slack){const reference=security(anchor,worlds),raw=security(proposal,worlds),target=reference-slack;if(raw>=target)return {p:proposal,blend:0,reference,raw,final:raw};let lo=0,hi=1;const mix=t=>proposal.map((v,i)=>v*(1-t)+anchor[i]*t);for(let i=0;i<14;i++){const t=(lo+hi)/2;if(security(mix(t),worlds)>=target)hi=t;else lo=t;}const p=mix(hi);return {p,blend:hi,reference,raw,final:security(p,worlds)};}
const pureAilments=new Set('willowisp thunderwave toxic poisonpowder poisongas stunspore sleeppowder hypnosis sing spore grasswhistle lovelykiss glare darkvoid yawn'.split(' '));
const selfHeals=new Set('recover softboiled slackoff milkdrink shoreup synthesis morningsun moonlight roost'.split(' '));
function counter(a,view,db){if(view.double||!a||a.kind!=='move'||a.struggle||a.mechanic)return null;const me=view.own[view.active[0][0]],f=view.opponent[view.active[1][0]];if(!me||!f||f.unseen||me.dynamaxed)return null;const mid=me.moves[a.index]?.id,m=db.moves?.[mid];if(!m||m.category!=='Status')return null;
 if(pureAilments.has(mid)&&f.status){return 'already-statused';}
 // Unlike Roost, ordinary self-heals have no type change. Do not penalize a slow healing line that can follow an incoming hit.
 if(mid!=='roost'&&selfHeals.has(mid)&&me.hp===me.maxHp)return 'full-heal';return null;}
const rd=x=>Number.isFinite(x)?Math.round(x*10000)/10000:null;
export function crownPolicy(view,db,policy,actions,study,circuit){const tier=view.profile.tier;if(!isCrown(tier)||!policy.length)return {policy,info:null};const champ=tier==='champion',W=study?.worlds||[],has=W.length>0;
 const keys=has?study.keys:policy.map(r=>r.key),baseMap=new Map(policy.map(r=>[r.key,r.weight])),base=norm(keys.map(k=>Math.max(0,baseMap.get(k)||0))),anchor0=has?norm(study.reference):base,ref=keys.map(()=>0),stay=keys.map(()=>0),swap=keys.map(()=>0);let pSwitch=0,stayN=0,swapN=0;
 if(has)for(const w of W){const mix=w.prior.map((x,j)=>.64*x+.36*w.opponent[j]),sw=sum(mix.map((p,j)=>w.swap[j]?p:0));pSwitch+=sw/W.length;const swP=sum(w.prior.map((p,j)=>w.swap[j]?p:0)),stP=1-swP;if(stP>1e-6)stayN++;if(swP>1e-6)swapN++;
  w.matrix.forEach((row,i)=>{ref[i]+=dot(row,mix)/W.length;if(stP>1e-6)stay[i]+=sum(row.map((x,j)=>!w.swap[j]?x*w.prior[j]/stP:0));if(swP>1e-6)swap[i]+=sum(row.map((x,j)=>w.swap[j]?x*w.prior[j]/swP:0));});}
 for(let i=0;i<keys.length;i++){if(stayN)stay[i]/=stayN;if(swapN)swap[i]/=swapN;}
 const alt=keys.map(k=>actions.get(k)||[]),tags=alt.map(as=>as.length===1?counter(as[0],view,db):null);const attack=alt.map(as=>as.some((a,slot)=>{if(a.kind!=='move')return false;const p=view.own[view.active[0][slot]],m=db.moves?.[p?.moves?.[a.index]?.id];return !!m&&m.category!=='Status';}));
 const solid=attack.some((on,i)=>on&&(base[i]>.055||anchor0[i]>.055||circuit?.rows?.[keys[i]]?.kill>.16)),benches=view.opponent.filter((p,i)=>!view.active[1].includes(i)&&(p.unseen||p.hpPercent>0)),targetable=benches.some(p=>p.unseen||!p.status),hp=view.own[view.active[0][0]],danger=hp?.hp/Math.max(1,hp?.maxHp)<.64;
 const mult=tags.map((tag,i)=>{if(has&&W.length>=2&&W.every(w=>w.matrix[i].length)&&keys.some((_,k)=>k!==i&&W.every(w=>w.matrix[i].every((x,j)=>w.matrix[k][j]>x+.10))))return 0;if(tag==='already-statused'&&solid){const supported=targetable&&has&&pSwitch>.31&&swapN>=2&&swap[i]-stay[i]>.16;return !targetable||danger&&!supported?0:supported?(champ?.34:.45):(champ?.018:.045);}if(tag==='full-heal'&&solid&&has&&stayN>=2&&stay[i]<Math.max(...stay)-.25)return .31;return 1;});
 // If a move is forced, or all retained lines are unusual, return a real legal line, never an empty policy.
 if(!mult.some(x=>x>0)||!keys.some((k,i)=>mult[i]>0&&(base[i]>0||anchor0[i]>0)))mult.fill(1);
 const anchor=norm(anchor0.map((v,i)=>v*mult[i]));const maxRef=Math.max(...ref);let suggestion=keys.map((k,i)=>{const w=base[i];if(!(w>0)||!mult[i])return 0;const edge=has?Math.exp((champ?2.8:2.1)*clamp(ref[i]-maxRef,-1,.1)):1;return Math.pow(w,champ?2.05:1.65)*edge*mult[i];});if(!(sum(suggestion)>0))suggestion=anchor.slice();suggestion=norm(suggestion);
 // Move away from an undifferentiated long tail, but do not collapse a necessary mixed defence into argmax.
 // An anchor is conditional on the public guard. Matrix confidence is deliberately lower for a single sampled world.
 const slack=champ?.042:.070,fit=has?safeBlend(suggestion,anchor,W,slack+(W.length<2?.07:0)):{p:suggestion,blend:0,reference:null,raw:null,final:null};
 const final=norm(fit.p);const out=keys.map((key,i)=>({key,weight:final[i]})).filter(r=>r.weight>0).sort((a,b)=>b.weight-a.weight||a.key.localeCompare(b.key));
 return {policy:out,info:{build:CROWN_BUILD,tier,worlds:W.length,scope:view.double?'joint':'single',switchMass:has?rd(pSwitch):null,guarded:keys.filter((_,i)=>mult[i]<1).length,anchorBlend:rd(fit.blend),referenceFloor:rd(fit.reference),finalFloor:rd(fit.final),slack:has?slack+(W.length<2?.07:0):null,rows:keys.map((key,i)=>({key,before:rd(base[i]),after:rd(final[i]),stay:stayN?rd(stay[i]):null,switch:swapN?rd(swap[i]):null,publicReason:mult[i]<1?(tags[i]||'matrix-dominance'):null,multiplier:mult[i]}))}};
}
