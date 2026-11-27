// 高分天梯先验（human-prior-v2）与动画式训练家指令（anime-command-v1）的回归测试。
// 运行：node --test verify/expert-command.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis; globalThis.self = globalThis;
const SCRIPTS = ['src/data/official-names.js', 'src/engine/name-policy.js', 'src/engine/opponent-training.js', 'st-bridge/gender.js', 'st-bridge/battle-mechanics.js', 'src/engine/gear-resolve.js', 'st-bridge/ability-random.js', 'src/engine/ability-choice.js', 'src/engine/typechart.js', 'src/engine/mechanics.js', 'src/ui/mechanic-items.js', 'src/engine/move-lifecycle.js', 'src/engine/ps-move-data.js', 'src/engine/move-scripts.js', 'src/engine/team-selection.js', 'src/engine/battle.js', 'src/engine/showdown/ps-engine.js', 'src/engine/showdown/rule-text.js', 'src/engine/field-environment.js', 'src/engine/anime-mode.js', 'src/engine/battle-showdown-adapter.js', 'src/engine/team.js', 'src/data/presets.js'];
const quiet = console.log; console.log = () => {};
for (const s of SCRIPTS) vm.runInThisContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), {filename: s});
console.log = quiet;
const J = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', n + '.json')));
const dex = J('pokedex'), moves = J('moves'), learnsets = J('learnsets');
PKMBattle.setData(dex, moves); PKMTeam.setData(dex, moves, learnsets);
const HP = await import(pathToFileURL(path.join(ROOT, 'src/ai/expert/human-prior.mjs')).href + '?v=human-prior-v2');
const {EXPERT_WEIGHTS} = await import(pathToFileURL(path.join(ROOT, 'src/ai/expert/weights.mjs')).href);
const {FEATURES} = await import(pathToFileURL(path.join(ROOT, 'src/ai/expert/features.mjs')).href);

test('专家权重：特征表一致、仅含聚合参数', () => {
  assert.equal(HP.EXPERT_BUILD, 'human-prior-v2');
  assert.deepEqual(EXPERT_WEIGHTS.features, FEATURES);
  assert.ok(!JSON.stringify(EXPERT_WEIGHTS).match(/"(players?|p1|p2|userid|log)"/), '权重里不应含对局原文或玩家名');
  assert.equal(HP.EXPERT_LAMBDA.wild, 0, '野生宝可梦不使用天梯先验');
  for (const t of ['leader', 'ace', 'elite', 'champion']) assert.ok(HP.EXPLOIT_ALPHA[t] > 0 && HP.EXPLOIT_ALPHA[t] < .5);
});

test('读心混合：alpha=0 不改变均衡；alpha>0 只向“对人类预测回应的最优解”偏移', () => {
  const eq = [.5, .5], M = [[[0.9, 0.1], [0.4, 0.6]]], q = [[.8, .2]];
  assert.equal(HP.exploitMix(eq, M, q, 0), null);
  const r = HP.exploitMix(eq, M, q, .3);
  assert.ok(Math.abs(r.policy[0] + r.policy[1] - 1) < 1e-9);
  assert.ok(r.policy[0] > .5 && r.policy[0] <= .8, '应偏向对预测回应更好的行动，但保留均衡成分');
  HP.setExpertEnabled(false);
  try { assert.equal(HP.exploitMix(eq, M, q, .3), null); assert.equal(HP.blendRoot([{key: 'move:0', weight: 1}], null, null, null, .3).used, false); }
  finally { HP.setExpertEnabled(true); }
});

const FR = await import(pathToFileURL(path.join(ROOT, 'src/ai/expert/foe-reads.mjs')).href + '?v=foe-reads-v1');
const cands = () => [{k: 'move:a', l: 1.2, s: 0, r: 0}, {k: 'move:b', l: .4, s: 0, r: 1}, {k: 'move:c', l: -.3, s: 0, r: 0}, {k: 'switch:2', l: .1, s: 1, r: 0}, {k: 'switch:?', l: -.3, s: 1, r: 0}];
test('对手习惯读取：只点最大招、从不换人的玩家 → 集中度↑、换人倾向↓、读招力度↑', () => {
  const reads = Array.from({length: 12}, (_, t) => ({turn: t, k: 'move:a', cands: cands()}));
  const f = HP.fitAdaptation(reads);
  assert.ok(f.a > 1.2 && f.beta < -.3 && f.alphaScale > 1.15, JSON.stringify(f));
  HP.setFoeAdaptation({foeReads: reads});
  assert.ok(HP.exploitAlpha('champion') > HP.EXPLOIT_ALPHA.champion);
  HP.setFoeAdaptation(null);
  assert.equal(HP.exploitAlpha('champion'), HP.EXPLOIT_ALPHA.champion);
});
test('对手习惯读取：行为随机的玩家 → 读招力度下降；记录不足时不启用', () => {
  const ks = ['move:c', 'switch:?', 'move:b', 'switch:2', 'move:c', 'switch:?', 'move:a', 'move:c', 'switch:?', 'move:b', 'switch:2', 'move:c'];
  const f = HP.fitAdaptation(ks.map((k, t) => ({turn: t, k, cands: cands()})));
  assert.ok(f.alphaScale < 1, JSON.stringify(f));
  assert.equal(HP.fitAdaptation([{turn: 1, k: 'move:a', cands: cands()}]), null);
});
test('公开记录解析：只认已结算回合里玩家的第一个公开行动', () => {
  const ps = {log: ['|turn|3'], sides: [{pokemon: [{name: 'Pika', set: {_nativeIndex: 2}}]}, {pokemon: []}]};
  const mem = {pending: null, reads: []}, predict = {turn: 3, foe: 0, cands: cands()};
  FR.armFoeRead(mem, predict, ps); ps.log.push('|move|p2a: Mew|Psychic|p1a: Bulba', '|switch|p1a: Pika|Pikachu, L50|100/100', '|turn|4');
  assert.equal(FR.settleFoeRead(mem, ps, 0).k, 'switch:2');
  FR.armFoeRead(mem, predict, ps); ps.log.push('|move|p2a: Mew|Psychic|p1a: Pika', '|faint|p1a: Pika', '|switch|p1a: Bulba|Bulbasaur|100/100', '|turn|5');
  assert.equal(FR.settleFoeRead(mem, ps, 0), null, '先被击倒：没有公开选择');
  FR.armFoeRead(mem, predict, ps); ps.log.push('|move|p1a: Bulba|B|p2a: Mew', '|turn|6');
  assert.equal(FR.settleFoeRead(mem, ps, 0).k, 'move:b');
  assert.equal(mem.reads.length, 2);
});

const mk = () => [['blastoise', ['hydropump', 'icebeam', 'surf', 'earthquake']], ['pikachu', ['thunderbolt', 'quickattack', 'irontail', 'thunderwave']]]
  .map(([s, m]) => PKMBattle.createPokemon(s, 50, m, {generateIdentity: false}));

test('动画指令：默认不安装（规则 = 原版 Showdown），双打不安装', () => {
  assert.equal(new PKMBattle.Battle(mk(), mk(), {double: false, encounterType: 'trainer', seed: 5}).anime, null);
  assert.equal(new PKMBattle.Battle(mk(), mk(), {double: true, encounterType: 'trainer', seed: 5, anime: {env: 'rock'}}).anime, null);
});

test('动画指令：斗志门槛、只能配合招式、喊话入战报、斗志扣除', () => {
  const b = new PKMBattle.Battle(mk(), mk(), {double: false, encounterType: 'trainer', seed: 1, anime: {env: 'water', bond: [90, 50]}});
  assert.equal(b.anime.spirit[0], 2);
  let r = b.turn({kind: 'move', index: 0, anime: 'endure'});
  assert.ok(r.some(x => /斗志不足/.test(x)) && b.turnCount === 0, '斗志不足时不推进回合');
  r = b.turn({kind: 'switch', index: 1, anime: 'dodge'});
  assert.ok(r.some(x => /只能配合招式/.test(x)) && b.turnCount === 0);
  r = b.turn({kind: 'move', index: 3, anime: 'dodge'});
  assert.ok(r.some(x => /「.*躲开！」/.test(x)) && b.turnCount === 1);
  assert.equal(b.anime.used[0], 1);
});

test('动画指令：NPC 训练家会下指令，野生宝可梦不会；效果经 PS 事件结算并有中文战报', () => {
  const seen = new Set(); let npc = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const b = new PKMBattle.Battle(mk(), mk(), {double: false, encounterType: 'trainer', seed, anime: {env: 'water', tier: 'champion'}});
    for (let g = 0; g < 60 && b.winner === null; g++) {
      if (b.pendingSwitch !== null) { b.forceSwitch(b.replacementOptions()[0]); continue; }
      const cmd = ['endure', 'power', 'terrain', 'dodge'].find(c => !b.animeReason(c, {kind: 'move', index: 0})) || null;
      for (const x of b.turn({kind: 'move', index: 0, anime: cmd})) { const m = /(灵巧|没来得及|闪身|借助地形|掩护|全力一击|撑住|湿透)/.exec(x); if (m) seen.add(m[1]); }
    }
    npc += b.anime.used[1];
  }
  assert.ok(npc > 0, 'NPC 应使用指令');
  assert.ok(seen.size >= 4, '应出现多种指令战报：' + [...seen]);
  const w = new PKMBattle.Battle(mk().slice(0, 1), mk().slice(0, 1), {double: false, encounterType: 'wild', seed: 3, anime: {env: 'rock', tier: 'master'}});
  for (let i = 0; i < 8 && w.winner === null; i++) w.turn({kind: 'move', index: 0});
  assert.equal(w.anime.used[1], 0);
});

test('动漫指挥 v2：只有馆主及以上会下指令；档位越高起始斗志/羁绊越高；野生永远没有', () => {
  assert.equal(AnimeMode.VERSION, 'anime-command-v2');
  for (const tier of [null, 'novice', 'regular', 'veteran']) {
    const b = new PKMBattle.Battle(mk(), mk(), {double: false, encounterType: 'trainer', seed: 7, anime: {env: 'plain', tier}});
    assert.equal(b.anime.foeCmd, false, String(tier));
    for (let i = 0; i < 30 && b.winner === null; i++) { if (b.pendingSwitch !== null) { b.forceSwitch(b.replacementOptions()[0]); continue; } b.turn({kind: 'move', index: 0}); }
    assert.equal(b.anime.used[1], 0, String(tier) + ' 不应下指令');
    assert.equal(b.anime.spirit[1], 0, '没有指令能力的对手不积累斗志');
  }
  const order = ['leader', 'ace', 'elite', 'champion', 'master'].map(t => AnimeMode.TIER_CMD[t]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].start >= order[i - 1].start && order[i].bond > order[i - 1].bond, '起始斗志/羁绊随档位递增');
    assert.ok(order[i].noise <= order[i - 1].noise && order[i].attn >= order[i - 1].attn && order[i].margin <= order[i - 1].margin, '判断精度随档位递增');
  }
  assert.ok(!AnimeMode.TIER_CMD.leader.cmds.includes('dodge'));
  assert.ok(order.every((t, i) => t.omni === (i === 4)), '只有宝可梦大师读取玩家真实配置');
  const w = new PKMBattle.Battle(mk().slice(0, 1), mk().slice(0, 1), {double: false, encounterType: 'wild', seed: 3, anime: {env: 'water', tier: 'champion'}});
  assert.equal(w.anime.foeCmd, false); assert.equal(AnimeMode.aiCommand(w._ps, 1, {tier: 'wild', spirit: 5, env: 'water'}), null);
});

test('动漫指挥 v2：对战中途开关从下一回合生效；关掉再打开恢复原斗志，不能刷斗志', () => {
  const b = new PKMBattle.Battle(mk(), mk(), {double: false, encounterType: 'trainer', seed: 9});
  assert.equal(b.anime, null);
  b.turn({kind: 'move', index: 0});
  assert.ok(b.setAnime({env: 'water', tier: 'elite', bond: [70]}));
  assert.equal(b.anime.spirit[0], AnimeMode.SPIRIT_START); assert.equal(b.anime.spirit[1], AnimeMode.TIER_CMD.elite.start);
  const r = b.turn({kind: 'move', index: 0, anime: 'dodge'});
  assert.ok(r.some(x => /「.*躲开！」/.test(x)));
  const left = b.anime.spirit[0];
  b.setAnime(null); assert.equal(b.anime, null);
  assert.ok(b.turn({kind: 'move', index: 0, anime: 'dodge'}).every(x => !/「.*躲开！」/.test(x)), '关闭后不再结算指令');
  b.setAnime({env: 'water', tier: 'elite'}); assert.equal(b.anime.spirit[0], left, '恢复原来的斗志');
  assert.equal(new PKMBattle.Battle(mk(), mk(), {double: true, encounterType: 'trainer', seed: 9}).setAnime({env: 'rock'}), false);
});

test('动漫指挥 v2：不乱用——没有收益的局面不下令；有击倒威胁时会喊坚持住', () => {
  const b = new PKMBattle.Battle(mk(), mk(), {double: false, encounterType: 'trainer', seed: 11, anime: {env: 'plain', tier: 'master'}});
  const ps = b._ps, me = ps.sides[1].active[0], foe = ps.sides[0].active[0];
  const rng = () => .5;
  // 满血、对方威胁很小：变化招式（无攻击）时不该用全力/地形
  const quiet = AnimeMode.aiCommand(ps, 1, {tier: 'master', spirit: 5, env: 'plain', moveId: 'thunderwave', bond: 84, revealed: [], endureUsed: false, rng});
  assert.notEqual(quiet, 'power');
  // 残血且对方一击必杀：应当喊「坚持住！」
  me.hp = 5;
  const g = AnimeMode.commandGains(ps, 1, {profile: AnimeMode.TIER_CMD.master, spirit: 5, env: 'plain', moveId: 'hydropump', bond: 84, revealed: [], endureUsed: false});
  assert.ok(g.gains.endure > 0.3, JSON.stringify(g.gains));
  assert.equal(AnimeMode.aiCommand(ps, 1, {tier: 'master', spirit: 5, env: 'plain', moveId: 'hydropump', bond: 84, revealed: [], endureUsed: false, rng}), 'endure');
  assert.notEqual(AnimeMode.aiCommand(ps, 1, {tier: 'master', spirit: 2, env: 'plain', moveId: 'hydropump', bond: 84, revealed: [], endureUsed: false, rng}), 'endure', '斗志不足不能喊');
  // 非大师档：玩家宝可梦的未公开招式不进入估算
  foe.moveSlots.forEach(s => { s.pp = s.maxpp; });
  const pub = AnimeMode.commandGains(ps, 1, {profile: AnimeMode.TIER_CMD.champion, spirit: 5, env: 'plain', moveId: 'hydropump', bond: 78, revealed: []});
  assert.ok(pub && typeof pub.inc === 'number');
});

test('动画指令：地形推断', () => {
  assert.equal(AnimeMode.inferEnv({animeEnv: 'forest'}), 'forest');
  assert.equal(AnimeMode.inferEnv({environment: {weather: 'rain'}}), 'water');
  assert.equal(AnimeMode.inferEnv({title: '深灰道馆挑战'}), 'rock');
  assert.equal(AnimeMode.inferEnv({}), 'plain');
});

// ---- 局势估值（value-v1）：从天梯≥1800 对局胜负学习 ----
const VM = await import(pathToFileURL(path.join(ROOT, 'src/ai/expert/value-model.mjs')).href + '?v=value-v1');
const {VALUE_WEIGHTS, VALUE_EVAL} = await import(pathToFileURL(path.join(ROOT, 'src/ai/expert/value-weights.mjs')).href + '?v=value-v1');
const vside = (left, hp, extra = {}) => ({left, mons: Array.from({length: left}, (_, i) => ({hp: i === 0 ? hp : 1, status: ''})), act: {hp, status: '', boosts: {}, types: ['Water'], phys: false, spe: 80, level: 50}, field: {}, ...extra});
test('局势估值：反对称、对等局面为 0、剩余数量/体力越多越有利、钉子不利', () => {
  assert.ok(VALUE_WEIGHTS && VALUE_EVAL.linear.logloss < VALUE_EVAL.hand.logloss, '学习估值在留出对局上应优于原规则估值');
  const v = (A, B) => { const [a, b] = VM.valueVectors(A, B); return VM.valueLogit(VALUE_WEIGHTS, a, b); };
  assert.ok(Math.abs(v(vside(3, 1), vside(3, 1))) < 1e-9);
  const x = v(vside(3, .4), vside(2, 1)); assert.ok(Math.abs(x + v(vside(2, 1), vside(3, .4))) < 1e-9);
  assert.ok(v(vside(3, 1), vside(2, 1)) > 0 && v(vside(3, 1), vside(3, .5)) > 0);
  assert.ok(v(vside(3, 1, {field: {stealthrock: 1}}), vside(3, 1)) < 0);
});
test('局势估值：默认只用于冠军档，天王档可选开启，可关闭', () => {
  assert.equal(VM.valueBlend('champion'), 1); assert.equal(VM.valueBlend('elite'), 0); assert.equal(VM.valueBlend('leader'), 0);
  VM.setValueConfig({blend: {elite: 1}}); assert.equal(VM.valueBlend('elite'), 1); VM.setValueConfig({blend: {elite: 0}}); assert.equal(VM.valueBlend('regular'), 0);
  VM.setValueConfig({enabled: false}); assert.equal(VM.valueBlend('champion'), 0); VM.setValueConfig({enabled: true});
});

// ---- 宝可梦大师档（master-oracle-v1）：读取玩家完整配置 ----
const PROF = await import(pathToFileURL(path.join(ROOT, 'src/ai/profile.mjs')).href + '?v=npc-tier-wiring-v1&cmd=kanto-crown-v72');
const BV = await import(pathToFileURL(path.join(ROOT, 'src/ai/battle-view.mjs')).href + '?v=20261118-ai-elite-v3&cmd=kanto-crown-v72');
const BM = await import(pathToFileURL(path.join(ROOT, 'src/ai/belief-model.mjs')).href + '?v=20261118-ai-elite-v3&cmd=kanto-crown-v72');
const mkTeam = ids => ids.map(s => PKMBattle.createPokemon(s, 50, PKMTeam.chooseAutoMoves(s, 50), {generateIdentity: false}));
const masterBattle = () => new PKMBattle.Battle(mkTeam(['gengar', 'snorlax', 'starmie']), mkTeam(['alakazam', 'rhydon', 'lapras']), {double: false, difficulty: 'hard', encounterType: 'trainer', seed: 7});
const tierProfile = t => ({tier: t, label: PROF.TIERS[t].label, settings: {...PROF.TIERS[t]}, style: 'balanced', intent: 'serious'});
test('宝可梦大师：新档位存在，搜索预算与冠军相同，可从剧情 ai.tier 识别', () => {
  const m = PROF.TIERS.master, c = PROF.TIERS.champion;
  assert.equal(m.label, '宝可梦大师'); assert.equal(m.omniscient, true);
  for (const k of ['milliseconds', 'worlds', 'lookahead', 'nativeDepth', 'mistake']) assert.equal(m[k], c[k], k);
  assert.equal(PROF.searchTier('master'), 'champion'); assert.equal(PROF.searchTier('elite'), 'elite');
  assert.equal(PROF.tierOf('宝可梦大师'), 'master'); assert.equal(PROF.tierOf('master'), 'master');
  assert.equal(PROF.resolveTrainerAI({type: 'trainer', opponent: '测试', ai: {tier: 'master'}}).tier, 'master');
});
test('宝可梦大师：观测含玩家真实配置；冠军档仍只有公开信息', () => {
  const b = masterBattle();
  const blind = BV.observation(b, tierProfile('champion'), {});
  assert.equal(blind.oracle, undefined); assert.ok(blind.opponent.slice(1).every(p => p.unseen), '冠军看不到未出场队员');
  const v = BV.observation(b, tierProfile('master'), {});
  assert.equal(v.profile.tier, 'champion'); assert.equal(v.profile.master, true); assert.equal(v.profile.label, '宝可梦大师');
  assert.equal(v.oracle.team.length, 3);
  b.teams[0].forEach((p, i) => {
    const o = v.oracle.team[i];
    assert.equal(o.species, p.speciesId); assert.equal(o.item, p.item); assert.equal(o.ability, p.ability); assert.equal(o.nature, p.nature);
    assert.deepEqual(o.stats, p.stats); assert.deepEqual(o.moves.map(m => m.id), p.moves.map(m => m.id));
    assert.ok(!v.opponent[i].unseen); assert.deepEqual(v.opponent[i].moves.map(m => m.id), p.moves.map(m => m.id));
  });
  assert.ok(!/pendingChoice|_choice|prng|seed/.test(Object.keys(v).join(',')), '不含玩家本回合指令与随机数');
});
test('宝可梦大师：每个推演世界都是玩家真实队伍；冠军档仍是抽样假设', () => {
  const b = masterBattle(), db = {dex, moves, learnsets};
  const v = BV.observation(b, tierProfile('master'), {});
  for (let s = 1; s <= 3; s++) {
    const w = BM.sampleBeliefWorld(v, db, BV.seeded(s));
    assert.equal(w.oracle, true);
    b.teams[0].forEach((p, i) => { const q = w.teams[1][i]; assert.equal(q.species, p.speciesId); assert.equal(q.item, p.item); assert.equal(q.hp, p.hp); assert.deepEqual(q.moves.map(m => m.id), p.moves.map(m => m.id)); });
  }
  const forged = {...BV.observation(b, tierProfile('champion'), {}), oracle: v.oracle};
  assert.notEqual(BM.sampleBeliefWorld(forged, db, BV.seeded(1)).oracle, true, '没有大师标记时忽略 oracle');
});
