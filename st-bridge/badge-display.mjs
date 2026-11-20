/* Native trainer-card presentation. Earned records arrive from the native
 * floor-specific view; this module never reads, grants or saves game state.
 */
import {planBadgeDisplay} from './badge-records.mjs?v=20261118-badge-motion-v1';
import {BADGE_ART,BADGE_CSS} from './badge-assets.mjs?v=20261118-badge-motion-v1';
export const BADGE_MOTION_VERSION = '20261118-badge-motion-v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const artByName = new Map(BADGE_ART.map(a => [a.name,a]));
const styles = new WeakMap(), viewers = new WeakMap(); let sequence = 0;
function retainStyle(doc) {
  let item = styles.get(doc);
  if (!item) {
    const node = doc.createElement('style'); node.dataset.pkmBadgePresentation = BADGE_MOTION_VERSION;
    node.textContent = BADGE_CSS; (doc.head || doc.documentElement).append(node);
    item = {node,users:0}; styles.set(doc,item);
  }
  item.users++;
  return () => { if (--item.users === 0) { item.node.remove(); styles.delete(doc); } };
}
export function badgeCollectionsHTML(badges,{activeDex='kanto'}={}) {
  const plan = planBadgeDisplay(badges,{activeDex});
  if (!plan.groups.length) return '';
  const groupHTML = plan.groups.map(g => '<section class="badge-section" data-badge-group="'+g.id+'">'+
    '<div class="badge-heading"><span>'+esc(g.title)+'</span><small>'+g.earnedCount+' / '+g.total+'</small></div>'+
    '<div class="badges badge-rack" data-badge-managed role="group" aria-label="'+esc(g.title+'，已获得'+g.earnedCount+'枚，共'+g.total+'个槽位')+'">'+
    g.slots.map(b => {
      const art = artByName.get(b.name); if (!art) return '';
      const label = esc(b.name+' · '+(b.earned ? '已获得，放大查看' : '未获得'));
      const content = b.earned ? '<img src="'+art.src+'" alt="" width="44" height="44" decoding="async" draggable="false">' : '<span class="badge-empty-shape" aria-hidden="true" style="mask-image:url(&quot;'+art.src+'&quot;);-webkit-mask-image:url(&quot;'+art.src+'&quot;)"></span>';
      const data = ' data-badge-name="'+esc(b.name)+'" data-earned="'+b.earned+'" data-league-group="'+b.leagueGroup+'" title="'+label+'" aria-label="'+label+'"';
      const name = '<span class="badge-name">'+esc(b.name.replace(/徽章$/,''))+'</span>';
      return b.earned ? '<button type="button" class="bdg on"'+data+' aria-haspopup="dialog" aria-expanded="false" aria-pressed="false">'+content+name+'</button>' : '<div class="bdg off" role="img"'+data+'>'+content+name+'</div>';
    }).join('')+'</div></section>').join('');
  const earned = plan.groups.some(g => g.earnedCount > 0);
  return '<div class="badge-collections" data-badge-collections data-badge-motion="'+BADGE_MOTION_VERSION+'">'+groupHTML+(earned ? '<p class="badge-touch-hint">点按已获得的徽章 · 放大查看</p>' : '')+'</div>';
}
export function installBadgeInteraction({win,root,host=win}) {
  const docs = [...new Set([win.document,host.document])], releases = docs.map(retainStyle);
  const hostDoc = host.document, id = 'pkm-badge-detail-'+(++sequence);
  let disposed = false, selected = null, activeDex = root.dataset.nativeRegion || 'kanto', activeTab = 'tr', badges = [], visibleEarned = [], dialog = null, trigger = null, detailSignature = '';
  const shown = () => !disposed && root.isConnected && !root.hidden && !root.inert && !root.closest('[hidden]') && !root.querySelector(':scope>.pkdex.folded') && activeTab === 'tr';
  function feedback() {
    for (const n of root.querySelectorAll('[data-badge-managed] button[data-earned=true]')) {
      const on = n.dataset.badgeName === selected;
      n.setAttribute('aria-pressed',String(on)); n.setAttribute('aria-expanded',String(on && !!dialog));
    }
  }
  function close({restoreFocus=true}={}) {
    const old = dialog; if (!old) return;
    dialog = null; detailSignature = '';
    if (viewers.get(hostDoc) === api) viewers.delete(hostDoc);
    old.removeEventListener('keydown',onDialogKey);
    try { if (old.open && typeof old.close === 'function') old.close(); } catch {}
    old.remove(); feedback();
    if (restoreFocus && shown()) {
      const button = trigger?.isConnected && trigger.dataset.badgeName === selected ? trigger : [...root.querySelectorAll('[data-badge-managed] button[data-earned=true]')].find(b => b.dataset.badgeName === selected);
      button?.focus({preventScroll:true});
    }
    trigger = null;
  }
  function paint() {
    if (!dialog) return;
    const record = visibleEarned.find(b => b.name === selected), art = record && artByName.get(record.name);
    if (!record || !art || !shown()) { close({restoreFocus:false}); return; }
    const index = visibleEarned.indexOf(record), signature = record.name+'|'+visibleEarned.map(b => b.name).join('|');
    if (signature !== detailSignature) {
      detailSignature = signature;
      const image = dialog.querySelector('.badge-view-art'); image.src = art.src; image.alt = record.name+'材质细节';
      dialog.querySelector('.badge-view-name').textContent = record.name;
      dialog.querySelector('.badge-view-origin').textContent = ({indigo:'关都联盟',orange:'橘子联盟',silver:'城都联盟'})[record.leagueGroup]+' · '+art.place;
      dialog.querySelector('.badge-view-material').textContent = art.material;
      dialog.querySelector('.badge-view-description').textContent = art.description;
      dialog.querySelector('.badge-view-position').textContent = (index+1)+' / '+visibleEarned.length;
      for (const button of dialog.querySelectorAll('[data-badge-step]')) button.disabled = visibleEarned.length < 2;
      dialog.dataset.badgeName = record.name;
    }
    feedback();
  }
  function step(delta) {
    if (!dialog || visibleEarned.length < 2) return;
    const index = visibleEarned.findIndex(b => b.name === selected);
    selected = visibleEarned[(index+delta+visibleEarned.length)%visibleEarned.length].name; paint();
  }
  function onDialogKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); step(e.key === 'ArrowLeft' ? -1 : 1); }
    else if (e.key === 'Tab') {
      const buttons = [...dialog.querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && hostDoc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && hostDoc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function open(name,button) {
    if (!shown() || !visibleEarned.some(b => b.name === name)) return;
    const previous = viewers.get(hostDoc); if (previous && previous !== api) previous.close({restoreFocus:false});
    selected = name; trigger = button;
    if (dialog) { paint(); return; }
    const node = hostDoc.createElement('dialog'); dialog = node; node.className = 'pkm-badge-viewer';
    node.setAttribute('role','dialog'); node.setAttribute('aria-modal','true'); node.setAttribute('aria-labelledby',id); node.setAttribute('aria-describedby',id+'-desc');
    node.innerHTML = '<article class="badge-view-card"><header class="badge-view-head"><span>BADGE COLLECTION · 已获得</span><button type="button" class="badge-view-close" data-badge-close aria-label="关闭徽章详情" title="关闭">×</button></header><div class="badge-view-stage"><img class="badge-view-art" alt="" width="216" height="216" draggable="false"></div><div class="badge-view-body"><p class="badge-view-origin"></p><h2 class="badge-view-name" id="'+id+'"></h2><p class="badge-view-material"></p><p class="badge-view-description" id="'+id+'-desc"></p></div><nav class="badge-view-nav" aria-label="查看已获得的徽章"><button type="button" data-badge-step="-1" aria-label="上一枚已获得的徽章">← 上一枚</button><p class="badge-view-position" aria-live="polite"></p><button type="button" data-badge-step="1" aria-label="下一枚已获得的徽章">下一枚 →</button></nav></article>';
    node.addEventListener('keydown',onDialogKey);
    node.addEventListener('cancel',e => { e.preventDefault(); e.stopPropagation(); close(); });
    node.addEventListener('click',e => {
      e.stopPropagation();
      if (e.target === node || e.target.closest('[data-badge-close]')) { close(); return; }
      const stepButton = e.target.closest('[data-badge-step]'); if (stepButton && !stepButton.disabled) step(Number(stepButton.dataset.badgeStep));
    });
    // Block background scroll on the shade, but retain native touch scrolling
    // inside a tall detail card (no touch-action:none ancestor).
    for (const type of ['wheel','touchmove']) node.addEventListener(type,e => {
      if (!e.target.closest?.('.badge-view-card') && e.cancelable) e.preventDefault();
    },{passive:false});
    // The real top-level host viewport, not a fixed overlay inside the LCD.
    hostDoc.body.append(node); viewers.set(hostDoc,api); paint();
    if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open','');
    node.querySelector('[data-badge-close]').focus({preventScroll:true});
  }
  const onRootClick = e => {
    const button = e.target.closest?.('[data-badge-managed] button.bdg[data-earned=true]');
    if (button && root.contains(button)) { e.preventDefault(); open(button.dataset.badgeName,button); }
    else if (e.target.closest?.('.dx-fold')) close({restoreFocus:false});
  };
  const onVisibility = () => { if (!shown()) close({restoreFocus:false}); };
  const observer = new win.MutationObserver(onVisibility);
  observer.observe(root,{attributes:true,attributeFilter:['hidden','inert']});
  root.addEventListener('click',onRootClick); win.addEventListener('pagehide',onVisibility);
  const api = {
    version:BADGE_MOTION_VERSION, close,
    sync({badges:nextBadges=[],activeDex:nextDex=activeDex,activeTab:nextTab=activeTab}={}) {
      if (disposed) return;
      badges = nextBadges; activeDex = nextDex; activeTab = nextTab;
      visibleEarned = planBadgeDisplay(badges,{activeDex}).groups.flatMap(g => g.slots).filter(b => b.earned);
      if (selected && !visibleEarned.some(b => b.name === selected)) selected = null;
      if (!shown() || !selected) close({restoreFocus:false}); else paint();
      feedback();
    },
    dispose() {
      if (disposed) return;
      close({restoreFocus:false}); disposed = true; observer.disconnect(); root.removeEventListener('click',onRootClick); win.removeEventListener('pagehide',onVisibility);
      releases.forEach(release => release());
    },
  };
  return api;
}
