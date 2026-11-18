/* Move scripts: per-move rules ported from Pokémon Showdown for the site's own battle engine.
 * Rules reference: smogon/pokemon-showdown 41ba4797f8bffa503111fb42dc1d66d8cdb8405c
 * (data/moves.ts, data/conditions.ts, sim/battle-actions.ts). The rules are re-implemented
 * against this engine's state model. No Showdown code is bundled.
 * Pokémon Showdown: Copyright (c) 2011-2026 Guangcong Luo and other contributors, MIT License.
 *
 * battle.js calls these hooks; every hook is optional and returns a neutral value for moves
 * without a script. Pure logic, no DOM.
 */
(function (root, factory) {
  const api = factory(root); root.PKMMoveScripts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const VERSION = '20261116-ps-move-scripts-v1';
  const TYPE_ZH = { Normal: '一般', Fire: '火', Water: '水', Electric: '电', Grass: '草', Ice: '冰', Fighting: '格斗', Poison: '毒', Ground: '地面', Flying: '飞行', Psychic: '超能力', Bug: '虫', Rock: '岩石', Ghost: '幽灵', Dragon: '龙', Dark: '恶', Steel: '钢', Fairy: '妖精', Stellar: '星晶' };
  const PLATES = { dracoplate: 'Dragon', dreadplate: 'Dark', earthplate: 'Ground', fistplate: 'Fighting', flameplate: 'Fire', icicleplate: 'Ice', insectplate: 'Bug', ironplate: 'Steel', meadowplate: 'Grass', mindplate: 'Psychic', pixieplate: 'Fairy', skyplate: 'Flying', splashplate: 'Water', spookyplate: 'Ghost', stoneplate: 'Rock', toxicplate: 'Poison', zapplate: 'Electric' };
  const BINDING = { bind: '绑紧', wrap: '紧束', firespin: '火焰旋涡', whirlpool: '潮旋', sandtomb: '流沙地狱', clamp: '贝壳夹击', infestation: '纠缠不休', magmastorm: '熔岩风暴', snaptrap: '捕兽夹', thundercage: '雷电囚笼' };
  // Moves that double damage and never miss a Minimized target (conditions.ts minimize).
  const MINIMIZE_PUNISH = new Set(['stomp', 'steamroller', 'bodyslam', 'flyingpress', 'dragonrush', 'heatcrash', 'heavyslam', 'maliciousmoonsault', 'supercellslam']);
  const BERRY_HEAL_THIRD = new Set(['figyberry', 'wikiberry', 'magoberry', 'aguavberry', 'iapapaberry']);
  const STAT_BERRY = { liechiberry: 'atk', ganlonberry: 'def', salacberry: 'spe', petayaberry: 'spa', apicotberry: 'spd' };

  function create(h) {
    const { hasAbility, abilityId, itemId, isGrounded, effStat, effectiveness, normId } = h;
    const MOVES = () => h.moves() || {};
    const MECH = root.PKMMechanics || null;
    const itemName = id => MECH?.itemInfo?.(id)?.name || id;
    const typeZh = t => TYPE_ZH[t] || t;
    const alive = p => !!p && !p.fainted && p.hp > 0;
    const sideLabel = side => side === 0 ? '我方' : '敌方';
    const weatherFor = (b, p) => (['sun', 'rain'].includes(b.weather) && itemId(p) === 'utilityumbrella') ? null : b.weather;
    const turnTag = b => b.turnCount;
    const isBerry = id => !!id && id.endsWith('berry');
    const pos = (b, p) => { const side = b.sideOf(p); return { side, slot: Math.max(0, b.activeSlots[side].indexOf(b.teams[side].indexOf(p))) }; };
    const remainingAction = (b, p) => {
      const st = b._turnState; if (!st) return null;
      for (let i = st.index; i < st.movers.length; i++) if (st.movers[i].actor === p) return st.movers[i];
      return null;
    };
    const PLEDGES = ['firepledge', 'grasspledge', 'waterpledge'];
    // Showdown pledge combos: [combined type, side condition, which side gets it]
    const pledgeCombo = (a, c) => {
      const k = [a, c].sort().join('+');
      return { 'firepledge+grasspledge': ['Fire', 'seaoffire', 'foe'], 'firepledge+waterpledge': ['Water', 'rainbow', 'self'], 'grasspledge+waterpledge': ['Grass', 'swamp', 'foe'] }[k] || null;
    };
    const HP_TYPES = ['Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark'];
    function hiddenPowerType(p) {
      const iv = p.ivs || {}; let n = 0;
      ['hp', 'atk', 'def', 'spe', 'spa', 'spd'].forEach((k, i) => { n += ((iv[k] ?? 31) & 1) << i; });
      return HP_TYPES[Math.floor(n * 15 / 63)];
    }
    const DRIVES = { burndrive: 'Fire', chilldrive: 'Ice', dousedrive: 'Water', shockdrive: 'Electric' };
    const MEMORIES = { bugmemory: 'Bug', darkmemory: 'Dark', dragonmemory: 'Dragon', electricmemory: 'Electric', fairymemory: 'Fairy', fightingmemory: 'Fighting', firememory: 'Fire', flyingmemory: 'Flying', ghostmemory: 'Ghost', grassmemory: 'Grass', groundmemory: 'Ground', icememory: 'Ice', poisonmemory: 'Poison', psychicmemory: 'Psychic', rockmemory: 'Rock', steelmemory: 'Steel', watermemory: 'Water' };
    const positiveBoosts = p => Object.values(p.stages || {}).reduce((n, v) => n + (v > 0 ? v : 0), 0);
    const hasStatus = p => !!p.status || hasAbility(p, 'comatose');
    const isMegaStone = id => !!id && /ite[xy]?$/.test(id) && id !== 'eviolite';
    function canLoseItem(b, p, quiet = false, ignoreStickyHold = false) {
      const id = itemId(p);
      if (!id) return false;
      if (id.endsWith('iumz') || isMegaStone(id) || ['rustedsword', 'rustedshield'].includes(id)) return false;
      if (PLATES[id] && (p.speciesId || '').startsWith('arceus')) return false;
      if (!ignoreStickyHold && hasAbility(p, 'stickyhold')) { if (!quiet) b.say(`${p.name} 的黏着阻止了道具被夺走！`); return false; }
      return true;
    }

    /* ---------- berries eaten by Bug Bite / Pluck / Stuff Cheeks style effects ---------- */
    function eatBerry(b, p, id, why = '') {
      p._ateBerry = true;
      const say = msg => b.say(`${p.name}${why}${msg}`);
      if (id === 'sitrusberry') return b.heal(p, Math.max(1, Math.floor(p.maxHp / 4)), '吃下了文柚果');
      if (id === 'oranberry') return b.heal(p, 10, '吃下了橙橙果');
      if (BERRY_HEAL_THIRD.has(id)) return b.heal(p, Math.max(1, Math.floor(p.maxHp / 3)), '吃下了树果');
      if (id === 'enigmaberry') return b.heal(p, Math.max(1, Math.floor(p.maxHp / 4)), '吃下了谜芝果');
      const cure = { cheriberry: ['par'], chestoberry: ['slp'], pechaberry: ['psn', 'tox'], rawstberry: ['brn'], aspearberry: ['frz'] }[id];
      if (cure) { if (cure.includes(p.status)) { p.status = null; delete p.toxicCounter; say('吃下树果，异常状态痊愈了！'); } else say('吃下了树果。'); return; }
      if (id === 'lumberry') { if (p.status || p.volatile.confusion) { p.status = null; delete p.toxicCounter; delete p.volatile.confusion; say('吃下木子果，状态痊愈了！'); } else say('吃下了木子果。'); return; }
      if (id === 'persimberry') { if (p.volatile.confusion) { delete p.volatile.confusion; say('吃下柿仔果，混乱解除了！'); } else say('吃下了柿仔果。'); return; }
      if (id === 'leppaberry') { const m = (p.moves || []).find(x => x.ppLeft < x.pp) || p.moves?.[0]; if (m) { m.ppLeft = Math.min(m.pp, m.ppLeft + 10); say(`吃下苹野果，回复了 ${m.name} 的招式点数！`); } return; }
      if (STAT_BERRY[id]) return b.changeStages(p, { [STAT_BERRY[id]]: 1 }, p);
      if (id === 'starfberry') { const pool = ['atk', 'def', 'spa', 'spd', 'spe'].filter(k => p.stages[k] < 6); if (pool.length) b.changeStages(p, { [pool[Math.floor(b.rng() * pool.length)]]: 2 }, p); return; }
      if (id === 'lansatberry') { p.volatile.critBoost = Math.max(2, p.volatile.critBoost || 0); say('吃下兰萨果，变得容易击中要害了！'); return; }
      if (id === 'keeberry') return b.changeStages(p, { def: 1 }, p);
      if (id === 'marangaberry') return b.changeStages(p, { spd: 1 }, p);
      say(`吃下了${itemName(id)}。`);
    }

    /* ---------- type / category / accuracy changes (onModifyType / onModifyMove) ---------- */
    function prepare(b, user, target, move, opts = {}) {
      if (!move || move._psPrepared) return move;
      const exec = !!opts.exec; // false = preview / AI estimate: must not consume RNG or change battle state
      const m = { ...move, _psPrepared: true, _psExec: exec };
      const id = m._baseId || m.id;
      const w = weatherFor(b, user);
      const terrainOn = b.field?.terrain && isGrounded(user) ? b.field.terrain : null;
      if (m._isZ || m._isMax) return m;
      switch (id) {
        case 'weatherball': {
          const t = { sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice', hail: 'Ice' }[w];
          if (t) { m.type = t; m.basePower = (move.basePower || 50) * 2; m._scriptNote = `气象球变成了${typeZh(t)}属性！`; }
          break;
        }
        case 'terrainpulse': {
          const t = { electric: 'Electric', grassy: 'Grass', misty: 'Fairy', psychic: 'Psychic' }[terrainOn];
          if (t) { m.type = t; m.basePower = (move.basePower || 50) * 2; m._scriptNote = `大地波动变成了${typeZh(t)}属性！`; }
          break;
        }
        case 'judgment': { const t = PLATES[itemId(user)]; if (t) m.type = t; break; }
        case 'hiddenpower': m.type = hiddenPowerType(user); break;
        case 'technoblast': { const t = DRIVES[itemId(user)]; if (t) m.type = t; break; }
        case 'multiattack': { const t = MEMORIES[itemId(user)]; if (t) m.type = t; break; }
        case 'firepledge': case 'grasspledge': case 'waterpledge': {
          const pl = b._pledge, side = b.sideOf(user);
          if (pl && pl.side === side && pl.turn === turnTag(b) && pl.id !== id && pl.by !== user) {
            const combo = pledgeCombo(pl.id, id);
            if (combo) { m.type = combo[0]; m.basePower = 150; m._pledgeCombo = combo; m._scriptNote = '两种誓言合为一体了！'; }
          }
          break;
        }
        case 'revelationdance': m.type = user.terastallized && user.teraType && user.teraType !== 'Stellar' ? user.teraType : (user.types?.[0] || m.type); break;
        case 'aurawheel': if ((user.speciesId || '').includes('hangry')) m.type = 'Dark'; break;
        case 'ragingbull': {
          const sp = user.speciesId || '';
          if (sp === 'taurospaldeacombat') m.type = 'Fighting'; else if (sp === 'taurospaldeablaze') m.type = 'Fire'; else if (sp === 'taurospaldeaaqua') m.type = 'Water';
          break;
        }
        case 'ivycudgel': {
          const sp = user.speciesId || '';
          if (sp.startsWith('ogerponwellspring')) m.type = 'Water'; else if (sp.startsWith('ogerponhearthflame')) m.type = 'Fire'; else if (sp.startsWith('ogerponcornerstone')) m.type = 'Rock';
          break;
        }
        case 'terablast':
          if (user.terastallized && user.teraType) {
            if (user.teraType !== 'Stellar') m.type = user.teraType; else m.basePower = 100;
            if (effStat(user, 'atk') > effStat(user, 'spa')) m.category = 'Physical';
          }
          break;
        case 'terastarstorm':
          if ((user.speciesId || '') === 'terapagosstellar') { m.type = 'Stellar'; if (effStat(user, 'atk') > effStat(user, 'spa')) m.category = 'Physical'; m.target = 'allAdjacentFoes'; }
          break;
        case 'photongeyser': case 'lightthatburnsthesky':
          if (effStat(user, 'atk') > effStat(user, 'spa')) m.category = 'Physical';
          break;
        case 'shellsidearm': if (target && target !== user) {
          const lv = Math.floor(2 * user.level / 5 + 2), bp = move.basePower || 90;
          const phys = Math.floor(Math.floor(Math.floor(lv * bp * effStat(user, 'atk')) / Math.max(1, effStat(target, 'def'))) / 50);
          const spec = Math.floor(Math.floor(Math.floor(lv * bp * effStat(user, 'spa')) / Math.max(1, effStat(target, 'spd'))) / 50);
          if (phys > spec || (phys === spec && exec && b.rng() < 0.5)) { m.category = 'Physical'; m.flags = { ...(m.flags || {}), contact: 1 }; }
          break;
        }
        case 'blizzard': if (w === 'snow' || w === 'hail') m.accuracy = true; break;
        case 'thunder': case 'hurricane': {
          const tw = target && target !== user ? weatherFor(b, target) : b.weather;
          if (tw === 'rain') m.accuracy = true; else if (tw === 'sun') m.accuracy = 50;
          break;
        }
        case 'bleakwindstorm': case 'wildboltstorm': case 'sandsearstorm': {
          const tw = target && target !== user ? weatherFor(b, target) : b.weather;
          if (tw === 'rain') m.accuracy = true;
          break;
        }
        case 'growth': if (w === 'sun') m.boosts = { atk: 2, spa: 2 }; break;
        case 'expandingforce': if (terrainOn === 'psychic' && b.double) m.target = 'allAdjacentFoes'; break;
        case 'present': { if (!exec) { m.basePower = 60; break; } const r = b.rng(); m._presentHeal = r < 0.2; m.basePower = r < 0.2 ? 0 : r < 0.6 ? 40 : r < 0.9 ? 80 : 120; break; }
        default: break;
      }
      return m;
    }
    function modifyTarget(b, user, move) {
      if ((move.id === 'expandingforce') && b.double && b.field?.terrain === 'psychic' && isGrounded(user)) return 'allAdjacentFoes';
      return move.target;
    }
    function priority(b, user, move) {
      if (move.id === 'grassyglide' && b.field?.terrain === 'grassy' && isGrounded(user)) return 1;
      return 0;
    }

    /* ---------- onTry / onTryMove / onPrepareHit: once per move use ---------- */
    function tryMove(b, user, target, move, shared = {}) {
      const id = move._baseId || move.id;
      if (move._isZ || move._isMax) return null;
      const firstTurn = user.enteredTurn === b.turnCount - 1 || (b.turnCount <= 1 && !user.enteredTurn);
      switch (id) {
        case 'firepledge': case 'grasspledge': case 'waterpledge': {
          if (!b.double || move._pledgeCombo) return null;
          const side = b.sideOf(user);
          const ally = b.activeMons(side).find(q => q !== user && alive(q));
          const act = ally && remainingAction(b, ally);
          if (act && act.action?.kind === 'move' && PLEDGES.includes(act.move?.id) && act.move.id !== id) {
            b._pledge = { side, id, turn: turnTag(b), by: user };
            b.say(`${user.name} 正在等待同伴的行动……`);
            return { handled: true };
          }
          return null;
        }
        case 'teleport': {
          const side = b.sideOf(user);
          if (side === 1 && b.encounterType === 'wild') { b.wildFlee(user, `${user.name} 用瞬间移动逃走了！`); return { ended: true }; }
          if (!b.benchOf(side).length) return '但是失败了！（没有可以替换上场的宝可梦）';
          return null;
        }
        case 'fakeout': case 'firstimpression':
          return firstTurn ? null : '但是失败了！（只能在出场后的第一回合使用）';
        case 'matblock':
          return firstTurn ? null : '但是失败了！（只能在出场后的第一回合使用）';
        case 'suckerpunch': case 'thunderclap': {
          const act = target && remainingAction(b, target);
          const mv = act?.move;
          if (!act || !mv || act.action.kind !== 'move' || (mv.category === 'Status' && mv.id !== 'mefirst') || target.volatile?.recharging) return '但是失败了！（对手没有准备发动攻击）';
          return null;
        }
        case 'upperhand': {
          const act = target && remainingAction(b, target);
          if (!act || act.action.kind !== 'move' || !act.move || act.move.category === 'Status' || !(act.prio > 0)) return '但是失败了！（对手没有准备使用先制攻击）';
          return null;
        }
        case 'focuspunch':
          if (user.volatile.focuspunch?.lost) { delete user.volatile.focuspunch; return `${user.name} 失去了集中力，无法使出招式！`; }
          delete user.volatile.focuspunch; return null;
        case 'beakblast': delete user.volatile.beakblast; return null;
        case 'belch':
          return user._ateBerry || (user._consumedItems || []).some(i => isBerry(normId(i))) ? null : '但是失败了！（还没有吃过树果）';
        case 'lastresort': {
          const others = (user.moves || []).filter(m => m.id !== 'lastresort');
          const used = user.volatile.usedMoves || {};
          if (!(user.moves || []).some(m => m.id === 'lastresort') || !others.length || others.some(m => !used[m.id])) return '但是失败了！（还没有用过其他所有招式）';
          return null;
        }
        case 'poltergeist':
          if (!target || !itemId(target)) return '但是失败了！（对手没有携带道具）';
          b.say(`${target.name} 携带的${itemName(itemId(target))}向它袭来！`); return null;
        case 'steelroller':
          return b.field?.terrain ? null : '但是失败了！（场上没有场地）';
        case 'doubleshock':
          return user.types?.includes('Electric') ? null : '但是失败了！（自己不是电属性）';
        case 'burnup':
          return user.types?.includes('Fire') ? null : '但是失败了！（自己不是火属性）';
        case 'aurawheel':
          return (user.speciesId || '').startsWith('morpeko') ? null : '但是失败了！（只有莫鲁贝可能使用）';
        case 'darkvoid':
          return (user.speciesId || '').startsWith('darkrai') ? null : '但是失败了！（只有达克莱伊能使用）';
        case 'hyperspacefury':
          return (user.speciesId || '') === 'hoopaunbound' ? null : '但是失败了！（只有解放的胡帕能使用）';
        case 'ragingbull': case 'ivycudgel': return null;
        case 'clangoroussoul': {
          if (user.hp <= Math.floor(user.maxHp / 3)) return '但是失败了！（体力不足）';
          if (['atk', 'def', 'spa', 'spd', 'spe'].every(k => user.stages[k] >= 6)) return '但是失败了！（能力已经无法再提高）';
          return null;
        }
        case 'filletaway': {
          if (user.hp <= Math.floor(user.maxHp / 2)) return '但是失败了！（体力不足）';
          if (['atk', 'spa', 'spe'].every(k => user.stages[k] >= 6)) return '但是失败了！（能力已经无法再提高）';
          return null;
        }
        case 'noretreat':
          return user.volatile.noretreat ? '但是失败了！（已经背水一战了）' : null;
        case 'celebrate': b.say(`恭喜恭喜！${user.name} 在庆祝！`); return { handled: true };
        case 'happyhour': b.say('大家都沉浸在快乐的气氛中！'); return { handled: true };
        case 'holdhands': return null;
        case 'futuresight': case 'doomdesire': {
          if (!target) return '但是失败了！';
          const tp = pos(b, target);
          b.field.futureMoves = b.field.futureMoves || [];
          if (b.field.futureMoves.some(f => f.side === tp.side && f.slot === tp.slot)) return '但是失败了！（那个位置已经有预知攻击了）';
          b.field.futureMoves.push({ side: tp.side, slot: tp.slot, user, userSide: b.sideOf(user), moveId: id, turns: 3, type: move.type });
          b.say(id === 'futuresight' ? `${user.name} 预知了未来的攻击！` : `${user.name} 将破灭之愿托付给了未来！`);
          return { handled: true };
        }
        case 'round': return null;
        default: return null;
      }
    }

    /* ---------- onTryHit / onTryImmunity: per target, before accuracy ---------- */
    function tryHit(b, user, target, move) {
      if (!target || target === user) return null;
      const id = move._baseId || move.id;
      // Status moves are immune to type only when the data asks for it (Thunder Wave).
      if (move.category === 'Status' && move.ignoreImmunity === false && effectiveness(move.type, target.types) === 0) return `对 ${target.name} 没有效果……`;
      if (move.flags?.powder && (target.types?.includes('Grass') || hasAbility(target, 'overcoat') || itemId(target) === 'safetygoggles')) return `对 ${target.name} 没有效果……`;
      if (id === 'dreameater' && !(target.status === 'slp' || hasAbility(target, 'comatose'))) return `对 ${target.name} 没有效果……（对手没有睡着）`;
      if (move._presentHeal) {
        if (target.hp >= target.maxHp) return `${target.name} 的体力已经是满的！`;
        b.heal(target, Math.max(1, Math.floor(target.maxHp / 4)), '收到了礼物，回复了体力');
        return { handled: true };
      }
      if (id === 'ragingbull' || id === 'brickbreak' || id === 'psychicfangs') {
        if (id === 'ragingbull') {
          const sc = b.field.sides[b.sideOf(target)];
          if (sc.reflect || sc.lightscreen || sc.auroraveil) { sc.reflect = 0; sc.lightscreen = 0; sc.auroraveil = 0; b.say(`${target.name} 一方的壁被打破了！`); }
        }
      }
      return null;
    }

    function accuracy(b, user, target, move, acc) {
      if (!target || target === user) return acc;
      if (target.volatile?.minimize && MINIMIZE_PUNISH.has(move.id)) return true;
      if (target.volatile?.glaiverush) return true;
      return acc;
    }

    /* ---------- basePowerCallback / onBasePower ---------- */
    function basePower(b, user, target, move, bp) {
      if (!bp || move._isZ || move._isMax) return bp;
      const id = move._baseId || move.id;
      const t = target || {};
      switch (id) {
        case 'acrobatics': return itemId(user) ? bp : bp * 2;
        case 'assurance': return t._hurtTurn === turnTag(b) ? bp * 2 : bp;
        case 'avalanche': case 'revenge': return user._lastTaken && user._lastTaken.by === target && user._lastTaken.turn === turnTag(b) ? bp * 2 : bp;
        case 'brine': return t.hp * 2 <= t.maxHp ? bp * 2 : bp;
        case 'eruption': case 'waterspout': case 'dragonenergy': return Math.max(1, Math.floor(150 * user.hp / user.maxHp));
        case 'facade': return user.status && user.status !== 'slp' ? bp * 2 : bp;
        case 'hex': case 'infernalparade': return hasStatus(t) ? bp * 2 : bp;
        case 'venoshock': case 'barbbarrage': return ['psn', 'tox'].includes(t.status) ? bp * 2 : bp;
        case 'knockoff': return target && canLoseItem(b, target, true, true) ? bp * 1.5 : bp;
        case 'lashout': return user._statsLoweredTurn === turnTag(b) ? bp * 2 : bp;
        case 'lastrespects': return Math.min(5050, 50 + 50 * (b.teams[b.sideOf(user)] || []).filter(p => p.fainted || p.hp <= 0).length);
        case 'ragefist': return Math.min(350, 50 + 50 * (user._timesAttacked || 0));
        case 'payback': return target && b._turnState && !remainingAction(b, target) && target.enteredTurn !== turnTag(b) ? bp * 2 : bp;
        case 'powertrip': case 'storedpower': return 20 + 20 * positiveBoosts(user);
        case 'retaliate': return b._faintTurn?.[b.sideOf(user)] === turnTag(b) - 1 ? bp * 2 : bp;
        case 'risingvoltage': return b.field?.terrain === 'electric' && target && isGrounded(target) ? bp * 2 : bp;
        case 'mistyexplosion': return b.field?.terrain === 'misty' && isGrounded(user) ? bp * 1.5 : bp;
        case 'psyblade': return b.field?.terrain === 'electric' ? bp * 1.5 : bp;
        case 'expandingforce': return b.field?.terrain === 'psychic' && isGrounded(user) ? bp * 1.5 : bp;
        case 'gravapple': return b.field?.gravity > 0 ? bp * 1.5 : bp;
        case 'stompingtantrum': case 'temperflare': return user._lastMoveFailed ? bp * 2 : bp;
        case 'round': return b._roundTurn === turnTag(b) && b._roundSide === b.sideOf(user) ? bp * 2 : bp;
        case 'fusionbolt': case 'fusionflare': {
          const other = id === 'fusionbolt' ? 'fusionflare' : 'fusionbolt';
          const prev = b._prevMoveRecord;
          return prev && prev.id === other && prev.turn === turnTag(b) ? bp * 2 : bp;
        }
        case 'collisioncourse': case 'electrodrift':
          return target && effectiveness(move.type, target.types) > 1 ? bp * 5461 / 4096 : bp;
        case 'ficklebeam':
          if (!move._executing) return bp; // preview / AI: no RNG
          if (move._fickle == null) { move._fickle = b.rng() < 0.3; if (move._fickle) b.say(`${user.name} 全力发射了光束！`); }
          return move._fickle ? bp * 2 : bp;
        case 'watershuriken': return (user.speciesId || '') === 'greninjaash' ? 20 : bp;
        case 'solarbeam': case 'solarblade': return bp;
        default: return bp;
      }
    }

    /* ---------- onEffectiveness ---------- */
    function effectivenessFor(b, user, target, move, eff, type) {
      if (!target || eff === 0) return eff;
      const id = move._baseId || move.id;
      if (id === 'freezedry' && target.types?.includes('Water')) eff = eff / effectiveness(type, ['Water']) * 2;
      if (id === 'flyingpress') eff *= effectiveness('Flying', target.types);
      if (target.volatile?.tarshot && type === 'Fire' && !target.terastallized) eff *= 2;
      return eff;
    }

    function damageMultiplier(b, user, target, move) {
      let mult = 1;
      if (!target) return mult;
      if (target.volatile?.minimize && MINIMIZE_PUNISH.has(move.id)) mult *= 2;
      if (target.volatile?.glaiverush) mult *= 2;
      if (move.id === 'hydrosteam' && weatherFor(b, user) === 'sun') mult *= 3; // sun's 0.5 water penalty becomes 1.5
      return mult;
    }

    function damageCap(b, user, target, move, dmg) {
      if (['falseswipe', 'holdback'].includes(move?.id) && dmg >= target.hp) return Math.max(0, target.hp - 1);
      return dmg;
    }

    /* ---------- onHit / onAfterHit: per target, after damage ---------- */
    function onHit(b, user, target, move, info = {}) {
      const id = move._baseId || move.id;
      if (move._isZ || move._isMax) return;
      if (!target) return;
      const afterSub = ['ceaselessedge', 'stoneaxe', 'icespinner', 'steelroller', 'burnup', 'doubleshock'];
      if (info.substitute && !afterSub.includes(id)) return;
      if (['ceaselessedge', 'stoneaxe'].includes(id) && hasAbility(user, 'sheerforce') && (move.secondary || move.secondaries?.length)) return;
      switch (id) {
        case 'knockoff':
          if (alive(user) && canLoseItem(b, target)) { const it = itemId(target); target.item = null; target._itemTransferOccurred = true; target._knockedOff = it; b.say(`${user.name} 拍落了 ${target.name} 的${itemName(it)}！`); }
          break;
        case 'thief': case 'covet':
          if (alive(user) && !user.item && itemId(target) && canLoseItem(b, target)) {
            const it = target.item; target.item = null; user.item = it; user._itemTransferOccurred = target._itemTransferOccurred = true;
            b.say(`${user.name} 夺走了 ${target.name} 的${itemName(itemId({ item: it }))}！`);
          }
          break;
        case 'bugbite': case 'pluck': {
          const it = itemId(target);
          if (alive(user) && isBerry(it) && !hasAbility(target, 'stickyhold')) { target.item = null; target._itemTransferOccurred = true; b.say(`${user.name} 抢走并吃掉了 ${target.name} 的${itemName(it)}！`); eatBerry(b, user, it); }
          break;
        }
        case 'incinerate': {
          const it = itemId(target);
          if (it && (isBerry(it) || it.endsWith('gem'))) { target.item = null; b.say(`${target.name} 的${itemName(it)}被烧掉了！`); }
          break;
        }
        case 'clearsmog':
          if (alive(target)) { for (const k of Object.keys(target.stages)) target.stages[k] = 0; b.say(`${target.name} 的能力变化复原了！`); }
          break;
        case 'icespinner': case 'steelroller':
          if (b.field?.terrain) { b.field.terrain = null; b.field.terrainTurns = 0; b.say('场地被破坏，恢复了正常！'); }
          break;
        case 'ceaselessedge': {
          const sc = b.field.sides[b.sideOf(target)];
          if (alive(user) && sc.spikes < 3) { sc.spikes++; b.say(`${sideLabel(b.sideOf(target))}脚下散布了撒菱（${sc.spikes}层）！`); }
          break;
        }
        case 'stoneaxe': {
          const sc = b.field.sides[b.sideOf(target)];
          if (alive(user) && !sc.stealthrock) { sc.stealthrock = true; b.say(`${sideLabel(b.sideOf(target))}脚下散布了隐形岩！`); }
          break;
        }
        case 'jawlock':
          if (alive(user) && alive(target)) { user.volatile.jawlock = target; target.volatile.jawlock = user; b.say(`${user.name} 和 ${target.name} 都无法逃走了！`); }
          break;
        case 'fellstinger':
          if (alive(user) && info.ko) b.changeStages(user, { atk: 3 }, user);
          break;
        case 'sparklingaria':
          if (alive(target) && target.status === 'brn') { target.status = null; b.say(`${target.name} 的灼伤被治愈了！`); }
          break;
        case 'clangoroussoul':
          user.hp = Math.max(1, user.hp - Math.floor(user.maxHp / 3)); b.say(`${user.name} 消耗了体力！`);
          break;
        case 'filletaway':
          user.hp = Math.max(1, user.hp - Math.floor(user.maxHp / 2)); b.say(`${user.name} 削减了自己的体力！`);
          break;
        case 'doubleshock':
          if (alive(user) && user.types.includes('Electric')) { user.types = user.types.filter(x => x !== 'Electric'); if (!user.types.length) user.types = ['Typeless']; b.say(`${user.name} 用尽了电力！`); }
          break;
        case 'firepledge': case 'grasspledge': case 'waterpledge': {
          const combo = move._pledgeCombo; if (!combo || move._pledgeApplied) break;
          move._pledgeApplied = true; b._pledge = null;
          const side = combo[2] === 'self' ? b.sideOf(user) : b.sideOf(target);
          const sc = b.field.sides[side]; if (!sc || sc[combo[1]] > 0) break;
          sc[combo[1]] = 4;
          b.say({ seaoffire: `${sideLabel(side)}被火海包围了！`, rainbow: `${sideLabel(side)}的天空出现了彩虹！`, swamp: `${sideLabel(side)}被湿地包围了！` }[combo[1]]);
          break;
        }
        case 'burnup':
          if (alive(user) && user.types.includes('Fire')) { user.types = user.types.filter(x => x !== 'Fire'); if (!user.types.length) user.types = ['Typeless']; b.say(`${user.name} 的火焰燃尽了！`); }
          break;
        case 'roost':
          if (user.types?.includes('Flying') && !user.terastallized) { user.volatile.roost = [...user.types]; user.types = user.types.filter(x => x !== 'Flying'); if (!user.types.length) user.types = ['Normal']; }
          break;
        default: break;
      }
    }

    /* ---------- secondary.onHit (rolled by the engine's secondary chance) ---------- */
    function onSecondary(b, user, target, move) {
      const id = move._baseId || move.id;
      if (!alive(target)) return;
      switch (id) {
        case 'triattack': b.tryStatus(target, ['brn', 'par', 'frz'][Math.floor(b.rng() * 3)], user, { fromStatusMove: false }); break;
        case 'direclaw': b.tryStatus(target, ['psn', 'par', 'slp'][Math.floor(b.rng() * 3)], user, { fromStatusMove: false }); break;
        case 'alluringvoice':
          if (target._statsRaisedTurn === turnTag(b)) b.tryConfusion(target, user);
          break;
        case 'burningjealousy':
          if (target._statsRaisedTurn === turnTag(b)) b.tryStatus(target, 'brn', user, { fromStatusMove: false });
          break;
        case 'eeriespell': {
          const mv = (target.moves || []).find(m => m.id === target._lastMoveId);
          if (mv && mv.ppLeft > 0) { const cut = Math.min(3, mv.ppLeft); mv.ppLeft -= cut; b.say(`${target.name} 的 ${mv.name} 的 PP 减少了 ${cut}！`); }
          break;
        }
        case 'throatchop':
          if (!target.volatile.throatchop) b.say(`${target.name} 的喉咙被击中，暂时无法使用声音招式！`);
          target.volatile.throatchop = 2;
          break;
        case 'spiritshackle': case 'anchorshot':
          if (!target.volatile.cannotEscape) { target.volatile.cannotEscape = user; b.say(`${target.name} 被缝住了影子，无法逃走了！`); }
          break;
        default: break;
      }
    }

    /* ---------- volatiles the generic engine does not know ---------- */
    function addVolatile(b, who, vs, source, move) {
      switch (vs) {
        case 'partiallytrapped': {
          if (!alive(who) || who.volatile.partiallytrapped) return true;
          const turns = itemId(source) === 'gripclaw' ? 7 : (b.rng() < 0.5 ? 4 : 5);
          who.volatile.partiallytrapped = { source, move: move.id, name: move.name, turns, band: itemId(source) === 'bindingband' };
          b.say(`${who.name} 被${BINDING[move.id] || move.name}困住了！`);
          return true;
        }
        case 'saltcure':
          if (alive(who) && !who.volatile.saltcure) { who.volatile.saltcure = true; b.say(`${who.name} 被盐腌了！`); }
          return true;
        case 'syrupbomb':
          if (alive(who) && !who.volatile.syrupbomb) { who.volatile.syrupbomb = { turns: 3, source }; b.say(`${who.name} 浑身沾满了糖浆！`); }
          return true;
        case 'tarshot':
          if (alive(who) && !who.volatile.tarshot && !who.terastallized) { who.volatile.tarshot = true; b.say(`${who.name} 变得怕火了！`); }
          return true;
        case 'noretreat':
          who.volatile.noretreat = true; b.say(`${who.name} 背水一战，无法再逃走了！`);
          return true;
        case 'glaiverush':
          who.volatile.glaiverush = { setTurn: b.turnCount }; return true;
        case 'sparklingaria': return true;
        case 'lockedmove': case 'mustrecharge': return true;
        default: return false;
      }
    }

    const onField = (b, q) => alive(q) && b.activeMons(b.sideOf(q)).includes(q);
    function trapped(b, p) {
      const v = p?.volatile || {};
      if (p?.types?.includes('Ghost')) return null;
      if (itemId(p) === 'shedshell') return null;
      if (v.partiallytrapped && onField(b, v.partiallytrapped.source)) return `${p.name} 被${BINDING[v.partiallytrapped.move] || v.partiallytrapped.name}困住，无法交换！`;
      if (v.jawlock && onField(b, v.jawlock)) return `${p.name} 被紧咬不放，无法交换！`;
      if (v.noretreat) return `${p.name} 正在背水一战，无法交换！`;
      if (v.ingrain) return `${p.name} 扎了根，无法交换！`;
      return null;
    }

    function blocked(b, p, move) {
      if (p.volatile?.throatchop && move.flags?.sound) return `${p.name} 的喉咙受了伤，无法使用 ${move.name}！`;
      if (b.field?.gravity > 0 && move.flags?.gravity) return `由于重力，${p.name} 无法使用 ${move.name}！`;
      return null;
    }

    /* ---------- turn start: priorityChargeCallback ---------- */
    function beforeTurn(b, movers) {
      for (const m of movers) {
        const id = m.base?.id;
        if (!m.actor || m.actor.fainted) continue;
        if (id === 'focuspunch' && !m.actor.dynamaxed && m.action.mechanic !== 'z') { m.actor.volatile.focuspunch = { lost: false }; b.say(`${m.actor.name} 正在集中精神！`); }
        if (id === 'beakblast' && !m.actor.dynamaxed && m.action.mechanic !== 'z') { m.actor.volatile.beakblast = true; b.say(`${m.actor.name} 开始给鸟喙加热了！`); }
      }
    }
    function onDamagingHit(b, attacker, target, move, damage) {
      if (target.volatile?.focuspunch && damage > 0) target.volatile.focuspunch.lost = true;
      if (target.volatile?.beakblast && move.flags?.contact && alive(attacker)) b.tryStatus(attacker, 'brn', target, { fromStatusMove: false });
      target._timesAttacked = (target._timesAttacked || 0) + 1;
    }

    /* ---------- after the whole move (all targets) ---------- */
    function afterMove(b, user, move, shared = {}) {
      if (!move || shared._scriptsAfterDone) return;
      shared._scriptsAfterDone = true;
      const reached = !!shared.reachedTarget;
      const hit = !!shared.anyHit;
      const id = move._baseId || move.id;
      // crash moves: 1/2 max HP when the move misses / is blocked / has no effect
      if (move.hasCrashDamage && reached && !hit && alive(user) && !hasAbility(user, 'magicguard')) {
        b.applyDamage(user, Math.max(1, Math.round(user.maxHp / 2)), `${user.name} 摔在了地上，受到了伤害！`);
      }
      if (move.mindBlownRecoil && reached && alive(user) && !hasAbility(user, 'magicguard')) {
        b.applyDamage(user, Math.max(1, Math.round(user.maxHp / 2)), `${user.name} 削减了自己的体力！`);
      }
      if (move.chloroblastRecoil && hit && alive(user) && !hasAbility(user, 'magicguard')) {
        b.applyDamage(user, Math.max(1, Math.round(user.maxHp / 2)), `${user.name} 受到了反作用力伤害！`);
      }
      if (move.selfBoost?.boosts && hit && alive(user)) b.changeStages(user, move.selfBoost.boosts, user);
      if (id === 'round' && hit) { b._roundTurn = b.turnCount; b._roundSide = b.sideOf(user); }
      if (id === 'glaiverush' && !hit) delete user.volatile.glaiverush;
    }

    /* ---------- residuals ---------- */
    function residual(b, p) {
      if (!alive(p)) return;
      const v = p.volatile;
      const sc = b.field?.sides?.[b.sideOf(p)];
      if (sc?.seaoffire > 0 && !p.types.includes('Fire') && !hasAbility(p, 'magicguard')) {
        b.applyDamage(p, Math.max(1, Math.floor(p.maxHp / 8)), `${p.name} 受到了火海的伤害！`);
        if (!alive(p)) return;
      }
      if (v.partiallytrapped) {
        const pt = v.partiallytrapped;
        if (!alive(pt.source) || !b.activeMons(b.sideOf(pt.source)).includes(pt.source)) { delete v.partiallytrapped; }
        else if (--pt.turns <= 0) { delete v.partiallytrapped; b.say(`${p.name} 从${BINDING[pt.move] || pt.name}中挣脱了！`); }
        else if (!hasAbility(p, 'magicguard')) b.applyDamage(p, Math.max(1, Math.floor(p.maxHp / (pt.band ? 6 : 8))), `${p.name} 受到了${BINDING[pt.move] || pt.name}的伤害！`);
      }
      if (alive(p) && v.saltcure && !hasAbility(p, 'magicguard')) {
        const frac = p.types.includes('Water') || p.types.includes('Steel') ? 4 : 8;
        b.applyDamage(p, Math.max(1, Math.floor(p.maxHp / frac)), `${p.name} 受到了盐腌的伤害！`);
      }
      if (alive(p) && v.syrupbomb) {
        const s = v.syrupbomb;
        if (!alive(s.source) || !b.activeMons(b.sideOf(s.source)).includes(s.source) || s.turns <= 0) { delete v.syrupbomb; b.say(`${p.name} 身上的糖浆消失了。`); }
        else { s.turns--; b.changeStages(p, { spe: -1 }, s.source); if (s.turns <= 0) { delete v.syrupbomb; b.say(`${p.name} 身上的糖浆消失了。`); } }
      }
      if (v.throatchop > 0 && --v.throatchop <= 0) { delete v.throatchop; b.say(`${p.name} 的喉咙恢复了。`); }
      if (v.glaiverush && v.glaiverush.setTurn < b.turnCount) delete v.glaiverush;
      if (v.roost) { p.types = v.roost; delete v.roost; }
      if (v.jawlock && !onField(b, v.jawlock)) delete v.jawlock;
    }
    function fieldResidual(b) {
      const list = b.field?.futureMoves;
      if (!list?.length) return;
      const keep = [];
      for (const f of list) {
        if (--f.turns > 0) { keep.push(f); continue; }
        const target = b.cur(f.side, f.slot);
        if (!alive(target)) continue;
        const data = MOVES()[f.moveId] || {};
        const mv = { ...data, id: f.moveId, ignoreImmunity: false, flags: { ...(data.flags || {}), protect: 0 }, _future: true };
        b.say(`${target.name} 受到了${data.name || f.moveId}的攻击！`);
        b.futureHit(f.user, target, mv);
      }
      b.field.futureMoves = keep;
    }

    return {
      VERSION, prepare, modifyTarget, priority, tryMove, tryHit, accuracy, basePower, effectiveness: effectivenessFor, damageMultiplier, damageCap,
      onHit, onSecondary, addVolatile, trapped, blocked, beforeTurn, onDamagingHit, afterMove, residual, fieldResidual,
      eatBerry, canLoseItem, weatherFor, MINIMIZE_PUNISH, BINDING,
    };
  }
  return { VERSION, create, TYPE_ZH };
});
