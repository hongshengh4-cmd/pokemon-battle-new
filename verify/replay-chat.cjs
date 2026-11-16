// Shared fixture: replay real UpdateVariable blocks from the user's exported chat (read-only).
const fs=require('fs'),path=require('path');
const guard=require('../st-bridge/patch-guard.js');
const CHAT=process.env.PKM_CHAT||'/home/user/uploads/宝可梦·关都之旅 - 2026-11-16@07h46m51s685ms.json';
function load(){
  const chat=fs.readFileSync(CHAT,'utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
  const records=chat[1].variables[0].stat_data.pkm.npcs.records;
  const extra={ash:['小智','阿智'],misty:['小霞'],brock:['小刚'],gary:['小茂'],oak:['大木博士','大木'],joy:['乔伊小姐','乔伊'],jenny:['君莎小姐','君莎'],delia:['花子','小智妈妈']};
  const aliases=k=>[records[k]?.name,String(records[k]?.name||'').replace(/小姐$|博士$|先生$/,''),...(extra[k]||[])].filter(Boolean);
  const pathSegs=p=>{p=String(p??'').trim();if(!p)return[];let s=p.startsWith('/')?p.slice(1).split('/'):p.replace(/\[(\d+)\]/g,'.$1').split('.');s=s.filter(Boolean);if(s[0]==='stat_data')s.shift();return s;};
  return {chat,records,aliases,pathSegs};
}
function replay(){
  const {chat,records,aliases,pathSegs}=load(),out=[];
  const otherNames=Object.keys(records).flatMap(aliases);
  for(let i=1;i<chat.length;i++){
    const text=chat[i].mes||'';if(chat[i].is_user||!/<UpdateVariable\b/i.test(text))continue;
    const helpers={pathSegs,playerName:'碧悠姬',npcKey:r=>records[r]?r:Object.keys(records).find(k=>aliases(k).includes(r)),existingNpc:k=>!!records[k],aliases,otherNames};
    const plan=guard.parse(text,helpers);
    for(const o of plan.rawOps.filter(o=>o.segs[1]==='npcs'&&o.segs[4]==='love')){
      const k=o.segs[3],u=plan.bondUpdates.find(b=>b.key===k);
      out.push({messageId:i-1,npc:k,op:o.op,delta:o.value,accepted:plan.acceptedNpcs.includes(k),evidence:u?.evidence?.excerpt||null,action:u?.evidence?.action||null});
    }
  }
  return out;
}
module.exports={load,replay};
if(require.main===module)for(const r of replay())console.log(JSON.stringify(r));
