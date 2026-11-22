/*
 * Adventure/UI adapter for the pinned, unmodified Pokémon Showdown rule callbacks.
 * Runtime: local browser only; no fetch, Worker messages, storage or host/save writes.
 * Ordinary move/status/ability/item/field/queue resolution belongs EXCLUSIVELY to PS.
 * The legacy Battle supplies presentation, the public-information AI, result schema
 * and explicitly non-cartridge adventure features (capture/trainer items/escape).
 * SPDX-License-Identifier: MIT
 */
(function (root) {
  'use strict';
  const E = root.PKMBattle, Legacy = E?.Battle, PS = root.PKMShowdown;
  if (!E || !Legacy) throw Error('对战外壳未载入，请完整覆盖修复包。');
  // Fail closed: a missing/mismatched bundle must NEVER silently run the old rules.
  E.Battle = class { constructor() { throw Error('Showdown规则内核未就绪，请完整覆盖修复包并刷新。'); } };
  const COMMIT = '5b88c476113d51a939bddbcd00b5cd182a5d8058';
  if (PS?.commit !== COMMIT) throw Error('Showdown规则内核缺失或版本不匹配。');
  const VERSION = '20261119-showdown-rules-v1';
  const REPLACEMENT_VERSION = 'public-reserves-v71';
  const ENV = root.PKMFieldEnvironment;
  if (ENV?.version !== '20261118-field-interactions-v1') throw Error('天气与场地模块未就绪，请完整覆盖修复包并刷新。');
  const norm = E.normId, KEYS = ['hp','atk','def','spa','spd','spe'];
  const STATUS = {brn:'灼伤',par:'麻痹',psn:'中毒',tox:'剧毒',slp:'睡眠',frz:'冰冻'};
  const WEATHER = {sunnyday:'sun',desolateland:'sun',raindance:'rain',primordialsea:'rain',sandstorm:'sand',snowscape:'snow',hail:'snow',deltastream:'strongwinds'};
  const WEATHER_ZH = {sunnyday:'阳光变得强烈起来了！',desolateland:'日照变得非常猛烈！',raindance:'开始下雨了！',primordialsea:'开始下起大雨了！',sandstorm:'沙暴刮起来了！',snowscape:'开始下雪了！',hail:'开始下冰雹了！',deltastream:'神秘的乱流笼罩了天空！',none:'天气恢复了正常。'};
  const EFFECT_ZH = {mustrecharge:'硬直休息',confusion:'混乱',attract:'着迷',substitute:'替身',taunt:'挑衅',encore:'再来一次',disable:'定身法',torment:'无理取闹',healblock:'回复封锁',yawn:'瞌睡',leechseed:'寄生种子',nightmare:'恶梦',perishsong:'灭亡之歌',octolock:'蛸固',ingrain:'扎根',aquaring:'水流环',magnetrise:'电磁飘浮',telekinesis:'意念移物',focusenergy:'聚气',protect:'守住',lightscreen:'光墙',reflect:'反射壁',auroraveil:'极光幕',tailwind:'顺风',safeguard:'神秘守护',mist:'白雾',stealthrock:'隐形岩',spikes:'撒菱',toxicspikes:'毒菱',stickyweb:'黏黏网',trickroom:'戏法空间',magicroom:'魔法空间',wonderroom:'奇妙空间',gravity:'重力',electricterrain:'电气场地',grassyterrain:'青草场地',mistyterrain:'薄雾场地',psychicterrain:'精神场地'};
  const label = x => {const raw=String(x||''),id=norm(raw.replace(/^(move|ability|item): /,'')),kind=raw.startsWith('ability: ')?'abilities':raw.startsWith('item: ')?'items':'moves';return EFFECT_ZH[id]||STATUS[id]||root.PKMShowdownText?.[kind]?.[id]?.name||x||'效果';};
  const plain = x => JSON.parse(JSON.stringify(x));
  const sourceName = x => String(x || '').replace(/^p[12][a-z]?: /,'');
  const seedOf = n => {
    if (Array.isArray(n)) return n.slice(0,4);
    const out=[]; let x = Number.isFinite(Number(n)) ? Number(n) >>> 0 : Math.floor(Math.random()*4294967296);
    for (let i=0;i<4;i++) { x=(Math.imul(x,1664525)+1013904223)>>>0;out.push(x&65535); }
    return out;
  };
  function slotOf(q) { return q?.set?._nativeIndex; }
  function asSet(p, index) {
    return {species:p.speciesId,name:p.name || p.speciesName || p.speciesId,level:p.level,
      ability:p.ability || '',item:p.item || '',moves:p.moves.map(m=>m.id),nature:p.nature || 'Serious',
      ivs:{...p.ivs},evs:{...p.evs},gender:p.gender === 'M' || p.gender === 'F' ? p.gender : 'N',
      shiny:!!p.shiny,teraType:p.teraType || p.types?.[0] || 'Normal',gigantamax:p.dynamaxForm==='gmax',
      happiness:typeof p.happiness==='number'?p.happiness:255,dynamaxLevel:10,_nativeIndex:index};
  }
  class ShowdownBattle extends Legacy {
    constructor(teamA, teamB, opts = {}) {
      // Super initializes only carrier fields. onEnter is suppressed below, so no
      // legacy ability/hazard rule, RNG roll, damage or item can run on entry.
      const initial=[teamA,teamB].map(t=>t.map(p=>({hp:p.hp,maxHp:p.maxHp,status:p.status,sleepTurns:p.sleepTurns,toxicCounter:p.toxicCounter,fainted:p.fainted,moves:p.moves.map(m=>({id:m.id,pp:m.pp,ppLeft:m.ppLeft}))})));
      super(teamA,teamB,opts);
      this.rulesEngine={id:'pokemon-showdown',commit:COMMIT,adapter:VERSION,policy:'Gen 9 base + past moves; adventure gimmick enablement'};
      this.log=[];this.turnMarks=[];this._initial=initial;this._persistent=[[],[]];this._psCursor=0;this._replacementChoices=new Map();this._completedTurns=0;this._syncing=false;
      this._initializing=true;this._initialWeather={weather:opts.weather||null,turns:opts.weatherTurns??0};
      const facade=this;
      const id=this.double?'pkmcustomdoubles':'pkmcustomsingles';
      // Use a Format instance so all normal PS format defaults and rule table
      // validation still apply. No ladder clauses are silently added.
      PS.Dex.includeData();
      const format=new PS.Dex.Format({name:this.double?'PKM Custom doubles':'PKM Custom singles',id,mod:'gen9',gameType:this.double?'doubles':'singles',ruleset:[],debug:true});
      format.onBegin=function(){facade._initializePS(this);};
      format.onTryMove=function(pokemon,target,move){
        // Explicit adventure exceptions: no effect on trainer/link battles.
        if(facade.encounterType==='wild'&&pokemon.side.n===1&&move.id==='teleport'){
          facade._escape('wildFled',`${facade._native(pokemon)?.name || pokemon.name} 用瞬间移动逃走了！`);return false;
        }
        if(facade.encounterType==='wild'&&['roar','whirlwind'].includes(move.id)&&target&&pokemon.level>=target.level){
          if(target.volatiles['substitute']||target.volatiles['protect']||target.volatiles['ingrain']||target.volatiles['dynamax']||target.hasAbility('suctioncups'))return;
          facade._escape(target.side.n===1?'forceSwitch':'blownAway',`${facade._native(target)?.name || target.name} 被 ${move.name} 赶离了战斗！`);return false;
        }
      };
      const b=this._ps=new PS.Battle({format,seed:seedOf(opts.seed),strictChoices:false,send:()=>{}});
      // PS emits one or three protocol lines per add(). Read them immediately,
      // while state corresponds to the event, to preserve native HP animations.
      for(const method of ['add','addMove']){
        const original=b[method];
        b[method]=function(...args){const from=this.log.length,ret=original.apply(this,args),prev=facade._protocolContext;facade._protocolContext={from,args};try{facade._readProtocol();}finally{facade._protocolContext=prev;}return ret;};
      }
      const attrLastMove=b.attrLastMove;
      b.attrLastMove=function(...args){const ret=attrLastMove.apply(this,args);if(args.includes('[still]')&&facade._lastMoveAnim&&!facade._lastMoveAnim.prepare)facade._lastMoveAnim.cancelled=true;return ret;};
      const retarget=b.retargetLastMove;
      b.retargetLastMove=function(target){const ret=retarget.call(this,target),p=facade._native(target);if(p&&facade._lastMoveAnim)facade._lastMoveAnim.targets=[facade._animPos(p)];return ret;};
      // Observe the canonical consumption event, not a guessed log-message shape.
      // Fling and Natural Gift consume items too; Knock Off/Trick are NOT consumption.
      const runEvent=b.runEvent;
      b.runEvent=function(eventId,target,source,effect,...rest){
        const result=runEvent.call(this,eventId,target,source,effect,...rest);
        if(eventId==='AfterUseItem'&&rest[0]?.id){const p=facade._native(target),id=rest[0].id;if(p){p._consumedItems.push(id);p._lastConsumed=id;p._aiPublicItem=null;p._aiPublicItemKnown=true;}}
        return result;
      };
      const faints=b.resolveFaints; // Pinned PS renamed faintMessages to resolveFaints.
      b.resolveFaints=function(...args){const ret=faints.apply(this,args);facade._gymResult();return ret||this.ended;};
      for(const side of [0,1]) {
        const order=this.teams[side].map((p,i)=>({p,i})).sort((a,c)=>Number(initial[side][a.i].fainted||initial[side][a.i].hp<=0)-Number(initial[side][c.i].fainted||initial[side][c.i].hp<=0));
        b.setPlayer(side===0?'p1':'p2',{name:side===0?'我方':'敌方',team:order.map(({p,i})=>asSet(p,i))});
      }
      this._initializing=false;this._initial=null;this._readProtocol();this._syncFromPS();this._pumpReplacements();
      this.rng=()=>b.random(0x100000000)/0x100000000; // Capture only; AI never receives this.
    }
    say(text){return super.say(root.PKMOfficialNames ? root.PKMOfficialNames.displayText(text) : text);}
    onEnter() { /* Rules entry point is Showdown switchIn, never Legacy.onEnter. */ }
    _animKey(p){return {...super._animKey(p),speciesId:p.illusion?.speciesId||p.speciesId};} // Illusion reveal is a presentation form event, not a real species change.
    _native(q) { return q?.side && Number.isInteger(slotOf(q)) ? this.teams[q.side.n]?.[slotOf(q)] : null; }
    _pokemon(p) { return this._ps?.sides[p?._side]?.pokemon.find(q=>slotOf(q)===this.teams[p._side].indexOf(p)); }
    _initializePS(b) {
      this._ps=b;
      const weather=this._initialWeather;
      const weatherId=ENV.weatherId(weather?.weather);
      if(weatherId&&b.field.setWeather(weatherId,b.sides[0].pokemon[0],{id:'nativeweather',name:'环境天气',effectType:'Condition'}))b.field.weatherState.duration=ENV.turns(weather.turns);
      for(const side of [0,1]) {
        const psSide=b.sides[side];
        // This is the existing card's explicit cross-generation house rule.
        // HP, Max move effects, ending, exclusions and all counters remain PS.
        psSide.canDynamaxNow=()=>!this.mechanicUsed[side].dynamax && psSide.active.some(q=>this._native(q)?.mechanic==='dynamax');
        for(const q of psSide.pokemon) {
          const p=this._native(q),i=slotOf(q),input=this._initial[side][i];
          this._persistent[side][i]={species:p.originalSpeciesId,maxHp:q.baseMaxhp,stats:{hp:q.baseMaxhp,...q.baseStoredStats}};
          q.gender=p.gender==='M'||p.gender==='F'?p.gender:''; // Unknown is never randomized into a persistent sex.
          q.canMegaEvo=p.mechanic==='mega'&&!p.isMega?(p.megaForm || b.actions.canMegaEvo(q)):null;
          q.canUltraBurst=null;q.canTerastallize=p.mechanic==='tera'?q.teraType:null;
          q.hp=Math.max(0,Math.min(q.maxhp,Number(input.hp)||0));q.fainted=!!input.fainted||q.hp<=0;
          for(let j=0;j<q.baseMoveSlots.length;j++){
            const m=input.moves[j],s=q.baseMoveSlots[j];s.pp=Math.max(0,Math.min(Number(m.pp)||s.maxpp,Number(m.ppLeft)||0));s.maxpp=Number(m.pp)||s.maxpp;q.ppUps[j]=0;
          }
          q.moveSlots=q.baseMoveSlots.slice(); // Preserve PS slot-object aliasing: normal PP must survive switching.
          if(!q.fainted&&STATUS[input.status]){
            // Import an already-existing adventure status before switch-in.
            // PS.setStatus intentionally forbids NEW statuses on benched mons.
            // Run its immunity + SetStatus + Start hooks, but do not run an
            // active-only AfterSetStatus item hook on the entire benched team.
            const condition=b.dex.conditions.get(input.status),effect={id:'nativeinitialstatus',name:'外部初始状态',effectType:'Condition'};
            const wasActive=q.isActive;q.isActive=true;
            const applied=q.runStatusImmunity(input.status==='tox'?'psn':input.status)&&b.runEvent('SetStatus',q,q,effect,condition);
            if(applied){q.status=input.status;q.statusState=b.initEffectState({id:input.status,target:q,source:q});b.singleEvent('Start',condition,q.statusState,q,q,effect);}
            q.isActive=wasActive;
            // Start already drew PS's 2–4 counter. Do not roll it a second time.
            if(applied&&input.status==='slp'&&input.sleepTurns>0)q.statusState.time=q.statusState.startTime=Math.max(1,Math.min(4,Math.floor(input.sleepTurns)));
            if(applied&&input.status==='tox')q.statusState.stage=0; // Toxic resets on battle entry/switch.
          }
        }
        psSide.pokemonLeft=psSide.pokemon.filter(q=>!q.fainted).length;
      }
      // Initial weather was applied before importing statuses above.
    }
    _syncFromPS() {
      const b=this._ps;if(!b||this._syncing)return;this._syncing=true;
      try {
        for(const side of [0,1]){
          const s=b.sides[side];if(!s)continue;
          for(const q of s.pokemon){
            const p=this._native(q);if(!p)continue;
            p.hp=q.hp;p.maxHp=q.maxhp;p.fainted=q.fainted;p.status=q.status||null;
            p.sleepTurns=q.status==='slp'?(q.statusState.time||0):0;p.toxicCounter=q.status==='tox'?Math.min(15,(q.statusState.stage||0)+1):0;
            p.speciesId=q.species.id;p.speciesName=q.species.name;p.types=q.getTypes();p.ability=q.ability||null;p._abilitySuppressed=q.ignoringAbility();p.item=q.item||null;
            p.illusion=q.illusion?{speciesId:q.illusion.species.id,speciesName:q.illusion.species.name,name:q.illusion.name,hasNickname:!!this._native(q.illusion)?.hasNickname,types:q.illusion.species.types.slice(),gender:q.illusion.gender||null,shiny:!!q.illusion.set.shiny}:null;
            p.stats={hp:q.baseMaxhp,...q.storedStats};p.stages={...q.boosts};p.isMega=!!q.species.isMega;
            p.terastallized=!!q.terastallized;p.teraType=q.teraType;
            p.dynamaxed=!!q.volatiles.dynamax;p.dynamaxTurns=p.dynamaxed?(q.volatiles.dynamax.turns??3):0;p.normalMaxHp=p.dynamaxed?q.baseMaxhp:null;
            if(q.isActive)p._participated=true;
            p._cmdMoveActions=Number(q.activeMoveActions)||0;p._cmdOwnUsed=q.moveSlots.filter(m=>m.used).map(m=>m.id);
            p._enteredThisTurn=q.activeTurns===0;p.enteredTurn=Math.max(0,b.turn-(q.activeTurns||0)-1);
            p.choiceLockedMove=q.volatiles.choicelock?.move||null;p._lastMoveId=q.lastMove?.id||null;p._lastMoveType=q.lastMove?.type||null;
            p._protectStreak=q.volatiles.stall?.counter?Math.round(Math.log(q.volatiles.stall.counter)/Math.log(3)):0;
            const old=p.moves;
            p.moves=q.moveSlots.map((m,i)=>({...(old.find(x=>x.id===m.id)||E._moves?.[m.id]||{}),...this._moveTemplate(m.id),id:m.id,ppLeft:m.pp,pp:m.maxpp}));
            p.volatile=this._volatiles(q);
          }
          const previous=this.activeSlots[side].slice();
          this.activeSlots[side]=s.active.map(q=>q?slotOf(q):-1);this.active[side]=this.activeSlots[side][0]??-1;
          if(this._animOn){for(let slot=0;slot<this.activeSlots[side].length;slot++){
            const to=this.activeSlots[side][slot],from=previous[slot];
            if(to!==from&&to>=0)this._animPush('switch',{side,slot,from:from??-1,to,drag:!!this._psDragging,outFainted:from==null||from<0||!!this.teams[side][from]?.fainted,mon:this._animMon(this.teams[side][to])});
          }}
        }
        this.weather=WEATHER[b.field.weather]||b.field.weather||null;this.weatherTurns=b.field.weatherState.duration||0;
        // Keep legacy weather aliases for AI compatibility; expose the exact
        // canonical identity separately so hail/extreme weather never mislabel.
        this.weatherId=b.field.weather||null;this.weatherSuppressed=!!b.field.weather&&b.sides.every(Boolean)&&b.field.suppressingWeather();
        this.effectiveWeather=this.weatherSuppressed?null:this.weatherId;
        const field={terrain:b.field.terrain?b.field.terrain.replace(/terrain$/,''):null,terrainTurns:b.field.terrainState.duration||0,
          trickRoom:0,gravity:0,magicRoom:0,wonderRoom:0,pseudoWeather:{},sides:[{},{}]};
        for(const [k,v]of Object.entries(b.field.pseudoWeather)){field.pseudoWeather[k]=v.duration??true;const camel={trickroom:'trickRoom',magicroom:'magicRoom',wonderroom:'wonderRoom',gravity:'gravity'}[k];if(camel)field[camel]=v.duration??1;}
        for(const side of [0,1])for(const [k,v]of Object.entries(b.sides[side]?.sideConditions||{}))field.sides[side][k]=v.layers??v.duration??true;
        for(const s of field.sides)for(const k of ['spikes','toxicspikes','stealthrock','stickyweb','reflect','lightscreen','auroraveil','tailwind','safeguard','mist','wideguard','quickguard','matblock'])if(!(k in s))s[k]=0;
        this.field=field;
        // PS exposes the next turn number; the card displays completed turns.
        this.turnCount=this._completedTurns;
        if(b.ended&&this.winner===null){this.winner=b.winner==='我方'?0:b.winner==='敌方'?1:2;this.outcome=this.winner===0?'victory':this.winner===1?'defeat':'draw';}
        const request=b.sides[0]?.activeRequest;
        const forced=(request?.forceSwitch||[]).map((yes,i)=>yes?i:-1).filter(i=>i>=0);
        const normal=forced.filter(i=>this.selectionKind(i)!=='revive');
        const capacity=Math.min(normal.length,this.benchOf(0).length);
        const normalChosen=normal.filter(i=>this._replacementChoices.has(i)).length;
        const normalNeeded=normal.filter(i=>!this._replacementChoices.has(i)).slice(0,Math.max(0,capacity-normalChosen));
        const need=forced.filter(i=>!this._replacementChoices.has(i)&&(this.selectionKind(i)==='revive'||normalNeeded.includes(i)));
        this.pendingSwitch=this.winner===null?(need[0]??null):null;this.pendingSwitches=this.winner===null?need.slice(1):[];
        // Public-information AI must pause while a same-turn switch interrupts PS.
        this._turnState=this.winner===null&&b.requestState==='switch'?{showdown:true}:null;
        if(this._animOn)this._animSync();
      } finally {this._syncing=false;}
    }
    _moveTemplate(id) {
      const m=PS.Dex.moves.get(id);const out={};
      for(const k of ['name','type','category','basePower','accuracy','priority','target','flags','status','volatileStatus','sideCondition','slotCondition','pseudoWeather','weather','terrain','heal','drain','recoil','multihit','secondary','secondaries','boosts','self','selfSwitch','forceSwitch','damage','ohko','zMove','maxMove','isZ','isMax','critRatio','willCrit','selfdestruct','sleepUsable','callsMove']){
        if(m[k]!==undefined&&typeof m[k]!=='function'){
          // Function-valued subfields belong to the PS kernel, never UI clones.
          out[k]=JSON.parse(JSON.stringify(m[k]));
        }
      }return out;
    }
    _volatiles(q) {
      const out={},v=q.volatiles;
      for(const [k,state]of Object.entries(v))out[k]=state.duration??true;
      if(v.confusion)out.confusion=v.confusion.time||1;
      if(v.substitute)out.substitute=v.substitute.hp;
      if(v.mustrecharge)out.recharging={source:q.lastMove?.id||''};
      if(v.twoturnmove){const id=v.twoturnmove.move||q.lastMove?.id;out.chargingMove={id,semi:{fly:'air',bounce:'air',dig:'underground',dive:'underwater',phantomforce:'vanished',shadowforce:'vanished',skydrop:'air'}[id]||null};}
      if(v.lockedmove)out.moveChain={id:q.lastMove?.id,kind:['uproar'].includes(q.lastMove?.id)?'uproar':'rampage',remaining:v.lockedmove.duration};
      if(v.uproar)out.moveChain={id:'uproar',kind:'uproar',remaining:v.uproar.duration};
      if(v.rollout||v.iceball){const id=v.rollout?'rollout':'iceball';out.moveChain={id,kind:'rollout',hits:5-(v[id].duration||5)};}
      if(v.bide)out.bideState={remaining:v.bide.duration,damage:v.bide.totalDamage||0};
      if(v.encore)out.encore={moveId:v.encore.move,turns:v.encore.duration};
      if(v.disable){out.disableMove=v.disable.move;out.disableTurns=v.disable.duration;}
      if(v.attract){const src=this._native(v.attract.source);out.attract={sourceSide:src?src._side:1-q.side.n,sourceIndex:src?this.teams[src._side].indexOf(src):-1};}
      for(const key of ['leechseed','octolock','trapped','jawlock'])if(v[key])out[key]=true;
      for(const key of ['kingsshield','spikyshield','banefulbunker','obstruct','silktrap','burningbulwark','maxguard'])if(v[key])out.protect=true;
      if(v.focusenergy)out.critBoost=2;if(v.laserfocus)out.laserFocusUntil=this._completedTurns+1;
      return out;
    }
    _readProtocol() {
      const b=this._ps;if(!b)return;
      while(this._psCursor<b.log.length){
        const from=this._psCursor;let line=b.log[this._psCursor++];
        if(line.startsWith('|split|')){line=b.log[this._psCursor++];this._psCursor++;}
        if(!line)continue;
        this._psDragging=line.startsWith('|drag|');this._syncFromPS();
        this._protocolLine(line,this._protocolContext?.from===from?this._protocolContext.args:null);this._psDragging=false;
      }
    }
    _byIdent(ident){const match=/^p([12])([a-z])?: /.exec(ident||'');if(!match)return null;const s=this._ps.sides[Number(match[1])-1];if(!s)return null;return this._native(match[2]?s.active[match[2].charCodeAt(0)-97]:s.pokemon.find(q=>q.fullname===ident));}
    _protocolLine(line,args=null) {
      const a=line.split('|'),type=a[1];
      const p=this._native(args?.[1])||this._byIdent(a[2]),name=/^p[12][a-z]?: /.test(a[2]||'')?sourceName(a[2]):p?.name||sourceName(a[2]),target=this._native(args?.[3])||this._byIdent(a[4]);
      const pos=p?this._animPos(p):null;
      if(this._c6Entry&&(type==='move'||type==='turn'||type==='upkeep'||(type==='switch'||type==='drag')&&p===this._c6Entry)){
        if(!this._c6Entry._c6Rocks)this._c6Entry._c6Rocks='no-chip';this._c6Entry=null;}
      const from=a.slice(4).find(x=>x.startsWith('[from] ability: '));if(from&&p)p._aiPublicAbility=norm(from.slice(16));
      switch(type){
        case 'start':this.say(this.double?'双打战斗开始！':'战斗开始！');break; // BeforeSwitchIn has not installed Illusion yet; never reveal the true roster here.
        case 'move': {
          this._prepareNotice=null;
          const m=this._ps.activeMove||PS.Dex.moves.get(norm(a[3])),id=m.id,called=a.some(x=>x.startsWith('[from]'));
          this._c6Contact=null;
          if(!called&&p&&target&&!this.double&&p._side!==target._side&&m.basePower>0&&!m.multihit&&!m.ohko&&!m.selfdestruct&&!m.flags?.charge&&!p.dynamaxed&&!target.dynamaxed&&!p.terastallized&&!target.terastallized&&!this.weather&&!this.field.terrain&&!Object.values(p.stages||{}).some(Boolean)&&!Object.values(target.stages||{}).some(Boolean)&&!p.status&&!target.status&&!this.field.sides.some(s=>s.reflect||s.lightscreen||s.auroraveil)){
           this._c6Contact={p:target,from:p.illusion?.speciesId||p.speciesId,move:id,before:target.hp,t:this.turnCount};}
          if(!called&&p){const u=p._c6GearUsed||=[];if(!u.includes(id))u.push(id);
            if(!this.double){const other=this.cur(1-p._side),clean=!this.weather&&!this.field.terrain&&!this.field.trickRoom&&!this.field.sides.some(s=>s.tailwind)&&[p,other].every(x=>x&&!x.status&&!x.stages?.spe)&&!m.priority&&m.category!=='Status'&&!m.drain&&!m.flags?.heal;
              const shown=x=>x?.illusion?.speciesId||x?.speciesId,prev=this._c6Prev;if(clean&&prev?.clean&&prev.t===this.turnCount&&prev.p===other&&prev.s!==p._side&&prev.spec===shown(other)&&prev.vs===shown(p)){
               p._c6Order={vs:shown(other),first:false,t:this.turnCount};other._c6Order={vs:shown(p),first:true,t:this.turnCount};}
              this._c6Prev={p,s:p._side,t:this.turnCount,clean,spec:shown(p),vs:shown(other)};}}
          if(!called){this.moveCount++;if(p){const seen=p._cmdPublicUsed||=[];if(!seen.includes(id))seen.push(id);const moves=p._aiPublicMoves||=[];let record=moves.find(x=>x.id===id);if(!record)moves.push(record={id,used:0});record.used++;p._aiPublicLastMove=id;p._aiPublicProtectStreak=m.stallingMove?(p._aiPublicProtectStreak||0)+1:0;}}
          if(p){p._participated=true;this._lastMoveAnim=this.anim('move',{...pos,moveId:id,baseId:id,category:m.category,moveType:m.type,moveTarget:m.target,z:!!m.isZ,max:!!m.isMax,targets:target?[this._animPos(target)]:[],prepare:false,cancelled:a.includes('[still]')});}
          this.say(`${name}${called?' 在招式效果中':' '}使用了 ${a[3]}！`);break;
        }
        case 'cant': {
          const reason=a[3];if(reason==='recharge'){this.anim('recharge',pos||{});this.say(`${name} 需要休息，本回合无法行动！`);}
          else{this.anim('cant',{...pos,status:p?.status||null});this.say(reason==='slp'?`${name} 正在熟睡！`:`${name} 因${STATUS[reason]||label(reason)}无法行动！`);}break; // PS also emits cant|slp before a legal Sleep Talk/Snore.
        }
        case '-status': this.say(`${name} 陷入了${STATUS[a[3]]||a[3]}状态！`);break;
        case '-curestatus': this.say(`${name} 的${STATUS[a[3]]||a[3]}状态解除了！`);break;
        case '-cureteam': this.say(`${name} 一方的异常状态被治愈了！`);break;
        case '-damage': {const why=a.slice(4).find(x=>x.startsWith('[from] ')),h=this._c6Contact;
          if(p&&p===this._c6Entry&&why==='[from] Stealth Rock'){p._c6Rocks='hit';this._c6Entry=null;}if(!why&&h&&h.p===p&&h.t===this.turnCount&&p.hp>1&&h.before>p.hp&&!p.volatile?.substitute){p._c6OwnImpact={from:h.from,move:h.move,loss:h.before-p.hp,before:h.before,t:h.t};this._c6Contact=null;}if(why)this.say(`${name} 受到了${label(why.slice(7))}的伤害！`);break;}
        case '-heal': this.say(`${name} 回复了体力！`);break;
        case '-fail': this.say(`${name} 的招式失败了！`);break;
        case '-immune': this.say(`对 ${name} 没有效果……`);break;
        case '-miss': this.anim('miss',{...pos,target:target?this._animPos(target):undefined});this.say(`${name} 的攻击没有命中！`);break;
        case '-supereffective': this.say('效果绝佳！');break;
        case '-resisted': this.say('效果不理想……');break;
        case '-crit': this._c6Contact=null;this.say('击中了要害！');break;
        case '-nothing': this.say('但是什么也没有发生！');break;
        case '-notarget': this.say('没有可攻击的目标，招式失败了！');break;
        case '-mustrecharge': this.say(`${name} 下一回合需要休息！`);break;
        case '-prepare':
          if(this._lastMoveAnim){this._lastMoveAnim.prepare=true;this._lastMoveAnim.cancelled=false;}
          this._prepareNotice={ident:a[2],move:norm(a[3]),index:this.log.length,name};
          this.say(`${name} 正在为 ${label(a[3])} 蓄力！`);break;
        case '-boost': case '-unboost':this.say(`${name} 的${({atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度',accuracy:'命中率',evasion:'闪避率'})[a[3]]||a[3]}${type==='-boost'?'提高':'降低'}了 ${a[4]} 级！`);break;
        case '-clearallboost':this.say('所有宝可梦的能力变化都复原了！');break;
        case '-clearboost':this.say(`${name} 的能力变化复原了！`);break;
        case '-start': this.say(`${name} 获得了${label(a[3])}${a[4]?'（'+a[4]+'）':''}效果！`);break;
        case '-end': this.say(`${name} 的${label(a[3])}效果解除了！`);break;
        case '-singleturn': case '-singlemove':this.say(`${name} 发动了${label(a[3])}！`);break;
        case '-activate':this.say(`${name} 的${label(a[3])}发动了！`);break;
        case '-block':this.say(`${name} 被${label(a[3])}保护着！`);break;
        case '-sidestart':this.say(`${name} 一方出现了${label(a[3])}！`);break;
        case '-sideend':this.say(`${name} 一方的${label(a[3])}消失了！`);break;
        case '-fieldstart':this.say(`${label(a[2])}生效了！`);break;
        case '-fieldend':this.say(`${label(a[2])}消失了！`);break;
        case '-weather':if(!a.includes('[upkeep]'))this.say(WEATHER_ZH[norm(a[2])]||`${a[2]}天气生效了！`);break;
        case '-ability':if(p)p._aiPublicAbility=norm(a[3]);this.say(`${name} 的${a[3]}特性发动了！`);break;
        case '-endability':this.say(`${name} 的特性失效了！`);break;
        case '-item':if(p){p._aiPublicItem=norm(a[3]);p._aiPublicItemKnown=true;if(a.some(x=>/\[from\] move: (Trick|Switcheroo|Bestow|Thief|Covet)/.test(x))){p._itemTransferOccurred=true;p._c6Rocks=null;p._c6OwnImpact=null;p._c6Order=null;p._c6GearUsed=[];if(this._c6Entry===p)this._c6Entry=null;}}this.say(`${name} 的道具 ${a[3]} 生效了！`);break;
        case '-enditem':if(p){p._c6Rocks=null;p._c6OwnImpact=null;p._c6Order=null;if(this._c6Entry===p)this._c6Entry=null;p._c6GearUsed=[];p._aiPublicItem=null;p._aiPublicItemKnown=true;if(a.includes('[eat]'))p._ateBerry=true;const moved=a.some(x=>(x.startsWith('[from] move:')&&!x.startsWith('[from] move: Fling'))||x.startsWith('[from] ability: Pickpocket')||x.startsWith('[from] ability: Magician'));if(moved)p._itemTransferOccurred=true;}this.say(`${name} ${a.includes('[eat]')?'吃下':'失去了'} ${a[3]}！`);break;
        case 'switch':case 'drag':this._c6Prev=null;this._c6Contact=null;if(p){p._c6Rocks=null;if(!this.double&&!this.field.magicRoom&&this.field.sides[p._side]?.stealthrock)this._c6Entry=p;p._c6OwnImpact=null;p._c6Order=null;p._c6GearUsed=[];p._cmdPublicUsed=[];p._aiPublicLastMove=null;p._aiPublicProtectStreak=0;}if(!this._initializing)this.say(`${name} ${type==='drag'?'被迫':'替换'}上场了！`);break;
        case 'faint':this.aiObserver?.see(p);this.say(`${name} 失去了战斗能力！`);break;
        case '-mega':if(p)this.mechanicUsed[p._side].mega=true;this.say(`${name} 超级进化了！`);break;
        case '-zpower':if(p)this.mechanicUsed[p._side].z=true;this.anim('zpower',pos||{});this.say(`${name} 发动了Ｚ力量！`);break;
        case '-terastallize':if(p)this.mechanicUsed[p._side].tera=true;this.say(`${name} 太晶化了（${a[3]}）！`);break;
        case '-anim':
          // Upstream emits -prepare even for SAME-TURN attacks (sun/rain or
          // Power Herb), then -anim. Amend that presentation line in place:
          // do not delete logs or shift HP/animation indices, and never infer
          // skipped charging from raw weather or from damage alone.
          if(this._prepareNotice?.ident===a[2]&&this._prepareNotice.move===norm(a[3])){
            const notice=this._prepareNotice;this.log[notice.index]=`${notice.name} 立即发动了 ${label(a[3])}！`;this._prepareNotice=null;
          }
          if(this._lastMoveAnim){this._lastMoveAnim.prepare=false;this._lastMoveAnim.cancelled=false;if(target)this._lastMoveAnim.targets=[this._animPos(target)];}break;
        case '-message': case 'message':this.say(a[2]);break;
        case 'win':this.say(a[2]==='我方'?'战斗胜利！':'眼前一片漆黑……');break;
        case 'tie':if(!this.outcome)this.say('双方同时失去战斗能力，本场平局。');break;
        case 'error':this.lastRuleError=a[2];break;
        default:break; // Raw canonical replay remains in _ps.log, not discarded.
      }
      if(type==='-start'&&norm(a[3])==='dynamax'&&p)this.mechanicUsed[p._side].dynamax=true;
    }
    _gymResult(){
      if(!this.firstFaintLoses||!this._ps||this._initializing||this.winner!==null)return;
      const down=this._ps.sides.map(s=>s?.active.some(q=>q&&(q.fainted||q.hp<=0)));
      if(!down[0]&&!down[1])return;
      this.winner=down[0]&&down[1]?2:down[1]?0:1;this.outcome=this.winner===2?'draw':this.winner===0?'victory':'defeat';
      if(!this._ps.ended)this._ps.win(this.winner===2?null:this._ps.sides[this.winner]);
      this.say(this.winner===2?'双方同一步骤均失去战斗能力；榴柑道馆同时倒下请人工裁定。':this.winner===0?'对方有一只失去战斗能力，按榴柑道馆规则全组落败；我方获胜！':'我方有一只失去战斗能力，按榴柑道馆规则全组落败。');
    }
    _escape(reason,message){this.outcome='escaped';this.escapeReason=reason;this.winner=0;this.pendingSwitch=null;this.pendingSwitches=[];this.say(message);if(!this._ps.ended)this._ps.tie();}
    lockInfo(p){
      const q=this._pokemon(p);if(!q||q.fainted)return null;
      const id=q.getLockedMove();if(!id)return null;
      if(id==='recharge')return{id,kind:'recharge',label:'本回合休息',reason:'上一招后需要休息，本回合不能换人、使用道具或逃走。'};
      return{id,kind:q.volatiles.twoturnmove?'charge':id==='bide'?'bide':'lockedmove',label:PS.Dex.moves.get(id).name,reason:'正在完成连续行动，本回合必须继续该行动。'};
    }
    requestFor(p){const q=this._pokemon(p);return q&&q.isActive?q.getMoveRequestData():null;}
    skipAction(p){const q=this._pokemon(p);return !q||q.fainted||!!q.volatiles.commanding;}
    forcedAction(p){const lock=this.lockInfo(p);if(!lock)return null;return{kind:'move',index:Math.max(0,p.moves.findIndex(m=>m.id===lock.id)),forced:true,...(lock.kind==='recharge'?{recharge:true}:{} )};}
    needsStruggle(p,mechanic){const request=this.requestFor(p);if((mechanic==='dynamax'||this._pokemon(p)?.volatiles.dynamax)&&request?.maxMoves?.maxMoves.some(m=>!m.disabled))return false;return request?.moves.length===1&&request.moves[0].id==='struggle';}
    moveReason(p,index,mechanic){
      const q=this._pokemon(p);if(!q||q.fainted||q.volatiles.commanding)return '该宝可梦当前不需要选择行动。';
      const locked=this.lockInfo(p);if(locked)return null;
      const req=q.getMoveRequestData(),m=p.moves[index];if(!m)return '没有这项招式。';
      if(mechanic&&!this._canMechanic(q,mechanic,index))return '当前不能发动该特殊机制。';
      if(this.needsStruggle(p,mechanic))return '已没有可用招式，请使用挣扎。';
      const option=(mechanic==='dynamax'||q.volatiles.dynamax)?req.maxMoves?.maxMoves[index]:mechanic==='z'?req.canZMove?.[index]:req.moves.find(x=>x.id===m.id);
      if(!option||option.disabled)return `${p.name} 当前无法使用 ${m.name}。`;
      return null;
    }
    mechanicReason(p,kind){const q=this._pokemon(p);if(!q||this.lockInfo(p)||!p.moves.some((m,i)=>this._canMechanic(q,kind,i)))return '当前规则请求不允许发动该特殊机制。';return null;}
    moveView(p,base,mechanic){
      const q=this._pokemon(p);if(!q||!base)return base;
      const b=this._ps,m=b.dex.moves.get(base.id);let shown=b.dex.getActiveMove(m);
      if(mechanic==='z'&&this._canMechanic(q,'z',p.moves.findIndex(x=>x.id===base.id))){shown=b.actions.getActiveZMove(m,q);shown._isZ=true;}
      else if(q.volatiles.dynamax||mechanic==='dynamax'){shown=b.actions.getActiveMaxMove(m,q);shown._isMax=true;}
      const out={...this._moveTemplate(shown.id),...shown,id:shown.id,pp:base.pp,ppLeft:base.ppLeft,_baseId:base.id};
      // Base request owns variable targets (e.g. non-Ghost Curse); Z/Max own theirs.
      if(!out._isZ&&!out._isMax)out.target=q.getMoveRequestData().moves.find(x=>x.id===base.id)?.target||out.target;
      return out;
    }
    selectionKind(slot=this.pendingSwitch){return this._ps?.sides[0]?.slotConditions[slot]?.revivalblessing?'revive':'switch';}
    replacementOptions(slot=this.pendingSwitch){
      if(slot===null)return [];
      const reserved=[...this._replacementChoices.entries()].filter(([s])=>s!==slot).map(([,i])=>i),revive=this.selectionKind(slot)==='revive';
      return this.teams[0].map((p,i)=>({p,i})).filter(({p,i})=>!reserved.includes(i)&&(revive?p.fainted:!p.fainted&&p.hp>0&&!this.activeSlots[0].includes(i))).map(({i})=>i);
    }
    actionReason(p,action){
      if(!p||!action)return null;
      const lock=this.lockInfo(p);if(lock&&!['move','pass','wait'].includes(action.kind))return `${p.name} ${lock.reason}`;
      if(action.kind==='move'&&!action.struggle)return this.moveReason(p,action.index,action.mechanic);
      const q=this._pokemon(p);
      if(action.kind==='switch'){
        if(q?.trapped&&!q.hasItem('shedshell')&&!q.hasType('Ghost'))return `${p.name} 被困住了，无法交换！`;
        if(action.index===undefined)return null;
        const next=this.teams[p._side]?.[action.index];if(!next||next.fainted||next.hp<=0||this.activeSlots[p._side].includes(action.index))return '请选择未上场且能够战斗的宝可梦。';
      }
      return null;
    }
    _canMechanic(q,kind,index){const p=this._native(q),used=this.mechanicUsed[q.side.n];if(!p||p.mechanic!==kind||used[kind])return false;
      if(kind==='mega')return !!q.canMegaEvo;
      if(kind==='tera')return !!q.canTerastallize;
      if(kind==='z')return !!this._ps.actions.canZMove(q)?.[index];
      if(kind==='dynamax')return !!q.getDynamaxRequest();return false;
    }
    _choice(q,action={kind:'move',index:0}){
      if(!q||q.fainted||q.volatiles.commanding)return 'pass';
      const p=this._native(q),side=q.side.n;
      if(action.kind==='switch'){const next=this._pokemon(this.teams[side][action.index]);return 'switch '+(next.position+1);}
      const req=q.getMoveRequestData(),locked=this.lockInfo(p);
      // A locked request is a synthetic one-entry menu, not a learned move ID.
      // Sending its numeric slot avoids PS treating the synthetic 'recharge'
      // name as a normal-target move and demanding a target in doubles.
      if(locked)return 'move 1';
      let id=action.struggle?'struggle':p.moves[action.index]?.id;
      if(req.moves.length===1&&req.moves[0].id==='struggle')id='struggle';
      const m=PS.Dex.moves.get(id),event=!locked&&this._canMechanic(q,action.mechanic,action.index)?({mega:'mega',z:'zmove',dynamax:'dynamax',tera:'terastallize'})[action.mechanic]:'';
      let targetType=req.moves.find(x=>x.id===id)?.target||m.target;
      if(event==='zmove')targetType=req.canZMove?.[action.index]?.target||targetType;
      if(event==='dynamax'||q.volatiles.dynamax)targetType=req.maxMoves?.maxMoves[action.index]?.target||this._ps.actions.getMaxMove(m,q)?.target||targetType;
      let target='';
      if(this.double&&['normal','adjacentFoe','any','adjacentAlly','adjacentAllyOrSelf'].includes(targetType)&&!locked){
        const loc=action.target;let slot=loc?.slot,ts=loc?.side;
        if(!Number.isInteger(slot)){ts=['adjacentAlly','adjacentAllyOrSelf'].includes(targetType)?side:1-side;slot=this._ps.sides[ts].active.findIndex(t=>t&&!t.fainted&&(ts!==side||t!==q||targetType==='adjacentAllyOrSelf'));}
        if(slot>=0)target=' '+(ts===side?-(slot+1):slot+1);
      }
      return 'move '+(id||req.moves.find(m=>!m.disabled)?.id||'struggle')+target+(event?' '+event:'');
    }
    _enemyActions(){const reserved=new Set();return Array.from({length:this.double?2:1},(_,slot)=>{const a=this.aiAction(1,slot,reserved)||{kind:'move',index:0};if(a.kind==='switch')reserved.add(a.index);return a;});}
    _selectMoves(side,actions){
      const s=this._ps.sides[side];s.clearChoice();
      for(let slot=0;slot<s.active.length;slot++){
        const q=s.active[slot],a=actions[slot]||{kind:'pass'};
        if(!q||q.fainted||q.volatiles.commanding){s.choosePass();continue;}
        if(['pass','wait','item'].includes(a.kind)){
          // Adventure item/failed throw occupies this slot's turn. Queue pass is
          // an official PS queue action, not a fake learned move with side effects.
          s.choice.actions.push({choice:'pass',pokemon:q});continue;
        }
        const text=this._choice(q,a);
        const ok=s.choose(text);
        // Side.choose clears the entire choice; submit the full double string below instead.
        if(!ok)return false;
        break;
      }
      return true;
    }
    _submit(side,actions){
      const s=this._ps.sides[side];s.clearChoice();
      const texts=s.active.map((q,slot)=>{
        const a=actions[slot]||{kind:'pass'};
        if(!q||q.fainted||q.volatiles.commanding)return 'pass';
        if(['pass','wait','item'].includes(a.kind)){const req=q.getMoveRequestData(),first=req.moves.find(x=>!x.disabled);const index=Math.max(0,this._native(q).moves.findIndex(m=>m.id===first?.id));return this._choice(q,{kind:'move',index,struggle:first?.id==='struggle'});}
        return this._choice(q,a);
      });
      if(!s.choose(texts.join(', ')))return false;
      // Replace only explicit adventure passes, before either side is committed.
      for(let i=0;i<s.choice.actions.length;i++)if(['pass','wait','item'].includes(actions[i]?.kind)&&!this.lockInfo(this._native(s.active[i])))s.choice.actions[i]={choice:'pass',pokemon:s.active[i]};
      return s.isChoiceDone();
    }
    turn(action){
      if(action?.kind==='capture')return this.captureTurn?this.captureTurn(action):[];
      if(this.winner!==null||this.pendingSwitch!==null||this._ps.requestState!=='move')return [];
      if(action?.kind==='item'&&action.id==='pokemondoll')return this.escapeWithDoll();
      const start=this.log.length,actions=this.double&&action?.kind==='double'?action.actions:[action||{kind:'pass'}];
      // One trainer bag item per turn; reject before any partial effect/stock mutation.
      if(actions.filter(a=>a?.kind==='item').length>1){this.say('同一训练家每回合最多使用一次背包道具，请为另一出战位选择招式或换人。');return this.log.slice(start);}
      for(let slot=0;slot<actions.length;slot++){const reason=this.actionReason(this.cur(0,slot),actions[slot]);if(reason){this.say(reason);return this.log.slice(start);}}
      // Ask the unchanged public-information AI before applying player items.
      const enemy=this._enemyActions();
      if(!this._submit(0,actions)){this.say('行动校验未通过：'+(this._ps.sides[0].choice.error||'请重新选择。'));this._ps.sides[0].clearChoice();return this.log.slice(start);}
      if(!this._submit(1,enemy)){
        // Only the AI may fall back, never a player's chosen move.
        const side=this._ps.sides[1];side.clearChoice();side.autoChoose();
        if(!side.isChoiceDone())throw Error('AI无法给出合法行动；本回合未提交。');
      }
      for(let slot=0;slot<actions.length;slot++)if(actions[slot]?.kind==='item'){
        if(!this.useTrainerItem(actions[slot].id,slot)){this._ps.sides.forEach(s=>s.clearChoice());this.say('道具未生效，本回合未推进。');return this.log.slice(start);}
      }
      this.turnMarks.push(start);this._completedTurns++;this.turnCount=this._completedTurns;
      this._ps.commitChoices();this._replacementChoices.clear();this._readProtocol();this._syncFromPS();this._pumpReplacements();return this.log.slice(start);
    }
    turnDouble(actions){return this.turn({kind:'double',actions});}
    _enemyReplacementRequest(){
      const s=this._ps.sides[1],force=s.activeRequest?.forceSwitch||[],reserved=[...s.choice.switchIns].map(i=>slotOf(s.pokemon[i])).filter(Number.isInteger);
      return{totalSlots:s.active.length,switchesLeft:s.choice.forcedSwitchesLeft,passesLeft:s.choice.forcedPassesLeft,reserved,slots:s.active.map((q,slot)=>{
        if(!force[slot])return{slot,kind:'pass',candidates:[]};
        const revive=!!s.slotConditions[slot]?.revivalblessing;
        return{slot,kind:revive?'revive':'switch',phase:q.hp>0&&!q.fainted?'pivot':'faint',...(typeof q.switchFlag==='string'&&this._ps.dex.moves.get(q.switchFlag).selfSwitch?{relayMove:q.switchFlag}:{}),candidates:s.pokemon.filter(p=>!reserved.includes(slotOf(p))&&(revive?p.fainted:p.hp>0&&!p.fainted&&!s.active.includes(p))).map(slotOf),...(typeof q.switchFlag==='string'&&this._ps.dex.moves.get(q.switchFlag).selfSwitch==='copyvolatile'?{passStages:{...q.boosts}}:{})};
      })};
    }
    _planEnemyReplacement(){
      const side=this._ps.sides[1],request=side.activeRequest;if(!request?.forceSwitch)return null;
      if(this._enemyReplacementCache?.request===request)return this._enemyReplacementCache;
      // Compute before accepting any human replacement. Never pass the live PS
      // side, player choice/actions, queue, or RNG to the planner.
      side.clearChoice();let actions=null,error=null;
      try{if(!this.aiController?.replacements)throw Error('公开信息替补AI尚未附着');actions=this.aiController.replacements(this._enemyReplacementRequest());}
      catch(e){error=String(e.message||e);this.aiController?.replacementFailure?.(error);}
      return this._enemyReplacementCache={request,actions,error};
    }
    _submitEnemyReplacement(){
      const s=this._ps.sides[1],plan=this._planEnemyReplacement();if(!plan)return;
      let ok=false;
      if(Array.isArray(plan.actions)){
        try{
          const own=this._enemyReplacementRequest(),seen=new Set();
          if(plan.actions.length!==s.active.length)throw Error('替补组合槽位数不完整');
          const texts=plan.actions.map((a,slot)=>{
            const rule=own.slots[slot];if(!rule||rule.kind==='pass'){if(a.kind!=='pass')throw Error('无替补请求的槽位收到换人');return'pass';}
            if(a.kind==='pass')return'pass';
            if(a.kind!=='switch'||!rule.candidates.includes(a.index)||rule.kind!=='revive'&&seen.has(a.index))throw Error('替补目标不在本方规则候选中');
            if(rule.kind!=='revive')seen.add(a.index);
            const target=this._pokemon(this.teams[1][a.index]);return'switch '+(target.position+1);
          });
          ok=s.choose(texts.join(', '))&&s.isChoiceDone();
          if(!ok)throw Error(s.choice.error||'替补组合未完成规则请求');
        }catch(e){this.aiController?.replacementFailure?.(String(e.message||e));}
      }
      // Last-resort legal fallback, never advertised as a searched decision.
      if(!ok){s.clearChoice();s.autoChoose();}
    }
    _pumpReplacements(){
      const b=this._ps;let safety=0;
      while(!b.ended&&b.requestState==='switch'&&this.winner===null){
        if(++safety>32)throw Error('连续替换超过安全上限；请保留战斗日志。');
        this._syncFromPS();const p1=b.sides[0],p2=b.sides[1];
        if(p2.activeRequest?.forceSwitch)this._planEnemyReplacement();
        if(p1.activeRequest?.forceSwitch&&this.pendingSwitch!==null)return;
        for(const s of [p1,p2]){
          if(!s.activeRequest?.forceSwitch)continue;
          if(s===p2)this._submitEnemyReplacement();else{s.clearChoice();s.autoChoose();}
        }
        if(b.allChoicesDone()){b.commitChoices();this._replacementChoices.clear();this._readProtocol();this._syncFromPS();}else return;
      }
      this._syncFromPS();
    }
    forceSwitch(index){
      if(this.pendingSwitch===null||this.winner!==null)return false;
      if(!this.replacementOptions().includes(index))return false;
      this._planEnemyReplacement(); // Lock AI's plan before storing ANY human target.
      const slot=this.pendingSwitch;this._replacementChoices.set(slot,index);this._syncFromPS();if(this.pendingSwitch!==null)return true;
      const s=this._ps.sides[0],text=s.active.map((q,i)=>s.activeRequest.forceSwitch[i]&&this._replacementChoices.has(i)?'switch '+(this._pokemon(this.teams[0][this._replacementChoices.get(i)]).position+1):'pass').join(', ');
      if(!s.choose(text)){this._replacementChoices.delete(slot);this._syncFromPS();this.say('替换校验失败：'+s.choice.error);return false;}
      const enemy=this._ps.sides[1];if(enemy.activeRequest?.forceSwitch)this._submitEnemyReplacement();
      if(this._ps.allChoicesDone()){this._ps.commitChoices();this._replacementChoices.clear();this._readProtocol();this._syncFromPS();this._pumpReplacements();}
      return true;
    }
    escapeWithDoll(){
      if(this.winner!==null||this.encounterType!=='wild'||this.pendingSwitch!==null||!(this.itemStock.pokemondoll>0))return [];
      const start=this.log.length,reason=this.actionReason(this.cur(0),{kind:'run'});if(reason){this.say(reason);return this.log.slice(start);}
      this.itemStock.pokemondoll--;this._escape('doll','使用了宝可梦玩偶，成功从野生战斗中逃走！');return this.log.slice(start);
    }
    useTrainerItem(id,slot=0){
      const p=this.cur(0,slot),q=this._pokemon(p);if(!q||q.fainted||!(this.itemStock[id]>0)||this.lockInfo(p))return false;
      const boosts={xattack:{atk:2},xdefense:{def:2},xspatk:{spa:2},xspdef:{spd:2},xspeed:{spe:2},xaccuracy:{accuracy:2}};
      let ok=false;
      if(id==='guardspec')ok=!!q.side.addSideCondition('mist',q,{id:'guardspec',name:'能力防守',effectType:'Item'});
      else if(id==='direhit')ok=!!q.addVolatile('focusenergy',q,{id:'direhit',name:'要害攻击',effectType:'Item'});
      else if(boosts[id])ok=!!this._ps.boost(boosts[id],q,q,{id,name:id,effectType:'Item'});
      if(ok){this.itemStock[id]--;this.say(`对 ${p.name} 使用了 ${id}！`);}this._readProtocol();this._syncFromPS();return ok;
    }
    setTerrain(id,turns=5,source=null,opts={}){
      if(!this._ps)return false;const b=this._ps,q=this._pokemon(source)||b.sides[0].active[0],key=ENV.terrainId(id);
      if(!key&&!ENV.isClear(id))return false;
      const out=key?b.field.setTerrain(key,q):b.field.clearTerrain();
      if(out&&key)b.field.terrainState.duration=ENV.turns(turns);
      this._readProtocol();this._syncFromPS();return out;
    }
    setWeather(id,turns=5,source=null,opts={}){
      if(!this._ps)return false;const b=this._ps,q=this._pokemon(source)||b.sides[0].active[0],key=ENV.weatherId(id);
      if(!key&&!ENV.isClear(id))return false;
      const out=key?b.field.setWeather(key,q):b.field.clearWeather();
      if(out&&key)b.field.weatherState.duration=ENV.turns(turns);
      this._readProtocol();this._syncFromPS();return out;
    }
    tryStatus(p,status,source=p,opts={}){const q=this._pokemon(p),s=this._pokemon(source);if(!q)return false;const out=q.trySetStatus(status,s,opts.effect||{id:'nativeeffect',name:'状态效果',effectType:'Move'});this._readProtocol();this._syncFromPS();return !!out;}
    tryConfusion(p,source=p){const q=this._pokemon(p),out=q?.addVolatile('confusion',this._pokemon(source));this._readProtocol();this._syncFromPS();return !!out;}
    heal(p,amount,why=''){const q=this._pokemon(p);if(!q)return 0;const out=this._ps.heal(amount,q,q,{id:'nativeheal',name:why||'回复',effectType:'Condition'});this._readProtocol();this._syncFromPS();return Number(out)||0;}
    changeStages(p,boosts,source=p){const q=this._pokemon(p);if(!q)return false;const out=this._ps.boost(boosts,q,this._pokemon(source));this._readProtocol();this._syncFromPS();return out;}
    useMove(side,user,target,move,opts={}){const q=this._pokemon(user),t=this._pokemon(target);if(!q)return false;const out=this._ps.actions.useMove(move.id,q,{target:t});this._readProtocol();this._syncFromPS();return out;}
    completeCapture(){
      this._completedTurns=this.turnCount;this.pendingSwitches=[];this._turnState=null;
      // PS has no capture win condition. Tie closes its queue; the facade retains
      // the explicit captured outcome and is authoritative for adventure results.
      if(!this._ps.ended)this._ps.tie();this._readProtocol();this._syncFromPS();
    }
    captureSpec(p){
      const q=this._pokemon(p),set=q.set;
      return {species:PS.Dex.species.get(set.species).id,level:p.level,nature:p.nature||'',ability:norm(set.ability),item:q.item||'',
        moves:q.baseMoveSlots.map(m=>m.id),pp:q.baseMoveSlots.map(m=>m.pp),ivs:{...q.set.ivs},evs:{...q.set.evs},
        nickname:p.hasNickname?p.name:'',shiny:!!p.shiny,gender:p.gender||null,mechanic:'',megaForm:'',dynamaxForm:'',zType:'',teraType:''};
    }
    persistentPokemon(p){
      const q=this._pokemon(p),i=this.teams[p._side].indexOf(p),base=this._persistent[p._side][i];
      if(!q||!base)return {};
      // Return to the outside-battle HP scale WITHOUT modifying the live replay.
      // Temporary Transform/Mimic moves/PP, Mega stats and Dynamax HP never enter saves.
      return {hp:q.hp>0?Math.max(1,Math.ceil(q.hp*base.maxHp/q.maxhp)):0,maxHp:base.maxHp,stats:{...base.stats},sleepTurns:q.status==='slp'?(q.statusState.time||0):0,
        // Sketch explicitly updates PS.baseMoveSlots. Transform/Mimic do not.
        // A narrow change record lets the host persist Sketch without accepting
        // arbitrary temporary moves or overwriting a changed outside-battle set.
        permanentMoveChanges:q.baseMoveSlots.flatMap((m,slot)=>norm(q.set.moves[slot])==='sketch'&&m.id!=='sketch'?[{slot,from:'sketch',to:m.id}]:[]),
        moves:q.baseMoveSlots.map(m=>({id:m.id,ppLeft:m.pp,pp:m.maxpp}))};
    }
    result(){const result=super.result();for(const [key,side]of [['playerTeam',0],['enemyTeam',1]])result[key].forEach((p,i)=>Object.assign(p,this.persistentPokemon(this.teams[side][i])));return {...result,rulesEngine:{...this.rulesEngine}};}
    canonicalReplay(){return {rulesEngine:{...this.rulesEngine},inputLog:this._ps.inputLog.slice(),log:this._ps.log.slice()};}
  }
  const createPokemon=E.createPokemon;
  E.createPokemon=(species,level,moves,opts={})=>{const p=createPokemon(species,level,moves,opts),h=opts.happiness??opts.friendship?.official;if(h!==undefined&&h!==null&&Number.isFinite(Number(h)))p.happiness=Math.max(0,Math.min(255,Math.floor(Number(h))));return p;};
  E.commandVersion='kanto-crown-v72';
  E.replacementVersion=REPLACEMENT_VERSION;
  E.Battle=ShowdownBattle;E.rulesEngine={id:'pokemon-showdown',commit:COMMIT,adapter:VERSION,ready:true};
  E.rulesPatchVersion=VERSION;E.showdown=PS;E.fieldInteractionVersion=ENV.version;
  // Native lookup data and button previews must not keep old approximated effects.
  const hydrate=moves=>{for(const id of Object.keys(moves||{})){const m=PS.Dex.moves.get(id);if(!m.exists)continue;const data={...ShowdownBattle.prototype._moveTemplate(id),pp:m.pp};for(const key of Object.keys(moves[id]))delete moves[id][key];Object.assign(moves[id],data);}};
  const nativeSetData=E.setData;E.setData=(dex,moves)=>{nativeSetData(dex,moves);hydrate(moves);};if(E._moves)hydrate(E._moves);
  E.prepareMove=(_p,_t,move)=>move;
  E.transformMove=(p,move,mechanic)=>p?._battle instanceof ShowdownBattle?p._battle.moveView(p,move,mechanic):move;
  E.effectiveBasePower=(_p,_t,move)=>Number(move?.basePower)||0; // UI base power, never a second damage engine.
  // Do not loosen save validation or identity selection. Names/descriptions use
  // pinned upstream data; existence does not claim every branch was tested.
  if(root.PKMMechanics){const C=root.PKMMechanics,text=root.PKMShowdownText||{};
    for(const [kind,table]of [['abilities',C.ABILITIES],['items',C.ITEMS]])for(const m of PS.Dex[kind].all()){
      const prev=table[m.id],tr=text[kind]?.[m.id];table[m.id]={id:m.id,name:tr?.name||prev?.name||m.name,desc:tr?.zh||tr?.shortDesc||tr?.desc||'效果依照已锁定版本的Showdown规则结算。'};
    }
    C.isSupportedAbility=id=>!!PS.Dex.abilities.get(norm(id)).exists;
    C.isSupportedItem=id=>!!PS.Dex.items.get(norm(id)).exists;
  }
})(typeof globalThis!=='undefined'?globalThis:this);
