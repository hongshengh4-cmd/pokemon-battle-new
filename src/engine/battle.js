/*
 * PKM Battle Engine - singles and doubles (up to 6v6 teams).
 * Pure logic, no DOM. Depends on global PKMTypeChart.
 * Phase 1 scope: stats/IV/nature, damage formula, priority/speed order,
 * accuracy, crit, STAB, burn, weather basics (sun/rain/sand), major status
 * (par/brn/psn/tox/slp/frz), confusion, stat stages, secondary effects,
 * boosts/drain/recoil/heal/multihit from Showdown-style move data,
 * switching, simple AI. Phase 3 adds a curated ability/item set, weather
 * abilities/moves, terrains, entry hazards, screens, Tailwind and Trick Room.
 * Phase 4A adds Mega Evolution, Z-Moves, Dynamax/Gigantamax and Terastallization
 * in singles and doubles.
 */
(function (root) {
  'use strict';
  const { effectiveness } = root.PKMTypeChart || (typeof require !== 'undefined' ? require('./typechart.js') : {});

  const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const BATTLE_STATS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'];
  const NATURES = {
    adamant: ['atk', 'spa'], modest: ['spa', 'atk'], jolly: ['spe', 'spa'], timid: ['spe', 'atk'],
    bold: ['def', 'atk'], calm: ['spd', 'atk'], impish: ['def', 'spa'], careful: ['spd', 'spa'],
    brave: ['atk', 'spe'], quiet: ['spa', 'spe'], relaxed: ['def', 'spe'], sassy: ['spd', 'spe'],
    lonely: ['atk', 'def'], mild: ['spa', 'def'], hasty: ['spe', 'def'], naive: ['spe', 'spd'],
    naughty: ['atk', 'spd'], rash: ['spa', 'spd'], lax: ['def', 'spd'], gentle: ['spd', 'def'],
  };
  const STATUS_NAMES = { par: '麻痹', brn: '灼伤', psn: '中毒', tox: '剧毒', slp: '睡眠', frz: '冰冻' };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clampStage = v => Math.max(-6, Math.min(6, v));
  function stageMult(stage, kind) {
    stage = clampStage(stage);
    if (kind === 'acc') return stage >= 0 ? (3 + stage) / 3 : 3 / (3 - stage);
    if (kind === 'eva') return stage >= 0 ? 3 / (3 + stage) : (3 - stage) / 3;
    return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  }

  function calcStats(species, level, opts = {}) {
    const ivs = Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, opts.ivs || {});
    const evs = Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, opts.evs || {});
    const nature = (opts.nature || '').toLowerCase();
    const [up, down] = NATURES[nature] || [null, null];
    const out = {};
    for (const k of STAT_KEYS) {
      const base = species.baseStats[k], evQuarter=Math.floor(Math.max(0,Math.min(252,Number(evs[k])||0))/4);
      if (k === 'hp') { out.hp = Math.floor(((2 * base + ivs[k] + evQuarter) * level) / 100) + level + 10; continue; }
      let v = Math.floor(((2 * base + ivs[k] + evQuarter) * level) / 100) + 5;
      if (up === k) v = Math.floor(v * 1.1);
      if (down === k) v = Math.floor(v * 0.9);
      out[k] = v;
    }
    return out;
  }

  let DEX = {}, MOVES = {};
  // 数据包里没有描述的“自我替换 / 强制替换 / 无视地面免疫”，在装载数据时补上
  const MOVE_EFFECT_PATCH = {
    voltswitch: { selfSwitch: true }, uturn: { selfSwitch: true }, flipturn: { selfSwitch: true },
    partingshot: { selfSwitch: true }, chillyreception: { selfSwitch: true }, shedtail: { selfSwitch: true },
    teleport: { selfSwitch: true }, batonpass: { selfSwitch: 'copyvolatile' },
    roar: { forceSwitch: true }, whirlwind: { forceSwitch: true },
    dragontail: { forceSwitch: true }, circlethrow: { forceSwitch: true },
    thousandarrows: { ignoreImmunity: { Ground: true } }, thousandwaves: { ignoreImmunity: { Ground: true } },
  };
  function setData(dex, moves) {
    DEX = dex || {}; MOVES = moves || {};
    for (const [id, extra] of Object.entries(MOVE_EFFECT_PATCH)) if (MOVES[id]) Object.assign(MOVES[id], extra);
  }
  const normId = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const MECH = root.PKMMechanics || null;
  const TYPE_ITEMS = MECH?.TYPE_ITEMS || {};
  const abilityId = p => p?._abilitySuppressed ? '' : normId(p?.ability || '');
  const itemId = p => normId(p?.item || '');
  const hasAbility = (p, ...ids) => ids.includes(abilityId(p));
  const STAT_LABELS = { atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度', accuracy: '命中率', evasion: '闪避率' };
  const PINCH_ABILITIES = { Fire: 'blaze', Water: 'torrent', Grass: 'overgrow', Bug: 'swarm' };
  const STATUS_BY_ABILITY = { static: 'par', flamebody: 'brn', poisonpoint: 'psn' };
  const newSideField = () => ({ stealthrock: false, spikes: 0, toxicspikes: 0, stickyweb: false, reflect: 0, lightscreen: 0, auroraveil: 0, tailwind: 0, safeguard: 0, wideguard: false, quickguard: false, matblock: false });

  // 千箭齐发 / 千波激荡：数据里带 ignoreImmunity，可以打中飞行系与飘浮特性
  const ignoresImmunity = (move, type) => !!move && (move.ignoreImmunity === true
    || !!(move.ignoreImmunity && type && move.ignoreImmunity[type]));
  function isGrounded(p) {
    if (!p) return false;
    if (p._battle?.field?.gravity > 0) return true;
    if (p.volatile?.smackdown || p.volatile?.ingrain) return true;   // 被击落 / 扎根
    if (p.volatile?.magnetrise || p.volatile?.telekinesis) return false; // 电磁飘浮 / 念力挪移
    return !p.types?.includes('Flying') && abilityId(p) !== 'levitate';
  }
  const MAJOR_STATUSES = new Set(['par', 'brn', 'psn', 'tox', 'slp', 'frz']);
  function statusImmunityReason(p, status, battle = p?._battle) {
    const st = String(status || '').toLowerCase(), ab = abilityId(p), types = p?.types || [];
    if (!MAJOR_STATUSES.has(st)) return 'invalid';
    const abilityBlocked = (st === 'brn' && ab === 'waterveil') || (st === 'par' && ab === 'limber')
      || (st === 'slp' && ['insomnia', 'vitalspirit'].includes(ab)) || (['psn', 'tox'].includes(st) && ab === 'immunity')
      || (st === 'frz' && ab === 'magmaarmor') || ab === 'purifyingsalt' || ab === 'comatose'
      || (st === 'slp' && ab === 'leafguard' && battle?.weather === 'sun');
    if (abilityBlocked) return 'ability';
    if ((st === 'brn' && types.includes('Fire')) || (st === 'frz' && types.includes('Ice'))
      || (st === 'par' && types.includes('Electric')) || (['psn', 'tox'].includes(st) && (types.includes('Poison') || types.includes('Steel')))) return 'type';
    if (battle && isGrounded(p)) {
      if (battle.field?.terrain === 'misty') return 'misty';
      if (battle.field?.terrain === 'electric' && st === 'slp') return 'electric';
    }
    return null;
  }

  function battleStat(p, key, opts = {}) {
    let stage = opts.ignoreStages ? 0 : (p.stages[key] || 0);
    if (opts.crit) stage = opts.isAttackStat ? Math.max(stage, 0) : Math.min(stage, 0);
    let v = p.stats[key] * stageMult(stage, key === 'accuracy' ? 'acc' : key === 'evasion' ? 'eva' : undefined);
    const battle = p._battle;
    if (key === 'atk') {
      if (hasAbility(p, 'hugepower', 'purepower')) v *= 2;
      if (hasAbility(p, 'hustle')) v *= 1.5;
      if (hasAbility(p, 'guts') && p.status) v *= 1.5;
      if (hasAbility(p, 'defeatist') && p.hp <= p.maxHp / 2) v *= 0.5;
      if (itemId(p) === 'choiceband') v *= 1.5;
      if (itemId(p) === 'lightball' && p.speciesId === 'pikachu') v *= 2;
    }
    if (key === 'def') {
      if (hasAbility(p, 'furcoat')) v *= 2;
      if (hasAbility(p, 'marvelscale') && p.status) v *= 1.5;
      if (hasAbility(p, 'grassypelt') && battle?.field?.terrain === 'grassy' && isGrounded(p)) v *= 1.5;
      if (battle?.weather === 'snow' && p.types.includes('Ice')) v *= 1.5;
    }
    if (key === 'spa') {
      if (hasAbility(p, 'defeatist') && p.hp <= p.maxHp / 2) v *= 0.5;
      if (hasAbility(p, 'solarpower') && battle?.weather === 'sun') v *= 1.5;
      if (itemId(p) === 'choicespecs') v *= 1.5;
      if (itemId(p) === 'lightball' && p.speciesId === 'pikachu') v *= 2;
    }
    if (key === 'spd') {
      if (battle?.weather === 'sand' && p.types.includes('Rock')) v *= 1.5;
    }
    if (key === 'spe') {
      if (p.status === 'par' && !hasAbility(p, 'quickfeet')) v *= 0.5;
      if (hasAbility(p, 'quickfeet') && p.status) v *= 1.5;
      if (battle?.weather === 'rain' && hasAbility(p, 'swiftswim')) v *= 2;
      if (battle?.weather === 'sun' && hasAbility(p, 'chlorophyll')) v *= 2;
      if (battle?.weather === 'sand' && hasAbility(p, 'sandrush')) v *= 2;
      if (battle?.weather === 'snow' && hasAbility(p, 'slushrush')) v *= 2;
      if (itemId(p) === 'choicescarf') v *= 1.5;
      if (battle?.field?.sides?.[p._side]?.tailwind > 0) v *= 2;
    }
    return Math.max(1, Math.floor(v));
  }

  function abilityMoveInteraction(attacker, defender, move) {
    if (!move || !defender || defender === attacker) return null;
    if (['self', 'allySide', 'foeSide', 'all'].includes(move.target)) return null;
    if (move.flags?.sound && hasAbility(defender, 'soundproof')) return { kind: 'immune', label: '隔音' };
    if (move.flags?.bullet && hasAbility(defender, 'bulletproof')) return { kind: 'immune', label: '防弹' };
    const t = move.type;
    if (t === 'Ground' && (move.basePower || move.ohko || move.category !== 'Status') && hasAbility(defender, 'levitate') && !(defender._battle?.field?.gravity > 0)) return { kind: 'immune', label: '漂浮' };
    if (t === 'Fire' && hasAbility(defender, 'flashfire')) return { kind: 'flashfire', label: '引火' };
    if (t === 'Electric' && hasAbility(defender, 'voltabsorb')) return { kind: 'heal', label: '蓄电' };
    if (t === 'Electric' && hasAbility(defender, 'lightningrod')) return { kind: 'boost', boosts: { spa: 1 }, label: '避雷针' };
    if (t === 'Electric' && hasAbility(defender, 'motordrive')) return { kind: 'boost', boosts: { spe: 1 }, label: '电气引擎' };
    if (t === 'Water' && hasAbility(defender, 'waterabsorb', 'dryskin')) return { kind: 'heal', label: '储水' };
    if (t === 'Water' && hasAbility(defender, 'stormdrain')) return { kind: 'boost', boosts: { spa: 1 }, label: '引水' };
    if (t === 'Grass' && hasAbility(defender, 'sapsipper')) return { kind: 'boost', boosts: { atk: 1 }, label: '食草' };
    if (t === 'Ground' && hasAbility(defender, 'eartheater')) return { kind: 'heal', label: '食土' };
    if (move.basePower && hasAbility(defender, 'wonderguard') && effectiveness(t, defender.types) <= 1) return { kind: 'immune', label: '神奇守护' };
    return null;
  }

  function modifiedPower(attacker, defender, move) {
    let power = move.basePower || 0;
    const battle = attacker._battle;
    if (battle?.weather === 'sun') { if (move.type === 'Fire') power *= 1.5; if (move.type === 'Water') power *= 0.5; }
    if (battle?.weather === 'rain') { if (move.type === 'Water') power *= 1.5; if (move.type === 'Fire') power *= 0.5; }
    const terrain = battle?.field?.terrain;
    if (terrain === 'electric' && move.type === 'Electric' && isGrounded(attacker)) power *= 1.3;
    if (terrain === 'grassy') {
      if (move.type === 'Grass' && isGrounded(attacker)) power *= 1.3;
      if (['earthquake', 'bulldoze', 'magnitude'].includes(move.id) && isGrounded(defender)) power *= 0.5;
    }
    if (terrain === 'psychic' && move.type === 'Psychic' && isGrounded(attacker)) power *= 1.3;
    if (terrain === 'misty' && move.type === 'Dragon' && isGrounded(defender)) power *= 0.5;
    const pinch = PINCH_ABILITIES[move.type];
    if (pinch && hasAbility(attacker, pinch) && attacker.hp <= attacker.maxHp / 3) power *= 1.5;
    if ((move.basePower || 0) <= 60 && hasAbility(attacker, 'technician')) power *= 1.5;
    if (move.flags?.punch && hasAbility(attacker, 'ironfist')) power *= 1.2;
    if (move.flags?.contact && hasAbility(attacker, 'toughclaws')) power *= 1.3;
    if (attacker.volatile?.helpinghand && move.basePower) power *= 1.5;
    if (move.flags?.bite && hasAbility(attacker, 'strongjaw')) power *= 1.5;
    if (move.flags?.pulse && hasAbility(attacker, 'megalauncher')) power *= 1.5;
    if (move.recoil && hasAbility(attacker, 'reckless')) power *= 1.2;
    if (move.secondary && hasAbility(attacker, 'sheerforce')) power *= 1.3;
    if (move.type === 'Fire' && attacker.volatile?.flashfire && hasAbility(attacker, 'flashfire')) power *= 1.5;
    if (battle?.weather === 'sand' && ['Rock', 'Ground', 'Steel'].includes(move.type) && hasAbility(attacker, 'sandforce')) power *= 1.3;
    if (TYPE_ITEMS[itemId(attacker)] === move.type) power *= 1.2;
    if (itemId(attacker) === 'muscleband' && move.category === 'Physical') power *= 1.1;
    if (itemId(attacker) === 'wiseglasses' && move.category === 'Special') power *= 1.1;
    return power;
  }

  function defenderDamageMultiplier(attacker, defender, move, eff) {
    let mult = 1;
    if (hasAbility(defender, 'thickfat') && ['Fire', 'Ice'].includes(move.type)) mult *= 0.5;
    if (hasAbility(defender, 'heatproof') && move.type === 'Fire') mult *= 0.5;
    if (hasAbility(defender, 'purifyingsalt') && move.type === 'Ghost') mult *= 0.5;
    if (eff > 1 && hasAbility(defender, 'filter', 'solidrock', 'prismarmor')) mult *= 0.75;
    if ((hasAbility(defender, 'multiscale', 'shadowshield')) && defender.hp === defender.maxHp) mult *= 0.5;
    if (hasAbility(defender, 'icescales') && move.category === 'Special') mult *= 0.5;
    if (hasAbility(defender, 'punkrock') && move.flags?.sound) mult *= 0.5;
    if (hasAbility(defender, 'fluffy')) { if (move.flags?.contact) mult *= 0.5; if (move.type === 'Fire') mult *= 2; }
    if (hasAbility(attacker, 'tintedlens') && eff > 0 && eff < 1) mult *= 2;
    if (itemId(attacker) === 'lifeorb') mult *= 1.3;
    if (itemId(attacker) === 'expertbelt' && eff > 1) mult *= 1.2;
    const battle = defender._battle;
    if (battle && !hasAbility(attacker, 'infiltrator')) {
      const sc = battle.field?.sides?.[defender._side];
      if (sc) {
        if ((move.category === 'Physical' && sc.reflect > 0) || (move.category === 'Special' && sc.lightscreen > 0) || sc.auroraveil > 0) mult *= 0.5;
      }
    }
    return mult;
  }

  function createPokemon(speciesId, level, moveIds, opts = {}) {
    const id = normId(speciesId);
    const species = DEX[id];
    if (!species) throw new Error('Unknown species: ' + speciesId);
    const stats = calcStats(species, level, opts);
    const moves = (moveIds || []).slice(0, 4).map(mid => {
      const m = MOVES[normId(mid)];
      if (!m) throw new Error('Unknown move: ' + mid);
      return { id: normId(mid), ...m, ppLeft: m.pp ?? 10 };
    });
    if (!moves.length) throw new Error('Pokemon needs at least one move: ' + speciesId);
    const item = opts.item ? normId(opts.item) : null;
    const zType = MECH?.canonType(opts.zType || opts.zMoveType) || MECH?.typeForZCrystal(item) || null;
    let mechanic = normId(typeof opts.mechanic === 'string' ? opts.mechanic : (opts.mechanic?.kind || opts.mechanic?.type || ''));
    if (mechanic.includes('mega')) mechanic = 'mega';
    else if (mechanic.includes('tera')) mechanic = 'tera';
    else if (mechanic.includes('dynamax') || mechanic.includes('gigantamax') || mechanic.includes('gmax')) mechanic = 'dynamax';
    else if (mechanic === 'z' || mechanic.includes('zmove')) mechanic = 'z';
    if (!mechanic && (opts.megaForm || opts.mega)) mechanic = 'mega';
    if (!mechanic && opts.teraType) mechanic = 'tera';
    if (!mechanic && zType && item) mechanic = 'z';
    if (!['mega', 'z', 'dynamax', 'tera'].includes(mechanic)) mechanic = null;
    return {
      speciesId: id, originalSpeciesId: id, name: opts.nickname || species.name, speciesName: species.name, hasNickname: !!opts.nickname,
      types: species.types.slice(), originalTypes: species.types.slice(), level, stats, maxHp: stats.hp, hp: stats.hp,
      ivs: Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, opts.ivs || {}), evs: Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, opts.evs || {}), nature: opts.nature || '',
      moves, status: null, statusTurns: 0, toxicCounter: 1, sleepTurns: 0,
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 },
      volatile: {}, ability: opts.ability ? normId(opts.ability) : (normId(species.abilities?.[0] ?? '') || null), item,
      _initialHeldItem: item, _consumedItems: [], _itemTransferOccurred: false,
      gender: opts.gender || null, shiny: !!opts.shiny, fainted: false,
      mechanic, megaForm: opts.megaForm || opts.mega ? normId(opts.megaForm || opts.mega) : null,
      teraType: MECH?.canonType(opts.teraType) || null, terastallized: false,
      zType, dynamaxForm: opts.dynamaxForm === 'gmax' || opts.gmax ? 'gmax' : null,
      isMega: id.includes('mega'), dynamaxed: false, dynamaxTurns: 0, normalMaxHp: null, _preDynamax: null,
      choiceLockedMove: null, enteredTurn: 0, _enteredThisTurn: false, _side: null, _protectStreak: 0,
    };
  }

  function effStat(p, key) { return battleStat(p, key); }
  function struggleMove() {
    const m = MOVES.struggle || { name: 'Struggle', type: 'Normal', category: 'Physical', basePower: 50, accuracy: true, pp: 1, priority: 0, flags: { contact: 1 }, target: 'normal' };
    return { id: 'struggle', ...m, target: 'normal', ppLeft: 1, pp: 1 };
  }

  // —— v1.3.55：脚本化招式的“代打执行”——在选择行动时替换成真正要用的招式对象 ——
  const BANNED_SCRIPTED = new Set(['metronome', 'struggle', 'assist', 'copycat', 'mirrormove', 'sleeptalk', 'naturepower',
    'mefirst', 'instruct', 'quash', 'afteryou', 'allyswitch', 'snatch', 'imprison', 'magiccoat', 'bide', 'spitup',
    'swallow', 'destinybond', 'grudge', 'transform', 'sketch', 'mimic', 'counter', 'mirrorcoat', 'metalburst',
    'comeuppance', 'finalgambit', 'revivalblessing', 'healingwish', 'lunardance']);
  const FLING_POWER = { ironball: 100, toxicorb: 30, flameorb: 30, lifeorb: 30, lightball: 30, kingsrock: 30,
    razorfang: 30, leftovers: 10, choiceband: 10, choicespecs: 10, choicescarf: 10, whiteherb: 10, focusband: 10,
    clearamulet: 10, loadeddice: 10, sitrusberry: 80, oranberry: 60 };
  const NATURAL_GIFT_TYPE = { cheriberry: 'Fire', chestoberry: 'Water', pechaberry: 'Electric', oranberry: 'Poison',
    sitrusberry: 'Psychic', rawstberry: 'Grass', aspearberry: 'Ice', leppaberry: 'Fighting' };
  function resolveScriptedMove(battle, p, base) {
    const id = base?.id;
    if (!id) return base;
    if (p.volatile?.afteryou) delete p.volatile.afteryou; // 请客：优先度加成用完即消耗
    // 号令：被号令的宝可梦这一回合自动重复上一招
    if (p.volatile?.instructMove) {
      const mid = p.volatile.instructMove;
      if (MOVES[mid] && mid !== 'instruct') {
        delete p.volatile.instructMove;
        battle.say(`${p.name} 被号令，重复使用了 ${MOVES[mid].name}！`);
        return { ...MOVES[mid], id: mid, ppLeft: 99 };
      }
    }
    const okMove = m => m && !m.isZ && !m.isMax && !BANNED_SCRIPTED.has(m.id);
    const pickFrom = arr => arr.length ? arr[Math.floor(battle.rng() * arr.length)] : null;
    const copy = m => ({ ...m, ppLeft: 99 });
    if (id === 'metronome') {
      const pool = Object.keys(MOVES).map(k => ({ ...MOVES[k], id: k })).filter(okMove);
      const m = pickFrom(pool);
      if (m) { battle.say(`${p.name} 挥动手指，选中了 ${m.name}！`); return { ...m, ppLeft: 99 }; }
      battle.say('但是失败了！'); return base;
    }
    if (id === 'sleeptalk') {
      const mine = (p.moves || []).filter(m => okMove(m) && m.id !== 'sleeptalk' && m.id !== 'rest' && m.ppLeft > 0);
      const m = pickFrom(mine);
      if (m) { battle.say(`${p.name} 在梦中使用了 ${m.name}！`); return { ...m, ppLeft: 99 }; }
      battle.say('但是失败了！'); return base;
    }
    if (id === 'assist') {
      const side = battle.sideOf(p);
      const pool = [];
      for (const q of battle.teams[side] || []) if (q !== p) for (const m of q.moves || []) if (okMove(m) && m.basePower) pool.push(m);
      const m = pickFrom(pool);
      if (m) { battle.say(`${p.name} 借助队友的招式，使用了 ${m.name}！`); return copy(m); }
      battle.say('但是失败了！'); return base;
    }
    if (id === 'copycat') {
      const last = battle._lastExecutedMove;
      if (last && MOVES[last] && okMove({ ...MOVES[last], id: last })) { battle.say(`${p.name} 仿效了 ${MOVES[last].name}！`); return { ...MOVES[last], id: last, ppLeft: 99 }; }
      battle.say('但是失败了！'); return base;
    }
    if (id === 'mirrormove') {
      const last = p._moveAgainst;
      if (last && MOVES[last] && okMove({ ...MOVES[last], id: last })) { battle.say(`${p.name} 用 ${MOVES[last].name} 反击了！`); return { ...MOVES[last], id: last, ppLeft: 99 }; }
      battle.say('但是失败了！'); return base;
    }
    if (id === 'mefirst') {
      const foe = battle.cur(battle.other(battle.sideOf(p)));
      const last = foe?._lastMoveId;
      if (last && MOVES[last] && MOVES[last].basePower && okMove(MOVES[last])) {
        battle.say(`${p.name} 抢先使用了 ${MOVES[last].name}！`);
        return { ...MOVES[last], id: last, basePower: Math.floor(MOVES[last].basePower * 1.5), ppLeft: 99 };
      }
      battle.say('但是失败了！'); return base;
    }
    if (id === 'naturepower') {
      const mid = { electric: 'thunderbolt', grassy: 'energyball', misty: 'moonblast', psychic: 'psychic' }[battle.field?.terrain] || 'triattack';
      const m = MOVES[mid];
      if (m) { battle.say(`自然之力变成了 ${m.name}！`); return { ...m, id: mid, ppLeft: 99 }; }
      return base;
    }
    return base;
  }
  function stabMultiplier(attacker, move) {
    if (!move?.type) return 1;
    const adaptable = hasAbility(attacker, 'adaptability');
    if (attacker.terastallized && attacker.teraType) {
      const tera = move.type === attacker.teraType;
      const original = (attacker.originalTypes || []).includes(move.type);
      if (tera && original) return adaptable ? 2.25 : 2;
      if (tera || original) return adaptable ? 2 : 1.5;
      return 1;
    }
    if ((attacker.types || []).includes(move.type)) return adaptable ? 2 : 1.5;
    return 1;
  }
  function zMovePower(move) {
    const bp = move.basePower || 0;
    if (bp <= 55) return 100; if (bp <= 65) return 120; if (bp <= 75) return 140; if (bp <= 85) return 160;
    if (bp <= 95) return 175; if (bp <= 100) return 180; if (bp <= 110) return 185; if (bp <= 120) return 190;
    if (bp <= 130) return 195; return 200;
  }
  function maxMovePower(move) {
    const bp = move.basePower || 0;
    let power = bp <= 40 ? 90 : bp <= 50 ? 100 : bp <= 60 ? 110 : bp <= 70 ? 120 : bp <= 80 ? 130 : bp <= 90 ? 130 : bp <= 100 ? 135 : bp <= 110 ? 140 : bp <= 120 ? 145 : 150;
    if (['Fighting', 'Poison'].includes(move.type)) power = Math.max(70, power - 20);
    return power;
  }
  function makeZMove(user, baseMove) {
    if (!baseMove) return baseMove;
    if (baseMove.category === 'Status') return { ...baseMove, _isZ: true, _zStatus: true, _baseId: baseMove.id, name: `Z·${baseMove.name}`, accuracy: true };
    const crystal = MECH?.zCrystalForType(user.zType || baseMove.type);
    const generic = Object.values(MOVES).find(m => m.isZ && normId(m.isZ) === crystal);
    return {
      ...baseMove, id: generic?.id || `z${baseMove.id}`, name: generic?.name || `Z·${baseMove.name}`, basePower: zMovePower(baseMove), accuracy: true,
      secondary: undefined, secondaries: undefined, self: undefined, drain: undefined, recoil: undefined, multihit: undefined,
      status: undefined, volatileStatus: undefined, boosts: undefined, _isZ: true, _baseId: baseMove.id,
    };
  }
  function makeMaxMove(user, baseMove) {
    if (!baseMove) return baseMove;
    if (baseMove.category === 'Status' || !baseMove.basePower) {
      const guard = MOVES.maxguard || { id: 'maxguard', name: '极巨防壁', type: 'Normal', category: 'Status', basePower: 0, accuracy: true, pp: 10, priority: 4, target: 'self', volatileStatus: 'maxguard', flags: {} };
      return { ...guard, _isMax: true, _baseId: baseMove.id, ppLeft: baseMove.ppLeft };
    }
    let info = MECH?.maxMoveForType(baseMove.type) || { id: 'maxstrike', name: '极巨攻击' };
    let name = info.name, id = info.id;
    if (user.dynamaxForm === 'gmax' && baseMove.type === (user.types || [])[0]) {
      const g = Object.values(MOVES).find(m => String(m.name || '').startsWith('G-Max') && m.type === baseMove.type);
      if (g) { id = Object.keys(MOVES).find(k => MOVES[k] === g) || id; name = g.name; }
    }
    return {
      ...baseMove, id, name, basePower: maxMovePower(baseMove) + (name.startsWith('G-Max') ? 10 : 0), accuracy: true,
      secondary: undefined, secondaries: undefined, self: undefined, drain: undefined, recoil: undefined, multihit: undefined,
      status: undefined, volatileStatus: undefined, boosts: undefined, _isMax: true, _maxType: baseMove.type, _baseId: baseMove.id,
    };
  }
  function transformMove(user, baseMove, mechanic = null) {
    if (mechanic === 'z' && user.mechanic === 'z' && user.zType === baseMove.type) return makeZMove(user, baseMove);
    if (user.dynamaxed) return makeMaxMove(user, baseMove);
    return baseMove;
  }

  // v1.3.5：威力为 0 的特殊伤害招式（固定伤害 / 按体重、速度、体力计算威力 / 一击必杀）
  const FIXED_DAMAGE_IDS = ['seismictoss', 'nightshade', 'sonicboom', 'dragonrage', 'superfang', 'naturesmadness', 'ruination', 'psywave', 'endeavor', 'finalgambit'];
  const VARIABLE_POWER_IDS = ['lowkick', 'grassknot', 'heavyslam', 'heatcrash', 'gyroball', 'electroball', 'flail', 'reversal', 'present', 'return', 'frustration', 'hardpress', 'crushgrip', 'wringout', 'magnitude', 'beatup', 'punishment', 'trumpcard', 'spitup', 'fling', 'naturalgift'];
  const weightOf = p => DEX[p.speciesId]?.weightkg || 50;
  function specialDamageInfo(user, target, move, rnd = 0.5) {
    if (!move || move.basePower || move.category === 'Status') return null;
    const id = move.id;
    if (move.ohko) return { kind: 'ohko' };
    if (FIXED_DAMAGE_IDS.includes(id)) {
      let fixed = 0;
      if (id === 'seismictoss' || id === 'nightshade') fixed = user.level;
      else if (id === 'sonicboom') fixed = 20;
      else if (id === 'dragonrage') fixed = 40;
      else if (id === 'superfang' || id === 'naturesmadness' || id === 'ruination') fixed = Math.max(1, Math.floor(target.hp / 2));
      else if (id === 'psywave') fixed = Math.max(1, Math.floor(user.level * (0.5 + rnd)));
      else if (id === 'endeavor') fixed = Math.max(0, target.hp - user.hp);
      else if (id === 'finalgambit') fixed = user.hp;
      return { kind: 'fixed', damage: fixed };
    }
    if (VARIABLE_POWER_IDS.includes(id)) {
      let bp = 0;
      if (id === 'lowkick' || id === 'grassknot') { const w = weightOf(target); bp = w < 10 ? 20 : w < 25 ? 40 : w < 50 ? 60 : w < 100 ? 80 : w < 200 ? 100 : 120; }
      else if (id === 'heavyslam' || id === 'heatcrash') { const r = weightOf(user) / Math.max(0.1, weightOf(target)); bp = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; }
      else if (id === 'gyroball') bp = Math.min(150, Math.floor(25 * effStat(target, 'spe') / Math.max(1, effStat(user, 'spe'))) + 1);
      else if (id === 'electroball') { const r = effStat(user, 'spe') / Math.max(1, effStat(target, 'spe')); bp = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; }
      else if (id === 'flail' || id === 'reversal') { const x = Math.floor(48 * user.hp / user.maxHp); bp = x <= 1 ? 200 : x <= 4 ? 150 : x <= 9 ? 100 : x <= 16 ? 80 : x <= 32 ? 40 : 20; }
      else if (id === 'present') bp = rnd < 0.4 ? 40 : rnd < 0.7 ? 80 : 120;
      else if (id === 'return' || id === 'frustration') bp = 102;
      else if (id === 'hardpress') bp = Math.max(1, Math.floor(100 * target.hp / Math.max(1, target.maxHp)));
      else if (id === 'crushgrip' || id === 'wringout') bp = Math.max(1, Math.floor(120 * target.hp / Math.max(1, target.maxHp)));
      else if (id === 'magnitude') { const r = rnd * 100; let n = 10; if (r < 5) n = 4; else if (r < 15) n = 5; else if (r < 35) n = 6; else if (r < 65) n = 7; else if (r < 85) n = 8; else if (r < 95) n = 9; bp = [10, 30, 50, 70, 90, 110, 150][n - 4]; user._magN = n; }
      else if (id === 'beatup') { const team = user._battle?.teams?.[user._side] || [user]; bp = 10 * Math.max(1, team.filter(x => !x.fainted).length); }
      else if (id === 'punishment') { const n = Object.values(target.stages || {}).filter(v => v > 0).length; bp = Math.min(200, 60 + 20 * n); }
      else if (id === 'trumpcard') { const pp = move.ppLeft == null ? 1 : move.ppLeft; bp = pp === 0 ? 200 : pp === 1 ? 70 : pp === 2 ? 60 : pp === 3 ? 50 : 40; }
      else if (id === 'spitup') { const n = user.volatile?.stockpile || 0; if (n <= 0) return { kind: 'fixed', damage: 0 }; bp = 100 * n; }
      else if (id === 'fling') { if (!user.item) return { kind: 'fixed', damage: 0 }; bp = FLING_POWER[itemId(user)] || 30; }
      else if (id === 'naturalgift') { const it = itemId(user); if (!it || !it.endsWith('berry')) return { kind: 'fixed', damage: 0 }; bp = 80; }
      return { kind: 'power', basePower: bp, label: id === 'magnitude' ? `震级 ${user._magN || 7}！` : null, type: id === 'naturalgift' ? (NATURAL_GIFT_TYPE[itemId(user)] || 'Normal') : null };
    }
    if (id === 'counter' || id === 'mirrorcoat' || id === 'metalburst' || id === 'comeuppance') {
      const rec = user._lastTaken;
      const ok = rec && rec.turn === user._battle?.turnCount && rec.by && !rec.by.fainted;
      const catOk = id === 'counter' ? rec?.cat === 'Physical' : id === 'mirrorcoat' ? rec?.cat === 'Special' : true;
      if (!ok || !catOk) return { kind: 'fixed', damage: 0 };
      const mult = { counter: 2, mirrorcoat: 2, metalburst: 1.5, comeuppance: 1.5 }[id];
      return { kind: 'fixed', damage: Math.max(1, Math.floor(rec.amount * mult)), counterHit: true };
    }
    return null;
  }

  function estimateDamage(attacker, defender, move, rngVal = 0.925, opts = {}) {
    if (!move.basePower) return { damage: 0, eff: 1, crit: false };
    const abilityBlock = abilityMoveInteraction(attacker, defender, move);
    // 千箭齐发 / 千波激荡 可以打中“飘浮”“食土”的免疫
    const groundPierce = (move.type === 'Ground' && ignoresImmunity(move, 'Ground'));
    if (abilityBlock && !(groundPierce && abilityBlock.kind === 'immune' && ['漂浮', '食土'].includes(abilityBlock.label)))
      return { damage: 0, eff: 0, crit: false };
    const isPhys = move.category === 'Physical';
    const atk = battleStat(attacker, isPhys ? 'atk' : 'spa', { ignoreStages: hasAbility(defender, 'unaware'), crit: !!opts.crit, isAttackStat: true });
    const _wr = !!(attacker._battle?.field?.wonderRoom); // 奇妙空间：防御/特防互换
    const def = battleStat(defender, _wr ? (isPhys ? 'spd' : 'def') : (isPhys ? 'def' : 'spd'), { ignoreStages: hasAbility(attacker, 'unaware'), crit: !!opts.crit, isAttackStat: false });
    let power = modifiedPower(attacker, defender, move);
    // v1.3.54：玩水 / 玩泥巴 —— 火电威力减半
    const _pw = attacker._battle?.field.pseudoWeather || null;
    if (_pw?.watersport && move.type === 'Fire') power = Math.max(1, Math.floor(power / 2));
    if (_pw?.mudsport && move.type === 'Electric') power = Math.max(1, Math.floor(power / 2));
    const level = attacker.level;
    let dmg = Math.floor(((Math.floor((2 * level / 5 + 2) * power * atk / def)) / 50)) + 2;
    // v1.3.54：输电（目标被 electrify）/ 等离子浴 —— 一般属性攻击招式变成电属性
    let effType = move.type;
    if (move.category !== 'Status') {
      if (attacker.volatile?.electrify) effType = 'Electric';
      else if (_pw?.iondeluge && effType === 'Normal') effType = 'Electric';
    }
    let eff = effectiveness(effType, defender.types);
    // 千箭齐发这类招式对“本来免疫该属性”的宝可梦依然造成等倍伤害
    if (eff === 0 && ignoresImmunity(move, move.type)) eff = 1;
    if (eff === 0 && defender.volatile?.foresight && ['Normal', 'Fighting'].includes(move.type) && defender.types.includes('Ghost')) eff = 1;
    if (eff === 0 && defender.volatile?.miracleeye && move.type === 'Dark' && defender.types.includes('Psychic')) eff = 1;
    let mult = eff * rngVal;
    if (move._spreadTargets > 1) mult *= 0.75;
    mult *= stabMultiplier(attacker, { ...move, type: effType }); // STAB (incl. Terastal rules; v1.3.54 输电/等离子浴)
    if (isPhys && attacker.status === 'brn' && !hasAbility(attacker, 'guts')) mult *= 0.5;
    mult *= defenderDamageMultiplier(attacker, defender, move, eff);
    if ((move._isZ || move._isMax) && defender.volatile?.protect) mult *= 0.25;
    dmg = Math.floor(dmg * mult);
    return { damage: eff === 0 ? 0 : Math.max(1, dmg), eff, crit: !!opts.crit };
  }

  class Battle {
    constructor(teamA, teamB, opts = {}) {
      if (!teamA?.length || !teamB?.length) throw new Error('Both sides need a team');
      this.teams = [teamA, teamB];
      const battleFormat = String(opts.battleMode || opts.format || opts.mode || '').trim().toLowerCase();
      this.double = opts.double === true || opts.doubles === true || ['double', 'doubles', '2v2', '双打'].includes(battleFormat);
      this.firstFaintLoses = this.double && opts.firstFaintLoses === true; // 榴柑道馆特例，不影响普通双打
      this.activeSlots = this.teams.map(team => {
        const living = team.map((p, i) => ({ p, i })).filter(x => !x.p.fainted).map(x => x.i);
        return (this.double ? living.slice(0, 2) : living.slice(0, 1));
      });
      this.active = [this.activeSlots[0][0] ?? 0, this.activeSlots[1][0] ?? 0];
      this.rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
      this.difficulty = opts.difficulty || 'normal';
      this.weather = opts.weather || null;
      this.weatherTurns = opts.weatherTurns || 0;
      this.field = { terrain: null, terrainTurns: 0, trickRoom: 0, gravity: 0, sides: [newSideField(), newSideField()] };
      this.turnCount = 0;
      this.moveCount = 0;
      this.captureContext = opts.captureContext || {};
      this.log = [];
      this.winner = null; // 0: player | 1: enemy | 2: unresolved simultaneous defeat | null
      this.encounterType = opts.encounterType === 'wild' && teamB.length === 1 ? 'wild' : 'trainer';
      const ballIds=Object.keys(root.PKMCapture?.BALLS||{pokeball:1,greatball:1,ultraball:1,masterball:1,safariball:1,quickball:1,duskball:1,timerball:1,repeatball:1,netball:1,nestball:1,diveball:1,luxuryball:1,healball:1});
      this.ballStock = Object.fromEntries(ballIds.map(id => [id,
        Number.isInteger(opts.balls?.[id]) && opts.balls[id] >= 0 ? opts.balls[id] : 0]));
      this.itemStock = Object.fromEntries(Object.entries(opts.itemStock||{}).map(([id,n])=>[id,Math.max(0,Math.floor(Number(n)||0))]));
      this.outcome = null; this.capture = null; this.lastCapture = null;
      this.pendingSwitch = null; // player-facing active slot that must be replaced
      this.pendingSwitches = [];
      // A move-triggered player switch can pause a turn; queued actions keep their original actors.
      this._turnState = null;
      this.mechanicUsed = [{ mega: false, z: false, dynamax: false, tera: false }, { mega: false, z: false, dynamax: false, tera: false }];
      this.teams.forEach((team, side) => team.forEach(p => {
        p._battle = this; p._side = side; p._enteredThisTurn = false; p._protectStreak = 0;
        // Participation is per battle, not per successfully executed move.
        p._participated = false;
        delete p._initialStatusRejected;
        if (p.status && !p.fainted) {
          const reason = statusImmunityReason(p, p.status, this);
          if (reason) {
            p._initialStatusRejected = { status: p.status, reason };
            p.status = null; p.sleepTurns = 0;
          } else if (p.status === 'slp' && !(p.sleepTurns > 0)) p.sleepTurns = 1 + Math.floor(this.rng() * 3);
          else if (p.status === 'tox' && !(p.toxicCounter > 0)) p.toxicCounter = 1;
        }
      }));
      const intro = side => this.activeSlots[side].map(i => this.teams[side][i].name).join('、');
      this.say(`战斗开始！${intro(1)} 对 ${intro(0)}${this.double ? '（双打）' : ''}`);
      for (const p of this.teams.flat()) if (p._initialStatusRejected) {
        const { status, reason } = p._initialStatusRejected;
        const cause = reason === 'type' ? '属性' : reason === 'ability' ? '特性' : reason === 'invalid' ? '状态值无效' : '场地';
        this.say(`${p.name} 的外部初始状态（${STATUS_NAMES[status] || status}）因${cause}无效，已忽略。`);
        delete p._initialStatusRejected;
      }
      const entrants = [0, 1].flatMap(side => this.activeSlots[side].map((slot, pos) => ({ side, pos, p: this.cur(side, pos) })));
      entrants.sort((a, b) => effStat(b.p, 'spe') - effStat(a.p, 'spe')).forEach(x => this.onEnter(x.side, true, x.pos));
    }
    say(msg) { this.log.push(msg); }
    cur(side, slot = 0) { const index = this.activeSlots?.[side]?.[slot] ?? (slot === 0 ? this.active[side] : -1); return index >= 0 ? this.teams[side][index] : null; }
    activeIndex(side, slot = 0) { return this.activeSlots?.[side]?.[slot] ?? -1; }
    activeMons(side) { return (this.activeSlots?.[side] || []).map((_, slot) => this.cur(side, slot)).filter(p => p && !p.fainted); }
    setActive(side, slot, index) {
      const slots = this.activeSlots[side];
      while (slots.length <= slot) slots.push(-1);
      slots[slot] = index;
      if (slot === 0) this.active[side] = index;
    }
    alive(side) { return this.teams[side].filter(p => !p.fainted); }
    other(side) { return 1 - side; }
    sideOf(p) { return p?._side ?? this.teams.findIndex(team => team.includes(p)); }

    setWeather(id, turns = 5) {
      const map = { sunnyday: 'sun', raindance: 'rain', sandstorm: 'sand', snowscape: 'snow', hail: 'snow', sun: 'sun', rain: 'rain', sand: 'sand', snow: 'snow' };
      const w = map[normId(id)] || null;
      if (!w) return;
      this.weather = w; this.weatherTurns = turns;
      this.say({ sun: '阳光变得强烈起来！', rain: '开始下雨了！', sand: '沙暴刮起来了！', snow: '开始下雪了！' }[w]);
    }
    setTerrain(id, turns = 5) {
      const t = normId(id).replace(/terrain$/, '');
      if (!['electric', 'grassy', 'misty', 'psychic'].includes(t)) return;
      this.field.terrain = t; this.field.terrainTurns = turns;
      this.say({ electric: '脚下泛起了电光（电气场地）！', grassy: '脚下长出了青草（青草场地）！', misty: '薄雾笼罩了场地（薄雾场地）！', psychic: '脚下变得不可思议（精神场地）！' }[t]);
    }
    clearHazards(side) {
      const sc = this.field.sides[side];
      const had = sc.stealthrock || sc.spikes || sc.toxicspikes || sc.stickyweb;
      sc.stealthrock = false; sc.spikes = 0; sc.toxicspikes = 0; sc.stickyweb = false;
      return had;
    }
    applyEntryHazards(side, p, slot = 0) {
      if (!p || p.fainted || itemId(p) === 'heavydutyboots') return;
      const sc = this.field.sides[side], foe = this.cur(this.other(side), 0);
      if (sc.stealthrock) {
        const dmg = Math.max(1, Math.floor(p.maxHp * effectiveness('Rock', p.types) / 8));
        this.applyDamage(p, dmg, `${p.name} 受到了隐形岩的伤害！`);
        if (p.hp <= 0) return;
      }
      // Flying/Levitate users ignore grounded hazards entirely; only grounded Poison types absorb Toxic Spikes.
      if (!isGrounded(p)) return;
      if (sc.spikes) {
        const frac = [0, 1 / 8, 1 / 6, 1 / 4][Math.min(3, sc.spikes)];
        this.applyDamage(p, Math.max(1, Math.floor(p.maxHp * frac)), `${p.name} 受到了撒菱的伤害！`);
        if (p.hp <= 0) return;
      }
      if (sc.toxicspikes) {
        if (p.types.includes('Poison')) { sc.toxicspikes = 0; this.say(`${p.name} 吸收了毒菱！`); }
        else this.tryStatus(p, sc.toxicspikes >= 2 ? 'tox' : 'psn', foe, { fromStatusMove: false });
        if (p.hp <= 0) return;
      }
      if (sc.stickyweb) this.changeStages(p, { spe: -1 }, foe);
    }
    onEnter(side, initial = false, slot = 0) {
      const p = this.cur(side, slot);
      if (!p || p.fainted) return;
      // 首发、换入、被迫补位都算实际出场；首回合直接投球也不能把首发算成候补。
      p._participated = true;
      // v1.3.54：治愈之愿 / 新月舞 —— 换上来的宝可梦完全回复
      const _se = this._slotEffect?.[side]?.[slot];
      if (_se && !initial) {
        delete this._slotEffect[side][slot];
        p.status = null; delete p.volatile.confusion; delete p.toxicCounter;
        this.heal(p, p.maxHp, `${p.name} 继承了${_se === 'healingwish' ? '治愈之愿' : '新月舞'}的祝福！`);
      }
      p.enteredTurn = this.turnCount;
      p._enteredThisTurn = !initial;
      p.choiceLockedMove = null;
      this.applyEntryHazards(side, p, slot);
      if (p.hp <= 0 || p.fainted) return;
      this.applyEntryAbility(side, slot);
    }
    applyEntryAbility(side, slot = 0) {
      const p = this.cur(side, slot);
      if (!p || p.fainted || p.hp <= 0) return;
      const foes = this.activeMons(this.other(side)); const foe = foes[0]; let ab = abilityId(p);
      if (ab === 'trace' && foe?.ability) { p.ability = abilityId(foe); ab = p.ability; this.say(`${p.name} 的追踪复制了对手的特性！`); }
      const weatherAbility = { drought: 'sun', drizzle: 'rain', sandstream: 'sand', snowwarning: 'snow' }[ab];
      if (weatherAbility) this.setWeather(weatherAbility, 5);
      const terrainAbility = { electricsurge: 'electric', grassysurge: 'grassy', psychicsurge: 'psychic', mistysurge: 'misty' }[ab];
      if (terrainAbility) this.setTerrain(terrainAbility, 5);
      if (ab === 'intimidate' && foes.length) {
        this.say(`${p.name} 的威吓降低了对手的气势！`);
        foes.forEach(target => this.changeStages(target, { atk: -1 }, p));
      }
      if (ab === 'download' && foe && !foe.fainted) {
        const key = effStat(foe, 'def') < effStat(foe, 'spd') ? 'atk' : 'spa';
        this.say(`${p.name} 的下载分析了对手！`);
        this.changeStages(p, { [key]: 1 }, p);
      }
      if (ab === 'frisk' && foe?.item) this.say(`${p.name} 察觉到了对手携带的道具！`);
      if (ab === 'anticipation' && foe && foe.moves.some(m => m.basePower && effectiveness(m.type, p.types) > 1)) this.say(`${p.name} 因危险而颤抖了（危险预知）！`);
    }
    megaEvolve(side, slot = 0) {
      const p = this.cur(side, slot);
      if (!p || p.fainted || this.mechanicUsed[side].mega || p.mechanic !== 'mega' || !p.megaForm || !DEX[p.megaForm] || p.isMega) return false;
      const form = DEX[p.megaForm];
      if (!form || normId(form.baseSpecies || '') !== p.originalSpeciesId) return false;
      const hpRatio = p.hp / p.maxHp;
      p.speciesId = p.megaForm; p.speciesName = form.name; if (!p.hasNickname) p.name = form.name;
      p.types = form.types.slice(); p.originalTypes = form.types.slice();
p.stats = calcStats(form, p.level, { ivs: p.ivs, evs: p.evs, nature: p.nature });
      p.maxHp = p.stats.hp; p.hp = Math.max(1, Math.round(p.maxHp * hpRatio));
      p.ability = normId(form.abilities?.[0] || p.ability);
      p.isMega = true; this.mechanicUsed[side].mega = true;
      this.say(`✨ ${p.name} 超级进化了！`);
      this.applyEntryAbility(side, slot);
      return true;
    }
    dynamax(side, slot = 0) {
      const p = this.cur(side, slot);
      if (!p || p.fainted || this.mechanicUsed[side].dynamax || p.mechanic !== 'dynamax' || p.dynamaxed) return false;
      p.normalMaxHp = p.maxHp;
      p._preDynamax = { speciesId: p.speciesId, speciesName: p.speciesName, name: p.name, types: p.types.slice(), stats: p.stats };
      if (p.dynamaxForm === 'gmax' && DEX[`${p.originalSpeciesId}gmax`]) {
        const form = DEX[`${p.originalSpeciesId}gmax`];
        p.speciesId = `${p.originalSpeciesId}gmax`; p.speciesName = form.name; if (!p.hasNickname) p.name = form.name;
        p.types = form.types.slice(); p.stats = calcStats(form, p.level, { ivs: p.ivs, evs: p.evs, nature: p.nature });
      }
      p.maxHp = (p.normalMaxHp || p.maxHp) * 2;
      p.hp += p.normalMaxHp;
      p.dynamaxed = true; p.dynamaxTurns = 3; this.mechanicUsed[side].dynamax = true;
      this.say(`🔴 ${p.name} ${p.dynamaxForm === 'gmax' ? '超极巨化' : '极巨化'}了！（3 回合）`);
      return true;
    }
    endDynamax(p, silent = false) {
      if (!p?.dynamaxed) return;
      const normal = p.normalMaxHp || Math.floor(p.maxHp / 2);
      if (p._preDynamax) { const pre = p._preDynamax; p.speciesId = pre.speciesId; p.speciesName = pre.speciesName; if (!p.hasNickname) p.name = pre.name; p.types = pre.types.slice(); p.stats = pre.stats; }
      p.maxHp = normal; p.hp = p.fainted ? 0 : Math.max(1, Math.floor(p.hp / 2));
      p.dynamaxed = false; p.dynamaxTurns = 0; p.normalMaxHp = null; p._preDynamax = null;
      if (!silent) this.say(`${p.name} 的极巨化结束了。`);
    }
    terastallize(side, slot = 0) {
      const p = this.cur(side, slot);
      if (!p || p.fainted || this.mechanicUsed[side].tera || p.mechanic !== 'tera' || !p.teraType || p.terastallized) return false;
      p.originalTypes = p.types.slice();
      p.types = [p.teraType]; p.terastallized = true; this.mechanicUsed[side].tera = true;
      this.say(`💎 ${p.name} 太晶化了！属性变为 ${root.PKMMechanics?.TYPE_ZH?.[p.teraType] || p.teraType}！`);
      return true;
    }
    activateMechanic(side, kind, slot = 0) {
      if (kind === 'mega') return this.megaEvolve(side, slot);
      if (kind === 'dynamax') return this.dynamax(side, slot);
      if (kind === 'tera') return this.terastallize(side, slot);
      return false;
    }
    changeStages(p, boosts, source = p, opts = {}) {
      if (!p || p.fainted || !boosts) return false;
      let changed = false, lowered = false;
      for (const [k, raw] of Object.entries(boosts)) {
        if (!(k in p.stages) || !raw) continue;
        let amt = raw;
        if (hasAbility(p, 'contrary')) amt = -amt;
        if (hasAbility(p, 'simple')) amt *= 2;
        // Mist only prevents negative stages actually caused by an opponent; it never blocks boosts.
        if (amt < 0 && source && source._side != null && p._side != null && source._side !== p._side && !opts.abilityBoost && this.field.sides[p._side]?.mist > 0) {
          this.say(`白雾保护了${p.name}，${STAT_LABELS[k] || k}没有降低！`); continue;
        }
        if (amt < 0 && source && source !== p && !opts.abilityBoost) {
          const blocked = hasAbility(p, 'clearbody', 'whitesmoke', 'fullmetalbody')
            || (k === 'atk' && hasAbility(p, 'hypercutter'))
            || (k === 'def' && hasAbility(p, 'bigpecks'))
            || (k === 'accuracy' && hasAbility(p, 'keeneye'));
          if (blocked) { this.say(`${p.name} 的特性阻止了${STAT_LABELS[k]}降低！`); continue; }
          if ((this.field.sides[p._side]?.safeguard||0)>0) { this.say(`我方的能力防守保护了${p.name}，${STAT_LABELS[k]}没有降低！`); continue; }
          if (hasAbility(p, 'mirrorarmor') && !opts.noMirror) {
            this.say(`${p.name} 的镜甲反弹了能力降低！`);
            this.changeStages(source, { [k]: amt }, p, { noMirror: true });
            continue;
          }
        }
        const before = p.stages[k];
        p.stages[k] = clampStage(before + amt);
        if (p.stages[k] !== before) {
          changed = true; if (p.stages[k] < before) lowered = true;
          this.say(`${p.name} 的${STAT_LABELS[k] || k}${p.stages[k] > before ? '提高了' : '降低了'}！`);
        }
      }
      if (lowered && source && source !== p && !opts.abilityBoost) {
        if (hasAbility(p, 'defiant')) this.changeStages(p, { atk: 2 }, p, { abilityBoost: true });
        if (hasAbility(p, 'competitive')) this.changeStages(p, { spa: 2 }, p, { abilityBoost: true });
        if (hasAbility(p, 'rattled')) this.changeStages(p, { spe: 1 }, p, { abilityBoost: true });
      }
      if (itemId(p) === 'whiteherb' && Object.values(p.stages).some(v => v < 0)) {
        for (const k of Object.keys(p.stages)) if (p.stages[k] < 0) p.stages[k] = 0;
        this.consumeItem(p); this.say(`${p.name} 的白色香草恢复了降低的能力！`);
      }
      return changed;
    }
    tryStatus(p, status, source = null, opts = {}) {
      if (!p || p.fainted || p.status || !status) return false;
      if (p.volatile?.substitute && source && source !== p) { this.say(`${p.name} 的替身挡住了效果！`); return false; }
      const st = String(status || '').toLowerCase();
      const immunity = statusImmunityReason(p, st, this);
      if (immunity === 'ability') { this.say(`${p.name} 的特性使其不会陷入该异常状态！`); return false; }
      if (opts.fromStatusMove && source && source !== p && abilityId(p) === 'goodasgold') { this.say(`${p.name} 的黄金之躯挡下了变化招式！`); return false; }
      if (immunity === 'type' || immunity === 'invalid') return false;
      if (immunity === 'misty') { this.say('薄雾场地保护着宝可梦！'); return false; }
      if (immunity === 'electric') { this.say('电气场地让宝可梦无法入睡！'); return false; }
      p.status = st;
      if (st === 'tox') p.toxicCounter = 1;
      if (st === 'slp') p.sleepTurns = 1 + Math.floor(this.rng() * 3);
      this.say(`${p.name} 陷入了${STATUS_NAMES[st] || st}状态！`);
      if (source && source !== p && !opts.noSync && hasAbility(p, 'synchronize') && ['brn', 'psn', 'tox', 'par'].includes(st)) {
        this.say(`${p.name} 的同步把状态传给了对手！`);
        this.tryStatus(source, st, p, { noSync: true, fromStatusMove: false });
      }
      this.checkItemTrigger(p, 'status');
      return true;
    }
    consumeItem(p) { const old = p.item; p.item = null; if (old) { p._lastConsumed = old; p._consumedItems.push(old); } return old; }
    checkItemTrigger(p, event, ctx = {}) {
      if (!p || p.fainted || !p.item) return;
      // v1.3.55：查封 / 魔法空间 —— 道具（树果/装备自动触发）无效
      if (p.volatile?.embargo || this.field?.magicRoom) return;
      const item = itemId(p), healFrac = f => this.heal(p, Math.max(1, Math.floor(p.maxHp * f)), '道具生效');
      if (item === 'mentalherb' && p.volatile.confusion) { delete p.volatile.confusion; this.consumeItem(p); this.say(`${p.name} 的心灵香草治愈了混乱！`); return; }
      if (item === 'lumberry' && (p.status || p.volatile.confusion)) { p.status = null; delete p.volatile.confusion; this.consumeItem(p); this.say(`${p.name} 吃下木子果，状态痊愈了！`); return; }
      const berryStatus = { cheriberry: 'par', chestoberry: 'slp', pechaberry: 'psn', rawstberry: 'brn', aspearberry: 'frz' }[item];
      if (berryStatus && (p.status === berryStatus || (item === 'pechaberry' && p.status === 'tox'))) { p.status = null; this.consumeItem(p); this.say(`${p.name} 吃下树果，异常状态痊愈了！`); return; }
      if (item === 'persimberry' && p.volatile.confusion) { delete p.volatile.confusion; this.consumeItem(p); this.say(`${p.name} 吃下柿仔果，混乱解除了！`); return; }
      if (item === 'leppaberry' && p.moves.some(m => m.ppLeft <= 0)) { const m = p.moves.find(x => x.ppLeft <= 0); m.ppLeft = Math.min(m.pp, m.ppLeft + 10); this.consumeItem(p); this.say(`${p.name} 吃下苹野果，回复了 ${m.name} 的招式点数！`); return; }
      if (event === 'hit') {
        if (item === 'keeberry' && ctx.move?.category === 'Physical') { this.consumeItem(p); this.changeStages(p, { def: 1 }, p); return; }
        if (item === 'marangaberry' && ctx.move?.category === 'Special') { this.consumeItem(p); this.changeStages(p, { spd: 1 }, p); return; }
        if (item === 'enigmaberry' && ctx.eff > 1) { this.consumeItem(p); healFrac(1 / 4); return; }
        if (item === 'weaknesspolicy' && ctx.eff > 1) { this.consumeItem(p); this.say(`${p.name} 的弱点保险发动了！`); this.changeStages(p, { atk: 2, spa: 2 }, p); return; }
        if (item === 'jabocaberry' && ctx.move?.category === 'Physical' && ctx.attacker && !ctx.attacker.fainted) { this.consumeItem(p); this.applyDamage(ctx.attacker, Math.max(1, Math.floor(ctx.attacker.maxHp / 8)), `${ctx.attacker.name} 受到了嘉珍果的伤害！`); return; }
        if (item === 'rowapberry' && ctx.move?.category === 'Special' && ctx.attacker && !ctx.attacker.fainted) { this.consumeItem(p); this.applyDamage(ctx.attacker, Math.max(1, Math.floor(ctx.attacker.maxHp / 8)), `${ctx.attacker.name} 受到了雾莲果的伤害！`); return; }
      }
      if (p.hp <= p.maxHp / 2) {
        if (item === 'sitrusberry') { this.consumeItem(p); healFrac(1 / 4); return; }
        if (item === 'oranberry') { this.consumeItem(p); this.heal(p, 10, '道具生效'); return; }
      }
      if (p.hp <= p.maxHp / 4) {
        const stat = { liechiberry: 'atk', ganlonberry: 'def', salacberry: 'spe', petayaberry: 'spa', apicotberry: 'spd' }[item];
        if (stat) { this.consumeItem(p); this.changeStages(p, { [stat]: 1 }, p); }
      }
    }
    applyMoveDamage(p, amount, attacker, move) {
      let dmg = Math.max(0, amount);
      // 替身先替本体承受伤害（声音类招式无视替身）
      if (p.volatile?.substitute && !(move && move.flags?.sound)) {
        const sub = p.volatile.substitute;
        if (dmg >= sub) {
          delete p.volatile.substitute;
          this.say(`${p.name} 的替身被打倒了！`);
          const extra = dmg - sub, before = p.hp;
          p.hp = Math.max(0, p.hp - extra);
          return sub + (before - p.hp);
        }
        p.volatile.substitute = sub - dmg; this.say(`${p.name} 的替身承受了伤害（替身剩余 ${p.volatile.substitute}）！`);
        return dmg;
      }
      if (dmg >= p.hp && p.hp > 1) {
        if (hasAbility(p, 'sturdy') && p.hp === p.maxHp) { dmg = p.hp - 1; this.say(`${p.name} 用结实撑住了攻击！`); }
        else if (itemId(p) === 'focussash' && p.hp === p.maxHp) { dmg = p.hp - 1; this.consumeItem(p); this.say(`${p.name} 用气势披带撑住了攻击！`); }
        else if (itemId(p) === 'focusband' && this.rng() < 0.1) { dmg = p.hp - 1; this.say(`${p.name} 用气势头带撑住了攻击！`); }
        else if (p.volatile?.endure) { dmg = p.hp - 1; delete p.volatile.endure; this.say(`${p.name} 忍耐住了攻击！`); }
      }
      const before = p.hp;
      p.hp = Math.max(0, p.hp - dmg);
      return before - p.hp;
    }
    onDamagingHit(attacker, target, move, damage, crit, eff, beforeHp) {
      if (!target || target.fainted || damage <= 0) return;
      // v1.3.54：记录最后一次受到的伤害（双倍奉还/镜面反射/金属爆炸/复仇用）
      target._lastTaken = { amount: damage, cat: move.category, by: attacker, turn: this.turnCount };
      // v1.3.55：忍耐 —— 积蓄受到的伤害
      if (target.volatile?.bideTurns > 0) target.volatile.bideDamage = (target.volatile.bideDamage || 0) + damage;
      // v1.3.55：怨念 —— 直接受到攻击致死时，对手该招式的 PP 归零
      if (target.hp <= 0 && target.volatile?.grudge && !attacker.fainted) {
        const _gm = (attacker.moves || []).find(m => m.id === move.id);
        if (_gm && _gm.ppLeft > 0) { _gm.ppLeft = 0; this.say(`${target.name} 的怨念使 ${attacker.name} 的 ${move.name} 的 PP 变成了 0！`); }
      }
      // v1.3.54：同命 —— 直接受到攻击致死时，把对手一起带走
      if (target.hp <= 0 && target.volatile?.destinybond && !attacker.fainted) {
        attacker.hp = 0;
        this.say(`${target.name} 发动了同命，把 ${attacker.name} 一起带走了！`);
      }
      if (move.category === 'Physical') {
        if (hasAbility(target, 'stamina')) this.changeStages(target, { def: 1 }, target);
        if (hasAbility(target, 'weakarmor')) this.changeStages(target, { def: -1, spe: 2 }, target);
      }
      if (move.type === 'Dark' && hasAbility(target, 'justified')) this.changeStages(target, { atk: 1 }, target);
      if (['Dark', 'Ghost', 'Bug'].includes(move.type) && hasAbility(target, 'rattled')) this.changeStages(target, { spe: 1 }, target);
      if (move.type === 'Water' && hasAbility(target, 'watercompaction')) this.changeStages(target, { def: 2 }, target);
      if (hasAbility(target, 'berserk') && beforeHp > target.maxHp / 2 && target.hp <= target.maxHp / 2) this.changeStages(target, { spa: 1 }, target);
      if (crit && hasAbility(target, 'angerpoint')) { target.stages.atk = 6; this.say(`${target.name} 的愤怒穴位被击中，攻击升到了最高！`); }
      if (hasAbility(target, 'cursedbody') && attacker && !attacker.fainted && this.rng() < 0.3) { attacker.volatile.disableMove = move.id; attacker.volatile.disableTurns = 4; this.say(`${attacker.name} 受到诅咒之躯影响，${move.name} 被定身了！`); }
      this.checkItemTrigger(target, 'hit', { move, eff, attacker });
      if (move.flags?.contact && attacker && !attacker.fainted) {
        if (hasAbility(target, 'roughskin', 'ironbarbs')) this.applyDamage(attacker, Math.max(1, Math.floor(attacker.maxHp / 8)), `${attacker.name} 受到了粗糙皮肤的伤害！`);
        if (itemId(target) === 'rockyhelmet') this.applyDamage(attacker, Math.max(1, Math.floor(attacker.maxHp / 6)), `${attacker.name} 受到了凸凸头盔的伤害！`);
        const contactAbility = abilityId(target);
        if (STATUS_BY_ABILITY[contactAbility] && this.rng() < 0.3) this.tryStatus(attacker, STATUS_BY_ABILITY[contactAbility], target, { fromStatusMove: false });
        else if (contactAbility === 'effectspore' && this.rng() < 0.3) this.tryStatus(attacker, ['par', 'psn', 'slp'][Math.floor(this.rng() * 3)], target, { fromStatusMove: false });
      }
      if (attacker && !attacker.fainted && itemId(attacker) === 'lifeorb' && !(hasAbility(attacker, 'sheerforce') && move.secondary)) {
        this.applyDamage(attacker, Math.max(1, Math.floor(attacker.maxHp / 10)), `${attacker.name} 被生命宝珠夺走了体力！`);
      }
      if (attacker && !attacker.fainted && itemId(attacker) === 'shellbell') this.heal(attacker, Math.max(1, Math.floor(damage / 8)), '贝壳之铃回复了体力');
    }
    movePriority(user, move, target) {
      let prio = move.priority || 0;
      if (user.dynamaxed && move.category === 'Status') prio = 4; // becomes Max Guard
      if (hasAbility(user, 'prankster') && move.category === 'Status') prio += 1;
      if (hasAbility(user, 'galewings') && move.type === 'Flying' && user.hp === user.maxHp) prio += 1;
      if (hasAbility(user, 'triage') && (move.heal || move.flags?.heal)) prio += 3;
      return prio;
    }
    applyMaxMoveEffect(user, target, move) {
      const type = move._maxType || move.type, side = this.sideOf(user);
      const userBoost = { Fighting: { atk: 1 }, Poison: { spa: 1 }, Flying: { spe: 1 }, Ground: { spd: 1 }, Steel: { def: 1 } }[type];
      if (userBoost) this.changeStages(user, userBoost, user);
      const foeDrop = { Normal: { spe: -1 }, Bug: { spa: -1 }, Ghost: { def: -1 }, Dragon: { atk: -1 }, Dark: { spd: -1 } }[type];
      if (foeDrop && target && !target.fainted) this.changeStages(target, foeDrop, user);
      if (type === 'Fire') this.setWeather('sun', 5);
      if (type === 'Water') this.setWeather('rain', 5);
      if (type === 'Rock') this.setWeather('sand', 5);
      if (type === 'Grass') this.setTerrain('grassy', 5);
      if (type === 'Electric') this.setTerrain('electric', 5);
      if (type === 'Psychic') this.setTerrain('psychic', 5);
      if (type === 'Fairy') this.setTerrain('misty', 5);
      if (type === 'Ice') this.setWeather('snow', 5);
    }

    /* ---------- AI ---------- */
    aiAction(side, slot = 0, reserved = new Set()) {
      const me = this.cur(side, slot), foe = this.activeMons(this.other(side))[0];
      if (!me || me.fainted || !foe) return { kind: 'pass' };
      if (me.choiceLockedMove) {
        const locked = me.moves.findIndex(m => m.id === me.choiceLockedMove && m.ppLeft > 0);
        if (locked >= 0) return { kind: 'move', index: locked };
      }
      const diff = this.difficulty;
      const mistakes = diff === 'easy' ? 0.35 : diff === 'normal' ? 0.12 : 0;
      // Consider switching when badly matched and a healthy counter exists (hard+).
      if (diff !== 'easy') {
        const incoming = Math.max(...foe.moves.map(m => m.basePower ? effectiveness(m.type, me.types) : 0));
        const activeSet = new Set(this.activeSlots[side]);
        const bench = this.teams[side].map((p, i) => ({ p, i })).filter(x => !x.p.fainted && !activeSet.has(x.i) && !reserved.has(x.i));
        if (incoming >= 2 && bench.length && this.rng() < (diff === 'expert' ? 0.55 : 0.3)) {
          bench.sort((a, b) => {
            const score = p => Math.max(...p.moves.map(m => m.basePower ? effectiveness(m.type, foe.types) : 0)) * (p.hp / p.maxHp);
            return score(b.p) - score(a.p);
          });
          if (bench[0]) return { kind: 'switch', index: bench[0].i };
        }
      }
      let best = null;
      for (let i = 0; i < me.moves.length; i++) {
        const m = me.moves[i];
        if (m.ppLeft <= 0) continue;
        if (me.volatile.disableMove === m.id) continue;
        let score;
        if (!m.basePower) {
          score = 18;
          if (m.status && !foe.status) score = 42;
          if (m.boosts && Object.values(m.boosts).some(v => v > 0)) score = me.stages.atk >= 2 ? 8 : 38;
          if (m.heal) score = me.hp < me.maxHp * 0.45 ? 55 : 4;
          if (m.weather && !this.weather) score = 36;
          if (m.terrain && !this.field.terrain) score = 32;
          if (m.pseudoWeather === 'trickroom') score = effStat(me, 'spe') < effStat(foe, 'spe') ? 44 : 8;
          if (m.sideCondition) {
            const foeSide = this.field.sides[this.other(side)], mySide = this.field.sides[side];
            if (['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].includes(m.sideCondition)) score = (foeSide.spikes || foeSide.stealthrock || foeSide.toxicspikes || foeSide.stickyweb) ? 10 : 38;
            else if (m.sideCondition === 'tailwind') score = mySide.tailwind ? 8 : 30;
            else score = me.hp > me.maxHp * 0.6 ? 32 : 12;
          }
          if (m.id === 'defog') score = (this.field.sides[side].spikes || this.field.sides[side].stealthrock || this.field.terrain) ? 40 : 10;
          if (m.id === 'tidyup') score = 34;
        } else {
          const est = estimateDamage(me, foe, m);
          score = est.damage * ((m.accuracy === true ? 100 : m.accuracy || 100) / 100);
          if (m.id === 'rapidspin' && (this.field.sides[side].spikes || this.field.sides[side].stealthrock || this.field.sides[side].toxicspikes)) score += 45;
          if (est.damage >= foe.hp) score += 120;
          score *= 0.85 + this.rng() * 0.3;
        }
        if (mistakes && this.rng() < mistakes) score = this.rng() * 50;
        if (!best || score > best.score) best = { kind: 'move', index: i, score };
      }
      if (!best) return { kind: 'move', index: 0, struggle: true };
      const chosenMove = me.moves[best.index];
      const used = this.mechanicUsed?.[side];
      if (used && chosenMove) {
        if (me.mechanic === 'mega' && !used.mega && !me.isMega) best.mechanic = 'mega';
        else if (me.mechanic === 'dynamax' && !used.dynamax && !me.dynamaxed && chosenMove.basePower && me.hp > me.maxHp * 0.4) best.mechanic = 'dynamax';
        else if (me.mechanic === 'tera' && !used.tera && !me.terastallized && (chosenMove.type === me.teraType || effectiveness(chosenMove.type, foe.types) > 1)) best.mechanic = 'tera';
        else if (me.mechanic === 'z' && !used.z && me.zType === chosenMove.type && chosenMove.basePower) best.mechanic = 'z';
      }
      return best;
    }

    bestSwitch(side) {
      const foe = this.activeMons(this.other(side))[0];
      let best = null;
      this.teams[side].forEach((p, i) => {
        if (p.fainted || this.activeSlots[side].includes(i)) return;
        const off = foe ? Math.max(...p.moves.map(m => m.basePower ? effectiveness(m.type, foe.types) : 0)) : 0;
        const score = off * 2 + p.hp / p.maxHp;
        if (!best || score > best.score) best = { index: i, score };
      });
      return best?.index ?? -1;
    }

    doSwitch(side, index, opts = {}) {
      const slot = opts.slot || 0;
      const p = this.teams[side][index];
      if (!p || p.fainted || p.hp <= 0 || this.activeSlots[side].includes(index)) return false;
      const old = this.cur(side, slot);
      const foes = this.activeMons(this.other(side));
      if (!opts.forced && foes.some(foe => hasAbility(foe, 'shadowtag')) && !old.types.includes('Ghost')) { this.say(`${old.name} 被踩影困住，无法交换！`); return false; }
      // v1.3.54：妖精之锁 / 被盯住（黑色目光、挡路、蛛网） / 蛸固 —— 无法交换
      if (!opts.forced && (this.field.pseudoWeather?.fairylock > 0)) { this.say('妖精之锁封住了场地，无法交换！'); return false; }
      if (!opts.forced && (old.volatile?.cannotEscape || old.volatile?.octolock)) { this.say(`${old.name} 被盯住，无法逃走！`); return false; }
      if (old.dynamaxed && !old.fainted) this.endDynamax(old);
      if (!old.fainted && hasAbility(old, 'regenerator')) this.heal(old, Math.floor(old.maxHp / 3), '再生力回复了体力');
      if (!old.fainted && hasAbility(old, 'naturalcure') && old.status) { old.status = null; this.say(`${old.name} 的自然回复治愈了异常状态。`); }
      // v1.3.55：下场时还原被互换/覆盖的能力值、特性、变身
      if (old._transformed && old._transformBackup) {
        const _tb = old._transformBackup;
        old.speciesId = _tb.speciesId; old.stats = _tb.stats; old.types = _tb.types; old.ability = _tb.ability; old.moves = _tb.moves;
        delete old._transformed; delete old._transformBackup;
        this.say(`${old.name} 变回了原形。`);
      }
      if (old._statBackup) { old.stats = old._statBackup; delete old._statBackup; }
      if (old._abilityBackup) { old.ability = old._abilityBackup; delete old._abilityBackup; }
      old._abilitySuppressed = false;
      old._moveAgainst = null;
      old.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
      old.volatile = {};
      old._protectStreak = 0;
      old.choiceLockedMove = null;
      old._lastMoveId = null;
      this.setActive(side, slot, index);
      // 接力棒：把能力变化与部分持续效果交给换上来的宝可梦
      if (this._batonPass && this._batonPass.side === side && this._batonPass.slot === slot) {
        const bp = this._batonPass; this._batonPass = null;
        p.stages = { ...p.stages, ...bp.stages };
        const keep = ['substitute', 'focusenergy', 'critBoost', 'magnetrise', 'aquaring', 'ingrain', 'leechseed'];
        for (const k of keep) if (bp.volatile?.[k]) p.volatile[k] = bp.volatile[k];
        this.say(`${p.name} 接过了接力棒，继承了能力变化！`);
      }
      this.say(`${side === 0 ? '我方' : '敌方'}收回了 ${old.name}，换上 ${p.name}！`);
      this.onEnter(side, false, slot);
      return true;
    }

    useTrainerItem(id, slot = 0){
      const item=String(id||'');if((this.itemStock[item]||0)<=0)return false;
      const p=this.cur(0, slot);if(!p||p.fainted)return false;
      const effects={xattack:[{atk:2}],xdefense:[{def:2}],xspatk:[{spa:2}],xspdef:[{spd:2}],xspeed:[{spe:2}],xaccuracy:[{accuracy:1}]};
      if(item==='guardspec'){
        this.field.sides[0].safeguard=5;this.itemStock[item]--;this.say('使用了能力防守！我方队伍的能力不会被对手降低（5回合）。');return true;
      }
      if(item==='direhit'){
        p.volatile.critBoost=Math.max(2,Number(p.volatile.critBoost)||0);this.itemStock[item]--;this.say(`${p.name}的击中要害率大幅提高！`);return true;
      }
      const boosts=effects[item]?.[0];if(!boosts)return false;
      const changed=this.changeStages(p,boosts,p);if(!changed){this.say(`${p.name}的相关能力已无法继续提高；道具未消耗。`);return false;}
      this.itemStock[item]--;this.say(`使用了${({xattack:'力量强化',xdefense:'防御强化',xspatk:'特攻强化',xspdef:'特防强化',xspeed:'速度强化',xaccuracy:'命中强化'})[item]}！`);return true;
    }
    escapeWithDoll(){
      if(this.winner!==null||this.encounterType!=='wild'||(this.itemStock.pokemondoll||0)<=0)return[];
      const start=this.log.length;this.itemStock.pokemondoll--;this.winner=0;this.outcome='escaped';this.pendingSwitch=null;this.pendingSwitches=[];this.say('使用了宝可梦玩偶，成功从野生战斗中逃走！');return this.log.slice(start);
    }

    /** A selected switch occupies that actor's action, while faint replacements never start a new turn. */
    turn(playerAction) {
      if (playerAction?.kind === 'capture') return this.captureTurn ? this.captureTurn(playerAction) : [];
      if (this.winner !== null || this.pendingSwitch !== null || this._turnState) return [];
      if (this.double && playerAction?.kind === 'double') return this.turnDouble(playerAction.actions || []);
      if (playerAction?.kind === 'item' && playerAction.id === 'pokemondoll') return this.escapeWithDoll();
      return this._startTurn([playerAction || { kind: 'pass' }]);
    }

    // Resolve targets from the actual move metadata. "normal" can target an ally in doubles,
    // whereas adjacentFoe cannot; neither normal nor any can target the user itself.
    doubleTargets(side, slot, move, chosen) {
      const user = this.cur(side, slot);
      if (!user || user.fainted || user.hp <= 0) return [];
      const foes = this.activeMons(this.other(side)).filter(p => p.hp > 0);
      const allies = this.activeMons(side).filter(p => p.hp > 0);
      const others = [...foes, ...allies.filter(p => p !== user)];
      const all = [user, ...others];
      const selected = chosen && Number.isInteger(chosen.slot) ? this.cur(chosen.side ?? this.other(side), chosen.slot) : null;
      let targets;
      switch (move.target) {
        case 'self': return [user];
        case 'adjacentAlly': targets = allies.filter(p => p !== user); break;
        case 'adjacentAllyOrSelf': targets = allies; break;
        case 'allies': return allies;
        case 'allyTeam': case 'allySide': return [user];
        case 'allAdjacentFoes': return foes;
        case 'allAdjacent': return others;
        case 'all': return all;
        case 'foeSide': return [foes[0] || user];
        case 'randomNormal': return foes.length ? [foes[Math.floor(this.rng() * foes.length)]] : [];
        case 'any': case 'normal': targets = others; break;
        case 'adjacentFoe': case 'scripted': default: targets = foes;
      }
      if (!targets.length) return [];
      // A vanished ally is not silently replaced with an opponent. A vanished foe may be retargeted.
      if (chosen && chosen.side === side && !targets.includes(selected)) return [];
      let target = selected && targets.includes(selected) ? selected : (foes.find(p => targets.includes(p)) || targets[0]);
      if (target._side !== side && !['self', 'adjacentAlly', 'adjacentAllyOrSelf'].includes(move.target)) {
        const redirected = foes.find(p => p.volatile?.followme || p.volatile?.ragepowder || (p.volatile?.spotlight && target !== p)
          || (move.type === 'Electric' && hasAbility(p, 'lightningrod'))
          || (move.type === 'Water' && hasAbility(p, 'stormdrain')));
        if (redirected) target = redirected;
      }
      return [target];
    }
    turnDouble(playerActions) { return this._startTurn(playerActions || []); }
    _startTurn(playerActions) {
      if (this.winner !== null || this.pendingSwitch !== null || this._turnState) return [];
      const start = this.log.length, count = this.double ? 2 : 1;
      for (const side of [0, 1]) for (let slot = 0; slot < count; slot++) {
        const p = this.cur(side, slot); if (p) { p._enteredThisTurn = false; delete p.volatile.protect; }
      }
      const reserved = new Set();
      const enemy = Array.from({ length: count }, (_, slot) => {
        const a = this.aiAction(1, slot, reserved);
        if (a.kind === 'switch') reserved.add(a.index);
        return a;
      });
      const actions = [0, 1].flatMap(side => Array.from({ length: count }, (_, slot) => ({
        side, slot, actor: this.cur(side, slot), action: side === 0 ? (playerActions[slot] || { kind: 'pass' }) : enemy[slot]
      }))).filter(a => a.actor && !a.actor.fainted && a.actor.hp > 0);
      // Items affect the selected doubles slot, not always slot 0. An invalid single item costs no turn.
      for (const a of actions) if (a.side === 0 && a.action.kind === 'item') {
        if (a.action.id === 'pokemondoll') return this.escapeWithDoll();
        const used = this.useTrainerItem(a.action.id, a.slot);
        if (!used && !this.double) return this.log.slice(start);
        a.action = { kind: 'pass' };
      }
      this.turnCount++;
      // Switches precede moves. Do not substitute a switched-in mon for a queued actor.
      for (const a of actions) if (a.action.kind === 'switch' && this.cur(a.side, a.slot) === a.actor) {
        if (!this.doSwitch(a.side, a.action.index, { slot: a.slot })) this.say(`${a.actor.name} 无法交换，本次行动结束。`);
        this.checkFaints({ deferReplacement: true });
      }
      this.updateWinner();
      if (this.winner !== null) return this.log.slice(start);
      const moveActions = actions.filter(a => a.action.kind === 'move' && this.cur(a.side, a.slot) === a.actor && !a.actor.fainted);
      [...moveActions].filter(a => ['mega', 'dynamax', 'tera'].includes(a.action.mechanic))
        .sort((a, b) => effStat(b.actor, 'spe') - effStat(a.actor, 'spe'))
        .forEach(a => { if (this.cur(a.side, a.slot) === a.actor && !a.actor.fainted) this.activateMechanic(a.side, a.action.mechanic, a.slot); });
      const movers = moveActions.map(a => {
        const p = a.actor;
        const usable = p.moves.filter(m => m.ppLeft > 0 && p.volatile.disableMove !== m.id);
        const locked = p.choiceLockedMove ? p.moves.findIndex(m => m.id === p.choiceLockedMove && m.ppLeft > 0) : -1;
        const encIdx = p.volatile?.encore ? p.moves.findIndex(m => m.id === p.volatile.encore.moveId && m.ppLeft > 0) : -1;
        const picked = p.moves[locked >= 0 ? locked : (encIdx >= 0 ? encIdx : a.action.index)];
        const base = (a.action.struggle || !usable.length) ? struggleMove() : resolveScriptedMove(this, p, picked || p.moves[0]);
        const move = { ...transformMove(p, base, a.action.mechanic) };
        const targets = this.doubleTargets(a.side, a.slot, move, a.action.target);
        return { ...a, move, base, prio: p.volatile?.quash ? -9 : (p.volatile?.afteryou ? 3 : this.movePriority(p, move, targets[0] || p)),
          speed: effStat(p, 'spe'), tie: this.rng(), mechanic: a.action.mechanic || null };
      });
      const trick = this.field.trickRoom > 0;
      movers.sort((x, y) => (y.prio - x.prio) || (trick ? (x.speed - y.speed) || (x.tie - y.tie) : (y.speed - x.speed) || (x.tie - y.tie)));
      this._turnState = { movers, index: 0 };
      this._continueTurn();
      return this.log.slice(start);
    }
    _continueTurn() {
      const state = this._turnState;
      if (!state || this.pendingSwitch !== null || this.winner !== null) return;
      while (state.index < state.movers.length) {
        const m = state.movers[state.index++];
        const user = this.cur(m.side, m.slot);
        if (!user || user !== m.actor || user.fainted || user.hp <= 0) continue;
        const targets = this.doubleTargets(m.side, m.slot, m.move, m.action.target);
        if (!targets.length) { this.say(`${user.name} 的招式没有可选目标！`); continue; }
        const shared = {};
        for (let i = 0; i < targets.length; i++) {
          if (!targets[i] || targets[i].fainted || targets[i].hp <= 0 || user.fainted || user.hp <= 0) continue;
          this.useMove(m.side, user, targets[i], m.base, { mechanic: m.mechanic, _shared: shared,
            _doubleIndex: i, _doubleCount: targets.length, _spreadTargets: targets.length > 1 ? targets.length : 0 });
        }
        if (m.base.id === 'struggle' && !user.fainted && user.hp > 0 && this._struggled) this.applyDamage(user, Math.max(1, Math.floor(user.maxHp / 4)), `${user.name} 受到了反作用力伤害！`);
        if (m.base.basePower) delete user.volatile.helpinghand;
        this._struggled = false;
        if (this._boom === user && !user.fainted && user.hp > 0) { user.hp = 0; this.say(`${user.name} 倒下了！`); }
        this._boom = null;
        // Ordinary faint replacements happen after the remaining actions and residual effects.
        this.checkFaints({ deferReplacement: true });
        this.updateWinner();
        if (this.winner !== null) { this._turnState = null; return; }
        // Volt Switch / Baton Pass / forced switches must resolve before the queued actions resume.
        if (this.pendingSwitch !== null) return;
      }
      this.endOfTurn();
      this.checkFaints({ deferReplacement: true });
      this.updateWinner();
      this._turnState = null;
      if (this.winner !== null) return;
      this.checkFaints();
      this.updateWinner();
    }

    // 出招前的“不能使用”判定（挑衅 / 再来一次以外的限制都在这里）
    moveBlocked(p, move) {
      if (!p || !move) return null;
      if (p.volatile?.taunt && move.category === 'Status') return `${p.name} 正在被挑衅，无法使用变化招式！`;
      // v1.3.55：封印 —— 对手使用封印者也会的招式无效
      if (this.activeMons) {
        const _opp = this.activeMons(this.other(this.sideOf(p)));
        if (_opp.some(f => f.volatile?.imprison && (f.moves || []).some(m => m.id === move.id))) return `${p.name} 被封印了，无法使用 ${move.name}！`;
      }
      if (p.volatile?.torment && p._lastMoveId === move.id) return `${p.name} 因被折磨而无法连续使用同一招式！`;
      if (p.volatile?.healblock && (move.heal || move.drain || ['recover', 'roost', 'softboiled', 'milkdrink', 'slackoff', 'healorder', 'synthesis', 'moonlight', 'morningsun', 'shoreup', 'strengthsap', 'wish', 'rest'].includes(move.id))) return `${p.name} 被回复封锁，无法回复体力！`;
      return null;
    }

    canMove(p, move = null) {
      if (move && p.volatile.disableMove === move.id) { this.say(`${p.name} 的 ${move.name} 被定身法封住了！`); return false; }
      if (p.status === 'slp') {
        p.sleepTurns--;
        if (p.sleepTurns > 0) { this.say(`${p.name} 正在睡觉。`); return false; }
        p.status = null; this.say(`${p.name} 醒了过来！`);
      }
      if (p.status === 'frz') {
        if (this.rng() < 0.2) { p.status = null; this.say(`${p.name} 的冰冻解除了！`); }
        else { this.say(`${p.name} 被冻住了，无法行动！`); return false; }
      }
      if (p.status === 'par' && this.rng() < 0.25) { this.say(`${p.name} 麻痹了，无法行动！`); return false; }
      if (p.volatile.confusion) {
        p.volatile.confusion--;
        this.say(`${p.name} 混乱了！`);
        if (p.volatile.confusion <= 0) { delete p.volatile.confusion; this.say(`${p.name} 的混乱解除了。`); }
        else if (this.rng() < 0.33) {
          const dmg = Math.max(1, Math.floor((((2 * p.level / 5 + 2) * 40 * effStat(p, 'atk') / effStat(p, 'def')) / 50) + 2));
          this.applyDamage(p, dmg, `${p.name} 攻击了自己！`);
          return false;
        }
      }
      if (p.volatile?.attract && this.rng() < 0.5) { this.say(`${p.name} 被迷住了，无法行动！`); return false; }
      if (p.volatile.flinch) { delete p.volatile.flinch; if (p.dynamaxed) { /* Dynamax cannot flinch */ } else { this.say(`${p.name} 退缩了，无法行动！`); if (hasAbility(p, 'steadfast')) this.changeStages(p, { spe: 1 }, p); return false; } }
      return true;
    }

    useMove(side, user, target, baseMove, opts = {}) {
      const shared = opts._shared || null;
      const firstAction = !shared || !shared.started;
      if (shared?.cancelled) return;
      let move = shared?.move || baseMove;
      let wantsZ = shared ? !!shared.wantsZ : (opts.mechanic === 'z' && !this.mechanicUsed[side].z && user.mechanic === 'z' && user.zType === baseMove.type);
      if (firstAction) {
        if (wantsZ) move = makeZMove(user, baseMove);
        if (user.dynamaxed) move = makeMaxMove(user, baseMove);
        move = { ...move, _spreadTargets: opts._spreadTargets || 0 };
        if (shared) { shared.started = true; shared.move = move; shared.wantsZ = wantsZ; }
      }
      const protectMove = ['protect', 'maxguard'].includes(move.volatileStatus);
      if (firstAction && !protectMove) user._protectStreak = 0;
      if (firstAction) {
        const blocked = this.moveBlocked(user, baseMove);
        if (blocked) { this.say(blocked); if (shared) shared.cancelled = true; return; }
      }
      if (firstAction && !this.canMove(user, baseMove)) { if (protectMove) user._protectStreak = 0; if (shared) shared.cancelled = true; return; }
      if (firstAction) {
        user._participated = true;
        this.moveCount++;
        if (baseMove.id === 'struggle') { this._struggled = true; this.say(`${user.name} 已经没有可以使用的招式了！`); }
        if (baseMove.ppLeft > 0 && baseMove.id !== 'struggle') baseMove.ppLeft--;
        if (wantsZ) { this.mechanicUsed[side].z = true; this.say(`💥 ${user.name} 发动了Ｚ招式！`); }
        if (['choiceband', 'choicespecs', 'choicescarf'].includes(itemId(user)) && !user.choiceLockedMove) user.choiceLockedMove = baseMove.id;
        this.say(`${user.name} 使用了 ${move.name}！`);
      }
      if (firstAction && protectMove) {
        const streak = Math.max(0, Number(user._protectStreak) || 0);
        const chance = streak ? 1 / (3 ** streak) : 1;
        if (chance < 1 && this.rng() >= chance) {
          user._protectStreak = 0;
          this.say('但是失败了！');
          this.checkItemTrigger(user, 'pp');
          return;
        }
        user._protectStreak = streak + 1;
      }
      if (firstAction && (move.selfdestruct === 'always' || baseMove.id === 'finalgambit')) this._boom = user; // v1.3.5：大爆炸 / 自爆 / 搏命，使用后自己倒下
      // Status moves are not inherently self-targeting: use the explicit target chosen by the caller.
      const ghostCurse = move.id === 'curse' && user.types?.includes('Ghost');
      let realTarget = move.id === 'curse' ? (ghostCurse ? target : user) : (move.target === 'self' ? user : target);
      // v1.3.55：魔法反射 / 抢夺 —— 弹回对手的变化招式
      if (target && target !== user && move.category === 'Status' && !move.sideCondition && !move.pseudoWeather) {
        if (target.volatile?.magiccoat && move.target !== 'self') { this.say(`${target.name} 的魔法反射把招式弹了回去！`); realTarget = user; }
        else if (target.volatile?.snatch && (move.heal || (move.boosts && move.target === 'self'))) { this.say(`${target.name} 抢夺了对手的招式效果！`); realTarget = target; opts._snatched = true; }
      }
      if (realTarget !== user) realTarget._moveAgainst = move.id;
      if (realTarget !== user && hasAbility(realTarget, 'pressure') && baseMove.ppLeft > 0) baseMove.ppLeft--;
      const priority = this.movePriority(user, move, realTarget);
      if (realTarget !== user && priority > 0 && hasAbility(realTarget, 'dazzling', 'queenlymajesty', 'armortail')) { this.say(`${realTarget.name} 的特性阻止了先制招式！`); return; }
      if (realTarget !== user && priority > 0 && this.field.terrain === 'psychic' && isGrounded(realTarget)) { this.say('精神场地保护着宝可梦，先制招式失败了！'); return; }
      if (realTarget !== user && hasAbility(user, 'prankster') && move.category === 'Status' && realTarget.types.includes('Dark')) { this.say(`对 ${realTarget.name} 没有效果……`); return; }
      if (realTarget !== user && realTarget.volatile.protect && move.flags?.protect && !(move.basePower && (move._isZ || move._isMax))) { this.say(`${realTarget.name} 守住了攻击！`); return; }
      if (realTarget !== user) {
        const guard = this.field.sides[this.sideOf(realTarget)];
        if (guard?.wideguard && move.basePower && ['allAdjacent', 'allAdjacentFoes', 'all'].includes(move.target)) { this.say(`${realTarget.name} 一方被广域防守保护着！`); return; }
        if (guard?.quickguard && this.movePriority(user, move, realTarget) > 0) { this.say(`${realTarget.name} 一方被快速防守保护着！`); return; }
        if (guard?.matblock && move.basePower) { this.say(`${realTarget.name} 一方被掀榻榻米挡下了攻击！`); return; }
      }
      let interaction = realTarget !== user ? abilityMoveInteraction(user, realTarget, move) : null;
    // 千箭齐发 / 千波激荡可以打中飘浮特性
    if (interaction && interaction.kind === 'immune' && move.type === 'Ground' && ignoresImmunity(move, 'Ground')
      && ['漂浮', '食土'].includes(interaction.label)) interaction = null;
      if (interaction) {
        this.say(`${realTarget.name} 的${interaction.label}使招式没有效果！`);
        if (interaction.kind === 'heal') this.heal(realTarget, Math.floor(realTarget.maxHp / 4), '特性回复了体力');
        if (interaction.kind === 'boost') this.changeStages(realTarget, interaction.boosts, realTarget);
        if (interaction.kind === 'flashfire') { realTarget.volatile.flashfire = true; this.say(`${realTarget.name} 的引火被激发了！`); }
        return;
      }
      // Showdown-style OHKO type metadata (for example Sheer Cold's `ohko: 'Ice'`) is an explicit immunity rule.
      if (typeof move.ohko === 'string' && realTarget.types?.includes(move.ohko)) {
        this.say(`对 ${realTarget.name} 没有效果……`);
        return;
      }
      // Accuracy
      let acc = move.accuracy === true || move.accuracy == null ? 100 : move.accuracy;
      if (move.ohko && realTarget !== user) {
        if (user.level < realTarget.level) { this.say(`对 ${realTarget.name} 没有效果……（等级比对手低）`); return; }
        acc = 30 + (user.level - realTarget.level);
      }
      const targetEvasion = hasAbility(user, 'keeneye') ? Math.min(0, realTarget.stages.evasion || 0) : (realTarget.stages.evasion || 0);
      // accuracy:true denotes a never-miss move, not a 100%-accuracy move.
      if (!move.ohko && move.accuracy !== true) acc *= stageMult((user.stages.accuracy || 0), 'acc') * stageMult(targetEvasion, 'eva');
      if (move.accuracy !== true && move.category === 'Physical' && hasAbility(user, 'hustle')) acc *= 0.8;
      if (move.accuracy !== true && this.field.gravity > 0) acc *= 5 / 3;
      if (move.type === 'Fire' && user.volatile?.powder) {
        delete user.volatile.powder;
        this.say(`${user.name} 身上的粉尘被火苗引燃了！`);
        this.applyDamage(user, Math.max(1, Math.floor(user.maxHp / 4)), `${user.name} 受到了粉尘爆炸的伤害！`);
        return;
      }
      if (realTarget !== user && !realTarget.volatile?.lockon && this.rng() * 100 > acc) { this.say(`但是没有命中 ${realTarget.name}！`); return; }
      if (move.id === 'pollenpuff' && realTarget !== user && this.sideOf(realTarget) === side) {
        this.heal(realTarget, Math.floor(realTarget.maxHp / 2), '被花粉团回复了体力');
        if (firstAction) { user._lastMoveId = baseMove.id; user._lastMoveType = baseMove.type; }
        this.checkItemTrigger(user, 'pp');
        return;
      }
      if (move.id === 'curse') {
        if (!ghostCurse) {
          this.changeStages(user, { atk: 1, def: 1, spe: -1 }, user);
          return;
        }
        if (!target || target === user || target.fainted || target.volatile?.curse) { this.say('但是失败了！'); return; }
        const cost = Math.max(1, Math.floor(user.maxHp / 2));
        if (user.hp <= cost) { this.say('体力不足以施展诅咒；但是失败了！'); return; }
        this.applyDamage(user, cost, `${user.name} 消耗一半最大 HP 施展诅咒！`);
        target.volatile.curse = true;
        this.say(`${target.name} 被下了诅咒！每回合结束时会损失最大 HP 的四分之一。`);
        return;
      }
      if (['brickbreak', 'psychicfangs'].includes(move.id) && realTarget !== user) {
        const sc = this.field.sides[this.sideOf(realTarget)];
        if (sc.reflect || sc.lightscreen || sc.auroraveil) { sc.reflect = 0; sc.lightscreen = 0; sc.auroraveil = 0; this.say(`${realTarget.name} 一方的壁被打破了！`); }
      }

      const hits = Array.isArray(move.multihit) ? move.multihit[0] + Math.floor(this.rng() * (move.multihit[1] - move.multihit[0] + 1)) : (move.multihit || 1);
      let anyHit = false;
      for (let h = 0; h < hits; h++) {
        if (realTarget.fainted) break;
        let connected = true;
        if (move.basePower) {
          let critStage = move.critRatio || 0;
          critStage += user.volatile.critBoost || 0;
          if(user.volatile.critBoost){delete user.volatile.critBoost;}
          if (hasAbility(user, 'superluck')) critStage += 1;
          if (['scopelens', 'razorclaw'].includes(itemId(user))) critStage += 1;
          const crit = !(this.field.sides[this.sideOf(realTarget)]?.luckychant > 0) && !hasAbility(realTarget, 'battlearmor', 'shellarmor') && this.rng() < [1 / 24, 1 / 8, 1 / 2, 1][Math.min(3, critStage)];
          const est = estimateDamage(user, realTarget, move, 0.85 + this.rng() * 0.15, { crit });
          if (est.eff === 0 && !ignoresImmunity(move, move.type)) { this.say(`对 ${realTarget.name} 没有效果……`); connected = false; }
          else {
            anyHit = true;
            const beforeHp = realTarget.hp;
            let dmg = est.damage;
            if (crit) dmg = Math.floor(dmg * (hasAbility(user, 'sniper') ? 2.25 : 1.5));
            const dealt = this.applyMoveDamage(realTarget, dmg, user, move);
            if (crit) this.say('击中了要害！');
            if (est.eff > 1) this.say('效果绝佳！'); else if (est.eff < 1 && est.eff > 0) this.say('效果不理想……');
            if (dealt > 0) this.onDamagingHit(user, realTarget, move, dealt, crit, est.eff, beforeHp);
            if (move.drain && !user.fainted) this.heal(user, Math.max(1, Math.floor(dealt * move.drain[0] / move.drain[1])), '吸取了体力');
            if (move.recoil && !user.fainted && !hasAbility(user, 'rockhead')) this.applyDamage(user, Math.max(1, Math.floor(dealt * move.recoil[0] / move.recoil[1])), `${user.name} 受到了反作用力伤害！`);
          }
        } else if (realTarget !== user && specialDamageInfo(user, realTarget, move)) {
          // v1.3.5：固定伤害 / 特殊威力 / 一击必杀
          const sp = specialDamageInfo(user, realTarget, move, this.rng());
          if (sp && sp.label) this.say(sp.label);
          const probe = sp && sp.counterHit ? { eff: 1 } : estimateDamage(user, realTarget, { ...move, basePower: sp.basePower || 1, type: sp.type || move.type }, 1);
          if (probe.eff === 0) { this.say(`对 ${realTarget.name} 没有效果……`); connected = false; }
          else if (sp.kind === 'fixed' && sp.damage <= 0) { this.say('但是失败了！'); connected = false; }
          else {
            anyHit = true;
            const beforeHp = realTarget.hp;
            let dmg, eff = 1;
            if (sp.kind === 'ohko') dmg = realTarget.hp;
            else if (sp.kind === 'fixed') dmg = sp.damage;
            else { const est = estimateDamage(user, realTarget, { ...move, basePower: sp.basePower, type: sp.type || move.type }, 0.85 + this.rng() * 0.15); dmg = est.damage; eff = est.eff; }
            const dealt = this.applyMoveDamage(realTarget, dmg, user, move);
            if (sp.kind === 'ohko' && realTarget.hp <= 0) this.say('一击必杀！');
            if (eff > 1) this.say('效果绝佳！'); else if (eff < 1 && eff > 0) this.say('效果不理想……');
            if (dealt > 0) this.onDamagingHit(user, realTarget, move, dealt, false, eff, beforeHp);
          }
        } else anyHit = true;
        if (hits > 1 && h === hits - 1 && anyHit) this.say(`击中了 ${hits} 次！`);
        // Guaranteed move effects (on target / self)
        if (connected && !realTarget.fainted) this.applyEffects(user, realTarget, move, move, opts);
        const sec = move.secondary || (move.secondaries ? move.secondaries[0] : null);
        const sheer = hasAbility(user, 'sheerforce') && !!move.secondary;
        if (connected && sec && !sheer && !hasAbility(realTarget, 'shielddust') && !realTarget.fainted) {
          let chance = sec.chance ?? 100;
          if (hasAbility(user, 'serenegrace')) chance *= 2;
          if (this.rng() * 100 < chance) this.applyEffects(user, realTarget, move, sec, opts);
        }
        if (move.self && firstAction && !user.fainted) this.applyEffects(user, user, move, move.self, opts);
        if (user.fainted) break;
      }
      if (shared && anyHit) shared.anyHit = true;
      const lastTarget = !shared || opts._doubleIndex >= (opts._doubleCount || 1) - 1;
      const moveHit = shared ? !!shared.anyHit : anyHit;
      if (lastTarget && moveHit && move._isMax && !user.fainted) this.applyMaxMoveEffect(user, realTarget, move);
      if (lastTarget && moveHit && ['rapidspin', 'mortalspin'].includes(move.id) && !user.fainted) {
        if (this.clearHazards(this.sideOf(user))) this.say(`${user.name} 清除了自己一方的钉子！`);
      }
      if (anyHit && move.heal && !realTarget.fainted && realTarget.hp > 0) {
        const recipient = opts._snatched ? realTarget : (move.target === 'self' ? user : realTarget);
        this.heal(recipient, Math.floor(recipient.maxHp * move.heal[0] / move.heal[1]), '回复了体力');
      }
      if (firstAction) { if (user.volatile?.destinybond && baseMove.id !== 'destinybond') delete user.volatile.destinybond; user._lastMoveId = baseMove.id; user._lastMoveType = baseMove.type; this._lastExecutedMove = baseMove.id; }
      // 自我替换：伏特替换 / 急速折返 / 快速折返 / 抛下狠话 / 接力棒 …
      if (lastTarget && moveHit && move.selfSwitch && !user.fainted && user.hp > 0 && this.winner === null) this.requestSelfSwitch(user, move);
      // 强制替换：吼叫 / 吹飞 / 龙尾 / 巴投
      if (lastTarget && moveHit && move.forceSwitch && !realTarget.fainted && realTarget.hp > 0 && this.winner === null && this.outcome !== 'escaped') this.forceTargetOut(realTarget);
      if (lastTarget) this.checkItemTrigger(user, 'pp');
    }

    applyEffects(user, target, move, eff, context = {}) {
      if (!eff) return;
      // v1.3.54：戏法防守 —— 对手的变化招式无效（不影响自己一方的自我招式与场地类）
      if (eff === move && move.category === 'Status' && target && target._side !== user._side
        && !move.sideCondition && !move.pseudoWeather && (this.field.sides[this.sideOf(target)]?.craftyshield > 0)) {
        this.say(`${target.name} 一方被戏法防守保护着！`); return;
      }
      if (eff.self && eff !== move) this.applyEffects(user, user, move, eff.self);
      if (eff === move && (context._doubleIndex == null || context._doubleIndex === 0)) {
        if (move._zStatus && move.zMove && !move._zApplied) {
          move._zApplied = true;
          const z = move.zMove;
          if (z.boost) this.changeStages(user, z.boost, user);
          if (z.effect === 'clearnegativeboost') { for (const k of Object.keys(user.stages)) if (user.stages[k] < 0) user.stages[k] = 0; this.say(`${user.name} 的降低能力被Ｚ招式力量清除了！`); }
          if (z.effect === 'crit2') { user.volatile.critBoost = 2; this.say(`${user.name} 的Ｚ招式力量让它更容易击中要害！`); }
          if (z.effect === 'heal') this.heal(user, user.maxHp, 'Ｚ招式力量完全回复了体力');
        }
        if (move.weather) this.setWeather(move.weather, 5);
        if (move.terrain) this.setTerrain(move.terrain, 5);
        if (move.pseudoWeather === 'trickroom') {
          if (this.field.trickRoom > 0) { this.field.trickRoom = 0; this.say('扭曲的空间恢复了正常！'); }
          else { this.field.trickRoom = 5; this.say('空间被扭曲了（戏法空间，速度顺序反转）！'); }
        }
        if (move.pseudoWeather === 'gravity') { this.field.gravity = 5; this.say('重力变得更强了！'); }
        if (move.pseudoWeather === 'magicroom') { this.field.magicRoom = 5; this.say('魔法空间展开：所有宝可梦无法使用道具（5回合）！'); }
        else if (move.pseudoWeather === 'wonderroom') { this.field.wonderRoom = 5; this.say('奇妙空间展开：防御与特防按互换计算（5回合）！'); }
        else if (['watersport', 'mudsport', 'iondeluge', 'fairylock'].includes(move.pseudoWeather)) {
          this.field.pseudoWeather = this.field.pseudoWeather || {};
          this.field.pseudoWeather[move.pseudoWeather] = move.pseudoWeather === 'fairylock' ? 2 : 5;
          const PW_MSG = { watersport: '场上洒满了水（火属性招式威力减半）！', mudsport: '场上洒满了泥（电属性招式威力减半）！', iondeluge: '等离子浴：一般属性招式变成电属性！', fairylock: '妖精之锁：双方都无法交换宝可梦！' };
          this.say(PW_MSG[move.pseudoWeather]);
        }
        if (move.sideCondition) {
          const userSide = this.sideOf(user), foeSide = this.other(userSide);
          const scSide = move.target === 'foeSide' ? foeSide : userSide;
          const sc = this.field.sides[scSide];
          if (move.sideCondition === 'stealthrock' && !sc.stealthrock) { sc.stealthrock = true; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下散布了隐形岩！`); }
          if (move.sideCondition === 'spikes' && sc.spikes < 3) { sc.spikes++; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下散布了撒菱（${sc.spikes}层）！`); }
          if (move.sideCondition === 'toxicspikes' && sc.toxicspikes < 2) { sc.toxicspikes++; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下散布了毒菱（${sc.toxicspikes}层）！`); }
          if (move.sideCondition === 'stickyweb' && !sc.stickyweb) { sc.stickyweb = true; this.say(`${scSide === 0 ? '我方' : '敌方'}脚下被黏黏网覆盖！`); }
          if (move.sideCondition === 'reflect') { sc.reflect = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被反射壁保护着！`); }
          if (move.sideCondition === 'lightscreen') { sc.lightscreen = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被光墙保护着！`); }
          if (move.sideCondition === 'auroraveil') {
            if (this.weather === 'snow') { sc.auroraveil = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被极光幕保护着！`); }
            else this.say('但是失败了（极光幕需要雪天）！');
          }
          if (move.sideCondition === 'tailwind') { sc.tailwind = 4; this.say(`${scSide === 0 ? '我方' : '敌方'}刮起了顺风！`); }
          if (move.sideCondition === 'safeguard') { sc.safeguard = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被神秘守护（不会陷入异常状态）！`); }
          if (move.sideCondition === 'mist') { sc.mist = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被白雾笼罩（能力不会被对手降低）！`); }
          if (move.sideCondition === 'luckychant') { sc.luckychant = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}被幸运咒语守护（不会被打中要害）！`); }
          if (move.sideCondition === 'craftyshield') { sc.craftyshield = 5; this.say(`${scSide === 0 ? '我方' : '敌方'}一方摆出了戏法防守！`); }
          if (['wideguard', 'quickguard', 'matblock'].includes(move.sideCondition)) { sc[move.sideCondition] = true; this.say(`${scSide === 0 ? '我方' : '敌方'}一方摆出了防护！`); }
        }
        if (move.id === 'defog') {
          this.changeStages(target, { evasion: -1 }, user);
          let removed = false;
          for (const sd of [0, 1]) { removed = this.clearHazards(sd) || removed; const sc = this.field.sides[sd]; if (sc.reflect || sc.lightscreen || sc.auroraveil) { sc.reflect = 0; sc.lightscreen = 0; sc.auroraveil = 0; removed = true; } }
          if (this.field.terrain) { this.field.terrain = null; this.field.terrainTurns = 0; removed = true; }
          if (removed) this.say('场上的钉子、壁与场地被清除了！');
        }
        if (move.id === 'tidyup') {
          for (const sd of [0, 1]) this.clearHazards(sd);
          this.say('场上的钉子被打扫干净了！');
          this.changeStages(user, { atk: 1, spe: 1 }, user);
        }
        // v1.3.5：几个常见的变化招式
        if (move.id === 'rest') {
          if (user.hp >= user.maxHp) this.say('但是失败了！（体力已经是满的）');
          else if (statusImmunityReason(user, 'slp', this)) this.say(`${user.name} 无法入睡，但是失败了！`);
          else { user.status = 'slp'; user.sleepTurns = 3; delete user.toxicCounter; const real = user.maxHp - user.hp; user.hp = user.maxHp; this.say(`${user.name} 睡着了，并且回复了全部体力（+${real}）！`); }
        }
        if (move.id === 'haze') {
          for (const sd of [0, 1]) for (let slot = 0; slot < (this.double ? 2 : 1); slot++) { const p = this.cur(sd, slot); if (p) for (const k of Object.keys(p.stages)) p.stages[k] = 0; }
          this.say('所有宝可梦的能力变化都复原了！');
        }
        if (move.id === 'focusenergy') {
          if ((user.volatile.critBoost || 0) >= 2) this.say('但是失败了！');
          else { user.volatile.critBoost = 2; this.say(`${user.name} 鼓足了干劲（更容易击中要害）！`); }
        }
        if (move.id === 'splash') this.say('但是什么也没有发生！');
        // —— v1.3.55：B 组 + C 组 ——
        // 反制类
        if (move.id === 'snatch') { user.volatile.snatch = true; this.say(`${user.name} 摆出了抢夺的架势！`); }
        if (move.id === 'magiccoat') { user.volatile.magiccoat = true; this.say(`${user.name} 覆盖了魔法反射膜！`); }
        if (move.id === 'imprison') { user.volatile.imprison = true; this.say(`${user.name} 封印了对手与自己相同的招式！`); }
        if (move.id === 'grudge') { user.volatile.grudge = true; this.say(`${user.name} 暗下了怨念的决心！`); }
        if (move.id === 'bide') {
          if (!user.volatile?.bideTurns) { user.volatile.bideTurns = 2; user.volatile.bideDamage = 0; user.volatile.bideBy = this.cur(this.other(this.sideOf(user))); this.say(`${user.name} 正在忍耐……`); }
          else this.say(`${user.name} 正在忍耐……`);
        }
        // 复制/交换类
        if (move.id === 'psychup') { user.stages = { ...target.stages }; this.say(`${user.name} 用自我暗示复制了 ${target.name} 的能力变化！`); }
        if (move.id === 'topsyturvy') { for (const k of Object.keys(target.stages)) target.stages[k] = -target.stages[k]; this.say(`${target.name} 的能力变化被颠倒了！`); }
        if (move.id === 'psychoshift') {
          if (!user.status) this.say('但是失败了！（自己没有异常状态）');
          else if (target.status) this.say('但是失败了！（对手已有异常状态）');
          else { const st = user.status; user.status = null; this.tryStatus(target, st, user, { fromStatusMove: true }); }
        }
        const _bkS = q => { if (!q._statBackup) q._statBackup = { ...q.stats }; };
        if (move.id === 'powertrick') { _bkS(user); [user.stats.atk, user.stats.def] = [user.stats.def, user.stats.atk]; [user.stages.atk, user.stages.def] = [user.stages.def, user.stages.atk]; this.say(`${user.name} 的攻击和防御互换了！`); }
        if (move.id === 'powershift') { _bkS(user); [user.stats.atk, user.stats.spa] = [user.stats.spa, user.stats.atk]; [user.stages.atk, user.stages.spa] = [user.stages.spa, user.stages.atk]; this.say(`${user.name} 的攻击和特攻互换了！`); }
        if (move.id === 'speedswap') { _bkS(user); _bkS(target); [user.stats.spe, target.stats.spe] = [target.stats.spe, user.stats.spe]; this.say(`${user.name} 和 ${target.name} 交换了速度！`); }
        if (move.id === 'powersplit') { _bkS(user); _bkS(target); for (const k of ['atk', 'spa']) { const v = Math.floor((user.stats[k] + target.stats[k]) / 2); user.stats[k] = v; target.stats[k] = v; } this.say(`${user.name} 和 ${target.name} 平分了攻击和特攻！`); }
        if (move.id === 'guardsplit') { _bkS(user); _bkS(target); for (const k of ['def', 'spd']) { const v = Math.floor((user.stats[k] + target.stats[k]) / 2); user.stats[k] = v; target.stats[k] = v; } this.say(`${user.name} 和 ${target.name} 平分了防御和特防！`); }
        if (move.id === 'powerswap') { [user.stages.atk, target.stages.atk] = [target.stages.atk, user.stages.atk]; [user.stages.spa, target.stages.spa] = [target.stages.spa, user.stages.spa]; this.say(`${user.name} 和 ${target.name} 交换了攻击与特攻的能力变化！`); }
        if (move.id === 'guardswap') { [user.stages.def, target.stages.def] = [target.stages.def, user.stages.def]; [user.stages.spd, target.stages.spd] = [target.stages.spd, user.stages.spd]; this.say(`${user.name} 和 ${target.name} 交换了防御与特防的能力变化！`); }
        if (move.id === 'heartswap') { const us = { ...user.stages }; user.stages = { ...target.stages }; target.stages = us; this.say(`${user.name} 和 ${target.name} 交换了全部能力变化！`); }
        // 特性类
        const _bkA = q => { if (!q._abilityBackup) q._abilityBackup = q.ability; };
        if (move.id === 'roleplay') { _bkA(user); user.ability = abilityId(target); this.say(`${user.name} 复制了 ${target.name} 的特性！`); }
        if (move.id === 'skillswap') { _bkA(user); _bkA(target); const a1 = user.ability, a2 = target.ability; user.ability = normId(a2); target.ability = normId(a1); this.say(`${user.name} 和 ${target.name} 交换了特性！`); }
        if (move.id === 'entrainment') { _bkA(target); target.ability = abilityId(user); this.say(`${target.name} 获得了 ${user.name} 的特性！`); }
        if (move.id === 'simplebeam') { _bkA(target); target.ability = 'simple'; this.say(`${target.name} 的特性变成了单纯！`); }
        if (move.id === 'worryseed') { _bkA(target); target.ability = 'insomnia'; this.say(`${target.name} 的特性变成了不眠！`); }
        if (move.id === 'gastroacid') { target._abilitySuppressed = true; this.say(`${target.name} 的特性被胃液无效化了！`); }
        if (move.id === 'doodle') { _bkA(user); const ta = abilityId(target); user.ability = ta; for (const i of this.activeSlots[this.sideOf(user)]) { const a2 = this.teams[this.sideOf(user)][i]; if (a2 && a2 !== user) { _bkA(a2); a2.ability = ta; } } this.say(`${user.name} 把 ${target.name} 的特性描画给了自己和队友！`); }
        // 变身
        if (move.id === 'transform') {
          if (user._transformed) this.say('但是失败了！（已经变身）');
          else {
            user._transformBackup = { speciesId: user.speciesId, stats: { ...user.stats }, types: [...user.types], ability: user.ability, moves: user.moves };
            user.speciesId = target.speciesId; user.stats = { ...target.stats }; user.types = [...target.types];
            user.ability = abilityId(target); user.moves = (target.moves || []).map(m => ({ ...m, ppLeft: 5 }));
            user.stages = { ...target.stages }; user._transformed = true;
            this.say(`${user.name} 变成了 ${target.name}！`);
          }
        }
        // 模仿 / 写生
        if (move.id === 'mimic' || move.id === 'sketch') {
          const lastId = target._lastMoveId;
          if (!lastId || !MOVES[lastId] || (move.id === 'mimic' && ['sketch', 'mimic', 'struggle'].includes(lastId))) this.say('但是失败了！');
          else {
            const slot = user.moves.findIndex(m => m.id === move.id);
            if (slot >= 0) { user.moves[slot] = { ...MOVES[lastId], id: lastId, ppLeft: 5 }; this.say(`${user.name} 学会了 ${MOVES[lastId].name}！`); }
            else this.say('但是失败了！');
          }
        }
        // 道具类
        if (move.id === 'bestow') { if (!user.item || target.item) this.say('但是失败了！'); else { const it2 = user.item; user.item = null; target.item = it2; user._itemTransferOccurred = target._itemTransferOccurred = true; this.say(`${user.name} 把道具送给了 ${target.name}！`); } }
        if (move.id === 'recycle') { if (user.item || !user._lastConsumed) this.say('但是失败了！'); else { user.item = user._lastConsumed; this.say(`${user.name} 找回了 ${user.item}！`); } }
        if (move.id === 'embargo') { target.volatile.embargo = true; this.say(`${target.name} 被查封，无法使用道具！`); }
        if (move.id === 'corrosivegas') { if (!target.item || target._side === user._side) this.say('但是失败了！'); else { const it2 = target.item; target.item = null; this.say(`${target.name} 的道具被腐蚀气体熔化了！`); } }
        // 吞下（喷出的伤害在可变威力里算）
        if (move.id === 'swallow') {
          const n2 = user.volatile.stockpile || 0;
          if (n2 <= 0) this.say('但是失败了！');
          else { const frac = [0, 1 / 4, 1 / 2, 1][n2] || 1; this.heal(user, Math.floor(user.maxHp * frac), '吞下了蓄积的能量'); delete user.volatile.stockpile; }
        }
        if (move.id === 'spitup') delete user.volatile.stockpile;
        // 投掷的道具效果 / 自然之恩消耗树果
        if (move.id === 'fling' && user.item) {
          const it2 = this.consumeItem(user);
          if (it2 === 'toxicorb') this.tryStatus(target, 'tox', user, { fromStatusMove: false });
          else if (it2 === 'flameorb') this.tryStatus(target, 'brn', user, { fromStatusMove: false });
          else if (it2 === 'lightball') this.tryStatus(target, 'par', user, { fromStatusMove: false });
        }
        if (move.id === 'naturalgift' && user.item && itemId(user).endsWith('berry')) this.consumeItem(user);
        // 位置交换
        if (move.id === 'allyswitch') {
          if (this.double && this.activeSlots[this.sideOf(user)].length === 2) {
            const sl = this.activeSlots[this.sideOf(user)];
            this.activeSlots[this.sideOf(user)] = [sl[1], sl[0]];
            this.say(`${user.name} 和队友交换了位置！`);
          } else this.say('但是失败了！');
        }
        // 号令 / 请客（简化：号令=目标本回合末自动重复上一招；请客=目标下一回合优先行动）
        if (move.id === 'instruct') { if (target._lastMoveId && MOVES[target._lastMoveId] && target._lastMoveId !== 'instruct') { target.volatile.instructMove = target._lastMoveId; this.say(`${target.name} 被号令，将重复使用 ${MOVES[target._lastMoveId].name}！`); } else this.say('但是失败了！'); }
        if (move.id === 'afteryou') { target.volatile.afteryou = true; this.say(`${target.name} 被请客了，下一回合优先行动！`); }
        // —— v1.3.54：A 组 51 招 ——
        if (move.id === 'leechseed') {
          if (target.types.includes('Grass')) this.say(`对 ${target.name} 没有效果……`);
          else if (target.volatile?.leechseed) this.say(`${target.name} 已经被种下了种子！`);
          else { target.volatile.leechseed = user; this.say(`${target.name} 被种下了寄生种子！`); }
        }
        if (move.id === 'nightmare') {
          if (target.status !== 'slp') this.say('但是失败了！（目标不在睡眠状态）');
          else { target.volatile.nightmare = true; this.say(`${target.name} 被恶梦缠上了！`); }
        }
        if (move.id === 'octolock') { target.volatile.octolock = user; this.say(`${target.name} 被蛸固缠住了！`); }
        if (move.id === 'spite') {
          const mv = (target.moves || []).find(m => m.id === target._lastMoveId);
          if (mv && mv.ppLeft > 0) { const cut = Math.min(4, mv.ppLeft); mv.ppLeft -= cut; this.say(`减少了 ${target.name} 的 ${mv.name} 的 PP（-${cut}）！`); }
          else this.say('但是失败了！');
        }
        if (move.id === 'disable') {
          const mv = (target.moves || []).find(m => m.id === target._lastMoveId);
          if (!mv) this.say('但是失败了！');
          else { target.volatile.disableMove = mv.id; target.volatile.disableTurns = 2; this.say(`${target.name} 的 ${mv.name} 被定身法封住了！`); }
        }
        if (move.id === 'venomdrench') {
          if (!['psn', 'tox'].includes(target.status)) this.say('但是失败了！');
          else this.changeStages(target, { atk: -1, spa: -1, spe: -1 }, user);
        }
        if (move.id === 'takeheart') {
          if (user.status || user.volatile?.confusion) { user.status = null; delete user.volatile.confusion; this.say(`${user.name} 的异常状态被治愈了！`); }
          this.changeStages(user, { spa: 2, spd: 2 }, user);
        }
        if (move.id === 'dragoncheer') { target.volatile.critBoost = Math.max(target.volatile.critBoost || 0, target.types.includes('Dragon') ? 2 : 1); this.say(`${target.name} 被龙声鼓舞（更容易击中要害）！`); }
        if (move.id === 'purify') {
          if (!['psn', 'tox'].includes(target.status || '')) this.say('但是失败了！');
          else { target.status = null; this.say(`${target.name} 的毒被净化了！`); this.heal(user, Math.floor(user.maxHp / 2), ''); }
        }
        if (move.id === 'healpulse') this.heal(target, Math.floor(target.maxHp / 2), '被治愈波动回复了体力');
        if (move.id === 'floralhealing') this.heal(target, Math.floor(target.maxHp / 2), '被花疗回复了体力');
        if (move.id === 'junglehealing' || move.id === 'lunarblessing') {
          const side = this.sideOf(user);
          const healMsg = move.id === 'junglehealing' ? '被丛林治疗回复了体力' : '被新月祈祷回复了体力';
          let did2 = false;
          for (const i of this.activeSlots[side]) { const p2 = this.teams[side][i]; if (p2 && !p2.fainted && (p2.status || p2.hp < p2.maxHp)) { p2.status = null; delete p2.volatile.confusion; this.heal(p2, Math.floor(p2.maxHp / 4), healMsg); did2 = true; } }
          if (!did2) this.say('但是失败了！');
        }
        if (move.id === 'stuffcheeks') {
          const it = itemId(user);
          if (!it || !it.endsWith('berry')) this.say('但是失败了！（需要携带树果）');
          else { this.consumeItem(user); if (it === 'sitrusberry') this.heal(user, Math.floor(user.maxHp / 4), '吃下了树果'); else if (it === 'oranberry') this.heal(user, 10, '吃下了树果'); else this.say(`${user.name} 吃下了树果。`); this.changeStages(user, { def: 2 }, user); }
        }
        if (move.id === 'teatime') {
          let ate = false;
          for (const side of [0, 1]) for (const i of this.activeSlots[side]) {
            const p2 = this.teams[side][i]; if (!p2 || p2.fainted) continue;
            const it = itemId(p2);
            if (it && it.endsWith('berry')) { ate = true; this.consumeItem(p2); if (it === 'sitrusberry') this.heal(p2, Math.floor(p2.maxHp / 4), '参加了茶会'); else if (it === 'oranberry') this.heal(p2, 10, '参加了茶会'); else this.say(`${p2.name} 参加了茶会，吃下了树果。`); }
          }
          if (!ate) this.say('但是失败了！');
        }
        if (move.id === 'spotlight') { target.volatile.spotlight = true; this.say(`${target.name} 成为了全场的焦点！`); }
        if (move.id === 'electrify') { target.volatile.electrify = true; this.say(`${target.name} 被通了电，接下来的招式会变成电属性！`); }
        if (move.id === 'powder') {
          if (target.types.includes('Grass') || hasAbility(target, 'overcoat')) this.say(`对 ${target.name} 没有效果……`);
          else { target.volatile.powder = true; this.say(`${target.name} 身上沾满了粉尘！`); }
        }
        if (move.id === 'foresight' || move.id === 'odorsleuth') { target.volatile.foresight = true; this.say(`${target.name} 被识破了（一般/格斗招式可以打中幽灵系）！`); }
        if (move.id === 'miracleeye') { target.volatile.miracleeye = true; this.say(`${target.name} 被奇迹之眼看穿（恶属性招式可以打中超能力系）！`); }
        if (move.id === 'lockon' || move.id === 'mindreader') { target.volatile.lockon = { by: user, turns: 2 }; this.say(`${target.name} 被锁定了，接下来的招式必定命中！`); }
        if (move.id === 'soak') { target.types = ['Water']; this.say(`${target.name} 浸水变成了水属性！`); }
        if (move.id === 'magicpowder') { if (target.types.includes('Psychic')) this.say('但是失败了！'); else { target.types = ['Psychic']; this.say(`${target.name} 变成了超能力属性！`); } }
        if (move.id === 'camouflage') { user.types = ['Normal']; this.say(`${user.name} 采用了保护色，变成了一般属性！`); }
        if (move.id === 'reflecttype') { user.types = [...target.types]; this.say(`${user.name} 复制了 ${target.name} 的属性！`); }
        if (move.id === 'conversion') {
          const ts = [...new Set((user.moves || []).map(m => m.type).filter(Boolean))].slice(0, 2);
          if (ts.length) { user.types = ts; this.say(`${user.name} 改变了自己的纹理（${ts.join('/')}）！`); }
        }
        if (move.id === 'conversion2') {
          const last = target._lastMoveType;
          if (!last) this.say('但是失败了！');
          else {
            const cand = ['Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'].find(ty => effectiveness(last, [ty]) < 1 && !user.types.includes(ty));
            if (!cand) this.say('但是失败了！'); else { user.types = [cand]; this.say(`${user.name} 改变纹理，变成了${cand}属性（抵抗${last}）！`); }
          }
        }
        if (move.id === 'forestscurse') { if (!target.types.includes('Grass')) { target.types = [...target.types, 'Grass']; this.say(`${target.name} 被加上了草属性！`); } else this.say('但是失败了！'); }
        if (move.id === 'trickortreat') { if (!target.types.includes('Ghost')) { target.types = [...target.types, 'Ghost']; this.say(`${target.name} 被加上了幽灵属性！`); } else this.say('但是失败了！'); }
        if (move.id === 'flowershield') {
          let any2 = false;
          for (const side of [0, 1]) for (const i of this.activeSlots[side]) { const p2 = this.teams[side][i]; if (p2 && !p2.fainted && p2.types.includes('Grass')) { this.changeStages(p2, { def: 1 }, user); any2 = true; } }
          if (!any2) this.say('但是失败了！');
        }
        if (move.id === 'rototiller') {
          let any2 = false;
          for (const side of [0, 1]) for (const i of this.activeSlots[side]) { const p2 = this.teams[side][i]; if (p2 && !p2.fainted && p2.types.includes('Grass') && isGrounded(p2)) { this.changeStages(p2, { atk: 1, spa: 1 }, user); any2 = true; } }
          if (!any2) this.say('但是失败了！');
        }
        if (move.id === 'gearup' || move.id === 'magneticflux') {
          const boost = move.id === 'gearup' ? { atk: 1, spa: 1 } : { def: 1, spd: 1 };
          const side = this.sideOf(user);
          let any2 = false;
          for (const i of this.activeSlots[side]) { const p2 = this.teams[side][i]; if (p2 && !p2.fainted && hasAbility(p2, 'plus', 'minus')) { this.changeStages(p2, boost, user); any2 = true; } }
          if (!any2) this.say('但是失败了！');
        }
        if (move.id === 'quash') { target.volatile.quash = true; this.say(`${target.name} 被延后到本回合最后行动！`); }
        if (move.id === 'meanlook' || move.id === 'block' || move.id === 'spiderweb') { target.volatile.cannotEscape = user; this.say(`${target.name} 被盯住，无法逃走了！`); }
        if (move.id === 'destinybond') { user.volatile.destinybond = true; this.say(`${user.name} 暗下了同命的决心！`); }
        if (move.id === 'perishsong') {
          let applied = 0;
          for (const side of [0, 1]) for (const i of this.activeSlots[side]) { const p2 = this.teams[side][i]; if (p2 && !p2.fainted && !hasAbility(p2, 'soundproof') && p2.volatile?.perishcount == null) { p2.volatile.perishcount = 4; applied++; } }
          if (applied) this.say('灭亡之歌：所有在场宝可梦将在 3 回合后倒下！'); else this.say('但是失败了！');
        }
        if (move.id === 'healingwish' || move.id === 'lunardance') {
          const side = this.sideOf(user), slot = this.activeSlots[side].indexOf(this.teams[side].indexOf(user));
          this._slotEffect = this._slotEffect || {}; this._slotEffect[side] = this._slotEffect[side] || {};
          this._slotEffect[side][slot >= 0 ? slot : 0] = move.id;
          user.hp = 0;
          this.say(`${user.name} 用尽了全部力量（${move.id === 'healingwish' ? '治愈之愿' : '新月舞'}）！`);
        }
        if (move.id === 'revivalblessing') {
          const side = this.sideOf(user);
          const dead = (this.teams[side] || []).map((p2, i) => ({ p2, i })).filter(x => x.p2.fainted && !this.activeSlots[side].includes(x.i));
          if (!dead.length) this.say('但是失败了！');
          else {
            const pick = dead[Math.floor(this.rng() * dead.length)];
            pick.p2.fainted = false; pick.p2.hp = Math.floor(pick.p2.maxHp / 2); pick.p2.status = null; delete pick.p2.toxicCounter;
            this.say(`${pick.p2.name} 复活了（体力回复一半）！`);
            this.requestSelfSwitch(user, move);
          }
        }
        // —— 回复类（按天气调整）——
        if (['synthesis', 'moonlight', 'morningsun', 'shoreup'].includes(move.id)) {
          let frac = 0.5;
          if (this.weather === 'sun') frac = 2 / 3;
          else if (this.weather) frac = 0.25;
          if (move.id === 'shoreup' && this.weather === 'sand') frac = 2 / 3;
          this.heal(user, Math.max(1, Math.floor(user.maxHp * frac)), '回复了体力');
        }
        // —— 解除异常状态 ——
        if (['healbell', 'aromatherapy'].includes(move.id)) {
          const sd = this.sideOf(user);
          let cured = 0;
          for (const p of this.teams[sd]) if (p && p.status) { p.status = null; delete p.toxicCounter; delete p.sleepTurns; cured++; }
          this.say(cured ? '队伍中的异常状态被解除了！' : '但是没有需要解除的异常状态。');
        }
        if (move.id === 'refresh') {
          if (['psn', 'tox', 'par', 'brn'].includes(user.status)) { user.status = null; delete user.toxicCounter; this.say(`${user.name} 的异常状态被治愈了！`); }
          else this.say('但是没有需要治愈的状态。');
        }
        // —— 体力操作 ——
        if (move.id === 'painsplit') {
          if (target && !target.fainted && target !== user) {
            const avg = Math.floor((user.hp + target.hp) / 2);
            this.say(`双方分摊了体力（各 ${avg}）！`); user.hp = Math.min(user.maxHp, avg); target.hp = Math.min(target.maxHp, avg);
          } else this.say('但是失败了！');
        }
        if (move.id === 'strengthsap') {
          if (target && target !== user && !target.fainted) {
            this.heal(user, Math.max(1, effStat(target, 'atk')), '吸取了体力');
            this.changeStages(target, { atk: -1 }, user);
          } else this.say('但是失败了！');
        }
        if (move.id === 'bellydrum') {
          const cost = Math.floor(user.maxHp / 2);
          if (user.hp <= cost) this.say('但是失败了！（体力不足）');
          else if (user.stages.atk >= 6) this.say('但是失败了！（攻击已经无法再提高）');
          else { user.hp -= cost; user.stages.atk = 6; this.say(`${user.name} 用腹鼓把攻击提到了最大（-${cost}）！`); }
        }
        if (move.id === 'acupressure') {
          const pool = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'].filter(k => (user.stages[k] || 0) < 6);
          if (!pool.length) this.say('但是失败了！');
          else { const k = pool[Math.floor(this.rng() * pool.length)]; this.changeStages(user, { [k]: 2 }, user); this.say(`${user.name} 的${STAT_LABELS[k]}大幅提高了！`); }
        }
        if (move.id === 'wish') { user.volatile.wish = 2; this.say(`${user.name} 许下了愿望！`); }
        // —— 道具交换 ——
        if (['trick', 'switcheroo'].includes(move.id)) {
          if (!target || target === user || target.fainted) this.say('但是失败了！');
          else { const a = user.item, b = target.item; user.item = b || null; target.item = a || null; user._itemTransferOccurred = target._itemTransferOccurred = true; this.say(`${move.name}：双方交换了携带的道具！`); }
        }
        if (move.id === 'courtchange') { const tmp = this.field.sides[0]; this.field.sides[0] = this.field.sides[1]; this.field.sides[1] = tmp; this.say('双方交换了场地效果！'); }
      }
      if ((eff.volatileStatus === 'protect' || eff.volatileStatus === 'maxguard') && target === user) {
        user.volatile.protect = true; this.say(`${user.name} 摆出了守护的姿势！`);
      }
      // 守护系变体（王者盾牌 / 尖刺防守 / 碉堡 / 拦堵 / 线阱 / 火焰守护）
      if (['kingsshield', 'spikyshield', 'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark'].includes(eff.volatileStatus) && target === user) {
        user.volatile.protect = true;
        user.volatile[eff.volatileStatus] = true;
        this.say(`${user.name} 摆出了${eff.name || '守护'}的姿势！`);
      }
      if (['followme', 'ragepowder'].includes(eff.volatileStatus) && target === user) {
        user.volatile[eff.volatileStatus] = true; this.say(`${user.name} 正在吸引对手的注意！`);
      }
      if (eff.volatileStatus === 'helpinghand' && target !== user) {
        target.volatile.helpinghand = true; this.say(`${user.name} 帮助了 ${target.name}！`);
      }
      if (eff.status) {
        const who = eff.target === 'self' ? user : target;
        this.tryStatus(who, eff.status, user, { fromStatusMove: move.category === 'Status' && eff === move });
      }
      if (eff.volatileStatus === 'confusion' && !target.fainted && target !== user) {
        if (hasAbility(target, 'owntempo')) this.say(`${target.name} 的我行我素使其不会混乱！`);
        else { target.volatile.confusion = 2 + Math.floor(this.rng() * 4); this.say(`${target.name} 混乱了！`); this.checkItemTrigger(target, 'confusion'); }
      }
      if (eff.volatileStatus === 'flinch' && !target.fainted && target !== user) {
        if (hasAbility(target, 'innerfocus')) this.say(`${target.name} 的精神力使其不会退缩！`);
        else target.volatile.flinch = true;
      }
      if (eff.volatileStatus === 'substitute' && target === user && !user.volatile.substitute) {
        const cost = Math.max(1, Math.floor(user.maxHp / 4));
        if (user.hp <= cost) this.say('但是失败了！（体力不足，无法制造替身）');
        else { user.hp -= cost; user.volatile.substitute = cost; this.say(`${user.name} 制造了替身（-${cost}）！`); }
      }
      if (eff.volatileStatus === 'endure' && target === user) {
        user.volatile.endure = true; this.say(`${user.name} 摆出了忍耐的姿势！`);
      }
      if (eff.volatileStatus === 'minimize' && target === user) {
        user.volatile.minimize = true; this.changeStages(user, { evasion: 2 }, user); this.say(`${user.name} 变小了，更难被命中！`);
      }
      if (eff.volatileStatus === 'stockpile' && target === user) {
        const n = Math.min(3, (user.volatile.stockpile || 0) + 1);
        user.volatile.stockpile = n; this.changeStages(user, { def: 1, spd: 1 }, user);
        this.say(`${user.name} 蓄力了（${n} 层）！`);
      }
      const vs = eff.volatileStatus;
      if (vs && target && !target.fainted) {
        const self = eff === move && (eff.target === 'self' || eff.target === 'allySide' || eff.target === 'allyTeam');
        const who = self ? user : target;
        const tag = who === user ? 'user' : 'target';
        switch (vs) {
          case 'smackdown':
            who.volatile.smackdown = true;
            this.say(`${who.name} 被击落到地面上了！`);
            break;
          case 'taunt':
            if (!who.volatile.taunt) this.say(`${who.name} 被挑衅了，暂时无法使用变化招式！`);
            who.volatile.taunt = 3;
            break;
          case 'encore':
            if (!who._lastMoveId) { this.say('但是失败了！'); break; }
            who.volatile.encore = { moveId: who._lastMoveId, turns: 3 };
            this.say(`${who.name} 被要求重复使用同一招式！`);
            break;
          case 'yawn':
            if (['slp', 'frz', 'psn', 'tox', 'par', 'brn'].includes(who.status)) { this.say('但是失败了！'); break; }
            who.volatile.yawn = 2;
            this.say(`${who.name} 开始打哈欠了！`);
            break;
          case 'attract':
            if (who.volatile.attract) { this.say('但是失败了！'); break; }
            who.volatile.attract = { turns: 99 };
            this.say(`${who.name} 陷入了着迷状态！`);
            break;
          case 'aquaring':
            who.volatile.aquaring = true; this.say(`${who.name} 被水幕包裹，每回合回复体力！`); break;
          case 'ingrain':
            who.volatile.ingrain = true; this.say(`${who.name} 把根扎进了地面，每回合回复体力！`); break;
          case 'magnetrise':
            who.volatile.magnetrise = 5; this.say(`${who.name} 浮了起来，不受地面系招式影响！`); break;
          case 'telekinesis':
            who.volatile.telekinesis = 3; this.say(`${who.name} 被念力抬到了空中！`); break;
          case 'healblock':
            who.volatile.healblock = 5; this.say(`${who.name} 被回复封锁了！`); break;
          case 'torment':
            who.volatile.torment = true; this.say(`${who.name} 受到了折磨，不能连续使用同一招式！`); break;
          case 'laserfocus':
            who.volatile.critBoost = Math.max(2, Number(who.volatile.critBoost) || 0);
            this.say(`${who.name} 集中精神，下一击必定命中要害！`);
            break;
          case 'charge':
            who.volatile.charge = true;
            this.say(`${who.name} 开始充电，下次电系招式威力提高！`);
            break;
          case 'defensecurl':
            who.volatile.defensecurl = true;
            this.say(`${who.name} 蜷起了身体！`);
            break;
          default: break;
        }
      }
      if (eff.boosts) {
        const who = context?._snatched ? target : (eff === move.self || eff.target === 'self' ? user : target);
        this.changeStages(who, eff.boosts, who === user ? user : user);
      }
    }

    heal(p, amount, why = '') {
      if (amount <= 0 || p.fainted) return;
      const real = Math.min(amount, p.maxHp - p.hp);
      p.hp += real;
      if (real > 0) this.say(`${p.name} ${why || '回复了体力'}（+${real}）。`);
    }
    applyDamage(p, amount, why = '') {
      p.hp = Math.max(0, p.hp - amount);
      if (why) this.say(why);
    }
    checkFaints({ deferReplacement = false } = {}) {
      const count = this.double ? 2 : 1;
      for (const side of [0, 1]) for (let slot = 0; slot < count; slot++) {
        const p = this.cur(side, slot);
        if (p && !p.fainted && p.hp <= 0) { p.fainted = true; this.say(`${p.name} 失去了战斗能力！`); }
      }
      if (deferReplacement) return;
      // Marking and replacement are separate: previously marked fainted slots remain eligible.
      for (const side of [0, 1]) for (let slot = 0; slot < count; slot++) {
        let p = this.cur(side, slot);
        if (!p || !p.fainted) continue;
        if (side === 1) {
          // Entry hazards may KO more than one replacement. Never steal the ally's slot.
          while (p && p.fainted) {
            const idx = this.bestSwitch(1, slot); if (idx < 0) break;
            this.setActive(1, slot, idx); p = this.cur(1, slot);
            this.say(`敌方换上了 ${p.name}！`); this.onEnter(1, false, slot);
            if (p.hp <= 0 && !p.fainted) { p.fainted = true; this.say(`${p.name} 失去了战斗能力！`); }
          }
        } else if (this.pendingSwitch !== slot && !this.pendingSwitches.includes(slot)) {
          const alreadyQueued = this.pendingSwitches.length + (this.pendingSwitch === null ? 0 : 1);
          if (this.benchOf(0).length > alreadyQueued) this.pendingSwitches.push(slot);
        }
      }
      if (this.pendingSwitch === null && this.pendingSwitches.length) this.pendingSwitch = this.pendingSwitches.shift();
    }
    /** Player forced switch after a faint; in doubles the pending value is the active slot. */
    /** 备用宝可梦（同侧、未倒下、不在场） */
    benchOf(side) {
      const team = this.teams[side] || [];
      return team.map((p, i) => ({ p, i })).filter(x => !x.p.fainted && x.p.hp > 0 && !this.activeSlots[side].includes(x.i));
    }
    /** 自我替换（伏特替换等）：我方交给 UI 选择，敌方自动换人 */
    requestSelfSwitch(user, move) {
      const side = this.sideOf(user);
      const bench = this.benchOf(side);
      if (!bench.length) { this.say(`${user.name} 想回来休息，但是没有可以换上的宝可梦！`); return; }
      const baton = move.selfSwitch === 'copyvolatile';
      if (side === 1) {
        const slot = Math.max(0, this.activeSlots[1].indexOf(this.teams[1].indexOf(user)));
        const idx = this.bestSwitch(1, slot);
        if (idx >= 0) this.doSwitch(1, idx, { forced: true, slot });   // doSwitch 自带“换上”日志
        return;
      }
      const slot = this.activeSlots[0].indexOf(this.teams[0].indexOf(user));
      const s = slot >= 0 ? slot : 0;
      if (baton) this._batonPass = { side, slot: s, stages: { ...user.stages }, volatile: { ...user.volatile } };
      this.say(`${user.name} 效果发动：请选择替换上场的宝可梦！`);
      // 交给对战 UI（app.js 读到 pendingSwitch 会切成替换面板，选人后调用 forceSwitch）
      if (this.pendingSwitch === null) this.pendingSwitch = s;
      else if (!this.pendingSwitches.includes(s)) this.pendingSwitches.push(s);
    }
    /** 强制退场（吼叫 / 吹飞 / 龙尾 / 巴投） */
    forceTargetOut(target) {
      const side = this.sideOf(target);
      const bench = this.benchOf(side);
      const label = side === 1 ? '对手的' : '我方的';
      if (side === 1) {
        if (this.encounterType === 'wild') {
          // 野生对战被吼叫/吹飞赶走：直接结束战斗，不判胜利
          this.outcome = 'escaped';
          this.escapeReason = 'forceSwitch';
          this.winner = 0;
          this.pendingSwitch = null; this.pendingSwitches = [];
          this.say(`野生的 ${target.name} 被赶走了！战斗结束。`);
          return;
        }
        if (!bench.length) { this.say(`${label}${target.name} 被赶了回来，但是没有可以换上的宝可梦！`); return; }
        const pick = bench[Math.floor(this.rng() * bench.length)].i;
        const slot = Math.max(0, this.activeSlots[1].indexOf(this.teams[1].indexOf(target)));
        this.doSwitch(1, pick, { forced: true, slot });
        return;
      }
      if (!bench.length) { this.say(`${label}${target.name} 被赶了回来，但是没有可以换上的宝可梦！`); return; }
      const slot = this.activeSlots[0].indexOf(this.teams[0].indexOf(target));
      const s = slot >= 0 ? slot : 0;
      this.say(`${target.name} 被赶回了队伍，请选择替换上场的宝可梦！`);
      if (this.pendingSwitch === null) this.pendingSwitch = s; else if (!this.pendingSwitches.includes(s)) this.pendingSwitches.push(s);
    }

    forceSwitch(index) {
      if (this.pendingSwitch === null || this.pendingSwitch !== 0 && this.pendingSwitch !== 1) return false;
      const slot = this.pendingSwitch;
      if (!this.doSwitch(0, index, { forced: true, slot })) return false;
      this.pendingSwitch = this.pendingSwitches.shift() ?? null;
      // A replacement that faints on entry must itself be replaced without adding a turn.
      this.checkFaints({ deferReplacement: !!this._turnState });
      if (this._turnState && this.cur(0, slot)?.fainted && this.benchOf(0).length && this.pendingSwitch === null) this.pendingSwitch = slot;
      this.updateWinner();
      if (this.winner !== null) this._turnState = null;
      else if (this._turnState && this.pendingSwitch === null) this._continueTurn();
      return true;
    }
    endOfTurn() {
      for (const side of [0, 1]) for (let slot = 0; slot < (this.double ? 2 : 1); slot++) {
        const p = this.cur(side, slot);
        if (!p || p.fainted) continue;
        const ab = abilityId(p);
        // —— 计时类持续效果 ——
        for (const key of ['taunt', 'healblock', 'magnetrise', 'telekinesis', 'yawn']) {
          const v = p.volatile?.[key];
          if (v == null) continue;
          if (key === 'yawn') {
            const left = Number(v) - 1;
            if (left <= 0) {
              delete p.volatile.yawn;
              if (!p.status && !statusImmunityReason(p, 'slp', this)) { p.status = 'slp'; p.sleepTurns = 2 + Math.floor(this.rng() * 3); this.say(`由于哈欠，${p.name} 睡着了！`); }
            } else p.volatile.yawn = left;
            continue;
          }
          const left = Number(v) - 1;
          if (left <= 0) { delete p.volatile[key]; if (key === 'taunt') this.say(`${p.name} 的挑衅解除了。`); }
          else p.volatile[key] = left;
        }
        if (p.volatile?.encore) { const e = p.volatile.encore; e.turns -= 1; if (e.turns <= 0) { delete p.volatile.encore; this.say(`${p.name} 的再来一次解除了。`); } }
        if (p.volatile?.wish != null) {
          const left = Number(p.volatile.wish) - 1;
          if (left <= 0) { delete p.volatile.wish; this.heal(p, Math.max(1, Math.floor(p.maxHp / 2)), '许愿星回复了体力'); }
          else p.volatile.wish = left;
        }
        if (p.volatile?.aquaring) this.heal(p, Math.max(1, Math.floor(p.maxHp / 16)), '水幕回复了体力');
        if (p.volatile?.ingrain) this.heal(p, Math.max(1, Math.floor(p.maxHp / 16)), '扎根回复了体力');
        if (p.volatile?.curse) this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 4)), `${p.name} 受到了诅咒的伤害！`);
        if (this.field.terrain === 'grassy' && isGrounded(p)) this.heal(p, Math.floor(p.maxHp / 16), '青草场地回复了体力');
        if (this.weather === 'rain' && ab === 'raindish') this.heal(p, Math.floor(p.maxHp / 16), '雨盘回复了体力');
        if (this.weather === 'snow' && ab === 'icebody') this.heal(p, Math.floor(p.maxHp / 16), '冰冻之躯回复了体力');
        if (ab === 'dryskin') {
          if (this.weather === 'rain') this.heal(p, Math.floor(p.maxHp / 8), '干燥皮肤回复了体力');
          if (this.weather === 'sun') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了干燥皮肤的伤害！`);
        }
        if (this.weather === 'sand' && !['Rock', 'Ground', 'Steel'].some(t => p.types.includes(t)) && !hasAbility(p, 'sandveil', 'sandrush', 'sandforce', 'overcoat')) {
          this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 16)), `${p.name} 受到了沙暴的伤害！`);
        }
        if (this.weather === 'sun' && ab === 'solarpower') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了太阳之力的反作用！`);
        if (p.status === 'brn') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / (hasAbility(p, 'heatproof') ? 32 : 16))), `${p.name} 受到了灼伤的伤害！`);
        if (p.status === 'psn' || p.status === 'tox') {
          if (ab === 'poisonheal') this.heal(p, Math.floor(p.maxHp / 8), '毒疗回复了体力');
          else if (p.status === 'psn') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了毒的伤害！`);
          else { this.applyDamage(p, Math.max(1, Math.floor(p.maxHp * p.toxicCounter / 16)), `${p.name} 受到了剧毒的伤害！`); p.toxicCounter++; }
        }
        if (p.status && ab === 'shedskin' && this.rng() < 0.3) { p.status = null; this.say(`${p.name} 蜕皮治愈了异常状态！`); }
        if (p.status && ab === 'hydration' && this.weather === 'rain') { p.status = null; this.say(`${p.name} 的湿润之躯治愈了异常状态！`); }
        if (!p.fainted && ab === 'speedboost' && !p._enteredThisTurn) this.changeStages(p, { spe: 1 }, p);
        if (!p.fainted && itemId(p) === 'leftovers') this.heal(p, Math.floor(p.maxHp / 16), '剩饭回复了体力');
        if (!p.fainted && itemId(p) === 'blacksludge') {
          if (p.types.includes('Poison')) this.heal(p, Math.floor(p.maxHp / 16), '黑色污泥回复了体力');
          else this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了黑色污泥的伤害！`);
        }
        if (!p.fainted && !p.status && itemId(p) === 'flameorb') this.tryStatus(p, 'brn', p, { fromStatusMove: false });
        if (!p.fainted && !p.status && itemId(p) === 'toxicorb') this.tryStatus(p, 'tox', p, { fromStatusMove: false });
        this.checkItemTrigger(p, 'end');
        // —— v1.3.54：持续类效果 ——
        if (!p.fainted && p.volatile?.leechseed) {
          const src = p.volatile.leechseed;
          if (!src.fainted && src.hp > 0) { const d2 = Math.max(1, Math.floor(p.maxHp / 8)); this.applyDamage(p, d2, `${p.name} 的体力被寄生种子吸走了！`); if (!p.fainted) this.heal(src, d2, ''); }
        }
        if (!p.fainted && p.volatile?.nightmare && p.status === 'slp') this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 4)), `${p.name} 被恶梦折磨！`);
        if (!p.fainted && p.volatile?.octolock) { this.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 被蛸固锁住！`); if (!p.fainted) this.changeStages(p, { def: -1, spe: -1 }, p.volatile.octolock); }
        if (p.volatile?.perishcount != null) {
          if (--p.volatile.perishcount <= 0) { this.applyDamage(p, p.hp, `${p.name} 因灭亡之歌倒下了！`); delete p.volatile.perishcount; }
          else this.say(`${p.name} 的灭亡倒计时：${p.volatile.perishcount}！`);
        }
        if (p.volatile?.lockon && --p.volatile.lockon.turns <= 0) delete p.volatile.lockon;
        delete p.volatile.quash; delete p.volatile.electrify; delete p.volatile.spotlight;
        delete p.volatile.magiccoat; delete p.volatile.snatch;
        // v1.3.55：忍耐爆发
        if (!p.fainted && p.volatile?.bideTurns > 0) {
          p.volatile.bideTurns--;
          if (p.volatile.bideTurns === 0) {
            const amt = (p.volatile.bideDamage || 0) * 2;
            const tgt = p.volatile.bideBy || this.cur(this.other(this.sideOf(p)));
            delete p.volatile.bide; delete p.volatile.bideTurns; delete p.volatile.bideDamage; delete p.volatile.bideBy;
            if (amt > 0 && tgt && !tgt.fainted) this.applyDamage(tgt, amt, `${p.name} 忍耐爆发，${tgt.name} 受到了 ${amt} 点反击伤害！`);
          } else this.say(`${p.name} 正在忍耐……（还需 ${p.volatile.bideTurns} 回合）`);
        }
      }
      for (const side of [0, 1]) for (let slot = 0; slot < (this.double ? 2 : 1); slot++) { const p = this.cur(side, slot); if (p?.volatile.disableTurns > 0 && --p.volatile.disableTurns === 0) delete p.volatile.disableMove; if (p) { delete p.volatile.followme; delete p.volatile.ragepowder; delete p.volatile.helpinghand; } }
      // Field duration ticks.
      if (this.field.terrain && this.field.terrainTurns > 0 && --this.field.terrainTurns === 0) { this.field.terrain = null; this.field.terrainTurns = 0; this.say('场地恢复了正常。'); }
      if (this.field.trickRoom > 0 && --this.field.trickRoom === 0) this.say('扭曲的空间恢复了正常。');
      if (this.field.gravity > 0) this.field.gravity--;
      if (this.field.magicRoom > 0 && --this.field.magicRoom === 0) this.say('魔法空间的效果消失了。');
      if (this.field.wonderRoom > 0 && --this.field.wonderRoom === 0) this.say('奇妙空间的效果消失了。');
      // v1.3.54：玩水/玩泥巴/等离子浴/妖精之锁 倒计时
      if (this.field.pseudoWeather) for (const k of Object.keys(this.field.pseudoWeather)) {
        if (this.field.pseudoWeather[k] > 0 && --this.field.pseudoWeather[k] === 0) {
          delete this.field.pseudoWeather[k];
          this.say({ watersport: '水干了。', mudsport: '泥干了。', iondeluge: '等离子浴消失了。', fairylock: '妖精之锁的效果消失了。' }[k] || `${k} 的效果消失了。`);
        }
      }
      for (const sc of this.field.sides) {
        sc.wideguard = false; sc.quickguard = false; sc.matblock = false;
        if (sc.reflect > 0 && --sc.reflect === 0) this.say('反射壁消失了。');
        if (sc.lightscreen > 0 && --sc.lightscreen === 0) this.say('光墙消失了。');
        if (sc.auroraveil > 0 && --sc.auroraveil === 0) this.say('极光幕消失了。');
        if (sc.tailwind > 0 && --sc.tailwind === 0) this.say('顺风停了。');
        if (sc.safeguard > 0 && --sc.safeguard === 0) this.say('能力防守的效果消失了。');
        if (sc.mist > 0 && --sc.mist === 0) this.say('白雾散去了。');
        if (sc.luckychant > 0 && --sc.luckychant === 0) this.say('幸运咒语的效果消失了。');
        if (sc.craftyshield > 0 && --sc.craftyshield === 0) this.say('戏法防守的效果消失了。');
      }
      if (this.weatherTurns > 0 && --this.weatherTurns === 0) { this.say('天气恢复了正常。'); this.weather = null; }
      for (const side of [0, 1]) for (let slot = 0; slot < (this.double ? 2 : 1); slot++) { const p = this.cur(side, slot); if (p?.dynamaxed && --p.dynamaxTurns <= 0) this.endDynamax(p); }
    }

    updateWinner() {
      if (this.winner !== null || this.outcome === 'captured') return;
      if (this.firstFaintLoses) {
        const down = [0, 1].map(side => this.activeSlots[side].some(index => {
          const p = this.teams[side][index]; return p && (p.fainted || p.hp <= 0);
        }));
        if (down[0] || down[1]) {
          this.pendingSwitch = null; this.pendingSwitches = [];
          if (down[0] && down[1]) {
            // 原文没有给出双方同一结算步骤同时倒下的裁决：不替裁判决定胜负。
            this.winner = 2; this.outcome = 'draw';
            this.say('双方同一步骤均有宝可梦失去战斗能力；原规则未给出同时倒下裁决，请人工裁定。');
          } else if (down[1]) {
            this.winner = 0; this.say('对方有一只失去战斗能力，按榴柑道馆规则全组落败；我方获胜！');
          } else {
            this.winner = 1; this.say('我方有一只失去战斗能力，按榴柑道馆规则全组落败。');
          }
          return;
        }
      }
      if (this.alive(1).length === 0) { this.winner = 0; this.pendingSwitch = null; this.pendingSwitches = []; this.say('战斗胜利！'); }
      else if (this.alive(0).length === 0) { this.winner = 1; this.pendingSwitch = null; this.pendingSwitches = []; this.say('眼前一片漆黑……'); }
    }
    result() {
      return {
        winner: this.winner === null ? null : (this.winner === 0 ? 'player' : this.winner === 1 ? 'enemy' : 'draw'),
        outcome: this.outcome || (this.winner === null ? null : this.winner === 0 ? 'victory' : 'defeat'),
        encounterType: this.encounterType,
        ballStock: { ...this.ballStock },
        itemStock: { ...this.itemStock },
        capture: this.capture ? JSON.parse(JSON.stringify(this.capture)) : null,
        turns: this.turnCount,
        format: this.double ? 'doubles' : 'singles',
        activeSlots: JSON.parse(JSON.stringify(this.activeSlots)),
        weather: this.weather,
        field: JSON.parse(JSON.stringify(this.field)),
        mechanicUsed: JSON.parse(JSON.stringify(this.mechanicUsed)),
        playerTeam: this.teams[0].map(p => ({ species: p.speciesId, baseSpecies: p.originalSpeciesId, hp: p.hp, maxHp: p.maxHp, fainted: p.fainted, status: p.status, ability: p.ability, item: p.item, initialItem: p._initialHeldItem, consumedItems: [...p._consumedItems], itemTransferOccurred: !!p._itemTransferOccurred, mechanic: p.mechanic, isMega: p.isMega, terastallized: p.terastallized, teraType: p.teraType, dynamaxed: p.dynamaxed })),
        enemyTeam: this.teams[1].map(p => ({ species: p.speciesId, baseSpecies: p.originalSpeciesId, hp: p.hp, maxHp: p.maxHp, fainted: p.fainted, status: p.status, ability: p.ability, item: p.item, initialItem: p._initialHeldItem, consumedItems: [...p._consumedItems], itemTransferOccurred: !!p._itemTransferOccurred, mechanic: p.mechanic, isMega: p.isMega, terastallized: p.terastallized, teraType: p.teraType, dynamaxed: p.dynamaxed })),
        log: this.log.slice(),
      };
    }
  }

  const api = { version:'20261113-gender-recovery-v5', setData, specialDamageInfo, FIXED_DAMAGE_IDS, VARIABLE_POWER_IDS, createPokemon, calcStats, effStat, estimateDamage, Battle, normId, STATUS_NAMES, abilityId, itemId, isGrounded, transformMove, makeZMove, makeMaxMove, stabMultiplier };
  root.PKMBattle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
