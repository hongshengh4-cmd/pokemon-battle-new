// Native move-detail sheet; mechanics text belongs to the pinned Showdown source.
// No second damage/status/target engine and no obsolete "not implemented" claims.
(function(global){
  'use strict';
  let DESC={};
  const TYPE_ZH={Normal:'一般',Fire:'火',Water:'水',Electric:'电',Grass:'草',Ice:'冰',Fighting:'格斗',Poison:'毒',Ground:'地面',Flying:'飞行',Psychic:'超能力',Bug:'虫',Rock:'岩石',Ghost:'幽灵',Dragon:'龙',Dark:'恶',Steel:'钢',Fairy:'妖精',Stellar:'星晶','???':'？？？'};
  const CAT_ZH={Physical:'物理',Special:'特殊',Status:'变化'};
  const TARGET_ZH={normal:'选择相邻的其他宝可梦',any:'选择其他宝可梦',randomNormal:'随机对手',adjacentFoe:'选择相邻对手',allAdjacentFoes:'所有相邻对手',allAdjacent:'所有相邻宝可梦（包括同伴）',self:'自己',adjacentAllyOrSelf:'自己或相邻同伴',allies:'己方在场宝可梦',allyTeam:'己方全队',allySide:'己方场地',foeSide:'对方场地',all:'整个战场',scripted:'由招式效果决定',adjacentAlly:'相邻同伴'};
  function setDesc(d){DESC=d&&typeof d==='object'?d:{}}
  function descOf(move,baseId){for(const id of [move?.id,baseId,String(move?.id||'').startsWith('hiddenpower')?'hiddenpower':''].filter(Boolean))if(DESC[id])return DESC[id];return ''}
  function effectLines(move){
    const lines=[],notes=[],warns=[];
    if(!global.PKMBattle?.rulesEngine?.ready)return{lines,notes,warns:['规则内核未就绪；请完整覆盖修复包，不会回退到旧版简化规则。']};
    const entry=global.PKMShowdownText?.moves?.[move.id]||global.PKMShowdownText?.moves?.[move._baseId];
    if(entry?.zh)lines.push(entry.zh);
    else if(entry?.desc||entry?.shortDesc)lines.push(entry.desc||entry.shortDesc);
    else lines.push('效果由已锁定版本的Showdown内核执行；无额外的旧版简化结算。');
    if(entry?.zh&&entry?.desc)notes.push('Showdown 原文：'+entry.desc);
    notes.push('规则基准：Showdown 5b88c476113d；第9世代基础＋过往招式。Mega／Z／极巨／太晶并存是本卡保留的混合规则，不代表某一代卡带赛制。');
    if(move._isZ)notes.push('Ｚ招式使用内核的威力、目标和变化招式附加效果；每队限一次。');
    if(move._isMax)notes.push('极巨招式显示内核的对应威力与目标；剩余PP来自原招式。');
    if(!entry?.zh)notes.push('尚未汉化的机制说明保留Showdown原文，避免用旧版近似说明冒充准确规则。');
    return{lines,notes,warns};
  }
  function matchup(move,user,foe){
    if(!user||!foe||foe.fainted)return null;
    return{lines:['伤害、免疫、动态威力和追加效果由Showdown按实际战场结算；这里不再把旧版近似公式当成准确伤害预报。'],warns:[]};
  }
  function describe(move,ctx={}){
    const{user=null,foe=null,baseMove=null}=ctx,zhType=ctx.zhType||(t=>TYPE_ZH[t]||t),zhCat=ctx.zhCat||(c=>CAT_ZH[c]||c),ppm=baseMove||move;
    const rows=[['属性',zhType(move.type)],['分类',zhCat(move.category)],['基础威力',move.basePower?String(move.basePower):move.category==='Status'?'—':'随效果决定'],['命中',move.accuracy===true||move.accuracy==null?'不进行常规命中判定':move.accuracy+'%'],['招式点数',ppm.id==='struggle'?'—':`${ppm.ppLeft??ppm.pp}/${ppm.pp}`],['先制度',move.priority?(move.priority>0?'+':'')+move.priority:'0'],['对象',TARGET_ZH[move.target]||move.target||'由效果决定']];
    const fx=effectLines(move);
    return{name:ctx.name||global.PKMShowdownText?.moves?.[move.id]?.name||move.name,type:move.type,category:move.category,rows,desc:descOf(move,baseMove?.id),effects:fx.lines,notes:fx.notes,warns:fx.warns,matchup:matchup(move,user,foe),foeName:ctx.foeName||foe?.name||''};
  }
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function html(info){
    const li=arr=>arr.map(x=>`<li>${esc(x)}</li>`).join(''),m=info.matchup;
    const mu=m&&(m.lines.length||m.warns.length)?`<section class="mi-sec mi-matchup"><h4>对 ${esc(info.foeName)}</h4><ul>${li(m.lines)}${m.warns.map(w=>`<li class="mi-warn">⚠ ${esc(w)}</li>`).join('')}</ul></section>`:'';
    return `<header class="mi-head"><span class="mi-name">${esc(info.name)}</span><span class="mi-type">${esc(info.rows[0][1])}</span><span class="mi-cat cat-${esc(String(info.category).toLowerCase())}">${esc(info.rows[1][1])}</span></header>`
      +`<dl class="mi-rows">${info.rows.slice(2).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      +(info.desc?`<p class="mi-desc">${esc(info.desc)}</p>`:'')
      +(info.effects.length?`<section class="mi-sec"><h4>内核效果</h4><ul>${li(info.effects)}</ul></section>`:'')
      +(info.notes.length?`<section class="mi-sec mi-notes"><h4>规则说明与边界</h4><ul>${li(info.notes)}</ul></section>`:'')
      +(info.warns.length?`<section class="mi-sec mi-warns"><ul>${info.warns.map(w=>`<li class="mi-warn">⚠ ${esc(w)}</li>`).join('')}</ul></section>`:'')+mu;
  }
  function tooltip(info){return[`${info.name}（${info.rows[0][1]}·${info.rows[1][1]}）`,info.effects.join('；')||info.desc,'长按或点 ⓘ 查看详细说明'].filter(Boolean).join('\n')}
  global.PKMMoveInfo={setDesc,describe,html,tooltip,effectLines,matchup,_desc:()=>DESC};
})(typeof window!=='undefined'?window:globalThis);
