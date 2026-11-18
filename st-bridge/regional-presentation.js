/* Layout adapter, not a replacement dex/bag/NPC/trainer renderer.
   The original status.js owns each pane, event handler, UI state and poll. */
(()=>{'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={dex:'宝可梦图鉴',bag:'旅行背包',map:'旅途地图',near:'附近探索',aff:'好感',tr:'训练家资料'};
 function ensureShell(win,el){
  if(el.dataset.nativeRegion!=='johto')return;
  const dex=el.firstElementChild;if(!dex?.classList.contains('pkdex'))return;
  if(!dex.querySelector('#johtoCard')){
   dex.insertAdjacentHTML('beforeend',window.PKMRegionalPresentationAssets.exterior);
   const card=dex.querySelector('#johtoCard'),toggles=[...card.querySelectorAll('[data-case-toggle]')],unlock=card.querySelector('#blueUnlock');
   const setClosed=closed=>{
    closed=!!closed;const restoreFocus=toggles.includes(win.document.activeElement)||win.document.activeElement===unlock;
    win.__johtoCaseClosed=closed;card.classList.toggle('closed',closed);
    for(const button of toggles){const active=button.dataset.caseToggle===(closed?'closed':'open');button.disabled=!active;button.inert=!active;button.tabIndex=active?0:-1;button.setAttribute('aria-hidden',String(!active));button.setAttribute('aria-expanded',String(!closed));button.setAttribute('aria-label',closed?'展开图鉴':'收起图鉴');button.title=closed?'点击顶部凸起展开图鉴':'点击顶部凸起收起图鉴';}
    card.querySelector('#upperInside').inert=closed;card.querySelector('#lowerLcd').inert=closed;unlock.inert=!closed;unlock.tabIndex=closed?0:-1;
    if(restoreFocus)win.requestAnimationFrame(()=>toggles.find(button=>!button.disabled)?.focus({preventScroll:true}));report(win,el);
   };
   toggles.forEach(button=>button.onclick=()=>setClosed(!card.classList.contains('closed')));unlock.onclick=()=>setClosed(false);setClosed(!!win.__johtoCaseClosed);
   const buttons=[...card.querySelectorAll('[data-native-tab]')];
   buttons.forEach(b=>{b.onclick=()=>{const native=dex.querySelector('.dx-tabs [data-t="'+b.dataset.nativeTab+'"]');if(native){setClosed(false);native.click();}};b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=buttons.indexOf(b),n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[n].click();buttons[n].focus({preventScroll:true});};});
  }
  const slot=dex.querySelector('#nativeSlot'),shell=dex.querySelector('.dx-shell');if(slot&&shell&&shell.parentNode!==slot)slot.append(shell);
 }
 function beforeDraw(win,el){
  // Put the actual detail node back before the native data redraw replaces its
  // dex pane. No cloning, hand-recreated detail HTML, or stale event handlers.
  const dex=el.firstElementChild,detail=dex?.querySelector('#upperContent>.dex-info'),wrap=dex?.querySelector('[data-p=dex] .dex-wrap');
  if(detail){if(wrap)wrap.append(detail);else detail.remove();}
 }
 function decorateTrainer(win,el){
  const card=el.querySelector('[data-p=tr] .tcard');if(!card)return;
  const body=card.children[1];if(body&&!body.classList.contains('tc-body'))body.classList.add('tc-body');
  if(body&&!body.querySelector('.tc-identity')){
   const identity=win.document.createElement('div');identity.className='tc-identity';
   const nodes=['.tc-id','.tc-name','.tc-title'].map(s=>body.querySelector(s)).filter(Boolean);if(nodes[0])nodes[0].before(identity);nodes.forEach(n=>identity.append(n));
  }
 }
 function info(win,el,UI,S,I){
  if(el.dataset.nativeRegion!=='johto')return;
  ensureShell(win,el);const upper=el.querySelector('#upperContent');if(!upper||!I)return;
  for(const old of upper.querySelectorAll(':scope>.dex-info'))if(old!==I)old.remove();
  if(I.parentNode!==upper)upper.append(I);
  I.hidden=UI.tab!=='dex';I.setAttribute('aria-label','原版图鉴完整宝可梦资料');
  const hint=el.querySelector('#upperHint');if(hint)hint.textContent='原版完整资料 · 可滚动';
  const title=el.querySelector('#upperModeTitle');if(title)title.textContent='POKÉDEX / No.'+String(UI.sel).padStart(3,'0');
  const summary=upper.querySelector('.native-upper-summary');if(summary)summary.hidden=true;
  el.querySelector('[data-p=dex] .dex-grid')?.querySelectorAll('.cell').forEach(c=>{c.setAttribute('aria-pressed',String(+c.dataset.n===UI.sel));});
 }
 function upperSummary(win,el,UI,S){
  const upper=el.querySelector('#upperContent');if(!upper)return;
  const detail=upper.querySelector(':scope>.dex-info');if(detail)detail.hidden=true;
  let summary=upper.querySelector('.native-upper-summary');if(!summary){summary=win.document.createElement('div');summary.className='native-upper-summary';upper.append(summary);}summary.hidden=false;
  const region='城都',p=S.player,w=S.world;
  const title=el.querySelector('#upperModeTitle'),hint=el.querySelector('#upperHint');title.textContent=({bag:'ITEMS',map:'REGIONAL MAP',near:'NEARBY',aff:'好感',tr:'TRAINER CARD'})[UI.tab]||'JOHTO';hint.textContent='城都地区 · 共享旅程存档';
  let body='';
  if(UI.tab==='bag')body='<p>四个口袋、库存、道具确认与长按拖用，全部由原生背包处理。</p><div class="native-upper-facts"><span>持有金钱</span><b>₽ '+p.money.toLocaleString()+'</b><span>库存种类</span><b>'+p.bag.reduce((n,a)=>n+a.length,0)+' 种</b></div>';
  else if(UI.tab==='map')body='<p>'+esc(w.location||'—')+'</p><p>下屏为原生三级地图。浏览城市、建筑与室内；商店和中心操作仍由原版地图处理。</p>';
  else if(UI.tab==='near')body='<p>'+esc(w.location||'—')+'</p><p>原版遭遇、野生对战、捕捉与垂钓条件均保留。</p>'+(w.repel&&!w.repel.expired?'<div class="repel-line '+esc(w.repel.tone)+'">'+esc(w.repel.item)+' · '+esc(w.repel.text)+(w.repel.lv?' · Lv'+w.repel.lv:'')+'</div>':'');
  else if(UI.tab==='aff')body='<p>已结识 <b>'+S.npcs.length+'</b> 人。沿用关都的好感阶段、变化原因、最近增减和女性筛选。</p><p>读取同一份原有 NPC 关系记录，不另建一套存档。</p>';
  else body='<div class="native-upper-trainer"><div class="tc-ava">'+esc(p.name[0])+'</div><div><div class="tc-id">TRAINER CARD · ID No.'+esc(p.id)+'</div><div class="tc-name">'+esc(p.name)+'</div><span class="tc-title">'+esc(p.title)+'</span></div></div><p>'+esc(region)+'地区记录 · 同一支同行队伍与同一份旅程</p>';
  const html='<small class="native-upper-kicker">JOHTO / NATIVE KANTO RUNTIME</small><h2>'+esc(labels[UI.tab])+'</h2>'+body;
  if(summary.__html!==html){summary.__html=html;summary.innerHTML=html;}
 }
 function afterRender(win,el,UI,S){
  ensureShell(win,el);decorateTrainer(win,el);
  const region=el.dataset.nativeRegion||'kanto';el.firstElementChild.dataset.region=region;
  const nativeButtons=el.querySelectorAll('.dx-tabs [data-t]');nativeButtons.forEach(b=>{b.setAttribute('role','tab');b.setAttribute('aria-selected',String(b.dataset.t===UI.tab));});
  if(region==='johto'){
   el.querySelectorAll('[data-native-tab]').forEach(b=>{const on=b.dataset.nativeTab===UI.tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});
   if(UI.tab==='dex'){const I=el.querySelector('[data-p=dex] .dex-info')||el.querySelector('#upperContent>.dex-info');info(win,el,UI,S,I);}
   else upperSummary(win,el,UI,S);
  }
  const cells=el.querySelectorAll('[data-p=dex] .cell');cells.forEach(c=>{c.tabIndex=0;c.setAttribute('role','button');c.setAttribute('aria-label','No.'+String(c.dataset.n).padStart(3,'0')+' '+(c.querySelector('.nm')?.textContent||''));c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();c.click();}};});
  if(!el.__pkmRegionalObserved){el.__pkmRegionalObserved=true;const observer=new win.ResizeObserver(()=>report(win,el));observer.observe(el);win.addEventListener('pagehide',()=>observer.disconnect(),{once:true});}
  report(win,el);
 }
 function report(win,el){
  const manager=(window.PKMRegionalHost||window).PKMRegionalDex;if(manager){manager.report(win);return;}
  win.requestAnimationFrame(()=>{const frame=win.frameElement;if(!frame||!el.isConnected||el.hidden)return;const h=Math.ceil(el.getBoundingClientRect().height+28);if(h>35&&Math.abs((parseFloat(frame.style.height)||0)-h)>8)frame.style.height=h+'px';});
 }
 (window.PKMRegionalHost||window).PKMRegionalPresentation=Object.freeze({beforeDraw,afterRender,info});
})();
