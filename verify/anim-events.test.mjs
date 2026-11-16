import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.PKMTypeChart = { effectiveness: () => 1 };
globalThis.PKMMechanics = { canonType: value => value || null, typeForZCrystal: () => null };
const BattleAPI = require('../src/engine/battle.js');
const stats = { hp: 60, atk: 120, def: 50, spa: 80, spd: 50, spe: 75 };
const dex = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, { name: id.toUpperCase(), types: ['Normal'], baseStats: stats, abilities: [] }]));
const moves = {
  hit: { name: 'Hit', type: 'Normal', category: 'Physical', basePower: 150, accuracy: true, pp: 20, target: 'normal', flags: {} },
  quake: { name: 'Quake', type: 'Ground', category: 'Physical', basePower: 40, accuracy: true, pp: 10, target: 'allAdjacent', flags: {} },
  swordsdance: { name: 'SD', type: 'Normal', category: 'Status', basePower: 0, accuracy: true, pp: 20, target: 'self', boosts: { atk: 2 } },
};
BattleAPI.setData(dex, moves);
const mon = (id, m = ['hit']) => BattleAPI.createPokemon(id, 50, m);
const mk = (p, e, extra = {}) => new BattleAPI.Battle(p, e, { difficulty: 'easy', seed: 5, ...extra });
const strip = b => JSON.stringify({ log: b.log, teams: b.teams.map(t => t.map(p => [p.hp, p.status, p.fainted, p.stages])) });

test('animation stream is presentation-only: identical results with and without capture', () => {
  const run = capture => { const b = mk([mon('a', ['hit', 'swordsdance']), mon('b')], [mon('c'), mon('d')]); if (capture) b.animReset();
    for (let i = 0; i < 4 && b.winner === null; i++) { if (b.pendingSwitch !== null) b.forceSwitch(1); else b.turn({ kind: 'move', index: i % 2 }); } return b; };
  const plain = run(false), cap = run(true);
  assert.equal(strip(plain), strip(cap));
  assert.equal(plain.animEvents, undefined);
  assert.ok(cap.animFlush().length > 0);
});

test('records ordered move -> hp -> faint -> switch events with log positions', () => {
  const b = mk([mon('a'), mon('b')], [mon('c'), mon('d')]);
  b.animReset();
  b.turn({ kind: 'move', index: 0 });
  const ev = b.animFlush();
  const types = ev.map(e => e.type);
  const mv = ev.find(e => e.type === 'move');
  assert.ok(mv && mv.moveId && mv.targets.length === 1);
  assert.ok(types.indexOf('hp') > types.indexOf('move'));
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].log >= ev[i - 1].log);
  const faint = ev.find(e => e.type === 'faint');
  if (faint) {
    const sw = ev.find(e => e.type === 'switch' && e.side === faint.side);
    if (faint.side === 1) assert.ok(sw && sw.outFainted && types.indexOf('switch') > types.indexOf('faint'));
  }
});

test('spread moves list every target; boosts are reported', () => {
  const d = mk([mon('a', ['quake', 'swordsdance']), mon('b'), mon('e')], [mon('c'), mon('d')], { double: true });
  d.animReset();
  d.turn({ kind: 'double', actions: [{ kind: 'move', index: 0 }, { kind: 'move', index: 0, target: { side: 1, slot: 0 } }] });
  const quake = d.animFlush().find(e => e.type === 'move' && e.moveId === 'quake');
  assert.ok(quake && quake.targets.length === 3, JSON.stringify(quake?.targets));
  const s = mk([mon('a', ['swordsdance'])], [mon('c')]);
  s.animReset(); s.turn({ kind: 'move', index: 0 });
  const boost = s.animFlush().find(e => e.type === 'boost');
  assert.ok(boost && boost.stat === 'atk' && boost.amount === 2 && boost.side === 0);
});
