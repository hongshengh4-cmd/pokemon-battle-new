// 连续/蓄力/硬直等招式生命周期、训练家个体身份、6选3 参赛名单。
// 使用网站自带的真实 moves.json / pokedex.json / typechart.js，而不是手写的假招式。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.PKMMechanics = { canonType: v => v || null, typeForZCrystal: () => null };
require('../src/engine/typechart.js');
require('../st-bridge/gender.js');
require('../st-bridge/ability-random.js');
const B = require('../src/engine/battle.js');
const Team = require('../src/engine/team-selection.js');
B.setData(require('../src/data/pokedex.json'), require('../src/data/moves.json'));

const mon = (sp, lv, moves, o = {}) => B.createPokemon(sp, lv, moves, o);
const fight = (p, e, o = {}) => new B.Battle(Array.isArray(p) ? p : [p], Array.isArray(e) ? e : [e], { seed: 7, difficulty: 'easy', ...o });
const alwaysHit = b => { const r = b.rng; b.rng = () => Math.min(r(), 0.5); return b; };
const move = (p, id) => p.moves.find(m => m.id === id);
const bp = (b, id) => B.effectiveBasePower(b.cur(0), b.cur(1), move(b.cur(0), id));
const use = (b, index = 0) => b.turn({ kind: 'move', index });
const tank = (moves = ['splash']) => mon('chansey', 100, moves);

test('滚动：5 次锁定，威力 30→60→120→240→480，只扣首次 PP，期间不能换招/换人/道具/逃跑/投球', () => {
  const geo = mon('geodude', 20, ['rollout', 'defensecurl']), b = alwaysHit(fight([geo, mon('pidgey', 20, ['tackle'])], tank(), { balls: { pokeball: 3 }, itemStock: { potion: 2 } }));
  const powers = [];
  for (let i = 0; i < 5; i++) {
    powers.push(bp(b, 'rollout'));
    if (i > 0) {
      assert.equal(b.lockInfo(geo)?.id, 'rollout');
      for (const action of [{ kind: 'switch', index: 1 }, { kind: 'item', id: 'potion' }, { kind: 'run' }, { kind: 'capture', ball: 'pokeball' }])
        assert.ok(b.actionReason(geo, action), JSON.stringify(action));
      // Even if the UI sent "Defense Curl", the engine continues Rollout.
      use(b, 1);
    } else use(b, 0);
  }
  assert.deepEqual(powers, [30, 60, 120, 240, 480]);
  assert.equal(move(geo, 'rollout').ppLeft, 19, '只在第一次消耗 PP');
  assert.equal(move(geo, 'defensecurl').ppLeft, 40, '锁定期间没有误用变圆');
  assert.equal(b.lockInfo(geo), null, '第 5 次后解除锁定');
  assert.equal(bp(b, 'rollout'), 30, '新一轮从头开始');
  use(b, 0); assert.equal(move(geo, 'rollout').ppLeft, 18, '新一轮重新扣 PP');
});

test('滚动 + 变圆：威力翻倍（60→…→960）；换下场后变圆清除', () => {
  const geo = mon('geodude', 20, ['rollout', 'defensecurl']), b = alwaysHit(fight([geo, mon('pidgey', 20, ['tackle'])], tank()));
  use(b, 1); assert.equal(bp(b, 'rollout'), 60);
  const powers = []; for (let i = 0; i < 5; i++) { powers.push(bp(b, 'rollout')); use(b, 0); }
  assert.deepEqual(powers, [60, 120, 240, 480, 960]);
  b.turn({ kind: 'switch', index: 1 }); b.turn({ kind: 'switch', index: 0 });
  assert.equal(bp(b, 'rollout'), 30);
});

test('滚动：被守住、未命中、无法行动都会中断并清空累计', () => {
  const geo = mon('geodude', 20, ['rollout']), b = alwaysHit(fight(geo, tank(['protect', 'splash'])));
  b.aiAction = () => ({ kind: 'move', index: 1 }); use(b);
  assert.equal(bp(b, 'rollout'), 60);
  b.aiAction = () => ({ kind: 'move', index: 0 }); use(b);
  assert.equal(b.lockInfo(geo), null); assert.equal(bp(b, 'rollout'), 30);

  const g2 = mon('geodude', 20, ['rollout']), b2 = fight(g2, tank()); b2.rng = () => 0.01; use(b2);
  assert.equal(bp(b2, 'rollout'), 60); b2.rng = () => 0.999; use(b2);
  assert.equal(b2.lockInfo(g2), null, '未命中中断'); assert.equal(bp(b2, 'rollout'), 30);

  const g3 = mon('geodude', 20, ['rollout']), b3 = alwaysHit(fight(g3, tank())); use(b3);
  g3.status = 'slp'; g3.sleepTurns = 3; use(b3);
  assert.equal(b3.lockInfo(g3), null, '睡着无法行动即中断');
});

test('梦话叫出的滚动：不进入连续、不累积威力、不扣滚动 PP', () => {
  const geo = mon('geodude', 20, ['sleeptalk', 'rollout'], { status: 'slp' }), b = alwaysHit(fight(geo, tank()));
  geo.status = 'slp'; geo.sleepTurns = 5;
  b.rng = () => 0.3; use(b, 0);
  assert.ok(b.log.some(x => /梦中使用了 Rollout/.test(x)), b.log.join('\n'));
  assert.equal(b.lockInfo(geo), null);
  assert.equal(move(geo, 'rollout').ppLeft, 20);
  assert.equal(move(geo, 'sleeptalk').ppLeft, 9);
  assert.equal(B.effectiveBasePower(geo, b.cur(1), { ...move(geo, 'rollout'), _calledBy: 'sleeptalk' }), 30);
});

test('冰球与滚动同一机制', () => {
  const p = mon('jigglypuff', 30, ['iceball']), b = alwaysHit(fight(p, tank()));
  const powers = []; for (let i = 0; i < 5; i++) { powers.push(bp(b, 'iceball')); use(b); }
  assert.deepEqual(powers, [30, 60, 120, 240, 480]); assert.equal(move(p, 'iceball').ppLeft, 19);
});

test('逆鳞：2～3 回合锁定，只扣一次 PP，结束后混乱', () => {
  const d = mon('dratini', 40, ['outrage', 'splash']), b = alwaysHit(fight(d, tank()));
  use(b, 0); let turns = 1;
  while (b.lockInfo(d) && turns < 5) { use(b, 1); turns++; }
  assert.ok(turns === 2 || turns === 3, `turns=${turns}`);
  assert.equal(move(d, 'outrage').ppLeft, 9); assert.equal(move(d, 'splash').ppLeft, 40);
  assert.ok(d.volatile.confusion > 0);
});

test('破坏光线：命中后下一回合硬直，不能行动或换人；未命中不硬直', () => {
  const s = mon('snorlax', 50, ['hyperbeam', 'splash']), b = alwaysHit(fight([s, mon('pidgey', 20, ['tackle'])], tank()));
  use(b, 0); assert.equal(b.lockInfo(s)?.kind, 'recharge');
  assert.ok(b.actionReason(s, { kind: 'switch', index: 1 }));
  const pp = move(s, 'hyperbeam').ppLeft; use(b, 0);
  assert.equal(move(s, 'hyperbeam').ppLeft, pp, '硬直回合不出招'); assert.equal(b.lockInfo(s), null);
  const s2 = mon('snorlax', 50, ['hyperbeam']), b2 = fight(s2, tank()); b2.rng = () => 0.999; use(b2);
  assert.equal(b2.lockInfo(s2), null);
});

test('日光束：第一回合蓄力不伤害，第二回合攻击且不再扣 PP；晴天一回合完成', () => {
  const p = mon('bellsprout', 40, ['solarbeam']), foe = tank(), b = alwaysHit(fight(p, foe));
  const hp = foe.hp; use(b); assert.equal(foe.hp, hp); assert.equal(b.lockInfo(p)?.kind, 'charge');
  use(b); assert.ok(foe.hp < hp); assert.equal(move(p, 'solarbeam').ppLeft, 9); assert.equal(b.lockInfo(p), null);
  const p2 = mon('bellsprout', 40, ['solarbeam']), f2 = tank(), b2 = alwaysHit(fight(p2, f2, { weather: 'sun', weatherTurns: 5 }));
  const h2 = f2.hp; use(b2); assert.ok(f2.hp < h2); assert.equal(b2.lockInfo(p2), null);
});

test('飞翔：空中期间普通攻击打不中，起风可命中且威力翻倍', () => {
  const p = mon('pidgey', 30, ['fly']), foe = mon('chansey', 100, ['tackle', 'gust']), b = alwaysHit(fight(p, foe));
  b.aiAction = () => ({ kind: 'move', index: 0 });
  p.stats.spe = 999; const hp = p.hp; use(b);
  assert.equal(p.hp, hp, '撞击打不中空中目标');
  assert.equal(B.effectiveBasePower(foe, p, move(foe, 'gust')), 80);
  use(b); assert.equal(b.lockInfo(p), null); assert.equal(move(p, 'fly').ppLeft, 14);
});

test('连斩 40→80→160 且每次扣 PP；三连踢打满 3 击且逐击判定命中', () => {
  const p = mon('scyther', 40, ['furycutter']), b = alwaysHit(fight(p, tank()));
  const powers = []; for (let i = 0; i < 4; i++) { powers.push(bp(b, 'furycutter')); use(b); }
  assert.deepEqual(powers, [40, 80, 160, 160]); assert.equal(move(p, 'furycutter').ppLeft, 16);
  const h = mon('hitmonlee', 40, ['triplekick']), b2 = fight(h, tank()); b2.rng = () => 0.4; use(b2);
  assert.ok(b2.log.includes('击中了 3 次！'), b2.log.join('\n'));
  const h3 = mon('hitmonlee', 40, ['triplekick']), b3 = fight(h3, tank()); b3.rng = () => (b3.log.includes('效果绝佳！') ? 0.999 : 0.4); use(b3);
  assert.ok(b3.log.some(x => /后续攻击没有命中/.test(x)), '逐击命中判定：第二击可落空 ' + b3.log.join('|'));
});

test('忍耐：两次积蓄后第三次返还 2 倍伤害，后续不扣 PP', () => {
  const p = mon('snorlax', 50, ['bide']), foe = mon('geodude', 40, ['tackle']), b = alwaysHit(fight(p, foe));
  b.aiAction = () => ({ kind: 'move', index: 0 });
  const start = p.hp; use(b); use(b);
  const taken = start - p.hp, foeHp = foe.hp; use(b);
  assert.ok(taken > 0); assert.equal(foeHp - foe.hp, Math.min(foeHp, taken * 2));
  assert.equal(move(p, 'bide').ppLeft, 9);
});

test('训练家个体：缺失性别按种族生成且可复现；合法既有性别与无性别 N 保留；特性不固定第一格', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => mon('pidgey', 10, ['tackle'], { generateIdentity: true, identitySeed: `gym#${i}` }));
  assert.ok(seeds.every(p => ['M', 'F'].includes(p.gender)));
  assert.ok(new Set(seeds.map(p => p.gender)).size === 2);
  assert.equal(mon('pidgey', 10, ['tackle'], { generateIdentity: true, identitySeed: 'x' }).gender, mon('pidgey', 10, ['tackle'], { generateIdentity: true, identitySeed: 'x' }).gender);
  assert.equal(mon('magnemite', 10, ['tackle'], { generateIdentity: true, identitySeed: 'm' }).gender, 'N');
  assert.equal(mon('pidgey', 10, ['tackle'], { gender: 'F', generateIdentity: true, identitySeed: 'x' }).gender, 'F');
  assert.equal(mon('pidgey', 10, ['tackle']).gender, null, '玩家已有个体不在引擎里被补随机');
  const abilities = new Set(Array.from({ length: 40 }, (_, i) => mon('geodude', 10, ['tackle'], { generateIdentity: true, identitySeed: `a${i}` }).ability));
  assert.ok(abilities.has('rockhead') && abilities.has('sturdy'), [...abilities].join());
  assert.ok(!abilities.has('sandveil'), '隐藏特性不随机给出');
  assert.equal(mon('geodude', 10, ['tackle'], { ability: 'Sand Veil' }).ability, 'sandveil', '已有合法隐藏特性保留');
});

test('6选3：必须恰好选 3 只健康、不重复成员；顺序即出场顺序；原队伍格号不变', () => {
  const party = ['geodude', 'pidgey', 'bellsprout', 'snorlax', 'jigglypuff', 'magnemite'].map((s, i) => Object.assign(mon(s, 20, ['tackle']), { hostSlot: i }));
  party[1].hp = 0; party[1].fainted = true;
  assert.equal(Team.required(party, 3), 3);
  const picked = Team.select(party, [4, 0, 5], 3);
  assert.deepEqual(picked.map(p => p.hostSlot), [4, 0, 5]); assert.equal(picked[0], party[4]);
  for (const bad of [[0, 2], [0, 2, 3, 4], [0, 0, 2], [0, 1, 2], [0, 2, 9]]) assert.throws(() => Team.validate(party, bad, 3), String(bad));
  assert.equal(Team.required(party.slice(0, 2), 3), 1, '健康成员不足时按实际可用数');
  const b = fight(picked, tank()); assert.equal(b.cur(0).speciesId, 'jigglypuff');
});
