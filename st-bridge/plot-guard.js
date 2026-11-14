/* Plot chronology primitives: no writes, no assumptions about unseen events. */
(function(root){'use strict';
  const PLOT_RE = /([A-Z]{2,3}\d{2,3})\s*[｜|]\s*节点\s*(\d+)\s*[｜|]\s*(进行中|节点完成|完成|跳过)/;
  const FREE_RE = /自由\s*[｜|]\s*节点\s*0\s*[｜|]\s*进行中/;
  function date(text) {
    const m=String(text||'').match(/第\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日(?:\s*(\d{1,2})[:：](\d{2}))?/);
    if(!m)return null;
    const [y,mo,d]=m.slice(1,4).map(Number),hasTime=m[4]!==undefined,h=hasTime?Number(m[4]):0,mi=hasTime?Number(m[5]):0;
    if(y<1||mo<1||mo>12||d<1||d>31||([4,6,9,11].includes(mo)&&d>30)||(mo===2&&d>29)||h>23||mi>59)return null;
    const day=(y-1)*372+(mo-1)*31+d, minute=day*1440+h*60+mi;
    return {y,mo,d,h,mi,day,minute,hasTime,text:`第${y}年 ${mo}月${d}日${hasTime?` ${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`:''}`};
  }
  function makeEvents(entries){
    const list=[], stages={}, seen=new Set();
    for(const e of entries||[]){
      const keys=e.keys||e.key||[], evt=keys.find(k=>/^EVT_/.test(k)), stg=keys.find(k=>/^STAGE_\d+/.test(k));
      if(evt){
        if(seen.has(evt))continue;seen.add(evt);
        const content=String(e.content||''),line=(content.match(/(?:^|\n)-\s*时间[:：]\s*([^\n]+)/)||[])[1]||'';
        const dates=[...line.matchAll(/第\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日(?:\s*\d{1,2}[:：]\d{2})?/g)].map(m=>date(m[0])).filter(Boolean);
        const start=dates[0]||null, end=dates.length>1?dates[1]:null;
        const block=(content.split(/\n- 节点[:：]\s*\n/)[1]||'').split(/\n\s*介入点[：:]|\n- 对战机会|\n- 收尾|\n- 涉及角色|\n<\/Plot_Event>/)[0];
        const nodes=block?block.split(/\n(?=\s{2}\d+\.\s)/).map(t=>t.trim()).filter(Boolean):[];
        // SP03 is a player-confirmed flexible preparation window, not a May 11 launch mandate.
        const flexibleStart=evt==='EVT_SP03' && !!end;
        const lastStart=flexibleStart?(end.hasTime?end.minute:end.day*1440+1439):(start?(start.hasTime?start.minute:start.day*1440+1439):Infinity);
        const finish=end?(end.hasTime?end.minute:end.day*1440+1439):Infinity;
        list.push({id:evt.slice(4),title:String(e.comment||'').split('｜').slice(1).join('｜')||evt,content,
          stage:(content.match(/阶段[:：]\s*(S\d+[^\n]*)/)||[])[1]||'', date:start, endDate:end,
          startMinute:start?.minute??-Infinity, lastStartMinute:lastStart, endMinute:finish, flexibleStart,
          dateLabel:line, nodes:nodes.length?nodes:['（全事件）'],
          hook:(content.match(/介入点[：:]\s*([^\n]+)/)||[])[1]||'',battle:(content.match(/对战机会[:：]\s*([^\n]+)/)||[])[1]||'',ord:list.length});
      }else if(stg){const n='S'+Number(stg.slice(6));(stages[n]||=[]).push({comment:e.comment,content:String(e.content||'')});}
    }
    list.sort((a,b)=>((a.date?.day??Infinity)-(b.date?.day??Infinity))||(a.ord-b.ord));
    return {list,stages};
  }
  function position(book,states,world={},timeText='',opts={}){
    const list=book?.list||[];if(!list.length)return null;
    const index=Object.fromEntries(list.map((e,i)=>[e.id,i]));
    let last=null,freeTail=false,latest=null,sequenceConflict=opts.strictHistory?inspectHistory(list,states,opts.initialWorld||{}):'';
    for(const st of states||[]){
      if(!st)continue; latest=st;
      const g=String(st.剧情||''),m=g.match(PLOT_RE);
      if(m&&index[m[1]]!==undefined){
        const cur={id:m[1],node:Number(m[2]),status:m[3],bodyPresent:st.__plotBodyPresent};
        if(last&&!sequenceConflict){
          const a=index[last.id],b=index[cur.id],total=list[a].nodes.length;
          if(last.status==='跳过')sequenceConflict=`旧记录把 ${last.id} 标为跳过，不能视为已发生。`;
          else if(['完成','节点完成'].includes(last.status)&&last.bodyPresent===false)sequenceConflict=`旧记录缺少可核对正文，不能只凭 ${last.id} 的完成标签推进。`;
          else if(b===a){
            const expected=last.status==='节点完成'&&last.node<total?last.node+1:last.node;
            if(last.status==='完成'||cur.node!==expected)sequenceConflict=`旧记录从 ${last.id} 节点${last.node}（${last.status}）跳到节点${cur.node}，请核对。`;
          }else if(b!==a+1||last.status!=='完成'||last.node!==total)
            sequenceConflict=`旧记录从 ${last.id} 节点${last.node} 跳到 ${cur.id} 节点${cur.node}，未证明前序节点按顺序完成。`;
          else if(cur.node!==1)sequenceConflict=`${cur.id} 不能从节点${cur.node}开始，请核对旧记录。`;
        }
        last=cur;freeTail=false;
      }
      else if(FREE_RE.test(g)||/自由/.test(g))freeTail=true;
    }
    // A legacy snapshot is only used if the selected chat contains no explicit plot progress.
    if(!last&&world.event&&index[world.event]!==undefined){
      last={id:world.event,node:Number(world.node)||1,status:world.nodeStatus||'进行中'};
      if(opts.strictHistory&&(world.event!==(list[0]?.id||'EP001')||last.node!==1))
        sequenceConflict ||= `可见聊天没有完整剧情起点，旧快照从 ${world.event} 节点${last.node}开始；不能推定此前节点已发生，请恢复并核对完整记录。`;
    }
    let i=last?index[last.id]:index.EP001??0,node=1,note='',started=false,historyConflict=sequenceConflict;
    if(last){
      started=true;node=last.node;
      const priorTotal=list[i].nodes.length;
      if(!Number.isInteger(node)||node<1||node>priorTotal)
        historyConflict ||= `旧记录的 ${last.id} 节点${node} 超出范围（1—${priorTotal}），未自动推进。`;
      else if(last.status==='跳过')
        historyConflict ||= `旧记录将 ${last.id} 标为跳过；硬约束版不会自动认定它发生或完成，请核对。`;
      else if(['完成','节点完成'].includes(last.status)&&last.bodyPresent===false)
        historyConflict ||= `旧记录只标记 ${last.id} 节点${node} 已完成，但没有可核对的正文；未自动推进。`;
      else if(last.status==='完成'&&node!==priorTotal)
        historyConflict ||= `旧记录在 ${last.id} 节点${node}/${priorTotal} 就标记整件事件完成；未自动推进。`;
      else if(last.status==='完成'&&!historyConflict){i++;node=1;started=false;}
      else if(last.status==='节点完成'&&!historyConflict){
        if(node<priorTotal)node++;
        else note='最后一个节点仅标了“节点完成”，尚未记录整件事件完成；请真实收束后标“完成”。';
      }
    }
    const mode=latest?.模式||world.mode||'同行模式';
    if(i>=list.length)return{finished:true,mode};
    const event=list[i],total=event.nodes.length;
    if(!Number.isInteger(node)||node<1||node>total){note=`历史记录的节点 ${node} 超出 ${event.id} 的范围（1—${total}）；保留旧记录，请人工核对。`;node=Math.max(1,Math.min(total,Number(node)||1));}
    const now=date(timeText||latest?.时间||world.time),next=list[i+1]||null;
    // If no end time was supplied, do not invent one. The next event's start window is the latest safe boundary.
    const limit=Math.min(event.endMinute,next?.lastStartMinute??Infinity);
    const notBefore=!!now&&now.minute<event.startMinute&&!started;
    const nodeOpen=nodeMinimum(NODE_OPEN,event.id,node);
    const nodeNotBefore=!!now&&!!nodeOpen&&now.minute<nodeOpen.minute;
    let conflict=historyConflict;
    if(!conflict&&now&&!started&&now.minute>event.lastStartMinute)
      conflict=`${event.id} 的固定开始窗口（${event.dateLabel}）已过去，而现有记录未证明它已开始。`;
    else if(!conflict&&now&&started&&now.minute<event.startMinute)
      conflict=`现有记录称 ${event.id} 已开始，但正文时间早于固定日期 ${event.dateLabel}。`;
    else if(!conflict&&now&&started&&now.minute>limit)
      conflict=`${event.id} 尚未完成，但正文时间已越过本事件范围或下一事件的开始窗口。`;
    return {event,node,total,nodeText:event.nodes[node-1]||'',note,started,notBefore,nodeNotBefore,nodeOpen,free:freeTail&&(notBefore||nodeNotBefore),mode,now,next,limit,conflict,index:i};
  }
  // Only directly stated, unambiguous cross-day facts are machine checked.
  // Other prose chronology remains a prompt constraint and cannot be semantically proven by this module.
  // Fictional year numbering does not establish leap years: Feb 29 is a conservative earliest possible day, not a claim that it exists.
  const NODE_OPEN={
    EP005:{4:"第1年 6月14日 00:00"},
    EP033:{4:"第1年 11月5日 00:00"},
    EP084:{2:"第2年 10月25日 00:00"},
    EP109:{2:"第2年 11月30日 00:00"},
    EP112:{2:"第2年 12月3日 10:00"},
    EP113:{1:"第2年 12月3日 10:00"},
    EP128:{2:"第2年 12月18日 00:00"},
    EP165:{2:"第3年 1月26日 00:00"},
    EP199:{2:"第3年 2月29日 00:00"},
    EP273:{2:"第3年 8月2日 00:00"},
    EP275:{2:"第3年 8月7日 00:00"},
    MOV04:{3:"第3年 3月8日 00:00"}
  };
  const NODE_FINISH={
    EP002:{4:"第1年 5月24日 00:00"},
    EP003:{2:"第1年 5月25日 00:00"},
    EP004:{4:"第1年 6月4日 00:00"},
    EP011:{2:"第1年 7月29日 00:00"},
    EP013:{4:"第1年 8月4日 00:00"},
    EP014:{2:"第1年 8月7日 00:00"},
    EP020:{2:"第1年 8月26日 00:00",4:"第1年 8月28日 00:00"},
    EP023:{3:"第1年 9月10日 00:00"},
    EP033:{3:"第1年 11月5日 00:00"},
    SP02:{3:"第1年 12月29日 00:00"},
    EP050:{2:"第2年 3月26日 00:00"},
    EP075:{2:"第2年 9月2日 00:00"},
    EP077:{4:"第2年 9月4日 00:00"},
    EP079:{3:"第2年 9月7日 00:00"},
    EP084:{1:"第2年 10月25日 00:00"},
    EP096:{1:"第2年 11月7日 00:00"},
    EP097:{1:"第2年 11月8日 00:00"},
    EP099:{2:"第2年 11月10日 00:00"},
    EP101:{2:"第2年 11月12日 00:00"},
    EP102:{1:"第2年 11月13日 00:00"},
    EP104:{2:"第2年 11月17日 00:00"},
    EP105:{2:"第2年 11月18日 00:00"},
    EP106:{2:"第2年 11月19日 00:00"},
    EP112:{1:"第2年 12月3日 10:00"},
    EP117:{2:"第2年 12月7日 00:00"},
    EP123:{1:"第2年 12月13日 00:00"},
    EP124:{1:"第2年 12月14日 00:00"},
    EP125:{1:"第2年 12月15日 00:00"},
    EP126:{1:"第2年 12月16日 00:00"},
    EP127:{1:"第2年 12月17日 00:00"},
    EP130:{1:"第2年 12月20日 00:00"},
    EP135:{1:"第2年 12月25日 00:00"},
    EP136:{1:"第2年 12月26日 00:00"},
    EP137:{1:"第2年 12月27日 00:00"},
    EP140:{1:"第2年 12月30日 00:00"},
    EP151:{1:"第3年 1月10日 00:00"},
    EP153:{1:"第3年 1月12日 00:00"},
    EP154:{1:"第3年 1月13日 00:00"},
    EP156:{1:"第3年 1月17日 00:00"},
    EP160:{1:"第3年 1月21日 00:00"},
    EP167:{1:"第3年 1月28日 00:00"},
    EP172:{2:"第3年 2月2日 00:00"},
    EP176:{1:"第3年 2月6日 00:00"},
    EP177:{2:"第3年 2月7日 00:00"},
    EP179:{1:"第3年 2月9日 00:00"},
    EP187:{1:"第3年 2月17日 00:00"},
    EP194:{2:"第3年 2月24日 00:00"},
    EP199:{1:"第3年 2月29日 00:00"},
    EP205:{1:"第3年 3月7日 00:00"},
    EP212:{1:"第3年 3月16日 00:00"},
    EP213:{1:"第3年 3月17日 00:00"},
    EP216:{1:"第3年 3月20日 00:00"},
    EP217:{1:"第3年 3月21日 00:00"},
    EP218:{1:"第3年 3月22日 00:00"},
    EP219:{1:"第3年 3月23日 00:00"},
    EP220:{1:"第3年 3月24日 00:00"},
    EP222:{1:"第3年 3月26日 00:00"},
    EP223:{2:"第3年 3月27日 00:00"},
    EP225:{1:"第3年 3月29日 00:00"},
    EP226:{1:"第3年 3月30日 00:00"},
    EP229:{1:"第3年 4月2日 00:00"},
    EP230:{1:"第3年 4月3日 00:00"},
    EP231:{1:"第3年 4月4日 00:00"},
    EP246:{1:"第3年 4月19日 00:00"},
    EP252:{2:"第3年 4月25日 00:00"},
    EP258:{2:"第3年 5月4日 00:00"},
    EP259:{1:"第3年 5月5日 00:00"},
    EP264:{1:"第3年 5月10日 00:00"},
    EP267:{1:"第3年 7月28日 00:00"},
    EP268:{1:"第3年 7月29日 00:00"},
    EP269:{1:"第3年 7月30日 00:00"},
    EP270:{1:"第3年 7月31日 00:00"},
    EP273:{1:"第3年 8月2日 00:00"},
    EP274:{2:"第3年 8月4日 00:00"},
    MOV04:{2:"第3年 3月8日 00:00"},
    MOV05:{5:"第3年 5月1日 00:00"}
  };
  function nodeMinimum(table,event,node){const v=table[event]?.[node];return v?date(v):null;}
  function onsetFailure(event,previous,nextState,end){
    const declared=String(nextState?.开始||nextState?.事件开始||'');
    const who=(declared.match(/(?:EP|SP|MOV)\d{2,3}/)||[])[0],start=date(declared),anchor=event.date;
    if(event.flexibleStart){
      if(who!==event.id||!start||!anchor||start.minute<event.startMinute||start.minute>event.lastStartMinute)
        return `${event.id} 的开始记录须写明事件 ID 和准备范围内实际发生的日期，不能指定范围外日期或强制首日。`;
    } else if(who!==event.id||!start||!anchor||(anchor.hasTime?(!start.hasTime||start.minute!==anchor.minute):(start.hasTime||start.day!==anchor.day)))
      return `${event.id} 的本幕结束时间已晚于开始窗口；请同时写“开始：${event.id}｜${anchor?.text||event.dateLabel}”，并在正文从该窗口开始演出；未指定时刻不得补造。`;
    if(start.minute>end.minute)return '事件开始记录不能晚于本幕结束时间。';
    if(previous&&(start.hasTime?start.minute<previous.minute:start.day<previous.day))return '事件开始记录早于前一条正文，不能倒填。';
    return '';
  }
  // Recheck the visible history, but never infer unseen story from a late snapshot.
  // This verifies structured timestamps and labels only; it cannot understand the prose.
  function inspectHistory(list,states,initialWorld){
    const indexes=Object.fromEntries(list.map((e,i)=>[e.id,i]));
    let last=null,previousTime=null,seenPlot=false;
    const baseline=date(initialWorld?.time);
    for(const st of states||[]){
      if(!st)continue;
      const text=String(st.剧情||''),free=FREE_RE.test(text),m=text.match(PLOT_RE),t=date(st.时间);
      if(!t||!t.hasTime)return '旧记录的状态栏缺少完整日期和时刻，不能推定其时间顺序。';
      if(previousTime&&t.minute<previousTime.minute)return '旧记录的正文时间倒退，不能自动补完或覆盖。';
      if(free){
        let allowed=false;
        if(!last)allowed=!!list[0]&&t.minute<list[0].startMinute;
        else if(last.status==='完成'){
          const next=list[indexes[last.id]+1];allowed=!next||t.minute<next.startMinute||(next.flexibleStart&&t.minute<=next.lastStartMinute);
        }else if(last.status==='节点完成'){
          const e=list[indexes[last.id]],nextNode=last.node<e.nodes.length?last.node+1:null;
          const open=nextNode&&nodeMinimum(NODE_OPEN,last.id,nextNode);
          allowed=!!open&&t.minute<open.minute;
        }
        if(!allowed)return '旧记录在固定事件或节点进行时标记了自由，不能据此推定节点已完成。';
        previousTime=t;continue;
      }
      if(!m||indexes[m[1]]===undefined)return '旧记录的剧情状态缺失、格式不明或事件不在当前世界书；无法核对节点顺序。';
      const id=m[1],node=Number(m[2]),status=m[3],i=indexes[id],e=list[i];
      if(!seenPlot){
        if(i!==0||node!==1)return `可见聊天从 ${id} 节点${node}开始，缺少主线起点；不能推定此前节点已发生，请恢复并核对完整记录。`;
        seenPlot=true;
      }
      if(status==='跳过')return `旧记录把 ${id} 标为跳过，不能视为已发生。`;
      if(node<1||node>e.nodes.length)return `旧记录的 ${id} 节点${node} 超出范围。`;
      if(status==='完成'&&node!==e.nodes.length)return `旧记录在 ${id} 最后一个节点之前标记整件事件完成。`;
      if(['完成','节点完成'].includes(status)&&st.__plotBodyPresent===false)return `旧记录只标记 ${id} 节点${node} 已完成，但没有可核对的正文。`;
      if(t.minute<e.startMinute)return `旧记录的 ${id} 时间早于固定开始窗口。`;
      const limit=Math.min(e.endMinute,list[i+1]?.lastStartMinute??Infinity);
      if(t.minute>limit)return `旧记录的 ${id} 时间越过事件范围或下一事件开始窗口。`;
      const open=nodeMinimum(NODE_OPEN,id,node),finish=nodeMinimum(NODE_FINISH,id,node);
      if(open&&t.minute<open.minute)return `旧记录的 ${id} 节点${node} 早于跨日开放时间。`;
      if(finish&&['完成','节点完成'].includes(status)&&t.minute<finish.minute)return `旧记录的 ${id} 节点${node} 早于跨日完成时间。`;
      if(!last||last.id!==id){
        const anchoredFirst=!last&&initialWorld?.event===id&&Number(initialWorld?.node||1)===1&&baseline&&baseline.minute===e.startMinute;
        const declared=String(st.开始||st.事件开始||'').trim();
        if((e.flexibleStart&&declared)||(t.minute>e.lastStartMinute&&!anchoredFirst)){
          const reason=onsetFailure(e,previousTime||baseline,st,t);if(reason)return '旧记录缺少可核对的开始记录：'+reason;
        }
      }
      last={id,node,status};previousTime=t;
    }
    return '';
  }
  function validate(book,pos,previousState,nextState,world={}){
    if(!pos||pos.finished)return {ok:true};
    const fail=reason=>({ok:false,reason,event:pos.event.id,node:pos.node});
    if(pos.conflict)return fail(pos.conflict+' 不能自动补写或跳过，请核对并编辑/重选已有状态后继续。');
    if(!nextState)return fail('回复缺少 <pkm_state>，无法校验时间和剧情节点。');
    const t=date(nextState.时间);
    if(!t||!t.hasTime)return fail('状态栏时间必须写完整日期和 HH:MM；不能猜测缺失时刻。');
    const prev=date(previousState?.时间||world.time);
    if(prev&&t.minute<prev.minute)return fail('正文时间倒退；请修正或重新生成，不会自动改写旧正文。');
    const g=String(nextState.剧情||''),m=g.match(PLOT_RE);
    if(FREE_RE.test(g)){
      const waitingForNode=pos.nodeNotBefore&&pos.nodeOpen&&t.minute<pos.nodeOpen.minute;
      const waitingForEvent=!pos.started&&(t.minute<pos.event.startMinute||(pos.event.flexibleStart&&t.minute<=pos.event.lastStartMinute));
      if(!waitingForNode&&!waitingForEvent)return fail(`固定事件 ${pos.event.id} 已开始或到达开始窗口，不能用“自由”掩盖待处理节点。`);
      if(t.minute>pos.limit)return fail('不能越过固定事件范围或下个事件的开始窗口。');
      return {ok:true};
    }
    if(!m)return fail('状态栏剧情格式无法识别；应写事件ID｜节点N｜进行中/节点完成/完成，或未到期时写自由｜节点0｜进行中。');
    if(m[3]==='跳过')return fail('新回复不能自动跳过固定主线节点。');
    if(['完成','节点完成'].includes(m[3])&&nextState.__plotBodyPresent===false)
      return fail('不能只靠状态标签认定剧情完成；需要有可核对的正文，不得凭空完成节点。');
    if(m[1]!==pos.event.id||Number(m[2])!==pos.node)
      return fail(`应处理 ${pos.event.id} 节点${pos.node}，不能跳到 ${m[1]} 节点${m[2]}。`);
    if(m[3]==='完成'&&pos.node!==pos.total)return fail(`只有演完 ${pos.event.id} 最后一个节点（${pos.total}）才能写“完成”。`);
    if(t.minute<pos.event.startMinute)return fail(`${pos.event.id} 尚未到固定开始时间 ${pos.event.dateLabel}。`);
    const nodeOpen=nodeMinimum(NODE_OPEN,pos.event.id,pos.node);
    if(nodeOpen&&t.minute<nodeOpen.minute)return fail(`${pos.event.id} 节点${pos.node}依原文跨日顺序，不应早于 ${nodeOpen.text}。`);
    const nodeFinish=nodeMinimum(NODE_FINISH,pos.event.id,pos.node);
    if(nodeFinish&&['节点完成','完成'].includes(m[3])&&t.minute<nodeFinish.minute)
      return fail(`${pos.event.id} 节点${pos.node}包含后续日期/时刻，不能在 ${nodeFinish.text} 前标完成。`);
    const declared=String(nextState.开始||nextState.事件开始||'').trim();
    if(!pos.started&&((pos.event.flexibleStart&&declared)||t.minute>pos.event.lastStartMinute)){
      // The status time denotes the end of this message, not the beginning of the scene.
      // A declared flexible onset is the actual date within the range, never the range's first day by default.
      const reason=onsetFailure(pos.event,prev,nextState,t);if(reason)return fail(reason);
    }
    if(t.minute>pos.limit)return fail(`${pos.event.id} 尚未结束，时间不能越过它的明确结束范围或下一事件的开始窗口。`);
    return {ok:true,event:m[1],node:Number(m[2]),status:m[3]};
  }
  const api={PLOT_RE,FREE_RE,date,makeEvents,position,validate,NODE_OPEN,NODE_FINISH};root.PKMPlotGuard=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
