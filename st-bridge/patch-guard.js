/* Conservative reconciliation of visible UpdateVariable blocks.
 * No guesses from malformed JSON; dedupe only across distinct blocks; do not
 * collapse repeated operations in one block. External/hidden MVU writes cannot
 * be validated by this module and must be reviewed by the player. */
(function(root){'use strict';
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  function stable(x){
    if(Array.isArray(x))return x.map(stable);
    if(obj(x))return Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])]));
    return x;
  }
  const key=o=>JSON.stringify([o.op,o.segs,stable(o.value)]);
  const pathKey=o=>JSON.stringify(o.segs);
  const overlap=(a,b)=>{const n=Math.min(a.length,b.length);for(let i=0;i<n;i++)if(a[i]!==b[i])return false;return true;};
  function visibleBody(text){
    const t=String(text||'');const content=t.match(/<content>([\s\S]*?)<\/content>/i);
    return String(content?content[1]:t).replace(/<(?:wave_plan|thinking|analysis|options|summary|comment|pkm_state|UpdateVariable)\b[^>]*>[\s\S]*?<\/(?:wave_plan|thinking|analysis|options|summary|comment|pkm_state|UpdateVariable)>/gi,'').replace(/<[^>]*>/g,'');
  }
  function directInteraction(text,aliases,player){
    const names=[...new Set((aliases||[]).map(x=>String(x||'').trim()).filter(x=>x.length>=2&&!/^[a-z]+$/i.test(x)))];
    const players=[...new Set(['你','玩家',String(player||'').trim()].filter(x=>x&&x!=='{{user}}'))];
    const action=/(?:道谢|感谢|谢过|回应|帮助|帮忙|扶起|扶住|救|安慰|鼓励|保护|拥抱|握手|击掌|交谈|交给|递给|交付|给予|送给|赠送|邀请|询问|说话|说|问|聊天|交流|目光落向|注视|面向|向|对|跟|和|与|为|替|陪伴|提醒|叮嘱)/;
    for(const part of visibleBody(text).split(/[。！？!?\n]+/)){
      // Merely being nearby is not a player's interaction.
      const s=part.replace(/玩家(?:只是|仅|正)?(?:站|坐|待|在)[^，,；;。]{0,10}(?:一旁|旁边|身旁)/g,'');
      if(s.length>800)continue;
      if(names.some(n=>s.includes(n))&&players.some(p=>s.includes(p))&&action.test(s))return true;
    }
    return false;
  }
  function parse(text,helpers={}){
    const pathSegs=helpers.pathSegs||(()=>[]),blocks=[],warnings=[];
    const src=String(text||'');
    const starts=[...src.matchAll(/<UpdateVariable\b[^>]*>/gi)].length, ends=[...src.matchAll(/<\/UpdateVariable\s*>/gi)].length;
    if(starts!==ends)return {ops:[],rawOps:[],warnings:['补丁不是完整的 JSON 数组，已停止本回复全部可见补丁'],malformed:true,conflicts:[],duplicates:[]};
    const re=/<UpdateVariable\b[^>]*>([\s\S]*?)<\/UpdateVariable\s*>/gi;
    for(const m of src.matchAll(re)){
      const block=m[1],jp=block.match(/<JSONPatch\b[^>]*>([\s\S]*?)<\/JSONPatch\s*>/i);
      if(/<JSONPatch\b/i.test(block)&&!jp)return {ops:[],rawOps:[],warnings:['补丁不是完整的 JSON 数组，已停止本回复全部可见补丁'],malformed:true,conflicts:[],duplicates:[]};
      let a=[];
      if(jp){
        const raw=jp[1].replace(/```(?:json)?/gi,'').trim();
        try {a=JSON.parse(raw);} catch(e){return {ops:[],rawOps:[],warnings:['补丁不是完整的 JSON 数组，已停止本回复全部可见补丁'],malformed:true,conflicts:[],duplicates:[]};}
        if(!Array.isArray(a)||a.some(x=>!obj(x)||!x.op||!x.path))return {ops:[],rawOps:[],warnings:['补丁不是完整的 JSON 数组，已停止本回复全部可见补丁'],malformed:true,conflicts:[],duplicates:[]};
      }else{
        // Preserve supported historical lodash-like expressions when no JSONPatch exists.
        for(const c of block.matchAll(/_\.(set|add|delta|remove)\(\s*(['"`])(.+?)\2\s*(?:,([^;]*?))?\)\s*;/g)){
          let args;try{args=JSON.parse('['+String(c[4]||'').replace(/'/g,'"')+']');}catch(_){return {ops:[],rawOps:[],warnings:['旧式补丁无法解析，已停止本回复全部可见补丁'],malformed:true,conflicts:[],duplicates:[]};}
          if(c[1]==='set')a.push({op:'replace',path:c[3],value:args.at(-1)});
          else if(c[1]==='remove')a.push({op:'remove',path:c[3]});
          else if(typeof args[0]==='number')a.push({op:'delta',path:c[3],value:args[0]});
        }
        if(!a.length && block.trim() && !/^<Analysis>[\s\S]*<\/Analysis>$/i.test(block.trim())){
          const array=(block.match(/\[[\s\S]*\]/)||[])[0];
          if(array){try{a=JSON.parse(array);}catch(_){return {ops:[],rawOps:[],warnings:['补丁不是完整的 JSON 数组，已停止本回复全部可见补丁'],malformed:true,conflicts:[],duplicates:[]};}}
          if(!Array.isArray(a))return {ops:[],rawOps:[],warnings:['补丁不是完整的 JSON 数组，已停止本回复全部可见补丁'],malformed:true,conflicts:[],duplicates:[]};
        }
      }
      const idx=blocks.length, ops=[];
      for(const o of a){
        if(!obj(o)||!o.op||!o.path)continue;
        const segs=pathSegs(o.path),op=String(o.op).toLowerCase();if(!segs.length)continue;
        if(segs.some(s=>['__proto__','prototype','constructor'].includes(s)))continue;
        if(segs[0]==='pkm'&&segs[1]==='npcs'&&segs[2]==='records'&&segs[3]&&helpers.npcKey){const k=helpers.npcKey(segs[3]);if(k)segs[3]=k;}
        ops.push({op,segs,value:o.value,block:idx});
      }
      blocks.push(ops);
    }
    const rawOps=blocks.flat(), conflicts=new Set(),dup=[];
    for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++)for(const a of blocks[i])for(const b of blocks[j]){
      if(!overlap(a.segs,b.segs))continue;
      if(key(a)===key(b))continue;
      conflicts.add(pathKey(a));conflicts.add(pathKey(b));
    }
    if(conflicts.size)warnings.push('不同补丁有冲突路径，冲突项未由桥接处理，请人工核对');
    const seen=new Set(),ops=[];
    for(const block of blocks){
      const before=new Set(seen),thisBlock=new Set();
      for(let o of block){
        const k=key(o);thisBlock.add(k);
        if(conflicts.has(pathKey(o)))continue;
        if(before.has(k)){dup.push(o);continue;}
        const g=o.segs;
        if(g[0]==='pkm'&&g[1]==='npcs'){
          if(g.length<=3){warnings.push('人物整表补丁无法可靠核对，已忽略');continue;}
          if(g[2]==='records'){
            if(g[4]==='lastInteraction'){warnings.push('最近互动由桥接维护，已忽略直接改写');continue;}
            if(g.length===4&&obj(o.value)){
              if(helpers.existingNpc?.(g[3])){warnings.push('人物整对象补丁无法可靠核对好感，已忽略');continue;}
              // Presence may create a record, but never invent a recent interaction or bond.
              o={...o,value:{...o.value,love:0,last:0,why:null,lastInteraction:-1}};
            }
          }
        }
        ops.push(o);
      }
      for(const k of thisBlock)seen.add(k);
    }
    if(dup.length)warnings.push('检测到重复补丁；不同补丁中的相同操作只处理一次');
    // All sensitive bond fields must form one complete reliable trio in the same block.
    const groups=new Map();
    for(const o of ops){const g=o.segs;if(g[0]!=='pkm'||g[1]!=='npcs'||g[2]!=='records'||g.length!==5||!['love','last','why'].includes(g[4]))continue;const k=o.block+'|'+g[3];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);}
    const rejected=new Set(),acceptedNpcs=new Set();
    for(const [k,group] of groups){
      const npc=group[0].segs[3],loves=group.filter(o=>o.segs[4]==='love'),last=group.filter(o=>o.segs[4]==='last'),why=group.filter(o=>o.segs[4]==='why');
      const amount=loves.reduce((n,o)=>n+(o.op==='delta'&&Number.isFinite(Number(o.value))?Number(o.value):0),0),reason=String(why.at(-1)?.value||'').trim();
      const valid=loves.length>0&&loves.every(o=>o.op==='delta'&&Number.isFinite(Number(o.value)))&&last.length===1&&['replace','add'].includes(last[0].op)&&Number(last[0].value)===amount&&why.length===1&&['replace','add'].includes(why[0].op)&&!!reason&&!/^(同行|在场|相处|一起相处|普通聊天|见面)$/.test(reason)
        &&directInteraction(text,helpers.aliases?.(npc)||[npc],helpers.playerName);
      if(!valid){for(const o of group)rejected.add(o);warnings.push('不可靠人物好感补丁：缺少可核对互动或完整的 love/last/why，未由桥接处理');}
      else acceptedNpcs.add(npc);
    }
    const clean=ops.filter(o=>!rejected.has(o));
    return {ops:clean,rawOps,warnings:[...new Set(warnings)],malformed:false,conflicts:[...conflicts],duplicates:dup,acceptedNpcs:[...acceptedNpcs]};
  }
  const api={parse,directInteraction,visibleBody};root.PKMPatchGuard=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
