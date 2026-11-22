/* SPDX-License-Identifier: MIT
 * Canonical display/search boundary. Legacy spellings are ONLY an import migration.
 * Search never indexes migration aliases. Unknown names never become guessed IDs.
 */
(function(root){'use strict';
 const data=root.PKMOfficialNameData;
 if(data?.version!=='official-simplified-v1')throw Error('官方简体中文名录未就绪，请完整安装新版文件。');
 const norm=x=>String(x??'').normalize('NFKC').trim();
 const id=x=>norm(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/♀/g,'f').replace(/♂/g,'m').replace(/[^a-z0-9]/g,'');
 const kinds=['species','moves','items','abilities','natures'],reverse={};
 const owns=(obj,key)=>!!obj&&Object.prototype.hasOwnProperty.call(obj,key);
 for(const kind of kinds){
  reverse[kind]=new Map();
  for(const [key,name]of Object.entries(data.names[kind])){
   const word=norm(name);const list=reverse[kind].get(word)||[];list.push(key);reverse[kind].set(word,list);
  }
  // The unqualified species/move name denotes the base entry, not an arbitrary
  // typed or cosmetic form. Explicit internal IDs still preserve exact forms.
  for(const list of reverse[kind].values())list.sort((a,b)=>a.length-b.length||a.localeCompare(b));
 }
 function resolve(kind,value,{migrate=true}={}){
  if(!kinds.includes(kind))return'';
  const raw=typeof value==='object'?(value?.id||value?.itemId||value?.itemName||value?.name||''):value,word=norm(raw);
  if(!word)return'';
  const key=id(word);
  if(key&&owns(data.names[kind],key)&&/^[\p{L}\p{N}\s.:'’_\-♀♂]+$/u.test(word)&&!/[\u3400-\u9fff]/.test(word))return key;
  const exact=reverse[kind].get(word);if(exact)return exact[0];
  if(migrate){const old=data.aliases[kind]?.[word];if(old&&data.names[kind][old])return old;}
  return'';
 }
 function name(kind,key){if(!kinds.includes(kind))return'';const table=data.names[kind],raw=String(key??''),keyId=id(raw);return owns(table,raw)?table[raw]:owns(table,keyId)?table[keyId]:kind==='species'&&owns(data.internalSpeciesDisplay,keyId)?data.internalSpeciesDisplay[keyId]:'';}
 function has(kind,key){if(!kinds.includes(kind))return false;return owns(data.names[kind],id(key));}
 const lists={};
 function entries(kind,{catalog=false}={}){
  const k=kind+(catalog?':catalog':'');if(lists[k])return lists[k];
  let result=Object.entries(data.names[kind]||{}).map(([key,word])=>({kind,id:key,name:word,english:data.english[kind]?.[key]||key,supported:true}));
  if(catalog&&['moves','items'].includes(kind))result=data.catalog.filter(x=>x.kind===kind);
  // No unknown translation fallback. Every visible result has a verified name.
  lists[k]=Object.freeze(result.filter(x=>/[\u3400-\u9fff]/.test(x.name)).map(x=>Object.freeze({...x})));return lists[k];
 }
 function search(kind,query='',{catalog=false,limit=80,allowed=null}={}){
  const q=norm(query).toLowerCase(),pool=entries(kind,{catalog});
  return pool.filter(x=>(!allowed||allowed.has(x.id))&&(!q||norm(x.name).toLowerCase().includes(q)||x.id.includes(q)||String(x.english).toLowerCase().includes(q)))
   .sort((a,b)=>Number(norm(b.name).toLowerCase()===q)-Number(norm(a.name).toLowerCase()===q)||Number(b.supported)-Number(a.supported)||a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id)).slice(0,Math.max(1,Math.min(5000,Number(limit)||80)));
 }
 function overlay(zh={}){return{...zh,...data.names};}
 function normalizeMoves(raw,{warnings=[]}={}){
  const input=Array.isArray(raw)?raw:[],out=[];let rejected=0;
  for(const value of input){if(!value)continue;const mid=resolve('moves',value);if(!mid){rejected++;continue;}if(!out.includes(mid))out.push(mid);}
  if(rejected){warnings.push(`发现 ${rejected} 项未收录或未核验的招式。`);throw Error(`配置含 ${rejected} 项未收录或未核验的招式，已阻止开战；请用官方名录更正，不会自动丢招或替换配招。`);}
  if(out.length>4)throw Error('配招超过四项，已阻止开战；请明确选择四个招式。');
  if(input.some(Boolean)&&!out.length)throw Error('所填招式均不在官方名称名录中，已阻止空配招开战；请重新选择招式。');
  return out.slice(0,4);
 }
 function normalizeItem(raw,{warnings=[]}={}){
  if(raw==null||raw==='')return'';const key=resolve('items',raw);
  if(!key){warnings.push('发现未收录或不能携带的道具。');throw Error('配置含未收录或不能携带的道具，已阻止开战；请从官方携带物名录重新选择。');}
  return key;
 }
 function validateBattleSpec(spec={}){
  if(typeof spec==='string')spec={species:spec};
  if(!spec||typeof spec!=='object')throw Error('宝可梦配置应为对象或已收录物种名。');
  if((spec.species||spec.name)&&!resolve('species',spec.species||spec.name))throw Error('配置含未收录物种或未核验形态，已阻止开战，不会替换成另一只宝可梦。');
  if(spec.moves!=null&&!Array.isArray(spec.moves))throw Error('moves 必须是招式数组，不能自动改成另一套配招。');
  if(spec.moves)normalizeMoves(spec.moves);
  for(const field of ['item','heldItem','held_item'])if(spec[field])normalizeItem(spec[field]);
  for(const[kind,field,label]of [['abilities','ability','特性'],['natures','nature','性格']])if(spec[field]&&!resolve(kind,spec[field]))throw Error('配置含未核验的'+label+'名称，已阻止开战，请从官方名录更正。');
  return true;
 }
 // All English protocol tokens and known legacy names translate straight to a
 // canonical display label. Aliases are not exposed as search suggestions.
 let pairs=null,rx=null,map=null;
 function displayText(text){
  if(!pairs){
   const m=new Map();
   for(const kind of kinds){
    for(const[key,word]of Object.entries(data.names[kind])){m.set(data.english[kind]?.[key]||key,word);m.set(key,word);m.set(word,word);}
    for(const[old,key]of Object.entries(data.aliases[kind]||{}))if(data.names[kind][key])m.set(old,data.names[kind][key]);
   }
   for(const[key,word]of Object.entries(data.internalSpeciesDisplay||{})){m.set(data.internalSpeciesEnglish?.[key]||key,word);m.set(key,word);}
   pairs=[...m].filter(([a,b])=>a&&b).sort((a,b)=>b[0].length-a[0].length);map=new Map(pairs);
   const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');rx=new RegExp(pairs.map(([a])=>escape(a)).join('|'),'g');
  }
  return String(text??'').replace(rx,x=>map.get(x)||x);
 }
 const api={version:data.version,data,resolve,name,has,entries,search,overlay,normalizeMoves,normalizeItem,validateBattleSpec,displayText};
 root.PKMOfficialNames=Object.freeze(api);
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
