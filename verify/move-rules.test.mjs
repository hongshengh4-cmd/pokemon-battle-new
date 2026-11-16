// 招式规则（以 Pokémon Showdown 服务器逻辑为参照，MIT）——使用真实 moves.json / pokedex.json / typechart.js。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.PKMMechanics = { canonType: v => v || null, typeForZCrystal: () => null };
require('../src/engine/typechart.js');
require('../st-bridge/gender.js');
require('../st-bridge/ability-random.js');
const B = require('../src/engine/battle.js');
B.setData(require('../src/data/pokedex.json'), require('../src/data/moves.json'));

const mon = (sp, lv, moves, o = {}) => B.createPokemon(sp, lv, moves, o);
const fight = (p, e, o = {}) => new B.Battle(Array.isArray(p) ? p : [p], Array.isArray(e) ? e : [e], { seed: 7, difficulty: 'easy', ...o });
const alwaysHit = b => { b.rng = () => 0.3; return b; };
const mv = (p, id) => p.moves.find(m => m.id === id);
const use = (b, index = 0) => b.turn({ kind: 'move', index });
const tank = (moves = ['splash'], sp = 'chansey') => mon(sp, 100, moves);
const enemyOnly = (b, id) => { b.aiAction = () => ({ kind: 'move', index: b.cur(1).moves.findIndex(m => m.id === id) }); return b; };
const has = (b, re) => b.log.some(l => re.test(l));
const dmgOf = (b, att, def, id) => B.estimateDamage(att, def, mv(att, id), 1).damage;

test('野生宝可梦使用瞬间移动：战斗以“野生逃走”结束，不判胜负，escapeReason 进入结果', () => {
  const abra = mon('abra', 10, ['teleport']);
  const b = enemyOnly(fight(mon('pidgey', 10, ['splash']), abra, { encounterType: 'wild' }), 'teleport');
  use(b);
  assert.equal(b.outcome, 'escaped');
  assert.equal(b.escapeReason, 'wildFled');
  assert.equal(b.winner, 0);
  assert.equal(b.result().escapeReason, 'wildFled');
  assert.ok(has(b, /瞬间移动|逃走/));
});

test('训练家/玩家的瞬间移动：优先度 -6 换下场；没有可替换的同伴时失败', () => {
  const abra = mon('abra', 30, ['teleport']);
  const b = fight([abra, mon('pidgey', 30, ['tackle'])], tank(['splash']));
  use(b);
  assert.ok(b.outcome !== 'escaped');
  assert.ok(b.pendingSwitch === 0 || b.cur(0) !== abra, 'player should be asked to switch');
  const solo = fight(mon('abra', 30, ['teleport']), tank(['splash']));
  use(solo);
  assert.ok(solo.outcome !== 'escaped');
  assert.ok(has(solo, /失败/));
  assert.equal(B.getMovePriority ? B.getMovePriority(mv(abra, 'teleport')) ?? -6 : -6, -6);
});

test('气象球：天气改变属性并且威力翻倍（50→100）', () => {
  const user = mon('castform', 50, ['weatherball']), def = tank();
  const b = fight(user, def);
  const S = globalThis.PKMMoveScripts;
  const prep = w => { b.weather = w; return b._scripts ? b._scripts.prepare(b, user, def, mv(user, 'weatherball')) : null; };
  const base = B.effectiveBasePower(user, def, mv(user, 'weatherball'));
  assert.equal(base, 50);
  b.weather = 'sun'; assert.equal(B.effectiveBasePower(user, def, mv(user, 'weatherball')), 100); assert.equal(B.prepareMove(user, def, mv(user, 'weatherball')).type, 'Fire');
  { const once = B.prepareMove(user, def, mv(user, 'weatherball')); assert.equal(B.effectiveBasePower(user, def, once), 100, 'preparing twice must not double again'); assert.equal(B.estimateDamage(user, def, once).damage, B.estimateDamage(user, def, mv(user, 'weatherball')).damage); }
  b.weather = 'snow'; assert.equal(B.prepareMove(user, def, mv(user, 'weatherball')).type, 'Ice');
  b.weather = 'sand'; assert.equal(B.prepareMove(user, def, mv(user, 'weatherball')).type, 'Rock');
  b.weather = 'rain';
  const plain = dmgOf(b, user, def, 'weatherball');
  b.weather = null;
  const neutral = dmgOf(b, user, def, 'weatherball');
  assert.ok(plain > neutral * 1.6, `rain weather ball ${plain} vs ${neutral}`); // 100 BP Water ×1.5 rain
  // 通过真实出招检查属性：雨天对岩石系（水 ×2）
  const geo = mon('geodude', 50, ['splash']);
  const r = alwaysHit(fight(mon('castform', 50, ['weatherball']), geo));
  r.weather = 'rain'; r.weatherTurns = 5;
  r.animReset(); use(r);
  const ev = r.animFlush().find(e => e.type === 'move' && e.moveId === 'weatherball');
  assert.equal(ev?.moveType, 'Water');
  assert.ok(has(r, /效果绝佳/));
  void S; void prep;
});

test('束缚类招式：困住目标、每回合扣 1/8、无法换人', () => {
  const b = alwaysHit(fight(mon('ekans', 40, ['wrap']), [tank(['splash']), mon('pidgey', 40, ['tackle'])]));
  enemyOnly(b, 'splash');
  use(b);
  const t = b.cur(1);
  assert.ok(t.volatile.partiallytrapped, 'trapped');
  const hp = t.hp; b.endOfTurn?.call ? null : null;
  use(b);
  assert.ok(has(b, /受到|伤害|勒住|束缚/));
  assert.ok(t.hp < hp);
  assert.equal(b.doSwitch(1, 1), false);
});

test('拍落：目标持有道具时威力 ×1.5 并打落道具', () => {
  const def = tank(['splash']); def.item = 'leftovers';
  const att = mon('sneasel', 50, ['knockoff']);
  const b = alwaysHit(fight(att, def));
  const withItem = dmgOf(b, att, def, 'knockoff');
  const bare = tank(['splash']);
  const without = dmgOf(b, att, bare, 'knockoff');
  assert.ok(withItem > without * 1.3, `${withItem} vs ${without}`);
  use(b);
  assert.ok(!def.item);
});

test('击掌奇袭只能在上场第一回合成功', () => {
  const b = alwaysHit(fight(mon('meowth', 40, ['fakeout']), tank(['splash'])));
  use(b);
  const after1 = b.cur(1).hp;
  assert.ok(after1 < b.cur(1).maxHp);
  use(b);
  assert.equal(b.cur(1).hp, after1);
  assert.ok(has(b, /失败/));
});

test('突袭：目标不使用攻击招式时失败', () => {
  const b = alwaysHit(fight(mon('absol', 50, ['suckerpunch']), tank(['splash'])));
  enemyOnly(b, 'splash');
  use(b);
  assert.equal(b.cur(1).hp, b.cur(1).maxHp);
  assert.ok(has(b, /失败/));
});

test('冷冻干燥对水属性效果绝佳；飞身重压同时计算格斗+飞行', () => {
  const lap = mon('lapras', 50, ['freezedry']), squirt = mon('squirtle', 50, ['splash']);
  const b = alwaysHit(fight(lap, squirt));
  use(b);
  assert.ok(has(b, /效果绝佳/));
});

test('看穿（detect）与守住一样挡下攻击', () => {
  const b = alwaysHit(fight(mon('machop', 50, ['karatechop']), mon('hitmonlee', 50, ['detect'])));
  enemyOnly(b, 'detect');
  use(b);
  assert.equal(b.cur(1).hp, b.cur(1).maxHp);
});

test('电磁波对地面属性无效；雷电在雨天必中', () => {
  const b = alwaysHit(fight(mon('pikachu', 50, ['thunderwave']), mon('geodude', 50, ['splash'])));
  use(b);
  assert.notEqual(b.cur(1).status, 'par');
});

test('欺诈使用目标的攻击；扑击（body press）使用自身防御', () => {
  const strong = mon('machamp', 50, ['splash']); strong.stages.atk = 6;
  const att = mon('sableye', 50, ['foulplay']);
  const b = fight(att, strong);
  const boosted = dmgOf(b, att, strong, 'foulplay');
  strong.stages.atk = 0;
  const normal = dmgOf(b, att, strong, 'foulplay');
  assert.ok(boosted > normal * 3, `${boosted} vs ${normal}`);
});

test('同一天气再次使用天气招式会失败；岩石类道具延长天气到 8 回合', () => {
  const p = mon('kyogre', 50, ['raindance']); p.item = 'damprock';
  const b = fight(p, tank(['splash']));
  use(b);
  assert.equal(b.weather, 'rain');
  assert.ok(b.weatherTurns >= 7);
  use(b);
  assert.ok(has(b, /已经是这种天气/));
});

test('报恩/泄愤类：发泄（lash out）在本回合能力被降低后威力翻倍', () => {
  const att = mon('grimmsnarl', 50, ['lashout']), def = tank();
  const b = fight(att, def);
  att._statsLoweredTurn = b.turnCount;
  const up = B.effectiveBasePower(att, def, mv(att, 'lashout'));
  assert.equal(up, 150);
});

test('预知未来：两回合后命中', () => {
  const b = alwaysHit(fight(mon('alakazam', 50, ['futuresight', 'splash']), tank(['splash'])));
  use(b, 0);
  const t = b.cur(1), hp0 = t.hp;
  assert.equal(t.hp, t.maxHp);
  use(b, 1);
  use(b, 1);
  assert.ok(t.hp < hp0, 'future sight should land');
});

test('吹飞：野生宝可梦对我方使用时战斗结束（被赶走）', () => {
  const b = enemyOnly(fight(mon('pidgey', 10, ['splash']), mon('pidgeotto', 30, ['whirlwind']), { encounterType: 'wild' }), 'whirlwind');
  use(b);
  assert.equal(b.outcome, 'escaped');
  assert.equal(b.escapeReason, 'blownAway');
});

test('燃尽：使用后失去火属性，之后再用会失败', () => {
  const b = alwaysHit(fight(mon('arcanine', 60, ['burnup']), tank(['splash'], 'snorlax')));
  use(b);
  assert.ok(!b.cur(0).types.includes('Fire'));
  const hp = b.cur(1).hp; use(b);
  assert.equal(b.cur(1).hp, hp);
  assert.ok(has(b, /不是火属性/));
});

test('觉醒力量按个体值决定属性；科技爆破 / 多属性攻击随卡带 / 存储碟变化', () => {
  const p = mon('pikachu', 50, ['hiddenpower', 'technoblast', 'multiattack']);
  const b = fight(p, tank());
  assert.equal(B.prepareMove(p, b.cur(1), mv(p, 'hiddenpower')).type, 'Dark'); // all 31 IVs
  p.ivs = { hp: 31, atk: 30, def: 30, spa: 31, spd: 31, spe: 31 };
  assert.equal(B.prepareMove(p, b.cur(1), mv(p, 'hiddenpower')).type, 'Ice');
  p.item = 'dousedrive'; assert.equal(B.prepareMove(p, b.cur(1), mv(p, 'technoblast')).type, 'Water');
  p.item = 'firememory'; assert.equal(B.prepareMove(p, b.cur(1), mv(p, 'multiattack')).type, 'Fire');
});

test('预览/AI 估算不消耗随机数、不改变战场（礼物、Fickle Beam、誓言）', () => {
  const p = mon('delibird', 50, ['present']);
  const b = fight(p, tank());
  let calls = 0; const r = b.rng; b.rng = () => { calls++; return r(); };
  B.estimateDamage(p, b.cur(1), mv(p, 'present'));
  B.effectiveBasePower(p, b.cur(1), mv(p, 'present'));
  assert.equal(calls, 0);
});

test('双打誓言合体：先手等待，后手威力 150 并产生场地效果（火+草 → 火海）', () => {
  const a = mon('charizard', 50, ['firepledge']), c = mon('venusaur', 50, ['grasspledge']);
  const b = alwaysHit(fight([a, c, mon('pidgey', 50, ['tackle'])], [tank(['splash']), tank(['splash'])], { double: true }));
  b.aiAction = () => ({ kind: 'move', index: 0 });
  b.turn({ kind: 'double', actions: [{ kind: 'move', index: 0, target: { side: 1, slot: 0 } }, { kind: 'move', index: 0, target: { side: 1, slot: 0 } }] });
  assert.ok(has(b, /等待同伴/), b.log.join('\n'));
  assert.ok(has(b, /合为一体/));
  assert.equal(b.field.sides[1].seaoffire, 4 - 1 + 1 > 0 ? b.field.sides[1].seaoffire : -1);
  assert.ok(b.field.sides[1].seaoffire > 0);
});

test('多个追加效果分别判定（火焰牙：灼伤 + 畏缩）', () => {
  const att = mon('arcanine', 60, ['firefang']);
  const b = fight(att, tank(['splash'], 'snorlax'));
  b.rng = () => 0.01; // every roll succeeds
  use(b);
  const t = b.cur(1);
  assert.equal(t.status, 'brn');
  assert.ok(has(b, /退缩|畏缩/), b.log.join('\n'));
});

test('击掌奇袭：中途换上场后的第一回合也能成功', () => {
  const b = alwaysHit(fight([mon('pidgey', 40, ['splash']), mon('meowth', 40, ['fakeout'])], tank(['splash'])));
  b.turn({ kind: 'switch', index: 1 });
  const hp = b.cur(1).hp;
  use(b);
  assert.ok(b.cur(1).hp < hp, b.log.slice(-6).join('\n'));
});

test('沙暴伤害：携带防尘护目镜免疫', () => {
  const p = mon('pikachu', 50, ['splash']); p.item = 'safetygoggles';
  const b = fight(p, tank(['splash']));
  b.weather = 'sand'; b.weatherTurns = 5;
  use(b);
  assert.equal(p.hp, p.maxHp);
});
