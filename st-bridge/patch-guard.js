/* Conservative reconciliation of visible UpdateVariable blocks.
 * No guesses from malformed JSON; dedupe only across distinct blocks; do not
 * collapse repeated operations in one block. External/hidden MVU writes cannot
 * be attributed by this parser alone. bond-sync.js binds the supported MVU
 * COMMAND_PARSED/ENDED pair to an exact message/swipe before settling NPC bonds. */
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
  // Planning / bookkeeping blocks are not story text: an NPC name inside a plot plan or memory summary
  // is never evidence that the player actually interacted with that NPC this turn.
  const HIDDEN_BLOCKS=['wave_plan','think','think_nya','thinking','analysis','options','summary','comment','pkm_state','UpdateVariable','JSONPatch',
    'acg_think','story_driver','world_timeline','wlog','anti_protagonist_halo_protocol','butterfly_effect_protocol','parallel_line_drive',
    'memory_log','npc_log','Memory','locator','pkm_battle','pkm_result','pkm_profile','details'];
  function stripHidden(t){
    let out=String(t||'').replace(/<!--[\s\S]*?-->/g,'');
    for(let pass=0;pass<3;pass++)for(const tag of HIDDEN_BLOCKS)out=out.replace(new RegExp('<'+tag+'\\b[^>]*>[\\s\\S]*?<\\/'+tag+'>','gi'),'');
    return out;
  }
  function visibleBody(text){
    const t=stripHidden(text);const content=t.match(/<content>([\s\S]*?)<\/content>/i);
    return String(content?content[1]:t).replace(/<[^>]*>/g,'');
  }
  const escape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Detect completed *actions*, not unrelated occurrences of 不/没/想 elsewhere.
  const ACTIONS=[
    /道谢|道了(?:声)?谢|道了(?:一声)?谢|道声谢|感谢|谢过|致谢|谢谢|感激|多谢/,
    /帮助|帮忙|帮了|扶起|扶住|救下|救了|救助|解围|协助|救命|救援|护航/,
    /安慰|抚慰|鼓励|宽慰|打气|激励|鼓舞|倾听|听完|听着|开导|点拨|指点/,
    /保护|守护|挡下|并肩作战|并肩战斗|联手(?:战斗|击败|对抗)|切磋|对战|交战|挑战赛/,
    /拥抱|抱住|牵手|握手|击掌|握住|拍了拍|拍拍|摸了摸|摸摸/,
    /交谈|聊天|交流|谈话|对话|询问|咨询|请教|问候|问好|说话|回应|回答|叮嘱|提醒|讲解|称赞|赞许|夸奖|致意|道别|告别|祝贺|恭喜|道贺|答应|应下|应允|应道|答道|回道|许诺|承诺|鞠躬|行礼|打招呼|寒暄/,
    /交给|递给|递到|交付|交还|递还|接过|给予|送给|赠送|请客|分享|领取|领到|推近|推过去|递过去|拿给|颁发|办理|入住|治疗|恢复|抛给|扔给|丢给|发给|颁给|塞给|塞进|塞到|递来|递上|送上|递了过来|抛了过来|扔了过来|丢了过来/,
    /责备|批评|争吵|吵架|冒犯|伤害|背叛|讽刺|欺骗|辱骂|拒绝(?!向|对|给|帮|与|和|去|跟|为|替)|失信/,
    /邀请|陪伴|陪着|照料|照顾|包扎|送行|送别|(?:一同|一起|一道|结伴)(?:出发|上路|踏上|启程|前往|赶路|同行)|并肩(?:走|前行|出发|赶路|同行)/,
  ];
  const QUOTED_BOND=/谢了|谢啦|谢谢|多谢|感谢|谢过|恭喜|祝贺|对不起|抱歉|好久不见|认可|佩服/;
  const BENIGN=/不小心|不由自主|情不自禁|毫不犹豫|忍不住|不禁/g;
  const UNFINISHED=/(?:拒绝|拒不|懒得|没有|没能|并没|未曾|尚未|未能|并未|不曾|不会|不能|不愿|不想|不肯|不要|并不|从未|没|不)[^，,。！？!?；;]{0,9}$|(?:准备|打算|计划|试图|试着|尝试|提议|提出|考虑|差点|险些|假装|希望|想要|想向|想对|想给|想去|想来|想)[^，,。！？!?；;]{0,10}$|\b(?:not|never|without|might|would)\b[^,.;!?]{0,18}$/i;
  const HYPOTHETICAL=/(?:如果|假如|假设|要是|若是|倘若|是否|能否|也许|可能|梦见|(?<!宝可)梦中|(?<!宝可)梦里|想象|幻想)|\bif\b/i;
  function actionMatches(text){
    const out=[];for(let kind=0;kind<ACTIONS.length;kind++)for(const match of String(text||'').matchAll(new RegExp(ACTIONS[kind].source,'g')))out.push({kind,index:match.index,word:match[0]});
    return out.sort((a,b)=>a.index-b.index);
  }
  function affirmative(s){
    const text=String(s||'').replace(BENIGN,''),matches=actionMatches(text);
    if(!matches.length)return !HYPOTHETICAL.test(text)&&!/(?:没有|未能|未曾|不曾|并未|没能|假装)/.test(text);
    return matches.some(m=>!UNFINISHED.test(text.slice(Math.max(0,m.index-30),m.index))&&!HYPOTHETICAL.test(text.slice(0,m.index)));
  }
  // A comma is not a mandatory subject boundary. Quotes, however, are: an NPC's
  // quoted 我/你 is not proof that the narrator/player performed that action.
  function segments(text,commas=false){
    const out=[];let start=0,quote=null;
    const pairs={'“':'”','「':'」','『':'』','‘':'’','"':'"'};
    for(let i=0;i<text.length;i++){
      const c=text[i];if(quote){if(c===quote)quote=null;continue;}
      if(pairs[c]){quote=pairs[c];continue;}
      if((commas?/[，,]/:/[。！？!?；;\n]/).test(c)){out.push(text.slice(start,i));start=i+1;}
    }
    out.push(text.slice(start));return out.filter(x=>x.trim());
  }
  function outsideQuotes(s){return s.replace(/“[^”]*”|「[^」]*」|『[^』]*』|‘[^’]*’|"[^"]*"/g,m=>' '.repeat(m.length));}
  function interactionEvidence(text,aliases,player,reason='',otherNames=[]){
    const names=[...new Set((aliases||[]).map(x=>String(x||'').trim()).filter(x=>x.length>=2))];
    const players=[...new Set(['你','玩家','我',String(player||'').trim()].filter(x=>x&&x!=='{{user}}'))];
    const r=String(reason||'').trim();
    if(!names.length||!r||/^(?:同行|在场|相处|一起相处|普通聊天|见面|关系变化|好感变化|日常互动|互动|无|null)$/i.test(r))return null;
    const has=(s,items)=>items.some(n=>/^[a-z][a-z0-9 ]*$/i.test(n)?new RegExp('\\b'+escape(n)+'\\b','i').test(s):s.includes(n));
    const others=[...new Set([...otherNames,'小智','小霞','小刚','路人','警员','护士','陌生人','另一名训练家'].filter(n=>n&&!names.includes(n)&&!players.includes(n)))];
    const observer=/(?:看着|看见|看到|望着|目睹|旁观|听说|听到|听见|得知|想象|梦见)[^，,。！？!?；;]{0,40}$/;
    // An NPC that is only the *object* of looking/hearing is not the partner of a following action.
    const glance=/(?:看着|看见|看到|望着|目睹|旁观|听说|听到|听见|得知|想象|梦见|看了一眼|瞥了一眼|瞄了一眼|扫了一眼|打量着|注视着|盯着)[^，,。！？!?；;]{0,40}$/;
    const observedOnly=narrative=>names.some(nm=>{const i=narrative.indexOf(nm);return i>=0&&glance.test(narrative.slice(0,i));});
    // Quoted speech that opens by addressing someone else (“小智，……”) is not an interaction with this NPC.
    const addressedOther=(clause,from)=>{const q=clause.slice(from).match(/[“「『"]\s*([^，,！!？?：:”」』"\s]{1,8})\s*[，,！!？?：:]/);return !!q&&!has(q[1],names)&&others.some(o=>q[1]===o||q[1].startsWith(o));};
    const pronounStart=/^(?:她|他)(?![们的])/;
    const body=visibleBody(text).replace(/```[\s\S]*?```/g,'');
    let prevSubjectNpc=false,colonToPlayer=null;
    for(const sentence of segments(body)){
      if(colonToPlayer){
        const pending=colonToPlayer;colonToPlayer=null;const lead=sentence.trimStart();
        if(/^[“「『"]/.test(lead)){const said=lead.match(QUOTED_BOND);if(said&&!addressedOther(lead,0))return {kind:/恭喜|祝贺/.test(said[0])?5:0,action:said[0],excerpt:(pending.excerpt+lead.slice(0,80)),reason:r};}
      }
      let playerCarry=false,npcCarry=false,prior='',first=true,subjectNpc=null;
      for(const raw of segments(sentence,true)){
        const clause=raw.replace(BENIGN,''),narrative=outsideQuotes(clause),trim=narrative.trim().replace(/^(?:而|但|随后|接着|于是|这时|同时|然后|不过)\s*/,'');
        // Sentence subject: the NPC by name, or 她/他 right after a sentence whose subject was this NPC.
        const subjectHere=first&&trim?(names.some(nm=>trim.startsWith(nm))||prevSubjectNpc&&pronounStart.test(trim)):false;
        if(first&&trim){subjectNpc=subjectHere?true:(others.some(o=>trim.startsWith(o))||has(trim.slice(0,4),players)||pronounStart.test(trim)?false:null);first=false;}
        const third=!subjectHere&&(others.some(n=>trim.startsWith(n))||/^(?:他|她|他们|她们|对方|那名少年|那名少女)(?!的)/.test(trim));
        if(third){playerCarry=false;npcCarry=false;}
        if(subjectHere)npcCarry=true;
        const pNow=has(narrative,players),nNow=has(clause,names)&&!observedOnly(narrative);
        // A completely quoted clause only inherits a player explicitly named in
        // the preceding narration; never infer the player from quoted pronouns.
        const p=pNow||playerCarry&&!third,n=nNow||npcCarry&&!third;
        const matches=actionMatches(narrative); // quoted speech is not narrated action
        if(p&&n&&!third)for(const m of matches){
          const pre=clause.slice(Math.max(0,m.index-35),m.index);
          if(UNFINISHED.test(pre)||HYPOTHETICAL.test(prior+clause.slice(0,m.index)))continue;
          if(observer.test(pre))continue;
          const playerPos=players.map(x=>narrative.indexOf(x)).filter(i=>i>=0),firstPlayer=playerPos.length?Math.min(...playerPos):-1;
          if(firstPlayer>=0&&observer.test(clause.slice(firstPlayer,m.index)))continue;
          const subjectPrefix=narrative.slice(0,m.index);
          if(others.some(o=>subjectPrefix.includes(o)&&!has(subjectPrefix,players)))continue;
          // Prevent "你站在旁边，小智向乔伊道谢" and object-only player mentions.
          if(firstPlayer>=0&&others.some(o=>{const oi=narrative.indexOf(o);return oi>firstPlayer&&oi<m.index&&!has(narrative.slice(oi),names);}))continue;
          if(m.kind===5&&addressedOther(clause,m.index))continue;
          return {kind:m.kind,action:m.word,excerpt:(raw.trim().slice(0,180)),reason:r};
        }
        // The NPC (clause subject) turns *to the player* and thanks/congratulates/apologises in a quote:
        // “他朝着你点了点头：‘谢了，一飞。’” The player must be the narrated addressee, not just nearby.
        if(n&&!nNow&&!third||subjectHere){
          const toPlayer=players.some(pl=>new RegExp('(?:朝着?|对着?|向|冲着?)[^，,。！？!?；;“「『"]{0,4}'+escape(pl)).test(narrative));
          const qStart=clause.search(/[“「『"]/),quoted=qStart>=0?clause.slice(qStart):'';
          const said=quoted.match(QUOTED_BOND);
          const clean=toPlayer&&!HYPOTHETICAL.test(qStart>=0?clause.slice(0,qStart):clause)&&!observer.test(narrative);
          if(clean&&said&&!addressedOther(clause,qStart)){
            return {kind:/恭喜|祝贺/.test(said[0])?5:0,action:said[0],excerpt:(raw.trim().slice(0,180)),reason:r};
          }
          // “……先朝你点了点头：” followed by the quote as its own paragraph.
          if(clean&&qStart<0&&/[：:]\s*$/.test(clause))colonToPlayer={excerpt:raw.trim().slice(0,120)};
        }
        if(pNow&&!third&&!observer.test(narrative))playerCarry=true;
        if(nNow&&p&&!third)npcCarry=true;
        prior=(prior+clause+'，').slice(-110);
        if(HYPOTHETICAL.test(clause)||third){playerCarry=false;npcCarry=false;}
      }
      if(subjectNpc!==null)prevSubjectNpc=subjectNpc;
    }
    // 当面对话往来：一句是你说的话，相邻一句是TA说的话或TA对此的直接反应
    // （“……”你认真地说。花子眼眶一红，点了点头。）。对别人说、旁观、假设都不算。
    const sents=segments(body),SAY=/说|道|答|应|回|问|喊|叫/;
    const lead=s=>outsideQuotes(s).trim().replace(/^(?:而|但|随后|接着|于是|这时|同时|然后|不过)\s*/,'');
    const clean=s=>{const nar=outsideQuotes(s);return !HYPOTHETICAL.test(nar)&&!observer.test(nar)&&!glance.test(nar)&&!/看着|看见|看到|望着|目睹|旁观|听说|得知/.test(nar)&&!others.some(o=>nar.includes(o));};
    const speaker=s=>{const qi=s.search(/[“「『"]/);if(qi<0||!clean(s))return null;const t=lead(s),nar=outsideQuotes(s);
      if(!(SAY.test(t)||/[：:]/.test(nar)))return null;if(addressedOther(s,qi))return null;
      if(players.some(pl=>t.startsWith(pl)))return 'p';if(names.some(nm=>t.startsWith(nm)))return 'n';return null;};
    const reacts=s=>{const t=lead(s);return !!t&&names.some(nm=>t.startsWith(nm))&&clean(s);};
    for(let k=0;k<sents.length;k++){
      const sp=speaker(sents[k]);if(!sp)continue;
      const nx=sents[k+1]?speaker(sents[k+1]):null,pv=k?speaker(sents[k-1]):null;
      if((sp==='p'&&(nx==='n'||pv==='n'||(sents[k+1]&&nx===null&&reacts(sents[k+1]))))||(sp==='n'&&nx==='p'))
        return {kind:5,action:'当面对话',excerpt:(sents[k]+'。'+(sents[k+1]||'')).trim().slice(0,180),reason:r};
    }
    return null;
  }
  function directInteraction(text,aliases,player,reason='',otherNames=[]){return !!interactionEvidence(text,aliases,player,reason,otherNames);}
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
    conflicts.clear(); // 好感守卫已关闭：冲突路径按出现顺序照常执行，不提示
    const seen=new Set(),ops=[];
    for(const block of blocks){
      const before=new Set(seen),thisBlock=new Set();
      for(let o of block){
        const k=key(o);thisBlock.add(k);
        if(conflicts.has(pathKey(o)))continue;
        if(before.has(k)){dup.push(o);continue;}
        ops.push(o);
      }
      for(const k of thisBlock)seen.add(k);
    }
    // 不同补丁块里完全相同的操作只执行一次（防止重复加分），不提示。
    // All sensitive bond fields must form one complete reliable trio in the same block.
    const groups=new Map();
    for(const o of ops){const g=o.segs;if(g[0]!=='pkm'||g[1]!=='npcs'||g[2]!=='records'||g.length!==5||!['love','last','why'].includes(g[4]))continue;const k=o.block+'|'+g[3];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);}
    const rejected=new Set(),acceptedNpcs=new Set(),bondUpdates=[],replaced=new Map(),capped=[];
    // 好感守卫已关闭（用户要求）：love/last/why 按补丁原样写入，不核对正文、不出提示；
    // 仅把 love 的总值保持在 ±100 以内。
    for (const [k,group] of groups){
      const npc=group[0].segs[3],loves=group.filter(o=>o.segs[4]==='love'),why=group.filter(o=>o.segs[4]==='why');
      if(!loves.length)continue;
      const deltas=loves.filter(o=>o.op==='delta'&&Number.isFinite(Number(o.value)));
      const amount=deltas.reduce((n,o)=>n+Number(o.value),0);
      const baseLove=helpers.love?.(npc),knownBase=typeof baseLove==='number'&&Number.isFinite(baseLove);
      if(knownBase&&deltas.length===loves.length&&amount){
        let applied=amount;
        if(baseLove+amount>100)applied=Math.max(0,100-baseLove);
        if(baseLove+amount<-100)applied=Math.min(0,-100-baseLove);
        if(applied!==amount){deltas.forEach((o,idx)=>{if(idx)rejected.add(o);else replaced.set(o,{...o,value:applied});});if(!applied)capped.push(npc);}
      }
      acceptedNpcs.add(npc);bondUpdates.push({key:npc,delta:amount,last:amount,why:String(why.at(-1)?.value??''),evidence:null,requested:amount});
    }
    const clean=ops.filter(o=>!rejected.has(o)).map(o=>replaced.get(o)||o);
    return {ops:clean,capped,rawOps,warnings:[],malformed:false,conflicts:[...conflicts],duplicates:dup,acceptedNpcs:[...acceptedNpcs],bondUpdates};
  }
  const api={version:'20261116-bond-guard-hotfix2',parse,directInteraction,interactionEvidence,visibleBody,affirmative};root.PKMPatchGuard=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
