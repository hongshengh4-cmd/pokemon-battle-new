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
  if(migrate&&kind==='moves')return resolveMoveAlias(word);
  if(migrate)return resolveNameAlias(kind,word);
  return'';
 }
 // Abilities / items / natures / species: traditional, old (pre-BDSP) and
 // English spellings plus decorated forms such as「猛火（隐藏特性）」「特性：猛火」.
 const nameAlias=()=>root.PKMNameAliasData||null;
 const DECOR={
  abilities:[/^(?:隐藏特性|隱藏特性|梦特性|夢特性|普通特性|一般特性|特性|ability)\s*[:：]\s*/i,/[（(【\[]\s*(?:隐藏|隱藏|梦|夢|普通|一般|特性|H|HA|hidden)[^）)】\]]*[）)】\]]/gi,/(?:隐藏特性|隱藏特性|梦特性|夢特性)$/],
  items:[/^(?:携带物品|攜帶物品|携带物|攜帶物|持有物|携带道具|攜帶道具|道具|item)\s*[:：]\s*/i,/^(?:携带|攜帶|持有)(?=.{2,})/],
  natures:[/^(?:性格|nature)\s*[:：]\s*/i,/\s*(?:性格|nature)$/i],
  species:[]
 };
 let aliasDepth=0;
 function resolveNameAlias(kind,word){
  if(aliasDepth>2)return'';
  aliasDepth++;
  try{
   let w=word;for(const re of DECOR[kind]||[])w=w.replace(re,'').trim();
   if(w&&w!==word){const r=resolve(kind,w);if(r)return r;}
   const A=nameAlias()?.[kind],ok=k=>k&&owns(data.names[kind],k)?k:'';
   if(A){const hit=hasCJK(word)?A.zh?.[looseKey(word)]:A.en?.[id(word)];if(ok(hit))return hit;}
   if(aliasDepth>1)return'';
   const parts=word.split(/[\/|｜／()（）\[\]【】]+/).map(norm).filter(Boolean);
   if(parts.length<2)return'';
   const ids=new Set();for(const part of parts){const k=resolve(kind,part);if(k)ids.add(k);}
   return ids.size===1?[...ids][0]:'';
  }finally{aliasDepth--;}
 }
 // Move import compatibility: old/regional/traditional Chinese names, English
 // names and Pokémon Showdown shorthands map to the exact Showdown move ID.
 // Generated table only (src/data/move-aliases.js); ambiguous historical names
 // are never guessed.
 const moveAlias=()=>root.PKMMoveAliasData||null;
 const looseKey=x=>norm(x).toLowerCase().replace(/[\s\u3000·・•_.\-,，、'’‘"“”「」『』《》〈〉【】\[\]()（）:：!！?？~～]/g,'');
 const hasCJK=x=>/[\u3400-\u9fff]/.test(x);
 function moveAliasHit(word){
  const A=moveAlias();if(!A)return'';const ok=k=>k&&owns(data.names.moves,k)?k:'';
  if(!hasCJK(word))return ok(A.en?.[id(word)]);
  let k=looseKey(word),hit=A.zh?.[k];
  if(!hit&&/招式$/.test(k)&&k.length>2)hit=A.zh?.[k.slice(0,-2)];
  return ok(hit);
 }
 function resolveMoveAlias(word,depth=0){
  const hit=moveAliasHit(word);if(hit)return hit;
  if(depth)return'';
  // "十万伏特（Thunderbolt）" / "Thunderbolt/十万伏特": every recognizable part
  // must agree on one move, otherwise nothing is guessed.
  const parts=word.split(/[\/|｜／()（）\[\]【】]+/).map(norm).filter(Boolean);
  if(parts.length<2)return'';
  const ids=new Set();
  for(const part of parts){const exact=reverse.moves.get(part);const k=exact?exact[0]:(owns(data.names.moves,id(part))&&!hasCJK(part)?id(part):(data.aliases.moves?.[part]&&data.names.moves[data.aliases.moves[part]]?data.aliases.moves[part]:resolveMoveAlias(part,1)));if(k)ids.add(k);}
  return ids.size===1?[...ids][0]:'';
 }
 function moveAmbiguity(value){
  const A=moveAlias();const word=norm(typeof value==='object'?(value?.id||value?.name||''):value);
  const list=A?.ambiguous?.[looseKey(word)];
  return Array.isArray(list)?list.map(k=>data.names.moves[k]||k):null;
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
  const input=Array.isArray(raw)?raw:[],out=[],bad=[];
  for(const value of input){if(!value)continue;const mid=resolve('moves',value);if(!mid){bad.push(value);continue;}if(!out.includes(mid))out.push(mid);}
  if(bad.length){
   const label=v=>{const w=norm(typeof v==='object'?(v?.name||v?.id||''):v),amb=moveAmbiguity(v);return amb?`「${w}」（旧译有歧义：${amb.join(' / ')}）`:`「${w}」`;};
   const list=bad.map(label).join('、');
   warnings.push(`无法识别的招式：${list}`);
   throw Error(`配置含 ${bad.length} 项无法识别的招式：${list}。已阻止开战，不会自动丢招或替换配招；请改成官方简中名、旧译名或 Showdown 英文名。`);
  }
  if(out.length>4)throw Error('配招超过四项，已阻止开战；请明确选择四个招式。');
  if(input.some(Boolean)&&!out.length)throw Error('所填招式均不在官方名称名录中，已阻止空配招开战；请重新选择招式。');
  return out.slice(0,4);
 }
 function normalizeItem(raw,{warnings=[]}={}){
  if(raw==null||raw==='')return'';const key=resolve('items',raw);
  // Unknown held item: this battle runs without it (save data is untouched).
  if(!key){warnings.push(`未识别的携带道具「${norm(typeof raw==='object'?(raw?.name||raw?.id||raw?.itemName||''):raw)}」，本场按未携带处理（存档不改）。`);return'';}
  return key;
 }
 function validateBattleSpec(spec={},{warnings=[]}={}){
  if(typeof spec==='string')spec={species:spec};
  if(!spec||typeof spec!=='object')throw Error('宝可梦配置应为对象或已收录物种名。');
  const who=norm(spec.nickname||spec.species||spec.name||'');
  if((spec.species||spec.name)&&!resolve('species',spec.species||spec.name))throw Error(`配置含无法识别的物种或形态「${who}」，已阻止开战，不会替换成另一只宝可梦。`);
  if(spec.moves!=null&&!Array.isArray(spec.moves))throw Error('moves 必须是招式数组，不能自动改成另一套配招。');
  if(spec.moves){try{normalizeMoves(spec.moves);}catch(e){throw Error((who?`「${who}」`:'')+e.message);}}
  for(const field of ['item','heldItem','held_item'])if(spec[field])normalizeItem(spec[field],{warnings});
  // Ability / nature never block a battle: the engine falls back to a legal
  // species ability / a rolled nature for this battle only; saves are untouched.
  for(const[kind,field,label]of [['abilities','ability','特性'],['natures','nature','性格']]){
   const v=spec[field];if(!v||resolve(kind,v))continue;
   const text=typeof v==='object'?JSON.stringify(v):norm(v);
   warnings.push(`「${who}」的${label}「${text}」无法识别，本场${kind==='abilities'?'改用该宝可梦的合法特性':'随机一种性格'}（存档不改）。`);
   try{root.console?.warn?.('[PKM] '+warnings[warnings.length-1]);}catch(_){}
  }
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
