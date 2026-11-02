import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);

// battle.js is intentionally DOM-free; provide the two browser globals it consumes.
globalThis.PKMTypeChart = { effectiveness: () => 1 };
globalThis.PKMMechanics = { canonType: value => value || null, typeForZCrystal: () => null };
const BattleAPI = require('../src/engine/battle.js');

const stats = { hp: 80, atk: 80, def: 70, spa: 80, spd: 70, spe: 75 };
const dex = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, {
  name: id.toUpperCase(), types: ['Normal'], baseStats: stats, abilities: [],
}]));
const moves = {
  hit: { name: 'Hit', type: 'Normal', category: 'Physical', basePower: 40, accuracy: true, pp: 20, target: 'normal', flags: {} },
  quake: { name: 'Quake', type: 'Ground', category: 'Physical', basePower: 40, accuracy: true, pp: 10, target: 'allAdjacent', flags: {} },
  followme: { name: 'Follow Me', type: 'Normal', category: 'Status', basePower: 0, accuracy: true, pp: 20, target: 'self', volatileStatus: 'followme', priority: 2 },
  helpinghand: { name: 'Helping Hand', type: 'Normal', category: 'Status', basePower: 0, accuracy: true, pp: 20, target: 'adjacentAlly', volatileStatus: 'helpinghand' },
};
BattleAPI.setData(dex, moves);
const mon = (id, moveIds = ['hit']) => BattleAPI.createPokemon(id, 50, moveIds);
const battle = (p, e, extra = {}) => new BattleAPI.Battle(p, e, { difficulty: 'easy', seed: 17, ...extra });

test('doubles provides two active slots and two player orders while singles remain one-active', () => {
  const dbl = battle([mon('a'), mon('b'), mon('e')], [mon('c'), mon('d')], { double: true });
  assert.equal(dbl.double, true);
  assert.equal(dbl.cur(0, 0).speciesId, 'a');
  assert.equal(dbl.cur(0, 1).speciesId, 'b');
  const foeHp = [dbl.cur(1, 0).hp, dbl.cur(1, 1).hp];
  dbl.turn({ kind: 'double', actions: [
    { kind: 'move', index: 0, target: { side: 1, slot: 0 } },
    { kind: 'move', index: 0, target: { side: 1, slot: 1 } },
  ] });
  assert.equal(dbl.turnCount, 1);
  assert.ok(dbl.cur(1, 0).hp < foeHp[0]);
  assert.ok(dbl.cur(1, 1).hp < foeHp[1]);

  const singles = battle([mon('a'), mon('b')], [mon('c'), mon('d')]);
  assert.equal(singles.double, false);
  assert.equal(singles.cur(0, 1), null);
  singles.turn({ kind: 'move', index: 0 });
  assert.equal(singles.turnCount, 1);
});

test('spread moves hit all adjacent combatants and ally selection works', () => {
  const dbl = battle([mon('a', ['quake']), mon('b')], [mon('c'), mon('d')], { double: true });
  const before = [dbl.cur(0, 1).hp, dbl.cur(1, 0).hp, dbl.cur(1, 1).hp];
  dbl.turn({ kind: 'double', actions: [{ kind: 'move', index: 0 }, { kind: 'pass' }] });
  assert.ok(dbl.cur(0, 1).hp < before[0]);
  assert.ok(dbl.cur(1, 0).hp < before[1]);
  assert.ok(dbl.cur(1, 1).hp < before[2]);

  const support = battle([mon('a', ['helpinghand']), mon('b')], [mon('c', ['followme']), mon('d', ['followme'])], { double: true });
  support.turn({ kind: 'double', actions: [
    { kind: 'move', index: 0, target: { side: 0, slot: 1 } },
    { kind: 'move', index: 0, target: { side: 1, slot: 0 } },
  ] });
  assert.ok(support.log.some(line => line.includes('帮助了')));
});

test('Follow Me redirects an explicitly selected single-target move', () => {
  const player = battle([mon('a'), mon('b')], [mon('c', ['hit']), mon('d', ['followme'])], { double: true });
  const before = [player.cur(1, 0).hp, player.cur(1, 1).hp];
  player.turn({ kind: 'double', actions: [
    { kind: 'move', index: 0, target: { side: 1, slot: 0 } },
    { kind: 'move', index: 0, target: { side: 1, slot: 0 } },
  ] });
  assert.ok(player.cur(1, 1).hp < before[1]);
  assert.equal(player.cur(1, 0).hp, before[0]);
});

test('forced switch is tied to the fainted doubles slot and enemy auto-replacement', () => {
  const dbl = battle([mon('a'), mon('b'), mon('e')], [mon('c'), mon('d'), mon('e')], { double: true });
  dbl.cur(0, 1).hp = 0;
  dbl.checkFaints();
  assert.equal(dbl.pendingSwitch, 1);
  assert.equal(dbl.forceSwitch(2), true);
  assert.equal(dbl.activeSlots[0][1], 2);
  assert.equal(dbl.pendingSwitch, null);

  const enemyActive = dbl.activeSlots[1][0];
  dbl.cur(1, 0).hp = 0;
  dbl.checkFaints();
  assert.notEqual(dbl.activeSlots[1][0], enemyActive);
  assert.ok(!dbl.cur(1, 0).fainted);
});

test('a remaining reserve can fill one of two simultaneous vacancies without blocking play', () => {
  const dbl = battle([mon('a'), mon('b'), mon('e')], [mon('c'), mon('d')], { double: true });
  dbl.cur(0, 0).hp = 0;
  dbl.cur(0, 1).hp = 0;
  dbl.checkFaints();
  assert.equal(dbl.pendingSwitch, 0);
  assert.equal(dbl.pendingSwitches.length, 0);
  assert.equal(dbl.forceSwitch(2), true);
  assert.equal(dbl.pendingSwitch, null);
  dbl.turn({ kind: 'double', actions: [{ kind: 'move', index: 0, target: { side: 1, slot: 0 } }, { kind: 'pass' }] });
  assert.equal(dbl.turnCount, 1);
});

test('mode follows narrative battle rules automatically, not team size or a manual toggle', () => {
  const source = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  const match = source.match(/  function battleModeFromConfig\(cfg\) \{[\s\S]*?\n  \}/);
  assert.ok(match, 'mode detector is part of the production UI path');
  const detect = new Function(`${match[0]}; return battleModeFromConfig;`)();
  assert.equal(detect({ rule: '本场采用双打，双方各两只同时出战。' }), true);
  assert.equal(detect({ rules: { text: '每方2只同时出场，按双打规则进行。' } }), true);
  assert.equal(detect({ rules: { rule: '2v2名额，采用单打轮换。' } }), false);
  assert.equal(detect({ rules: { teamSize: 2 }, teamSize: 2 }), false);
  assert.equal(detect({ format: '2v2' }), false);
  assert.equal(detect({ rules: { battleMode: 'single' }, rule: '双打' }), false);
  assert.equal(detect({ encounter: { type: 'wild' }, rule: '双打' }), false);
});
