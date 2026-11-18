// SPDX-License-Identifier: GPL-3.0-only
// Browser adaptation of select_move_from_mcts_results in Foul Play
// fp/search/main.py, revision 8f541f80f91f960603673796559f796b10ccf0fb.
// Upstream: https://github.com/pmariglia/foul-play . Modifications: JS port,
// zero-visit/error guards and scene-configurable skill. This readable module
// is the preferred source; see src/ai/licenses/FoulPlay-GPL-3.0.txt.
export function aggregatePolicies(results){
 const policy=new Map();let totalWeight=0;
 for(const result of results){const w=Number(result.weight??1),n=Number(result.totalVisits);if(!(w>0&&n>0))continue;totalWeight+=w;
  for(const option of result.options||[]){if(!(option.visits>=0)||!Number.isFinite(option.visits))continue;policy.set(option.key,(policy.get(option.key)||0)+w*option.visits/n)}
 }
 return [...policy].map(([key,weight])=>({key,weight:weight/(totalWeight||1)})).sort((a,b)=>b.weight-a.weight||a.key.localeCompare(b.key));
}
export function samplePolicy(policy,{window=.75,mistake=0}={},rng=Math.random){
 const valid=policy.filter(p=>Number.isFinite(p.weight)&&p.weight>0);if(!valid.length)return null;
 const best=Math.max(...valid.map(p=>p.weight));let choices=valid.filter(p=>p.weight>=best*window);
 if(mistake>0&&rng()<mistake){const lower=valid.filter(p=>p.weight<best*.75);if(lower.length)choices=lower;}
 const sum=choices.reduce((n,p)=>n+p.weight,0);let roll=rng()*sum;
 for(const p of choices){roll-=p.weight;if(roll<=0)return p.key}return choices.at(-1).key;
}
