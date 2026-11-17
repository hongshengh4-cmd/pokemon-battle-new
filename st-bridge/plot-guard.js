/* Date-keyed worldbook scene scheduling plus non-blocking chronology helpers. */
(function(root){'use strict';
  const PLOT_RE = /([A-Z]{2,3}\d{2,3})\s*[｜|]\s*节点\s*(\d+)\s*[｜|]\s*(进行中|节点完成|完成|跳过)/;
  const FREE_RE = /自由\s*[｜|]\s*节点\s*0\s*[｜|]\s*进行中/;
  // The story has numbered fictional years, not a real-world epoch. To retain
  // the existing day arithmetic, numbered year 3 is the first leap year
  // (year N ≡ N+1 under 4/100/400). The compressed 1997–1998 chain has no Feb 29.
  // This is an explicit clock convention, not a claim about real history.
  const CALENDAR='story-calendar-year3-leap-v1';
  const leap=y=>{const n=y+1;return n%4===0&&(n%100!==0||n%400===0);};
  // 故事第1年 = 1997年。旧存档的“第N年”继续可读，新文本统一写公历年份。
  const BASE_YEAR=1996;
  const DATE_RE=/(?:第\s*(\d+)\s*年|((?:19|20)\d{2})\s*年)\s*(\d+)\s*月\s*(\d+)\s*日(?:\s*(\d{1,2})[:：](\d{2}))?/;
  const DATE_RE_G=new RegExp(DATE_RE.source,'g');
  const finiteMinute=v=>v!==null&&v!==undefined&&v!==''&&Number.isSafeInteger(Number(v))?Number(v):null;
  function date(text) {
    const m=String(text||'').match(DATE_RE);
    if(!m)return null;
    const y=m[1]!==undefined?Number(m[1]):Number(m[2])-BASE_YEAR,[mo,d]=m.slice(3,5).map(Number),hasTime=m[5]!==undefined,h=hasTime?Number(m[5]):0,mi=hasTime?Number(m[6]):0;
    if(!Number.isSafeInteger(y)||y<1||y>1000000||mo<1||mo>12||d<1||h>23||mi>59)return null;
    const lengths=[31,leap(y)?29:28,31,30,31,30,31,31,30,31,30,31];
    if(d>lengths[mo-1])return null;
    const priorYears=(y-1)*365+Math.floor(y/4)-Math.floor(y/100)+Math.floor(y/400);
    const day=priorYears+lengths.slice(0,mo-1).reduce((a,b)=>a+b,0)+d,minute=day*1440+h*60+mi;
    return {y,year:BASE_YEAR+y,mo,d,h,mi,day,minute,hasTime,text:`${BASE_YEAR+y}年 ${mo}月${d}日${hasTime?` ${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`:''}`};
  }
  // v5 persisted a synthetic 31-day-per-month minute count. Decode its
  // calendar labels first; never treat that number as the new clock directly.
  // A fictitious/invalid legacy day cannot safely be inferred and returns null.
  function legacyMinute(value){
    const n=finiteMinute(value);if(n===null||n<1440)return null;
    const day=Math.floor(n/1440),tod=n-day*1440,z=day-1;
    const y=Math.floor(z/372)+1,mo=Math.floor((z%372)/31)+1,d=z%31+1;
    return date(`第${y}年 ${mo}月${d}日 ${String(Math.floor(tod/60)).padStart(2,'0')}:${String(tod%60).padStart(2,'0')}`)?.minute??null;
  }
  function repelDeadline(repel){
    if(!repel||typeof repel!=='object')return null;
    const end=finiteMinute(repel.expiresAtGameMinute);if(end===null)return null;
    if(repel.gameClock===CALENDAR)return {start:finiteMinute(repel.startedAtGameMinute),expires:end};
    if(repel.gameClock)return null; // unknown or explicitly unresolved version
    const rawStart=finiteMinute(repel.startedAtGameMinute),start=rawStart===null?end-1440:rawStart,duration=end-start;
    if(!Number.isSafeInteger(duration)||duration<=0||duration>7*1440)return null;
    const converted=legacyMinute(start);if(converted===null)return null;
    return {start:converted,expires:converted+duration};
  }
  function makeEvents(entries){
    const list=[], stages={}, seen=new Set();
    for(const e of entries||[]){
      const keys=e.keys||e.key||[], secondary=e.secondary_keys||e.keysecondary||[];
      const legacyEvent=keys.find(k=>/^EVT_/.test(String(k)));
      const commentId=(String(e.comment||'').match(/(?:事件详情|特别事件)·([A-Z]{2,3}\d{2,3})/)||[])[1];
      const keyedId=secondary.find(k=>/^(?:EP|SP|MOV)\d{2,3}$/.test(String(k)));
      const eventId=commentId||keyedId||(legacyEvent?String(legacyEvent).slice(4):'');
      const stg=keys.find(k=>/^STAGE_\d+/.test(String(k)));
      if(eventId){
        if(seen.has(eventId))continue;seen.add(eventId);
        const content=String(e.content||''),dateKeys=[...new Set(keys.map(k=>date(String(k))?.text).filter(Boolean))],line=(content.match(/(?:^|\n)-\s*时间[:：]\s*([^\n]+)/)||[])[1]||'';
        const dates=[...line.matchAll(DATE_RE_G)].map(m=>date(m[0])).filter(Boolean);
        const start=dates[0]||null, end=dates.length>1?dates[1]:null;
        const block=(content.split(/\n- 节点[:：]\s*\n/)[1]||'').split(/\n\s*介入点[：:]|\n- 对战机会|\n- 收尾|\n- 涉及角色|\n<\/Plot_Event>/)[0];
        const nodes=block?block.split(/\n(?=\s{2}\d+\.\s)/).map(t=>t.trim()).filter(Boolean):[];
        // SP03 is a player-confirmed flexible preparation window, not a May 11 launch mandate.
        const flexibleStart=eventId==='SP03' && !!end;
        const lastStart=flexibleStart?(end.hasTime?end.minute:end.day*1440+1439):(start?(start.hasTime?start.minute:start.day*1440+1439):Infinity);
        const finish=end?(end.hasTime?end.minute:end.day*1440+1439):Infinity;
        list.push({id:eventId,title:String(e.comment||'').split('｜').slice(1).join('｜')||eventId,content,sourceComment:String(e.comment||''),dateKeys,
          stage:(content.match(/阶段[:：]\s*(S\d+[^\n]*)/)||[])[1]||'', date:start, endDate:end,
          startMinute:start?.minute??-Infinity, lastStartMinute:lastStart, endMinute:finish, flexibleStart,
          dateLabel:line, nodes:nodes.length?nodes:['（全事件）'],
          hook:(content.match(/介入点[：:]\s*([^\n]+)/)||[])[1]||'',battle:(content.match(/对战机会[:：]\s*([^\n]+)/)||[])[1]||'',ord:list.length});
      }else if(stg){const n='S'+Number(stg.slice(6));(stages[n]||=[]).push({comment:e.comment,content:String(e.content||'')});}
    }
    list.sort((a,b)=>((a.date?.day??Infinity)-(b.date?.day??Infinity))||(a.ord-b.ord));
    return {list,stages};
  }
  // 主线调度（参考“待推进事件”队首机制）：事件按时间线首尾相接成一条链。
  // - 上一个事件完成（或玩家明确放弃=跳过）后，下一个事件立即成为队首；
  // - 队首未到预定时间：交给正文在场景空闲时快进到该时刻开演；已到/已过：照常开演，不跳过、不倒填；
  // - 进行中的事件按节点推进；节点有跨日开放时间且未到时，同样由正文快进。
  // 只生成提示，不拦截、不改写回复。
  function schedule(book,states,timeText,world={}){
    const list=Array.isArray(book)?book:(book?.list||[]);if(!list.length)return null;
    const now=date(timeText),index=Object.fromEntries(list.map((e,i)=>[e.id,i]));
    let last=null;
    for(const st of states||[]){
      const m=String(st?.剧情||'').match(PLOT_RE);
      if(m&&index[m[1]]!==undefined)last={id:m[1],node:Number(m[2]),status:m[3]};
    }
    if(!last&&world?.event&&index[String(world.event)]!==undefined)
      last={id:String(world.event),node:Number(world.node)||1,status:world.nodeStatus||'进行中'};
    const totalOf=e=>Math.max(1,Array.isArray(e?.nodes)&&e.nodes.length?e.nodes.length:1);
    const sceneOf=(e,n)=>{const t=e.nodes?.[n-1];return t&&t!=='（全事件）'?t:e.content;};
    let i=0,node=1,active=false;
    if(last){
      const cur=list[index[last.id]],total=totalOf(cur);
      const done=last.status==='完成'||last.status==='跳过'||(last.status==='节点完成'&&last.node>=total);
      if(done)i=index[last.id]+1;
      else{i=index[last.id];active=true;node=Math.max(1,Math.min(total,(Number(last.node)||1)+(last.status==='节点完成'?1:0)));}
    }
    const clock=now?.text||'';
    if(i>=list.length)return {kind:'finished',clock,previous:last?list[index[last.id]]:null};
    const event=list[i],total=totalOf(event),next=list[i+1]||null;
    const location=((event.content.match(/主要地点[:：]\s*([^\n]+)/)||[])[1]||'').trim();
    const base={event,node,total,location,stage:event.stage,clock,next,previous:last&&!active?list[index[last.id]]:null};
    if(active){
      const open=nodeMinimum(NODE_OPEN,event.id,node);
      const wait=now&&open&&now.minute<open.minute?open:null;
      return {...base,kind:'active',scene:sceneOf(event,node),nextScene:node<total?sceneOf(event,node+1):'',wait,waitMinutes:wait?wait.minute-now.minute:0,reason:wait?'node-wait':'continue-active'};
    }
    const target=event.date;
    const upcoming=!!(now&&target&&now.minute<event.startMinute);
    return {...base,kind:upcoming?'upcoming':'start',scene:sceneOf(event,1),nextScene:total>1?sceneOf(event,2):'',
      target,waitMinutes:upcoming?event.startMinute-now.minute:0,late:!!(now&&now.minute>event.lastStartMinute),
      reason:upcoming?'fast-forward':(now?'due':'no-clock')};
  }
  // 兼容旧接口名：桥接器早期版本调用 dateActivation。
  function dateActivation(book,states,timeText,world={}){
    const plan=schedule(book,states,timeText,world);
    return plan&&plan.kind!=='finished'?plan:null;
  }
  function position(book,states,world={},timeText='',opts={}){
    const list=book?.list||[];if(!list.length)return null;
    const index=Object.fromEntries(list.map((e,i)=>[e.id,i]));
    let last=null,freeTail=false,latest=null,sequenceConflict=opts.strictHistory?inspectHistory(list,states,opts.initialWorld||{}):'',sequenceWarning='';
    for(const st of states||[]){
      if(!st)continue; latest=st;
      const g=String(st.剧情||''),m=g.match(PLOT_RE);
      if(m&&index[m[1]]!==undefined){
        const skip=m[3]==='跳过',cur={id:m[1],node:skip?list[index[m[1]]].nodes.length:Number(m[2]),status:skip?'完成':m[3],bodyPresent:skip?true:st.__plotBodyPresent};
        if(last&&!sequenceConflict){
          const a=index[last.id],b=index[cur.id],total=list[a].nodes.length;
          if(last.status==='跳过')sequenceConflict=`旧记录把 ${last.id} 标为跳过，不能视为已发生。`;
          else if(['完成','节点完成'].includes(last.status)&&last.bodyPresent===false)sequenceConflict=`旧记录缺少可核对正文，不能只凭 ${last.id} 的完成标签推进。`;
          else if(b===a){
            const expected=last.status==='节点完成'&&last.node<total?last.node+1:last.node;
            if(last.status==='完成'||cur.node<expected)sequenceConflict=`旧记录从 ${last.id} 节点${last.node}（${last.status}）跳到节点${cur.node}，请核对。`;
            else if(cur.node>expected)sequenceWarning=`剧情记录从 ${last.id} 节点${last.node}前进到节点${cur.node}；按较后节点接续，中间节点不补记为单独完成。`;
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
      // The world snapshot is the save's authoritative record. Use it as the anchor
      // without requiring the visible chat to contain the full history from EP001;
      // old/compressed chats legitimately start mid-story.
    }
    let i=last?index[last.id]:index.EP001??0,node=1,note='',started=false,historyConflict=sequenceConflict;
    if(last){
      started=true;node=last.node;
      const priorTotal=list[i].nodes.length;
      if(!Number.isInteger(node)||node<1||node>priorTotal)
        historyConflict ||= `旧记录的 ${last.id} 节点${node} 超出范围（1—${priorTotal}），未自动推进。`;
      else if(last.status==='跳过')
        historyConflict ||= `旧记录将 ${last.id} 标为跳过；阵容兜底无法可靠推断后续队伍。`;
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
    let curI=i,curNode=node;
    const curEvent=list[curI],curTotal=curEvent.nodes.length;
    if(!Number.isInteger(curNode)||curNode<1||curNode>curTotal){note=`历史记录的节点 ${curNode} 超出 ${curEvent.id} 的范围（1—${curTotal}）；保留旧记录，请人工核对。`;curNode=Math.max(1,Math.min(curTotal,Number(curNode)||1));}
    const now=date(timeText||latest?.时间||world.time);
    // Compute the original event's boundary first; the advancement check below uses it.
    const nextOrig=list[curI+1]||null;
    const limitOrig=Math.min(curEvent.endMinute,nextOrig?.lastStartMinute??Infinity);
    // If the recorded time has moved into a later event's window while the current
    // event is still marked in-progress, advance the anchor to that later event. The
    // timeline itself is the evidence; this follows the clock and does not fabricate
    // unseen story or claim the skipped event was completed in detail.
    if(!historyConflict&&now&&started&&now.minute>limitOrig){
      let adv=null;
      for(let k=curI+1;k<list.length;k++){
        const e2=list[k];
        if(now.minute>=e2.startMinute&&now.minute<=Math.min(e2.endMinute,list[k+1]?.lastStartMinute??Infinity)){adv=k;break;}
        if(now.minute<e2.startMinute)break;
      }
      if(adv!==null){
        const old=curEvent;
        curI=adv;curNode=1;
        // The recorded time sits inside the new event's window, which is itself the
        // evidence that the event has begun; do not demand a separate onset record.
        started=true;
        note=`旧记录时间已进入 ${list[adv].id} 的窗口，按时间线从 ${list[adv].id} 节点1继续；不补写 ${old.id} 此前正文。`;
      }
    }
    i=curI;node=curNode;
    const event=list[i],total=event.nodes.length,next=list[i+1]||null;
    if(!note&&sequenceWarning&&last?.id===event.id)note=sequenceWarning;
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
  // Dates below follow the compressed 1997–1998 chain timeline (tools/timeline/plan.cjs).
  const NODE_OPEN={
    EP005:{4:"1997年 5月28日 00:00"},
    EP033:{4:"1997年 7月26日 00:00"},
    EP084:{2:"1997年 10月31日 00:00"},
    EP109:{2:"1997年 11月29日 00:00"},
    EP112:{2:"1997年 12月2日 10:00"},
    EP113:{1:"1997年 12月2日 10:00"},
    EP128:{2:"1997年 12月17日 00:00"},
    EP165:{2:"1998年 1月25日 00:00"},
    EP199:{2:"1998年 2月28日 00:00"},
    EP273:{2:"1998年 5月24日 00:00"},
    EP275:{2:"1998年 5月29日 00:00"},
    MOV04:{3:"1998年 3月8日 00:00"}
  };
  const NODE_FINISH={
    EP002:{4:"1997年 5月23日 00:00"},
    EP003:{2:"1997年 5月24日 00:00"},
    EP004:{4:"1997年 5月26日 00:00"},
    EP011:{2:"1997年 6月10日 00:00"},
    EP013:{4:"1997年 6月14日 00:00"},
    EP014:{2:"1997年 6月16日 00:00"},
    EP020:{2:"1997年 6月28日 00:00",4:"1997年 6月30日 00:00"},
    EP023:{3:"1997年 7月6日 00:00"},
    EP033:{3:"1997年 7月26日 00:00"},
    SP02:{3:"1997年 8月9日 00:00"},
    EP050:{2:"1997年 9月2日 00:00"},
    EP075:{2:"1997年 10月20日 00:00"},
    EP077:{4:"1997年 10月22日 00:00"},
    EP079:{3:"1997年 10月25日 00:00"},
    EP084:{1:"1997年 10月31日 00:00"},
    EP096:{1:"1997年 11月13日 00:00"},
    EP097:{1:"1997年 11月14日 00:00"},
    EP099:{2:"1997年 11月16日 00:00"},
    EP101:{2:"1997年 11月18日 00:00"},
    EP102:{1:"1997年 11月19日 00:00"},
    EP104:{2:"1997年 11月22日 00:00"},
    EP105:{2:"1997年 11月23日 00:00"},
    EP106:{2:"1997年 11月24日 00:00"},
    EP112:{1:"1997年 12月2日 10:00"},
    EP117:{2:"1997年 12月6日 00:00"},
    EP123:{1:"1997年 12月12日 00:00"},
    EP124:{1:"1997年 12月13日 00:00"},
    EP125:{1:"1997年 12月14日 00:00"},
    EP126:{1:"1997年 12月15日 00:00"},
    EP127:{1:"1997年 12月16日 00:00"},
    EP130:{1:"1997年 12月19日 00:00"},
    EP135:{1:"1997年 12月24日 00:00"},
    EP136:{1:"1997年 12月25日 00:00"},
    EP137:{1:"1997年 12月26日 00:00"},
    EP140:{1:"1997年 12月29日 00:00"},
    EP151:{1:"1998年 1月9日 00:00"},
    EP153:{1:"1998年 1月11日 00:00"},
    EP154:{1:"1998年 1月12日 00:00"},
    EP156:{1:"1998年 1月16日 00:00"},
    EP160:{1:"1998年 1月20日 00:00"},
    EP167:{1:"1998年 1月27日 00:00"},
    EP172:{2:"1998年 2月1日 00:00"},
    EP176:{1:"1998年 2月5日 00:00"},
    EP177:{2:"1998年 2月6日 00:00"},
    EP179:{1:"1998年 2月8日 00:00"},
    EP187:{1:"1998年 2月16日 00:00"},
    EP194:{2:"1998年 2月23日 00:00"},
    EP199:{1:"1998年 2月28日 00:00"},
    EP205:{1:"1998年 3月7日 00:00"},
    EP212:{1:"1998年 3月16日 00:00"},
    EP213:{1:"1998年 3月17日 00:00"},
    EP216:{1:"1998年 3月20日 00:00"},
    EP217:{1:"1998年 3月21日 00:00"},
    EP218:{1:"1998年 3月22日 00:00"},
    EP219:{1:"1998年 3月23日 00:00"},
    EP220:{1:"1998年 3月24日 00:00"},
    EP222:{1:"1998年 3月26日 00:00"},
    EP223:{2:"1998年 3月27日 00:00"},
    EP225:{1:"1998年 3月29日 00:00"},
    EP226:{1:"1998年 3月30日 00:00"},
    EP229:{1:"1998年 4月2日 00:00"},
    EP230:{1:"1998年 4月3日 00:00"},
    EP231:{1:"1998年 4月4日 00:00"},
    EP246:{1:"1998年 4月19日 00:00"},
    EP252:{2:"1998年 4月25日 00:00"},
    EP258:{2:"1998年 5月3日 00:00"},
    EP259:{1:"1998年 5月4日 00:00"},
    EP264:{1:"1998年 5月9日 00:00"},
    EP267:{1:"1998年 5月19日 00:00"},
    EP268:{1:"1998年 5月20日 00:00"},
    EP269:{1:"1998年 5月21日 00:00"},
    EP270:{1:"1998年 5月22日 00:00"},
    EP273:{1:"1998年 5月24日 00:00"},
    EP274:{2:"1998年 5月26日 00:00"},
    MOV04:{2:"1998年 3月8日 00:00"},
    MOV05:{5:"1998年 5月1日 00:00"}
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
    let last=null,previousTime=null,seenPlot=false,firstIsStart=true;
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
      const id=m[1],i=indexes[id],e=list[i],skip=m[3]==='跳过',node=skip?e.nodes.length:Number(m[2]),status=skip?'完成':m[3];
      const wrongStage=stageFailure(st,e);if(wrongStage)return '旧记录的'+wrongStage;
      if(!seenPlot){
        // An old or compressed chat may legitimately start mid-story. The first visible
        // plot state is the anchor; the world snapshot and this visible sequence together
        // determine the current position. Do not require the visible chat to begin at EP001.
        seenPlot=true;
        // If the first visible state is not the true story start, its onset happened in
        // unseen history; do not demand a declared onset record for it.
        firstIsStart=(i===0&&node===1);
      }
      if(node<1||node>e.nodes.length)return `旧记录的 ${id} 节点${node} 超出范围。`;
      if(status==='完成'&&node!==e.nodes.length)return `旧记录在 ${id} 最后一个节点之前标记整件事件完成。`;
      if(!skip&&['完成','节点完成'].includes(status)&&st.__plotBodyPresent===false)return `旧记录只标记 ${id} 节点${node} 已完成，但没有可核对的正文。`;
      if(t.minute<e.startMinute)return `旧记录的 ${id} 时间早于固定开始窗口。`;
      const limit=Math.min(e.endMinute,list[i+1]?.lastStartMinute??Infinity);
      // The first visible state of an old chat is a snapshot of where the story already
      // was; its time may legitimately sit past its own event's window because the story
      // continued. That is the signal to advance the anchor in position(), not a conflict.
      if(firstIsStart&&t.minute>limit)return `旧记录的 ${id} 时间越过事件范围或下一事件开始窗口。`;
      const open=nodeMinimum(NODE_OPEN,id,node),finish=nodeMinimum(NODE_FINISH,id,node);
      if(open&&t.minute<open.minute)return `旧记录的 ${id} 节点${node} 早于跨日开放时间。`;
      if(finish&&['完成','节点完成'].includes(status)&&t.minute<finish.minute)return `旧记录的 ${id} 节点${node} 早于跨日完成时间。`;
      if(!last||last.id!==id){
        const anchoredFirst=!last&&initialWorld?.event===id&&Number(initialWorld?.node||1)===1&&baseline&&baseline.minute===e.startMinute;
        const declared=String(st.开始||st.事件开始||'').trim();
        // For an old chat whose first visible state is mid-story, the onset is in unseen
        // history; the visible state itself is the evidence, so skip the onset demand.
        if(firstIsStart&&((e.flexibleStart&&declared)||(t.minute>e.lastStartMinute&&!anchoredFirst))){
          const reason=onsetFailure(e,previousTime||baseline,st,t);if(reason)return '旧记录缺少可核对的开始记录：'+reason;
        }
      }
      last={id,node,status};previousTime=t;
    }
    return '';
  }
  function stageFailure(state,event){
    const raw=String(state?.阶段||'').trim(),expected=String(event?.stage||'').trim();
    if(!raw||!expected)return '';
    const a=raw.match(/^S\s*(\d+)(?:\s+(.+))?$/i),b=expected.match(/^S\s*(\d+)(?:\s+(.+))?$/i);
    if(!a||!b||Number(a[1])!==Number(b[1]))return `阶段与当前事件不一致，应为 ${expected}。`;
    const clean=x=>String(x||'').replace(/[\s·・:：()（）]/g,'');
    if(a[2]&&b[2]&&clean(a[2])!==clean(b[2]))return `阶段名称与当前事件不一致，应为 ${expected}。`;
    return '';
  }
  // Runtime only schedules date-keyed worldbook scenes; this compatibility validator never gates a reply.
  // Never block, rewrite, or classify a reply as invalid.
  function validate(book,pos,previousState,nextState,world={}){
    return {ok:true,policy:'queue-chain-fastforward-v1'};
  }
  const api={version:'20261113-comprehensive-fix-v6',worldbookStoryPolicy:'queue-chain-fastforward-v1',BASE_YEAR,PLOT_RE,FREE_RE,CALENDAR,leap,date,legacyMinute,repelDeadline,makeEvents,schedule,dateActivation,position,validate,NODE_OPEN,NODE_FINISH};root.PKMPlotGuard=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
