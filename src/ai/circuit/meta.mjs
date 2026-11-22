// SPDX-License-Identifier: MIT
// Local filters for public aggregate priors; a frequent teammate is a possible world, never a discovery.
import {LADDER} from './ladder.mjs?v=crown-72';
export const canLearn=(v,level)=>!!v&&((v[0]>0&&v[0]<=level)||/[METR]/.test(v[1]||''));
export function usage(view,species){return view.double?LADDER.B9[species]:LADDER.N9[species]||LADDER.O9[species];}
export function partner(view,db,rng,used){if(view.encounterType==='wild')return '';const seen=view.opponent.filter(p=>!p.unseen);if(!seen.length||rng()>.40)return '';const mass=new Map();for(const p of seen){const row=usage(view,p.species);if(!row)continue;for(const [id,n] of Object.entries(row[2])){if(used.has(id)||!db.dex[id]||['Mega','Mega-X','Mega-Y','Gmax','Primal'].includes(db.dex[id].forme)||db.dex[id].battleOnly)continue;mass.set(id,(mass.get(id)||0)+Math.sqrt(n));}}
 let t=rng()*[...mass.values()].reduce((s,x)=>s+x,0);for(const [id,n]of mass)if((t-=n)<=0)return id;return '';}
