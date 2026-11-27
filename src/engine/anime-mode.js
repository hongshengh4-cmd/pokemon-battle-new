/* 动画式指令层（Anime Command Layer）
 * 叠加在固定版 Pokémon Showdown 规则内核之上：只通过 PS 自己的事件钩子（volatile / format handler）生效，
 * 不改任何 PS 招式、特性、道具数据。场景未开启 animeMode 时完全不安装，规则 = 100% 原版 Showdown。
 * 由 battle-showdown-adapter 在创建 PS.Battle 后调用 install()；仅单打。
 * SPDX-License-Identifier: MIT
 */
var AnimeMode = (() => {
  'use strict';
  const VERSION = 'anime-command-v2';
  const SPIRIT_MAX = 5, SPIRIT_START = 2;

  const CMDS = {
    dodge:   {id: 'dodge',   zh: '躲开！',   cost: 2, icon: '💨',
      short: '本回合闪避对手的招式，成功后反击更猛',
      desc: '本回合对手瞄准自己的招式，有一定几率被直接躲开（越快越容易躲；必中招式躲不开）。代价：自己本回合后出手。躲开成功后，这回合自己的招式威力×1.2、更容易击中要害（闪身反击）。'},
    terrain: {id: 'terrain', zh: '利用地形', cost: 2, icon: '⛰️',
      short: '借助场地：效果随地点变化',
      desc: '借助战场环境，效果随地点变化（见下方地形表）。'},
    power:   {id: 'power',   zh: '全力一击', cost: 3, icon: '🔥',
      short: '招式威力×1.5，但命中×0.8',
      desc: '把全部力量灌进这一击：攻击招式威力×1.5，但命中率×0.8（大招容易打空）。变化招式不能用全力。'},
    endure:  {id: 'endure',  zh: '坚持住！', cost: 3, icon: '❤️‍🔥', once: true,
      short: '本回合若被打倒，按羁绊几率留 1 HP',
      desc: '本回合若被招式打倒，按与训练家的羁绊几率以 1 HP 撑住，并进入「绝境爆发」（攻击、特攻各+1）。每只宝可梦每场限一次。'}
  };

  const ENV = {
    water:  {zh: '水域', cmdName: '借助水池',
      boost: {Water: 1.5, Electric: 1.3}, fireTaken: 0.5,
      lines: ['水系招式威力×1.5（借水势）', '电系招式×1.3（电流顺着水面传导，对不着地的目标无效）', '受到的火系伤害减半（潜入水中）'],
      shout: (n) => `${n}，借助水池！`},
    rock:   {zh: '岩地', cmdName: '躲到岩石后',
      boost: {Rock: 1.3, Ground: 1.3, Fighting: 1.3}, dmgTaken: 0.6,
      lines: ['本回合受到的伤害×0.6（以岩石为掩护）', '岩石、地面、格斗系招式×1.3（借助岩块）'],
      shout: (n) => `${n}，躲到岩石后面！`},
    forest: {zh: '草丛', cmdName: '藏进草丛',
      boost: {Grass: 1.3, Bug: 1.3, Poison: 1.3}, accTaken: 0.7, dodgeBonus: 0.1,
      lines: ['对手瞄准自己的命中率×0.7（藏身草木）', '草、虫、毒系招式×1.3', '常驻：在草丛里「躲开！」成功率+10%'],
      shout: (n) => `${n}，藏进草丛！`},
    plain:  {zh: '空地', cmdName: '借助场地',
      boost: {Normal: 1.2, Fighting: 1.2, Flying: 1.2}, dmgTaken: 0.8,
      lines: ['本回合受到的伤害×0.8（利用场地起伏卸力）', '一般、格斗、飞行系招式×1.2（借助助跑与地势）'],
      shout: (n) => `${n}，利用场地！`}
  };

  const AUTO = [
    {id: 'soaked', zh: '湿透', desc: '被水系招式击中后 2 回合内「湿透」：受到的电系招式×1.3、冰系×1.2，火系×0.7。'}
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function dodgeChance(me, foe, env, outside) {
    // outside=true：在 PS 事件之外（AI 预估）调用，只取含能力等级的实数值，不触发事件
    const r = me.getStat('spe', false, !!outside) / Math.max(1, foe.getStat('spe', false, !!outside));
    let p = 0.30 + 0.30 * (r - 1);
    if (env && ENV[env] && ENV[env].dodgeBonus) p += ENV[env].dodgeBonus;
    return clamp(p, 0.15, 0.75);
  }

  /* 在 PS.Battle 创建之后、第一次 makeChoices 之前调用 */
  function install(battle, ctx) {
    // ctx = {env:'water'|'rock'|'forest', bond:[p1%, p2%], on:()=>bool}
    // 可在对战中途调用（开关打开时）；同一场只注册一次，之后只更新 ctx。
    if (battle.__animeCtx) { Object.assign(battle.__animeCtx, ctx); return battle.__animeCtx; }
    battle.__animeCtx = ctx;
    const C = battle.dex.data.Conditions;
    const reg = (id, o) => { C[id] = o; battle.dex.conditions.conditionCache.delete(id); };
    const envOf = () => ENV[ctx.env] || null;

    reg('animedodge', {
      name: 'Anime Dodge', duration: 1,
      onModifyPriority(pr) { return pr - 1; },
      onAccuracyPriority: -20,
      onAccuracy(acc, target, source, move) {
        if (!source || source === target || source.side === target.side) return;
        const st = this.effectState;
        if (typeof acc !== 'number') { if (acc === true && move && move.category !== 'Status' && !st.blockedSaid) { st.blockedSaid = true; this.add('-anime', 'dodgeblocked', target); } return; }
        const p = dodgeChance(target, source, ctx.env);
        if (this.randomChance(Math.round(p * 100), 100)) { st.dodged = true; this.add('-anime', 'dodge', target, Math.round(p * 100)); return 0; }
        this.add('-anime', 'dodgefail', target, Math.round(p * 100));
        return acc;
      },
      onBasePowerPriority: 21,
      onBasePower(bp, src, tgt, move) { if (this.effectState.dodged) { this.add('-anime', 'counter', src); return this.chainModify(1.2); } },
      onModifyCritRatio(cr) { if (this.effectState.dodged) return cr + 1; }
    });

    reg('animeterrain', {
      name: 'Anime Terrain', duration: 1,
      onBasePowerPriority: 21,
      onBasePower(bp, src, tgt, move) {
        const E = envOf(); if (!E) return;
        let m = E.boost[move.type] || 1;
        if (move.type === 'Electric' && ctx.env === 'water' && tgt && !tgt.isGrounded()) m = 1;
        if (m !== 1) { this.add('-anime', 'terrainboost', src, move.type, m); return this.chainModify(m); }
      },
      onSourceModifyDamage(dmg, src, tgt, move) {
        const E = envOf(); if (!E) return;
        if (E.dmgTaken) { this.add('-anime', 'cover', tgt); return this.chainModify(E.dmgTaken); }
        if (E.fireTaken && move.type === 'Fire') { this.add('-anime', 'cover', tgt); return this.chainModify(E.fireTaken); }
      },
      onAccuracy(acc, target, source, move) {
        const E = envOf();
        if (!E || !E.accTaken || typeof acc !== 'number' || !source || source.side === target.side) return;
        this.add('-anime', 'hide', target);
        return Math.round(acc * E.accTaken);
      }
    });

    reg('animepower', {
      name: 'Anime Power', duration: 1,
      onBasePowerPriority: 22,
      onBasePower(bp, src, tgt, move) { if (move.category !== 'Status') { this.add('-anime', 'powerhit', src); return this.chainModify(1.5); } },
      onSourceModifyAccuracyPriority: -5,
      onSourceModifyAccuracy(acc) { if (typeof acc === 'number') return this.chainModify(0.8); }
    });

    reg('animeendure', {
      name: 'Anime Endure', duration: 1,
      onDamagePriority: -10,
      onDamage(damage, target, source, effect) {
        const st = this.effectState;
        if (st.done || !effect || effect.effectType !== 'Move' || damage < target.hp) return;
        st.done = true;
        const bond = ctx.bondOf ? ctx.bondOf(target) : (ctx.bond?.[target.side.n] || 50);
        if (this.randomChance(bond, 100)) { st.burst = true; this.add('-anime', 'endure', target, bond); return target.hp - 1; }
        this.add('-anime', 'endurefail', target, bond);
      },
      onDamagingHit(damage, target) {
        const st = this.effectState;
        if (st.burst && !st.boosted) { st.boosted = true; this.add('-anime', 'burst', target); this.boost({atk: 1, spa: 1}, target, target); }
      }
    });

    reg('animesoaked', {
      name: 'Anime Soaked', duration: 3,
      onStart(p) { this.add('-anime', 'soaked', p); },
      onSourceBasePowerPriority: 18,
      onSourceBasePower(bp, attacker, defender, move) {
        const m = {Electric: 1.3, Ice: 1.2, Fire: 0.7}[move.type];
        if (m) { this.add('-anime', 'soakhit', defender, move.type); return this.chainModify(m); }
      },
      onEnd(p) { if (p.hp > 0) this.add('-anime', 'dry', p); }
    });

    // 自动联动：水系招式命中 → 湿透（作为 format 级事件，仅动画模式安装）
    const fmt = battle.format, prev = fmt.onDamagingHit;
    fmt.onDamagingHit = function (damage, target, source, move) {
      if (prev) prev.call(this, damage, target, source, move);
      if (ctx.on && !ctx.on()) return;
      if (move && move.type === 'Water' && target.hp > 0 && !target.volatiles['animesoaked']) target.addVolatile('animesoaked');
    };
    return ctx;
  }

  /* 回合开始前，把双方选择的指令挂到在场宝可梦上 */
  function apply(battle, side, cmd) {
    const p = battle.sides[side].active[0];
    if (!p || p.fainted || !cmd) return false;
    const id = {dodge: 'animedodge', terrain: 'animeterrain', power: 'animepower', endure: 'animeendure'}[cmd];
    return !!p.addVolatile(id);
  }

  /* ---------------- 对手（NPC）指令 v2 ----------------
   * 只有「馆主」及以上档位的训练家会下指令；野生宝可梦、新人/普通/资深训练家一律不会。
   * 决策 = 估算每条指令本回合带来的收益（击倒概率、承受伤害、先后手、斗志机会成本），
   * 收益不够就不下令——不会为了用而用。档位越高：估算越准、注意力越集中、会留斗志给「坚持住！」、
   * 起始斗志与羁绊越高；宝可梦大师读取玩家真实配置（与其 AI 搜索的信息边界一致），其余档位只用公开信息：
   * 玩家宝可梦已公开使用过的招式 + 按其属性推测的本系招式，能力值按种族值估算（不读努力值/个体值/性格）。 */
  const ALL_CMDS = ['dodge', 'terrain', 'power', 'endure'];
  const TIER_CMD = {
    leader:   {label: '馆主',       start: 1, bond: 60, attn: .62, noise: .30, margin: .20, lambda: .10, cmds: ['terrain', 'power', 'endure'], plan: false, omni: false,
      skill: '会在明显的时机下令（大招补刀、濒死撑住），偶尔看漏时机；不会用「躲开！」'},
    ace:      {label: '精英',       start: 1, bond: 66, attn: .78, noise: .20, margin: .15, lambda: .09, cmds: ALL_CMDS, plan: false, omni: false,
      skill: '四种指令都会用，判断较准，偶尔看漏时机'},
    elite:    {label: '天王',       start: 2, bond: 72, attn: .90, noise: .10, margin: .10, lambda: .08, cmds: ALL_CMDS, plan: true, omni: false,
      skill: '计算先后手与击倒线，会为王牌留斗志'},
    champion: {label: '冠军',       start: 2, bond: 78, attn: 1,   noise: .04, margin: .07, lambda: .07, cmds: ALL_CMDS, plan: true, omni: false,
      skill: '几乎不看漏时机，精确计算击倒线、先后手和躲闪率'},
    master:   {label: '宝可梦大师', start: 3, bond: 84, attn: 1,   noise: 0,   margin: .05, lambda: .06, cmds: ALL_CMDS, plan: true, omni: true,
      skill: '知道你队伍的真实配置，指令时机最精准'}
  };
  const tierCmd = t => TIER_CMD[t] || null;

  function eff(b, type, p) { try { if (!b.dex.getImmunity(type, p)) return 0; return Math.pow(2, b.dex.getEffectiveness(type, p)); } catch (e) { return 1; } }
  const BOOST = n => n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
  // 公开估算的能力值：种族值 + 等级 + 默认养成（IV31 / EV84 / 无性格修正）+ 公开的能力等级与异常状态
  function pubStat(p, stat) {
    const B = p.species?.baseStats?.[stat] || 80, L = p.level || 50;
    if (stat === 'hp') return Math.floor((2 * B + 31 + 21) * L / 100) + L + 10;
    let v = Math.floor((2 * B + 31 + 21) * L / 100) + 5;
    v *= BOOST(p.boosts?.[stat] || 0);
    if (stat === 'spe' && p.status === 'par') v *= .5;
    return v;
  }
  const realStat = (p, stat) => p.getStat(stat, false, true);
  function estDmg(b, src, tgt, m, srcPub, tgtPub) {
    if (!m || m.category === 'Status' || !m.basePower) return 0;
    const phys = m.category === 'Physical';
    const A = (srcPub ? pubStat : realStat)(src, phys ? 'atk' : 'spa'), D = (tgtPub ? pubStat : realStat)(tgt, phys ? 'def' : 'spd');
    let d = Math.floor(Math.floor(Math.floor(2 * src.level / 5 + 2) * m.basePower * A / Math.max(1, D)) / 50) + 2;
    if (phys && src.status === 'brn' && !src.hasAbility?.('guts')) d *= .5;
    return d * (src.hasType(m.type) ? 1.5 : 1) * eff(b, m.type, tgt);
  }
  const accOf = m => m.accuracy === true ? 1 : (m.accuracy || 100) / 100;
  // 最高伤害 dmgMax（随机数 1.00）时，以 0.85–1.00 均匀伤害浮动击倒 hp 的概率
  const koP = (dmgMax, hp) => dmgMax <= 0 ? 0 : clamp((dmgMax - hp) / (0.15 * dmgMax), 0, 1);
  function gauss(rnd) { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* 估算四条指令本回合的收益（单位：≈ 击倒一只宝可梦的价值）。只读公开信息（omni 档除外）。 */
  function commandGains(b, side, o) {
    const me = b.sides[side].active[0], foe = b.sides[1 - side].active[0];
    if (!me || !foe || me.fainted || foe.fainted) return null;
    const T = o.profile || TIER_CMD.champion, omni = !!T.omni, E = ENV[o.env] || ENV.plain;
    const m = o.moveId ? b.dex.moves.get(o.moveId) : null;
    const atk = !!(m && m.category !== 'Status' && m.basePower > 0);
    const mHP = Math.max(1, me.hp), fHP = Math.max(1, foe.hp);
    const myMax = atk ? estDmg(b, me, foe, m, false, !omni) : 0, myAcc = atk ? accOf(m) : 0;
    // 对方可能用的招式：大师 = 真实招式；其他档 = 已公开招式 + 本系推测招式（威力 80）
    let pool;
    if (omni) pool = foe.moveSlots.filter(x => x.pp > 0 && !x.disabled).map(x => b.dex.moves.get(x.id));
    else {
      const seen = (o.revealed || []).map(id => b.dex.moves.get(id)).filter(x => x && x.exists !== false);
      const phys = (foe.species?.baseStats?.atk || 0) >= (foe.species?.baseStats?.spa || 0);
      const guess = foe.getTypes().filter(t => t !== '???').map(t => ({id: 'guess' + t, type: t, basePower: 80, category: phys ? 'Physical' : 'Special', accuracy: 100, priority: 0}));
      pool = seen.concat(guess);
    }
    let worst = null, inc = 0, incExp = 0;
    for (const mv of pool) { const d = estDmg(b, foe, me, mv, !omni, false), e = d * accOf(mv); if (e > incExp) { incExp = e; inc = d; worst = mv; } }
    const incAcc = worst ? accOf(worst) : 0, alwaysHit = worst ? worst.accuracy === true : false;
    // 先后手
    const mySpe = realStat(me, 'spe'), foeSpe = omni ? realStat(foe, 'spe') : pubStat(foe, 'spe');
    const tr = !!b.field?.pseudoWeather?.trickroom, pr = m?.priority || 0, fpr = worst?.priority || 0;
    const meFirst = pr !== fpr ? pr > fpr : (mySpe === foeSpe ? null : (mySpe > foeSpe) !== tr);
    const firstP = meFirst === null ? .5 : meFirst ? 1 : 0;
    const threat = koP(inc, mHP) * incAcc;
    // 我方招式的价值：击倒 1.3，未击倒按造成体力比例 ×0.6；pAct = 能出手的概率
    const V = (mul, accMul, first, survive) => {
      if (!atk) return 0;
      const k = koP(myMax * mul, fHP), pAct = first + (1 - first) * survive;
      return pAct * myAcc * accMul * (1.3 * k + (1 - k) * .6 * Math.min(1, myMax * mul * .925 / fHP));
    };
    const myKO = atk ? myAcc * koP(myMax, fHP) : 0;
    const foeActs = 1 - firstP * myKO;             // 我先手并击倒 → 对方本回合不出手
    const harm = (d, acc) => acc * (.6 * Math.min(1, d * .925 / mHP) + .7 * koP(d, mHP));
    const survive = 1 - threat;
    const base = V(1, 1, firstP, survive), H = harm(inc, incAcc) * foeActs;
    const g = {};
    if (atk) g.power = V(1.5, .8, firstP, survive) - base;
    // 利用地形：进攻加成 + 防守减伤 / 降命中
    let tg = 0;
    if (atk && E.boost[m.type]) { let mul = E.boost[m.type]; if (m.type === 'Electric' && o.env === 'water' && !foe.isGrounded()) mul = 1; tg += V(mul, 1, firstP, survive) - base; }
    if (worst) {
      const dm = E.dmgTaken || (E.fireTaken && worst.type === 'Fire' ? E.fireTaken : 1), am = alwaysHit ? 1 : (E.accTaken || 1);
      if (dm < 1 || am < 1) { const inc2 = inc * dm, acc2 = incAcc * am; tg += (H - harm(inc2, acc2) * foeActs) + (V(1, 1, firstP, 1 - koP(inc2, mHP) * acc2) - base); }
    }
    g.terrain = tg;
    // 躲开！：本回合后手（优先度 -1），躲开成功后闪身反击（×1.2、易要害）
    if (worst && !alwaysHit) {
      const r = mySpe / Math.max(1, foeSpe), dp = clamp(.30 + .30 * (r - 1) + (ENV[o.env]?.dodgeBonus || 0), .15, .75);
      const after = (1 - dp) * V(1, 1, 0, survive) + dp * V(1.3, 1, 0, 1);
      g.dodge = (H - (1 - dp) * harm(inc, incAcc)) + after - base; // 躲开后必定后手：原本能先手击倒的，反而会送对方先出手
    }
    // 坚持住！：只在可能被击倒时有价值；撑住后能出手 + 绝境爆发
    if (!o.endureUsed && threat > 0) {
      const save = threat * foeActs * ((o.bond || 60) / 100);
      g.endure = save * (.7 + .25) + (V(1, 1, firstP, survive + save) - base);
    }
    return {gains: g, meFirst, threat, myKO, atk, inc, mHP};
  }

  function aiCommand(b, side, o) {
    const T = o.profile || tierCmd(o.tier);
    if (!T) return null;                           // 野生 / 低档位：没有指令
    const rnd = o.rng || Math.random, sp = o.spirit;
    if (rnd() > T.attn) return null;               // 训练家这回合没抓住时机
    const ev = commandGains(b, side, {...o, profile: T});
    if (!ev) return null;
    let best = null, bestNet = T.margin;
    for (const id of T.cmds) {
      const c = CMDS[id], gain = ev.gains[id];
      if (gain == null || sp < c.cost) continue;
      if (id === 'power' && !ev.atk) continue;
      if (id === 'endure' && o.endureUsed) continue;
      let cost = T.lambda * c.cost * (sp >= SPIRIT_MAX ? .5 : 1);
      // 高档位：留 3 点斗志给这只宝可梦的「坚持住！」（它还没用过、对方有压制力时）
      if (T.plan && id !== 'endure' && !o.endureUsed && sp - c.cost < 3 && sp >= 3 && ev.inc >= ev.mHP * .45) cost += .12;
      const noisy = gain + (T.noise ? T.noise * (Math.abs(gain) + .15) * gauss(rnd) : 0);
      const net = noisy - cost;
      if (net > bestNet) { bestNet = net; best = id; }
    }
    return best;
  }
  /* 场景 → 地形：显式 env > 天气/场地 > 地名关键词 > 空地 */
  function inferEnv(cfg) {
    const ex = String(cfg?.animeEnv || cfg?.anime?.env || '').toLowerCase();
    if (ENV[ex]) return ex;
    const env = cfg?.environment || {}, w = String(env.weather || '').toLowerCase(), t = String(env.terrain || '').toLowerCase();
    if (/grass/.test(t)) return 'forest';
    if (/rain/.test(w)) return 'water';
    if (/sand/.test(w)) return 'rock';
    const text = [cfg?.title, cfg?.opponent, cfg?.event, cfg?.location, cfg?.rules?.opponent, cfg?.host?.intro].filter(Boolean).join(' ');
    if (/华蓝|水|海|湖|河|泳|浪|湾|岛|码头|渡/.test(text)) return 'water';
    if (/深灰|岩|洞|山|石|矿|月见|隧道/.test(text)) return 'rock';
    if (/森林|草|丛|花|树|自然|玉虹|常青|狩猎/.test(text)) return 'forest';
    return 'plain';
  }
  /* -anime 协议行 → 中文战报 */
  function describe(kind, name, a) {
    switch (kind) {
      case 'dodge': return `${name} 灵巧地躲开了攻击！（躲闪率 ${a[0]}%）`;
      case 'dodgefail': return `${name} 想躲开，但没来得及！（躲闪率 ${a[0]}%）`;
      case 'dodgeblocked': return `${name} 想躲开，但对手的招式必定命中！`;
      case 'counter': return `${name} 闪身反击！`;
      case 'terrainboost': return `${name} 借助地形，招式威力×${a[1]}！`;
      case 'cover': return `${name} 借着地形掩护，减轻了伤害！`;
      case 'hide': return `${name} 藏身其中，对手难以瞄准！`;
      case 'powerhit': return `${name} 使出了全力一击！`;
      case 'endure': return `${name} 回应训练家的呼喊，咬牙撑住了！（羁绊 ${a[0]}%）`;
      case 'endurefail': return `${name} 拼尽全力，还是没能撑住……（羁绊 ${a[0]}%）`;
      case 'burst': return `${name} 进入了绝境爆发！`;
      case 'soaked': return `${name} 全身湿透了！`;
      case 'soakhit': return `湿透的 ${name} 受到的冲击改变了！`;
      case 'dry': return `${name} 身上的水干了。`;
      default: return '';
    }
  }
  return {VERSION, CMDS, ENV, AUTO, SPIRIT_MAX, SPIRIT_START, TIER_CMD, tierCmd, install, apply, dodgeChance, aiCommand, commandGains, pubStat, inferEnv, describe};
})();
if (typeof module !== 'undefined') module.exports = AnimeMode;
if (typeof globalThis !== 'undefined') globalThis.AnimeMode = AnimeMode;
