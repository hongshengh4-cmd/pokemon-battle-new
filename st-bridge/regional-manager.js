/* Formal regional UI controller. All state reads use the real Tavern/MVU
   APIs. The only write is PKMKanto.useRegionalDex, on an explicit Use click.
   It validates ownership inside the original serialized native write chain. */
(()=>{'use strict';
 const W=window,H=W.PKMRegionalHost||W,D=H.document,BUILD='20261118-status-restore-v8.1';
 try{H.PKMRegionalDex?.dispose?.();}catch{}
 const cfg=W.PKMRegionalPresentationAssets,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const items=Object.freeze({'关都图鉴':{key:'kanto',label:'关都'},'城都图鉴':{key:'johto',label:'城都'}}),mounts=new Map();
 let stopped=false,queued=false,dialog=null;
 function mesId(win){try{for(let i=0;win&&i<12;i++){const f=win.frameElement;if(!f)break;const m=f.closest('.mes');if(m){const n=Number(m.getAttribute('mesid'));return Number.isInteger(n)?n:null;}win=f.ownerDocument.defaultView;}}catch{}return null;}
 function isAttached(win){try{for(let i=0;win&&i<12;i++){if(win===H)return true;const f=win.frameElement;if(!f?.isConnected)return false;win=f.ownerDocument.defaultView;}}catch{}return false;}
 function point(win,x,y){try{for(let i=0;win!==H&&i<12;i++){const f=win.frameElement;if(!f)return null;const r=f.getBoundingClientRect();x=r.left+x*r.width/(win.innerWidth||r.width||1);y=r.top+y*r.height/(win.innerHeight||r.height||1);win=f.ownerDocument.defaultView;}return win===H?{x,y}:null;}catch{return null;}}
 function relay(win,root){
  const listeners=[];for(const type of['pointermove','pointerup','pointercancel']){
   const fn=e=>{if(e.target?.closest?.('#pkdex-v121-root'))return;if(type==='pointermove'&&!e.buttons)return;const p=point(win,e.clientX,e.clientY);if(!p)return;const ok=D.dispatchEvent(new H.PointerEvent(type,{bubbles:true,cancelable:true,pointerId:e.pointerId,pointerType:e.pointerType,isPrimary:e.isPrimary,buttons:e.buttons,clientX:p.x,clientY:p.y}));if(!ok&&e.cancelable)e.preventDefault();};
   win.document.addEventListener(type,fn,{capture:true,passive:false});listeners.push(()=>win.document.removeEventListener(type,fn,true));
  }return()=>listeners.forEach(fn=>fn());
 }
 function context(){try{return H.SillyTavern?.getContext?.()||W.SillyTavern?.getContext?.()||{};}catch{return{};}}
 function variables(id){try{if(typeof W.getVariables==='function')return W.getVariables({type:'message',message_id:id});const m=context().chat?.[id];return m?.variables?.[m.swipe_id??0];}catch{return null;}}
 function snapshot(win){const c=context().chat||[],id=mesId(win),end=id==null?c.length:Math.min(c.length,id+1);let p=null;for(let i=end-1;i>=0;i--){p=variables(i)?.stat_data?.pkm;if(p)break;}if(!p){try{p=H.PKMKanto?.read?.();}catch{}}let state={};for(let i=end-1;i>=Math.max(0,end-6);i--){if(c[i]?.is_user)continue;const m=String(c[i]?.mes||'').match(/<pkm_state>([\s\S]*?)(?:<\/pkm_state>|$)/i);if(m){for(const line of m[1].split('\n')){const kv=line.match(/^\s*([^：:\n]{1,6})[：:]\s*(.*?)\s*$/);if(kv)state[kv[1].trim()]=kv[2];}break;}}return{pk:p||{},state};}
 const owned=(region,p)=>Number(p?.player?.bag?.[region==='kanto'?'关都图鉴':'城都图鉴'])>0;
 // Original Kanto is the baseline status UI, not a newly gated inventory view.
 // Region switching still validates real item ownership; rendering never grants items.
 const canView=(region,p)=>region==='kanto'||(region==='johto'&&owned('johto',p));
 const selectedRegion=p=>p?.integration?.activeRegionalDex==='johto'&&canView('johto',p)?'johto':'kanto';
 function report(win){let current=win;for(let i=0;i<8;i++){let f;try{f=current.frameElement;}catch{break;}if(!f)break;const owner=[...mounts.values()].find(m=>m.win===f.ownerDocument.defaultView||m.win===current);if(owner){owner.fit();break;}current=f.ownerDocument.defaultView;}}
 // Match current Kanto: keep the regex root and render native status bars in
 // that same message document. No regional webpage, header or extra iframe.
 function mount(win,root){
  if(stopped||!win||!root)return false;if(mounts.has(root)){mounts.get(root).sync();return true;}
  root.replaceChildren();
  const style=win.document.createElement('style');style.dataset.regionalStyle=BUILD;style.textContent=cfg.css;win.document.head.append(style);
  const regions=new Map(),cleanups=[relay(win,root)];let dead=false,fitQueued=false;
  const fit=()=>{if(dead||fitQueued)return;fitQueued=true;win.requestAnimationFrame(()=>{fitQueued=false;if(dead||!isAttached(win)||!root.isConnected)return;const f=win.frameElement;if(!f)return;const height=Math.ceil(root.getBoundingClientRect().height+28);if(height>35&&Math.abs((parseFloat(f.style.height)||0)-height)>8)f.style.height=height+'px';});};
  function ensureNative(region,active){
   if(regions.has(region))return regions.get(region).node;
   const node=win.document.createElement('div');node.className='regional-native-status';node.dataset.nativeRegion=region;node.hidden=region!==active;node.inert=node.hidden;root.append(node);
   const entry={node,timer:0,tries:0};regions.set(region,entry);
   const connect=()=>{entry.timer=0;if(dead||!node.isConnected)return;const api=H.PKMKantoLegacyStatus;if(api?.regionalBuild===BUILD){try{if(api.mountDex(win,node)!==false){fit();return;}}catch(e){console.error('[双地区图鉴] 原版状态栏连接失败',e);}}if(++entry.tries<120)entry.timer=win.setTimeout(connect,250);else{node.textContent='图鉴尚未连接，请完整部署仓库状态栏文件后刷新。';fit();}};
   connect();return node;
  }
  function sync(){
   if(dead)return;if(!root.isConnected||!isAttached(win)){dispose();return;}
   const{pk}=snapshot(win),active=selectedRegion(pk);
   for(const key of['kanto','johto']){if(canView(key,pk))ensureNative(key,active);const node=regions.get(key)?.node;if(node){const hidden=key!==active;if(node.hidden!==hidden)node.hidden=hidden;if(node.inert!==hidden)node.inert=hidden;}}
   root.dataset.activeDex=active;fit();
  }
  function dispose(){if(dead)return;dead=true;for(const entry of regions.values()){win.clearTimeout(entry.timer);try{H.PKMKantoLegacyStatus?.unmountDex?.(entry.node);}catch{}}for(const fn of cleanups.splice(0))try{fn();}catch{}observer?.disconnect();win.removeEventListener('pagehide',dispose);win.removeEventListener('resize',fit);style.remove();mounts.delete(root);}
  let observer;try{observer=new win.ResizeObserver(fit);observer.observe(root);}catch{}win.addEventListener('pagehide',dispose,{once:true});win.addEventListener('resize',fit);mounts.set(root,{win,root,fit,sync,dispose});sync();return true;
 }
 function refresh(){if(stopped||queued)return;queued=true;W.queueMicrotask(()=>{queued=false;for(const m of mounts.values())m.sync();});}
 const itemImage=(name,cls='iimg')=>items[name]?'<img class="'+esc(cls)+' regional-dex-icon" src="'+cfg.icons[items[name].key]+'" alt="'+esc(name)+'" draggable="false">':'';
 function closeDialog(){if(!dialog)return;const old=dialog;dialog=null;old.node.remove();old.previous?.focus?.({preventScroll:true});}
 function open(name){name=String(name||'').trim();const item=items[name];if(!item)return;closeDialog();let pk;try{pk=H.PKMKanto?.read?.();}catch{}const count=Math.max(0,Number(pk?.player?.bag?.[name])||0),node=D.createElement('div'),previous=D.activeElement;node.id='pkm-regional-dex-confirm';node.className='pkb';node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.setAttribute('aria-labelledby','pkm-regional-dex-dialog-title');node.innerHTML='<div class="care-card"><h3 id="pkm-regional-dex-dialog-title">使用'+esc(name)+'</h3><div class="care-line">'+itemImage(name,'pk-item')+'<b>'+esc(name)+'</b> × '+count+'</div><p>切换为'+item.label+'地区状态栏。图鉴与八枚徽章按地区显示；队伍、背包、世界、附近遭遇和好感仍是同一份存档。</p><p><b>重要物品，可反复使用，不会消耗。</b></p><p data-regional-error role="alert" hidden></p><div class="acts"><button type="button" class="ghost" data-dex-cancel>取消</button><button type="button" class="blue" data-dex-confirm '+(count>0?'':'disabled')+'>使用</button></div></div>';D.body.append(node);dialog={node,previous};node.querySelector('[data-dex-cancel]').onclick=closeDialog;node.querySelector('[data-dex-confirm]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{if(!H.PKMKanto?.useRegionalDex)throw Error('完整原版桥接仍在加载，请稍后重试');await H.PKMKanto.useRegionalDex(name);closeDialog();refresh();}catch(err){const msg=node.querySelector('[data-regional-error]');msg.hidden=false;msg.textContent=err?.message||String(err);b.disabled=false;}};
  node.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const buttons=[...node.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&D.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&D.activeElement===last){e.preventDefault();first.focus();}});node.querySelector('[data-dex-cancel]').focus({preventScroll:true});
 }
 const modalStyle=D.createElement('style');modalStyle.dataset.regionalModal=BUILD;modalStyle.textContent=cfg.modalCSS;D.head.append(modalStyle);
 const onKey=e=>{if(e.key==='Escape'&&dialog){e.preventDefault();closeDialog();}};D.addEventListener('keydown',onKey);
 function scan(){if(stopped)return;for(const f of D.querySelectorAll('#chat iframe')){try{const r=f.contentDocument?.getElementById('pkdex-v121-root');if(r)mount(f.contentWindow,r);}catch{}}}
 const observer=new H.MutationObserver(()=>{scan();});observer.observe(D.getElementById('chat')||D.body,{childList:true,subtree:true});
 const timer=W.setInterval(()=>{scan();refresh();},1000);
 const api={version:BUILD,mesId,isAttached,mount,report,refresh,open,itemImage,isDex:name=>!!items[String(name||'').trim()],item:name=>{const d=items[String(name||'').trim()];return d?{name:String(name).trim(),id:'',pk:3,d:'使用后切换为'+d.label+'地区状态栏；图鉴与八枚徽章分地区显示。重要物品，可反复使用，不消耗。'}:null;},dispose(){if(stopped)return;stopped=true;W.clearInterval(timer);observer.disconnect();closeDialog();D.removeEventListener('keydown',onKey);modalStyle.remove();for(const m of[...mounts.values()])m.dispose();if(H.PKMRegionalDex===api)delete H.PKMRegionalDex;}};
 H.PKMRegionalDex=api;W.addEventListener('pagehide',()=>api.dispose(),{once:true});scan();
})();
