/* Stateful move lifecycles for the existing browser engine.
 * Rules reference: smogon/pokemon-showdown 41ba4797f8bffa503111fb42dc1d66d8cdb8405c,
 * data/moves.ts and data/conditions.ts. Rules re-implemented, no Showdown code bundled.
 * Pokemon Showdown: Copyright (c) 2011-2026 Guangcong Luo and other contributors, MIT License.
 * Modern mechanics, including past moves; historical Rollout storage glitches are NOT reproduced.
 * No DOM, network, save writes or changes to owned Pokemon identities.
 */
(function (root, factory) {
  const api = factory(); root.PKMMoveLifecycle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '20261116-bond-npc-moves-team-v1';
  const ROLL = new Set(['rollout', 'iceball']);
  const RAMPAGE = new Set(['outrage', 'thrash', 'petaldance', 'ragingfury']);
  const CHARGE = new Set(['bounce', 'dig', 'dive', 'electroshot', 'fly', 'freezeshock', 'geomancy', 'iceburn', 'meteorbeam', 'phantomforce', 'razorwind', 'shadowforce', 'skullbash', 'skyattack', 'solarbeam', 'solarblade']);
  const SOLAR = new Set(['solarbeam', 'solarblade']);
  const SEMI = { fly: 'air', bounce: 'air', dig: 'underground', dive: 'underwater', phantomforce: 'vanished', shadowforce: 'vanished' };
  const EXCEPTIONS = {
    air: ['gust', 'twister', 'skyuppercut', 'thunder', 'hurricane', 'smackdown', 'thousandarrows'],
    underground: ['earthquake', 'magnitude', 'fissure'], underwater: ['surf', 'whirlpool'], vanished: [],
  };
  const DOUBLE = { air: ['gust', 'twister'], underground: ['earthquake', 'magnitude'], underwater: ['surf', 'whirlpool'], vanished: [] };
  const MULTI_ACCURACY = new Set(['triplekick', 'tripleaxel', 'populationbomb']);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ability = p => p?._abilitySuppressed ? '' : norm(p?.ability);
  const active = p => p && !p.fainted && p.hp > 0;
  const copyTemplate = move => {
    const out = { ...move }; delete out._ppSource; delete out._calledBy; delete out._executing; return out;
  };
  function lockInfo(p) {
    if (!p || !p.volatile || !active(p)) return null;
    const v = p.volatile;
    if (v.recharging) return { id: 'recharge', kind: 'recharge', label: '硬直恢复', reason: '上一招后需要休息，本回合不能换人、使用道具或逃走。' };
    if (v.chargingMove) return { id: v.chargingMove.id, kind: 'charge', label: '蓄力继续', reason: '正在完成两回合招式，本回合须继续出招。' };
    if (v.bideState) return { id: 'bide', kind: 'bide', label: '忍耐', reason: '正在忍耐，必须完成蓄力和反击。' };
    if (v.moveChain) return { id: v.moveChain.id, kind: v.moveChain.kind, label: v.moveChain.name || v.moveChain.id, reason: '连续攻击中，不能更换招式、换人、使用道具或逃走。' };
    return null;
  }
  function forcedMove(p, moves = {}) {
    const info = lockInfo(p); if (!info) return null;
    if (info.id === 'recharge') return { id: 'recharge', name: '硬直恢复', target: 'self', type: 'Normal', category: 'Status', basePower: 0, priority: 0, accuracy: true, ppLeft: 0, flags: {}, _continuation: true, _isRecharge: true };
    const state = p.volatile.chargingMove || p.volatile.moveChain || p.volatile.bideState;
    const known = p.moves.find(m => m.id === info.id);
    const move = known || state?.template || (moves[info.id] && { ...moves[info.id], id: info.id, ppLeft: 0 });
    return move ? { ...move, _continuation: true, _forced: true } : null;
  }
  function actionReason(p, action) {
    const info = lockInfo(p);
    return info && action && !['move', 'pass'].includes(action.kind) ? `${p.name} ${info.reason}` : null;
  }
  function abort(p) {
    if (!p?.volatile) return;
    delete p.volatile.moveChain; delete p.volatile.chargingMove; delete p.volatile.furyCutter; delete p.volatile.bideState;
  }
  function canHit(user, target, move) {
    const semi = target?.volatile?.chargingMove?.semi;
    if (!semi || !target || user === target || ability(user) === 'noguard' || ability(target) === 'noguard') return { allowed: true, multiplier: 1 };
    if (target._battle?.field?.gravity > 0 && semi === 'air') return { allowed: true, multiplier: 1 };
    return { allowed: EXCEPTIONS[semi].includes(move.id), multiplier: DOUBLE[semi].includes(move.id) ? 2 : 1 };
  }
  function power(user, target, move) {
    let bp = Number(move?.basePower) || 0; if (!bp || move._isZ || move._isMax) return bp;
    const v = user?.volatile || {}, b = user?._battle;
    if (ROLL.has(move.id)) {
      const n = move._calledBy === 'sleeptalk' ? 0 : (v.moveChain?.id === move.id ? v.moveChain.hits : 0);
      bp *= 2 ** Math.min(4, n || 0);
      if (v.defensecurl) bp *= 2;
    }
    if (move.id === 'furycutter') {
      const state = v.furyCutter;
      const n = state && (!b || b.turnCount - state.lastTurn <= 1) ? state.hits : 0;
      bp = Math.min(160, bp * 2 ** Math.min(2, n || 0));
    }
    if (move.id === 'echoedvoice' && b) {
      const e = b.field.echoedVoice;
      const turn = move._executing || b._turnState ? b.turnCount : b.turnCount + 1;
      const mult = !e || e.lastTurn < turn - 1 ? 1 : e.lastTurn === turn ? e.multiplier : Math.min(5, e.multiplier + 1);
      bp *= mult;
    }
    if (v.charge && move.type === 'Electric' && move.category !== 'Status') bp *= 2;
    if (SOLAR.has(move.id) && ['rain', 'sand', 'snow', 'hail'].includes(b?.weather)) bp *= .5;
    return bp * canHit(user, target, move).multiplier;
  }
  function before(battle, user, target, move, shared) {
    shared.attempted = true; shared.actualMove = move;
    const v = user.volatile;
    if (move._isRecharge) {
      delete v.recharging; shared.resting = true;
      battle.say(`${user.name} 需要休息，正在恢复行动能力！`); return true;
    }
    if (move.id !== 'furycutter') delete v.furyCutter;
    if (move.id === 'furycutter' && v.furyCutter && battle.turnCount - v.furyCutter.lastTurn > 1) delete v.furyCutter;
    if (move.id === 'bide' && !move._isZ && !move._isMax) {
      const state = v.bideState;
      if (!state) {
        v.bideState = { remaining: 2, damage: 0, source: null, template: copyTemplate(move) };
        shared.storingBide = true; battle.say(`${user.name} 开始忍耐，积蓄受到的攻击伤害！`); return true;
      }
      if (state.remaining > 0) { shared.storingBide = true; battle.say(`${user.name} 正在忍耐……`); return true; }
      delete v.bideState;
      const foes = battle.activeMons(battle.other(battle.sideOf(user)));
      const foe = active(state.source) && foes.includes(state.source) ? state.source : foes[0];
      if (!foe || !state.damage) { battle.say('但是失败了！（没有积蓄攻击伤害）'); return true; }
      if (foe.volatile.protect || !canHit(user, foe, move).allowed) { battle.say(`${foe.name} 避开了忍耐的反击！`); return true; }
      const attack = { ...move, target: 'normal', ignoreImmunity: true, type: 'Normal' };
      const beforeHp = foe.hp, dealt = battle.applyMoveDamage(foe, state.damage * 2, user, attack);
      if (dealt > 0) battle.onDamagingHit(user, foe, attack, dealt, false, 1, beforeHp);
      shared.anyHit = true; battle.say(`${user.name} 释放忍耐，反击了 ${state.damage * 2} 点伤害！`); return true;
    }
    if (!move._isZ && !move._isMax && CHARGE.has(move.id)) {
      if (move.flags?.gravity && battle.field.gravity > 0) { delete v.chargingMove; battle.say('重力使这招无法使用！'); return true; }
      if (v.chargingMove?.id === move.id) {
        delete v.chargingMove; shared.releasedCharge = true;
      } else {
        if (move.id === 'skullbash') battle.changeStages(user, { def: 1 }, user);
        if (['meteorbeam', 'electroshot'].includes(move.id)) battle.changeStages(user, { spa: 1 }, user);
        const fast = SOLAR.has(move.id) && battle.weather === 'sun' || move.id === 'electroshot' && battle.weather === 'rain';
        if (!fast && norm(user.item) === 'powerherb') {
          battle.consumeItem(user); battle.say(`${user.name} 消耗了强力香草，立即完成蓄力！`);
        } else if (!fast) {
          v.chargingMove = { id: move.id, semi: SEMI[move.id] || null, template: copyTemplate(move), targetSide: battle.sideOf(target), targetSlot: battle.activeSlots[battle.sideOf(target)]?.indexOf(battle.teams[battle.sideOf(target)].indexOf(target)) ?? 0 };
          shared.charging = true;
          battle.say(`${user.name} 正在为 ${move.name} 蓄力${SEMI[move.id] ? '，暂时隐入特殊位置' : ''}！`); return true;
        }
      }
    }
    if (move.id === 'echoedvoice') {
      const e = battle.field.echoedVoice;
      if (!e || e.lastTurn < battle.turnCount - 1) battle.field.echoedVoice = { lastTurn: battle.turnCount, multiplier: 1 };
      else if (e.lastTurn !== battle.turnCount) { e.lastTurn = battle.turnCount; e.multiplier = Math.min(5, e.multiplier + 1); }
    }
    // A sleeping Sleep Talk caller does not enter a multi-turn lock.
    if (!move._isZ && !move._isMax && move._calledBy !== 'sleeptalk' && user.status !== 'slp') {
      if (ROLL.has(move.id) && v.moveChain?.id !== move.id) v.moveChain = { id: move.id, name: move.name, kind: 'rollout', hits: 0, template: copyTemplate(move) };
      if (RAMPAGE.has(move.id) && v.moveChain?.id !== move.id) v.moveChain = { id: move.id, name: move.name, kind: 'rampage', remaining: 2 + Math.floor(battle.rng() * 2), template: copyTemplate(move) };
      if (move.id === 'uproar') {
        if (v.moveChain?.id !== move.id) v.moveChain = { id: move.id, name: move.name, kind: 'uproar', remaining: 3, template: copyTemplate(move) };
        for (const side of [0, 1]) for (const p of battle.activeMons(side)) if (p.status === 'slp') { p.status = null; p.sleepTurns = 0; battle.say(`${p.name} 被吵闹声惊醒了！`); }
      }
    }
    return false;
  }
  function finish(battle, user, base, shared = {}) {
    if (shared.lifecycleDone) return; shared.lifecycleDone = true;
    const v = user.volatile;
    if (shared.resting) return;
    if (!shared.attempted || !active(user)) { abort(user); return; }
    if (shared.charging) return;
    if (shared.storingBide) { if (v.bideState) v.bideState.remaining--; return; }
    const move = shared.actualMove || base, hit = !!shared.anyHit;
    if (v.moveChain && v.moveChain.id === move.id) {
      const state = v.moveChain;
      if (!hit || user.status === 'slp') delete v.moveChain;
      else if (state.kind === 'rollout') {
        if (++state.hits >= 5) { delete v.moveChain; battle.say(`${user.name} 完成了五次连续攻击！`); }
      } else if (--state.remaining <= 0) {
        delete v.moveChain;
        if (state.kind === 'rampage') battle.tryConfusion(user, user);
        else battle.say(`${user.name} 停止了吵闹。`);
      }
    }
    if (move.id === 'furycutter') {
      if (hit) v.furyCutter = { hits: Math.min(2, (v.furyCutter?.hits || 0) + 1), lastTurn: battle.turnCount };
      else delete v.furyCutter;
    }
    if (move.category !== 'Status') {
      if (move.type === 'Electric') delete v.charge;
      delete v.laserFocusUntil;
    }
    if (hit && move.flags?.recharge && !move._isZ && !move._isMax) {
      v.recharging = { source: move.id }; battle.say(`${user.name} 下一回合需要休息！`);
    }
  }
  function onDamage(target, source, damage) {
    if (target.volatile?.bideState && damage > 0 && source && source !== target) {
      target.volatile.bideState.damage += damage; target.volatile.bideState.source = source;
    }
  }
  function preventsSleep(battle) {
    return battle && [0, 1].some(side => battle.activeMons(side).some(p => p.volatile?.moveChain?.kind === 'uproar'));
  }
  function endTurn(battle, p) {
    if (p.volatile.laserFocusUntil != null && battle.turnCount >= p.volatile.laserFocusUntil) delete p.volatile.laserFocusUntil;
    if (p.volatile.furyCutter && p.volatile.furyCutter.lastTurn < battle.turnCount) delete p.volatile.furyCutter;
  }
  function hitCount(move, user, random = Math.random) {
    if (!Array.isArray(move.multihit)) {
      if (move.id === 'populationbomb' && norm(user.item) === 'loadeddice') return 4 + Math.floor(random() * 7);
      return move.multihit || 1;
    }
    const [min, max] = move.multihit;
    if (ability(user) === 'skilllink') return max;
    if (min === 2 && max === 5) {
      if (norm(user.item) === 'loadeddice') return 4 + Math.floor(random() * 2);
      const r = random(); return r < .35 ? 2 : r < .70 ? 3 : r < .85 ? 4 : 5;
    }
    return min + Math.floor(random() * (max - min + 1));
  }
  const details = {
    rollout: '最多连续攻击5次，威力30→60→120→240→480；变圆后再翻倍。后续攻击不耗PP；未命中、被挡下、无效或无法行动会中断。连续期间不能手动换招、换人、使用道具或逃走。',
    iceball: '与滚动相同的5次连续攻击机制；变圆后威力翻倍，后续攻击不耗PP，失败会中断。',
    furycutter: '连续成功使用时，威力40→80→160；每次消耗PP。换招、失败、无法行动或换人后重新累计。',
    echoedvoice: '场上连续回合有人使用时，威力40→80→120→160→200；同一回合多次使用不再叠加，空过一回合则重置。',
    charge: '特防提高1级，并使下一次电属性攻击威力翻倍；攻击后消耗充电效果。',
    laserfocus: '使下一回合结束前的下一次攻击必定击中要害（目标防要害特性等仍有效）。',
    bide: '锁定3个行动：前2次积蓄受到的攻击伤害，第3次向最后伤害来源返还2倍伤害；后续行动不耗PP。',
    uproar: '连续吵闹3回合，后续攻击不耗PP；场上的睡眠者会被惊醒，持续期间不能入睡。',
  };
  function description(move) {
    if (details[move.id]) return details[move.id];
    if (RAMPAGE.has(move.id)) return '连续攻击2或3回合，期间锁定招式且只在首次消耗PP；正常结束后陷入混乱。';
    if (CHARGE.has(move.id)) return '第一回合蓄力，第二回合完成招式；第二回合不消耗PP。强力香草可跳过蓄力；日光束/日光刃在晴天下、电光束在雨天下立即攻击。';
    if (move.flags?.recharge) return '成功命中后，下一回合必须休息，不能行动或主动换人。';
    if (MULTI_ACCURACY.has(move.id)) return '逐击检查命中；三连踢/三旋击的逐击威力为基础威力的1、2、3倍。';
    return '';
  }
  return { version: VERSION, ROLL, RAMPAGE, CHARGE, MULTI_ACCURACY, lockInfo, forcedMove, actionReason, abort, canHit, power, before, finish, onDamage, preventsSleep, endTurn, hitCount, description };
});
