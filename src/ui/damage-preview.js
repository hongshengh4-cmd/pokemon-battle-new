/*
 * Read-only damage/HP preview for the adventure battle UI.
 * All move, ability, item and field rules run in an isolated copy of the pinned
 * battle, never in the live battle. There is no alternate damage formula here.
 * No network, host messages, storage, PP consumption or live RNG access.
 * SPDX-License-Identifier: MIT
 */
(function (root) {
  'use strict';
  const VERSION = '20261118-damage-preview-v1';
  const COMMIT = '5b88c476113d51a939bddbcd00b5cd182a5d8058';
  const sessions = new WeakMap();
  const nonlethal = new Set(['falseswipe', 'holdback']);
  const reactive = new Set(['counter', 'mirrorcoat', 'metalburst', 'comeuppance', 'bide', 'shelltrap', 'focuspunch', 'beakblast', 'upperhand', 'suckerpunch']);
  const randomPower = new Set(['present', 'magnitude', 'psywave']);
  const delayed = new Set(['futuresight', 'doomdesire']);
  const unique = xs => [...new Set(xs.filter(Boolean))];
  const span = (lo, hi) => lo === hi ? String(lo) : `${lo}–${hi}`;
  const where = q => ({ side: q.side.n, index: q.position });
  const at = (b, loc) => b.sides[loc.side]?.pokemon[loc.index];
  const canPreview = b => b && root.PKMShowdown?.commit === COMMIT && b.rulesEngine?.commit === COMMIT;

  function snapshot(facade) {
    const ps = facade._ps, D = root.PKMShowdown.Dex;
    // The pinned browser bundle minifies class names. Upstream serialization
    // writes constructor.name, while its reader expects the public type names.
    // Normalize ONLY reference tokens in our private JSON, not engine code or
    // live objects. Deserialization then reconstructs genuine PS prototypes.
    const names = new Map([
      [ps.constructor.name, 'Battle'], [ps.field.constructor.name, 'Field'],
      [ps.sides[0].constructor.name, 'Side'], [ps.sides[0].pokemon[0].constructor.name, 'Pokemon'],
      ...[['moves','tackle','Move'],['abilities','static','Ability'],['items','leftovers','Item'],
        ['species','pikachu','Species'],['conditions','brn','Condition']].map(([kind,id,type]) => [D[kind].get(id).constructor.name, type]),
    ]);
    const raw = JSON.stringify(ps.toJSON());
    return { raw, names, format: { id: ps.format.id, name: ps.format.name, mod: ps.format.mod, gameType: ps.gameType } };
  }
  function clone(snap) {
    const PS = root.PKMShowdown;
    const state = JSON.parse(snap.raw, (_key, value) => typeof value !== 'string' ? value : value.replace(/^\[([^:\]]+)(:[^\]]*)?\]$/, (all, type, ref) => namesafe(type, ref, all)));
    function namesafe(type, ref, fallback) { return snap.names.has(type) ? `[${snap.names.get(type)}${ref || ''}]` : fallback; }
    const b = PS.Battle.fromJSON(state);
    // Only the adapter's two empty-ruleset Gen 9 formats are supported. Never
    // carry its onBegin/onTryMove closures into a preview: they point at the
    // REAL adventure facade. Flee-only status moves do not need a damage range.
    b.format = new PS.Dex.Format({ ...snap.format, ruleset: [], debug: true });
    b.ruleTable = b.dex.formats.getRuleTable(b.format);
    b.clearActiveMove(true);
    b.send = () => {};
    // Independent seed: the preview must not reveal the live random sequence.
    b.prng = new b.prng.constructor([127, 811, 2026, 1118]);
    b.log = []; b.inputLog = [];
    return b;
  }

  function applyMechanic(b, user, mechanic) {
    if (mechanic === 'mega' && user.canMegaEvo) b.actions.runMegaEvo(user);
    if (mechanic === 'tera' && user.canTerastallize && !user.terastallized) b.actions.terastallize(user);
    if (mechanic === 'dynamax' && !user.volatiles.dynamax) user.addVolatile('dynamax');
  }
  function residualRisk(b, q) {
    return ['brn','psn','tox'].includes(q.status) || ['leechseed','partiallytrapped','curse','nightmare','saltcure','perishsong'].some(id => !!q.volatiles[id]) || ['blacksludge','stickybarb'].includes(q.item) || b.field.isWeather(['sandstorm','hail']) || ['sunnyday','desolateland'].includes(q.effectiveWeather()) && q.hasAbility(['solarpower','dryskin']) || ['gmaxwildfire','gmaxvinelash','gmaxcannonade','gmaxvolcalith'].some(id => !!q.side.sideConditions[id]);
  }
  function sampleMove(snap, source, target, baseId, mechanic, roll, critical, branch, effects) {
    const b = clone(snap), user = at(b, source), foe = at(b, target);
    if (!user || !foe || !user.hp || !foe.hp || !user.isActive || !foe.isActive) throw Error('inactive preview target');
    const initialHp = foe.hp;
    const trace = { damage: 0, healed: false, critical: false, optionalCrit: false, guaranteedCrit: false, hits: 0, substitute: !!foe.volatiles.substitute, substituteAfter: null, indirect: false, minHp: initialHp, hitCounts: [], stochastic: false };
    let inDamage = 0, inRandomizer = 0, inLoop = 0, inAccuracy = 0, inSecondary = 0, pendingAccuracy = null;
    const random = b.random, sample = b.sample, runEvent = b.runEvent, accuracy = b.actions.hitStepAccuracy;
    const randomizer = b.randomizer, getDamage = b.actions.getDamage, hitLoop = b.actions.hitStepMoveHitLoop;
    b.randomizer = function (value) { inRandomizer++; try { return randomizer.call(this, value); } finally { inRandomizer--; } };
    b.random = function (m, n) {
      if (inRandomizer && m === 16 && n === undefined) return roll;
      if (inSecondary && m === 100 && n === undefined) return effects ? 0 : 99;
      // Explore both endpoint choices for variable hit counts, but leave other
      // callbacks on the independent seed. Random-power/called/reactive moves
      // are explicitly withheld below rather than pretending this samples all.
      if (inLoop && !inDamage && !this.event?.id) {
        if (m === 2 && n === undefined && user.hasItem('loadeddice')) return branch ? 1 : 0;
        if (m === 7 && n === undefined && user.hasItem('loadeddice')) return branch ? 6 : 0;
        if (n !== undefined && m >= 1 && n <= 11) return branch ? n - 1 : m;
      }
      return random.call(this, m, n);
    };
    b.sample = function (items) {
      if (inLoop && !inDamage && items.length && items.every(n => Number.isInteger(n) && n >= 2 && n <= 10)) return branch === 2 ? items[items.length - 1] : items[0];
      return sample.call(this, items);
    };
    for (const method of ['secondaries', 'selfDrops']) {
      const original = b.actions[method];
      b.actions[method] = function (...args) {
        const moveData = args[3];
        const optional = method === 'secondaries' ? moveData?.secondaries : [moveData?.self];
        if (optional?.some(s => s && s.chance > 0 && s.chance < 100)) trace.stochastic = true;
        inSecondary++; try { return original.apply(this, args); } finally { inSecondary--; }
      };
    }
    b.actions.hitStepAccuracy = function (...args) { inAccuracy++; try { return accuracy.apply(this, args); } finally { inAccuracy--; } };
    b.runEvent = function (event, ...args) {
      const result = runEvent.call(this, event, ...args);
      pendingAccuracy = event === 'Accuracy' && typeof result === 'number' ? result : null;
      return result;
    };
    b.randomChance = function (n, d) {
      if (inDamage && n === 1 && [1, 2, 8, 16, 24].includes(d)) {
        if (d === 1) trace.guaranteedCrit = true; else trace.optionalCrit = true;
        return d === 1 || critical;
      }
      // Ranges are conditional on the move connecting. This does not bypass
      // Protect, immunity, OHKO-level restrictions or semi-invulnerability.
      if (inAccuracy || d === 100 && pendingAccuracy === n) { pendingAccuracy = null; return n > 0; }
      pendingAccuracy = null;
      if (n <= 0) return false;
      if (n >= d) return true;
      trace.stochastic = true;
      return effects;
    };
    b.actions.getDamage = function (a, t, move, ...args) {
      inDamage++;
      try {
        const damage = getDamage.call(this, a, t, move, ...args);
        if (a === user && t === foe && typeof move === 'object') {
          trace.critical ||= !!t.getMoveHitData(move).crit;
          trace.guaranteedCrit ||= move.willCrit === true;
        }
        return damage;
      } finally { inDamage--; }
    };
    b.actions.hitStepMoveHitLoop = function (targets, a, move) {
      inLoop++;
      try { return hitLoop.call(this, targets, a, move); } finally { inLoop--; }
    };
    const hurt = foe.damage, heal = foe.heal;
    foe.damage = function (...args) {
      const before = this.hp, amount = hurt.apply(this, args);
      trace.damage += Math.max(0, before - this.hp); trace.minHp = Math.min(trace.minHp, this.hp);
      if (args[2]?.effectType !== 'Move' && before !== this.hp) trace.indirect = true;
      return amount;
    };
    foe.heal = function (...args) { const before = this.hp, ret = heal.apply(this, args); trace.healed ||= this.hp > before; return ret; };
    // Gimmicks are applied exclusively on the copy, before resolving its move.
    applyMechanic(b, user, mechanic);
    const options = { target: foe };
    if (mechanic === 'z') options.zMove = b.actions.getActiveZMove(b.dex.moves.get(baseId), user).id;
    if (user.volatiles.dynamax) options.maxMove = b.actions.getActiveMaxMove(b.dex.moves.get(baseId), user).id;
    const moved = b.actions.useMove(baseId, user, options);
    trace.hits = b.log.filter(line => line.startsWith('|-damage|') && line.includes(foe.fullname.replace(/^p([12]):/, 'p$1' + String.fromCharCode(97 + foe.position) + ':'))).length;
    trace.substituteAfter = foe.volatiles.substitute?.hp ?? null;
    const hitCountLine = b.log.find(line => line.startsWith('|-hitcount|'));
    if (hitCountLine) trace.hitCounts.push(Number(hitCountLine.split('|').at(-1)));
    trace.redirected = !!b.activeMove && b.activeTarget !== foe && !['allAdjacentFoes','allAdjacent','all','allies'].includes(b.activeMove.target);
    trace.charge = !!user.volatiles.twoturnmove && b.log.some(line => line.startsWith('|-prepare|'));
    trace.blocked = !moved || b.log.some(line => /\|-(immune|miss|fail)\|/.test(line)) && trace.damage === 0;
    trace.failedAccuracy = b.log.some(line => line.startsWith('|-miss|'));
    trace.afterHp = Math.max(0, foe.hp);
    trace.residual = residualRisk(b, foe);
    return trace;
  }

  function envelope(samples) {
    return {
      min: Math.min(...samples.map(s => s.damage)), max: Math.max(...samples.map(s => s.damage)),
      remainingMin: Math.min(...samples.map(s => s.afterHp)), remainingMax: Math.max(...samples.map(s => s.afterHp)),
      canKO: samples.some(s => s.minHp <= 0), allKO: samples.every(s => s.minHp <= 0),
      critical: samples.some(s => s.critical), optionalCrit: samples.some(s => s.optionalCrit), guaranteedCrit: samples.some(s => s.guaranteedCrit),
    };
  }
  const empty = (status, text, notes = []) => ({ status, text, risk: 'unknown', notes, normal: null, critical: null });

  function makeSession(facade, snap) {
    const cache = new Map();
    function estimate(user, target, baseMove, mechanic = null) {
      if (!user || !target || !baseMove) return empty('unavailable', '当前没有可估算的目标');
      const originalUser = facade._pokemon(user), originalTarget = facade._pokemon(target);
      if (!originalUser || !originalTarget || !originalUser.hp || !originalTarget.hp) return empty('unavailable', '目标当前无法承受招式');
      const source = where(originalUser), dest = where(originalTarget), id = baseMove._baseId || baseMove.id;
      const key = JSON.stringify([source, dest, id, mechanic]);
      if (cache.has(key)) return cache.get(key);
      let result;
      try { result = calculate(source, dest, id, mechanic); }
      catch (_) { result = empty('unavailable', '暂时无法可靠估算', ['请勿将无法估算视为零伤害；抓宠时优先使用点到为止。']); }
      cache.set(key, result);
      return result;
    }
    function calculate(source, target, id, mechanic) {
      const probe = clone(snap), user = at(probe, source), foe = at(probe, target), base = probe.dex.moves.get(id);
      if (!base.exists) return empty('unavailable', '暂时无法可靠估算');
      applyMechanic(probe, user, mechanic);
      const move = mechanic === 'z' ? probe.actions.getActiveZMove(base, user) : mechanic === 'dynamax' || user.volatiles.dynamax ? probe.actions.getActiveMaxMove(base, user) : base;
      if (base.callsMove && !move.isMax && !move.isZ) return empty('conditional', '调用其他招式，伤害不定');
      if (move.id === 'painsplit') return empty('conditional', '重新分配双方体力，不按普通伤害估算');
      if (move.category === 'Status') return { ...empty('status', '变化招式 · 不直接造成伤害'), risk: 'neutral' };
      if (reactive.has(move.id)) return empty('conditional', '取决于本回合行动，暂不报固定伤害', ['需要满足先后手、受击或蓄力条件，不能用固定数值判断留血。']);
      if (randomPower.has(move.id)) return empty('conditional', '随机伤害 · 不宜用来精确留血');
      if (delayed.has(move.id)) return empty('delayed', '延迟造成伤害 · 本回合不直接扣血');
      if (move.target === 'randomNormal' && facade.double) return empty('conditional', '随机选取对手，无法保证留血目标');
      const notes = [];
      const multi = !!move.multihit || user.hasAbility('parentalbond') && !move.flags?.noparentalbond && !move.isZ && !move.isMax;
      // Single hits enumerate every one of the 16 cartridge damage rolls.
      // For multiple hits these are common-roll envelopes, not a probability
      // distribution over all mixed-roll sequences. Never promise safe HP for
      // these: their dedicated caution is retained even when samples survive.
      const branches = multi ? [0, 1, 2] : [0], normalSamples = [], critSamples = [];
      const run = effects => {
        for (const critical of [false, true]) for (const branch of branches) for (let roll = 0; roll < 16; roll++) {
          const sample = sampleMove(snap, source, target, id, mechanic, roll, critical, branch, effects);
          (critical ? critSamples : normalSamples).push(sample);
        }
      };
      run(false);
      // Include both success/failure of optional triggers such as Focus Band or
      // damage-induced status. This is not the live battle's random outcome.
      if ([...normalSamples,...critSamples].some(s => s.stochastic)) run(true);
      const all = [...normalSamples, ...critSamples];
      const normal = envelope(normalSamples), crit = envelope(critSamples);
      if (all.some(s => s.failedAccuracy)) return empty('conditional', '命中条件特殊，暂不报固定伤害');
      if (all.every(s => s.charge)) return empty('charging', '本回合蓄力 · 暂不扣血', ['这不是命中回合的伤害；下回合会重新估算。']);
      if (all.some(s => s.redirected)) return empty('redirected', '招式可能被引走，不能保证打中所选目标');
      if (multi) notes.push('连击为合计估算；实际次数、逐次命中、会心和触发效果可能改变结果，不能保证留血。');
      if (all.some(s => s.substitute)) notes.push('目标有替身：这里显示本体扣血和本体剩余体力，不是替身承伤。');
      if (all.some(s => s.healed)) notes.push('剩余体力已计入招式命中时触发的即时回血；伤害为累计扣血，未减去回血。');
      if (all.some(s => s.indirect)) notes.push('已计入本次命中立即触发的额外扣血。');
      if (normal.critical) notes.push('本次必定或强制会心的效果已计入当前伤害。');
      if (base.flags?.charge && !all.every(s => s.charge)) notes.push('这是当前命中回合（或跳过蓄力后）的估算。');
      if (nonlethal.has(move.id)) notes.push('招式的直接伤害本身会至少留下 1 点体力；替身、特性追加扣血和回合末伤害需另行留意。');
      if (move.ohko) notes.push('一击必杀：仅在等级、属性等条件允许且命中时成立，命中后可能直接倒下。');
      const residual = residualRisk(probe, foe) || all.some(s => s.residual);
      if (residual) notes.push('警告：目标存在中毒、灼伤、天气或持续伤害风险；即使招后剩 1 点，也可能在回合末倒下。');
      let risk = normal.allKO ? 'ko' : normal.canKO ? 'risk' : crit.canKO ? 'critical' : multi ? 'caution' : normal.max === 0 && crit.max === 0 ? 'zero' : 'survives';
      if (residual && !['ko','risk','critical'].includes(risk)) risk = 'residual';
      const critical = crit.critical && crit.optionalCrit && !normal.critical ? crit : null;
      return { status: 'ok', text: '', hp: foe.hp, maxHp: foe.maxhp, normal, critical, risk, multi, residual, nonlethal: nonlethal.has(move.id), notes: unique(notes), assumptions: '按当前状态、能够出招且命中估算；不含对手先手变化、另一只宝可梦后续行动及回合末伤害。' };
    }
    return { version: VERSION, estimate };
  }
  function createSession(facade) {
    if (!canPreview(facade) || !facade._ps || facade.winner !== null || facade.pendingSwitch !== null) return { estimate: () => empty('unavailable', '当前不在选择招式阶段') };
    try {
      const b = facade._ps;
      if (!['pkmcustomsingles', 'pkmcustomdoubles'].includes(b.format.id) || b.format.mod !== 'gen9' || b.format.ruleset.length) throw Error('unsupported format');
      const snap = snapshot(facade), previous = sessions.get(b);
      if (previous?.raw === snap.raw) return previous.session;
      const session = makeSession(facade, snap);
      sessions.set(b, { raw: snap.raw, session });
      return session;
    } catch (_) { return { estimate: () => empty('unavailable', '暂时无法可靠估算') }; }
  }
  function summary(info) {
    if (!info?.normal) return info?.text || '暂时无法可靠估算';
    const n = info.normal;
    return `${info.multi ? '约伤害' : '伤害'} ${span(n.min,n.max)} · 剩 ${span(n.remainingMin,n.remainingMax)}`;
  }
  function caution(info) {
    if (!info?.normal) return '';
    return ({ ko: info.multi ? '连击有击倒风险' : '命中将倒下', risk:'可能击倒，留血危险', critical:'会心可能击倒', caution:'连击留血需谨慎', residual:'回合末可能倒下', zero:'本体不扣血／效果受阻', survives: info.nonlethal ? '直接伤害至少留 1 点' : '当前估算不会直接击倒' })[info.risk] || '';
  }
  root.PKMDamagePreview = { version: VERSION, createSession, summary, caution, span };
})(typeof window !== 'undefined' ? window : globalThis);
