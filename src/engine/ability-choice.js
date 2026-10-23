/* One individual has one ability. Preserve the first legal recorded choice, never reroll. */
(function(root){
  function tokens(raw){
    if(Array.isArray(raw))return raw.flatMap(tokens);
    if(raw && typeof raw==='object')return tokens(raw.current ?? raw.selected ?? raw.name ?? raw.id ?? raw.ability ?? Object.values(raw));
    if(typeof raw!=='string')return [];
    const s=raw.trim();
    if(/^[\[{]/.test(s)){try{return tokens(JSON.parse(s))}catch(_){}}
    return s.split(/[\/／、,，;；|｜+＋\n]+/).map(x=>x.trim().replace(/^(?:特性|隐藏特性|隱藏特性)[:：]\s*/, '').replace(/[（(](?:隐藏|隱藏|梦特|夢特|普通|H|HA)[）)]/gi,'').trim()).filter(Boolean);
  }
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function select(raw,legal=[],zh={}){
    for(const t of tokens(raw)){
      const exact=legal.find(a=>a===t || (norm(t)&&norm(a)===norm(t)) || zh[norm(a)]===t);
      if(exact)return exact;
    }
    if(legal.length)return legal[0];
    return tokens(raw)[0] || null;
  }
  root.PKMAbilityChoice={tokens,select};
})(globalThis);
