// SPDX-License-Identifier: MIT
// Search the canonical localization catalog, not a collection of aliases.
export const CATALOG_BUILD='official-simplified-v1';
export function mountOfficialCatalog(element){
 if(!element)return;const names=globalThis.PKMOfficialNames;
 if(names?.version!==CATALOG_BUILD)throw Error('官方名称搜索组件与名录不匹配。');
 element.innerHTML=`<summary>官方名称查询 <span class="oc-tag">简体中文</span></summary>
 <div class="oc-body"><p class="oc-note">只显示现行官方名。查到不等于能学会或能携带；配队仍受学习面和内核支持范围限制。内核收录也不代表在所有世代或官方赛制合法。</p>
 <div class="oc-controls"><label>类别 <select class="oc-kind" aria-label="名称查询类别"><option value="moves">招式</option><option value="items">道具</option><option value="species">宝可梦</option></select></label>
 <input class="oc-query" type="search" autocomplete="off" placeholder="输入官方中文名或英文 ID" aria-label="搜索官方名称"></div>
 <p class="oc-count" role="status" aria-live="polite"></p><div class="oc-results" role="list" aria-label="官方名称搜索结果"></div>
 <p class="oc-selection" aria-live="polite">点击结果可查看或复制正确名称。</p></div>`;
 const kind=element.querySelector('.oc-kind'),query=element.querySelector('.oc-query'),results=element.querySelector('.oc-results'),count=element.querySelector('.oc-count'),selected=element.querySelector('.oc-selection');
 function render(){
  const catalog=kind.value!=='species',rows=names.search(kind.value,query.value,{catalog,limit:80}),total=names.search(kind.value,query.value,{catalog,limit:5000}).length;
  count.textContent=total?`找到 ${total} 项${total>rows.length?`，先显示 ${rows.length} 项，请输入更多字缩小范围`:''}`:'未找到。请使用现行官方简体中文名；旧译名不进入搜索结果。';
  results.replaceChildren();
  for(const row of rows){
   const button=document.createElement('button');button.type='button';button.className='oc-result';button.setAttribute('role','listitem');button.dataset.kind=row.kind;button.dataset.id=row.id;button.dataset.supported=String(row.supported);
   const label=document.createElement('strong');label.textContent=row.name;
   const detail=document.createElement('small');detail.textContent=kind.value==='items'?(row.supported?'内核已收录，可作携带物候选':'图鉴条目，不提供战斗携带'):(row.supported?'内核已收录，配招仍需符合学习面':'图鉴条目，当前内核暂不支持');
   button.append(label,detail);button.onclick=async()=>{selected.textContent=`正确名称：${row.name}。${detail.textContent}。`;try{await navigator.clipboard.writeText(row.name);selected.textContent+='已复制。';}catch{selected.textContent+='可选中文字手动复制。';}};
   results.appendChild(button);
  }
 }
 kind.addEventListener('change',render);query.addEventListener('input',render);render();
 return{render,search:(category,q)=>names.search(category,q,{catalog:category!=='species',limit:5000})};
}
