/* Normalize both teams' held items and mechanics without mutating inventory. */
(function(root){'use strict';
  const id=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const rawItem=v=>typeof v==='string'?v:(v?.itemName||v?.name||v?.itemId||v?.id||'');
  const kindOf=v=>{
    const x=String(typeof v==='object'?(v?.kind||v?.type||''):(v||'')).trim(),n=id(x);
    if(/超级|超級|mega/i.test(x))return 'mega';
    if(/太晶|tera/i.test(x))return 'tera';
    if(/极巨|極巨|dynamax|gigantamax|gmax/i.test(x))return 'dynamax';
    if(n==='z'||/zmove/i.test(n)||/纯晶|純晶|Ｚ招式/.test(x))return 'z';return '';
  };
  function resolve(source,species,moves,opt={}){
    source=source&&typeof source==='object'?source:{};moves=Array.isArray(moves)?moves:[];
    const api=root.PKMBattleGear,held=rawItem(source.item||source.heldItem||source.held_item);
    const gear=source.battleGear&&typeof source.battleGear==='object'?source.battleGear:null;
    const resolveHeld=v=>(opt.resolveItem&&opt.resolveItem(v))||'';
    const formName=v=>(opt.resolveSpecies&&opt.resolveSpecies(v))||id(v);
    const typeName=v=>{
      if(!v)return '';
      const canonical=root.PKMMechanics?.canonType?.(v);if(canonical)return canonical;
      const z=api?.DATA?.zCrystals?.find(x=>id(x.type)===id(v)||x.name.startsWith(String(v)+'Ｚ'));
      return z?.type||'';
    };
    const out={},normal=held&&resolveHeld(held);
    if(normal)out.item=normal;
    if(!api){
      const k=kindOf(source.mechanic);if(k==='dynamax')out.mechanic='dynamax';
      if(k==='tera'&&source.teraType){out.mechanic='tera';out.teraType=source.teraType;}
      return out;
    }
    const sameItem=(a,b)=>{
      if(!a||!b)return true;
      const ai=resolveHeld(a),bi=resolveHeld(b);if(ai&&bi)return ai===bi;
      const az=api.zCrystalByItem(a),bz=api.zCrystalByItem(b);if(az&&bz)return az.itemId===bz.itemId;
      const am=api.megaStoneForItem(a,species),bm=api.megaStoneForItem(b,species);
      if(am&&bm)return am==='generic'||bm==='generic'||am.form===bm.form;
      return String(a).normalize('NFKC').toLowerCase()===String(b).normalize('NFKC').toLowerCase();
    };
    const hasMove=type=>api.hasZMove(moves,type,opt.resolveMove);
    const setMega=(form,item)=>{
      if(!form)return false;
      const stone=item?api.megaStoneForItem(item,species):null;
      if(item&&(!stone||(stone!=='generic'&&stone.form!==form.form)))return false;
      if(!item&&opt.allowImplicit===false)return false;
      out.item=form.stoneId;out.mechanic='mega';out.megaForm=form.form;return true;
    };
    const setZ=(crystal,declared)=>{
      if(!crystal)return false;
      out.item=crystal.itemId;
      if(declared&&typeName(declared)!==crystal.type)return false;
      if(hasMove(crystal.type)){out.mechanic='z';out.zType=crystal.type;return true;}
      return false;
    };
    const gearKind=kindOf(gear?.kind),gearItem=rawItem(gear);
    if(gear){
      // A legacy malformed record may contain both a separate item and battleGear.
      // Do not silently overwrite the ordinary item or manufacture a compatible stone.
      if(gearItem&&held&&!sameItem(gearItem,held))return out;
      const equipment=gearItem||held;
      if(gearKind==='mega')setMega(api.formForSpecies(species,formName(gear.form||gear.megaForm)),equipment);
      else if(gearKind==='z')setZ(api.zCrystalByItem(equipment),gear.type);
      return out;
    }
    const directKind=kindOf(source.mechanic),directForm=formName(source.megaForm||source.mega||'');
    const directZ=typeName(source.zType||source.zMoveType||'');
    if(held){
      const stone=api.megaStoneForItem(held,species);
      if(stone){
        const forms=api.megaFormsForSpecies(species),chosen=directForm?api.formForSpecies(species,directForm):(stone==='generic'?(forms.length===1?forms[0]:null):stone);
        if(setMega(chosen,held))return out;
      }
      const crystal=api.zCrystalByItem(held);
      if(crystal){setZ(crystal,directZ);return out;}
    }else if((directKind==='mega'||directForm)&&directForm){
      if(setMega(api.formForSpecies(species,directForm),''))return out;
    }else if((directKind==='z'||directZ)&&directZ){
      const crystal=api.DATA.zCrystals.find(x=>x.type===directZ);
      if(crystal&&opt.allowImplicit!==false){setZ(crystal,directZ);return out;}
    }
    if(directKind==='dynamax'){out.mechanic='dynamax';if(source.dynamaxForm||source.gmax)out.dynamaxForm=source.dynamaxForm||'gmax';}
    if((directKind==='tera'||source.teraType)&&typeName(source.teraType)){out.mechanic='tera';out.teraType=typeName(source.teraType);}
    return out;
  }
  root.PKMGearResolve={version:'20261113-gender-recovery-v5',resolve};if(typeof module!=='undefined'&&module.exports)module.exports=root.PKMGearResolve;
})(typeof globalThis!=='undefined'?globalThis:this);
