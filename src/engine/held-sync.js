/* Conservative battle-result reconciliation: never infer consumption from an empty result alone. */
(function(root){'use strict';
  const text=x=>typeof x==='string'?x:(x?.itemName||x?.name||x?.itemId||x?.id||'');
  const key=x=>{try{return JSON.stringify(x??null);}catch(_){return '';}};
  function snapshot(mon,entry,resolveItem){
    if(!mon||!entry||typeof resolveItem!=='function')return null;
    return {uid:String(mon.uid||''),savedItem:key(mon.item),gear:key(mon.battleGear),
      itemId:resolveItem(text(mon.item))||'',engineItem:String(entry.item||'').toLowerCase()};
  }
  function sync(mon,result,start,resolveItem){
    if(!mon||!result||!start||typeof resolveItem!=='function'||!start.uid||String(mon.uid||'')!==start.uid)return false;
    if(!start.itemId||start.itemId!==start.engineItem||key(mon.item)!==start.savedItem||key(mon.battleGear)!==start.gear)return false;
    if(resolveItem(text(mon.item))!==start.itemId)return false;
    if(!Object.hasOwn(result,'item')||(result.item!==null&&result.item!==''))return false;
    if(String(result.initialItem||'').toLowerCase()!==start.engineItem||result.itemTransferOccurred)return false;
    if(!Array.isArray(result.consumedItems)||!result.consumedItems.includes(start.itemId))return false;
    delete mon.item;return true;
  }
  // Treat absent, malformed, increased, or unknown stock as no consumption evidence.
  function consumedStock(initial,result,id){
    if(!initial||!result||!Object.hasOwn(initial,id)||!Object.hasOwn(result,id))return 0;
    const count=x=>{
      if(typeof x==='string'){x=x.trim();if(!/^\d+$/.test(x))return null;x=Number(x);}
      return typeof x==='number'&&Number.isSafeInteger(x)&&x>=0?x:null;
    };
    const before=count(initial[id]),after=count(result[id]);
    if(before===null||after===null||after>before)return 0;
    return before-after;
  }
  root.PKMHeldSync={snapshot,sync,consumedStock};if(typeof module!=='undefined'&&module.exports)module.exports=root.PKMHeldSync;
})(typeof globalThis!=='undefined'?globalThis:this);
