// SPDX-License-Identifier: MIT
// Learned position evaluation ("who is winning?") trained on the OUTCOMES of >=1800 Showdown ladder games.
// One feature extractor is shared by training (public replay states) and runtime (the PS simulation used by
// the elite/champion search), so the model is evaluated on exactly the quantities it was trained on.
// Antisymmetric by construction: v(A,B) = g(A,B) - g(B,A), so v(A,B) = -v(B,A) and equal positions score 0.
import {effectiveness, id} from './features.mjs?v=expert-features-v1';
import {VALUE_WEIGHTS} from './value-weights.mjs?v=value-v1';
export const VALUE_BUILD = 'value-v1';
export const VF = ['left', 'hpSum', 'actHp', 'slp', 'par', 'brn', 'tox', 'psn', 'frz', 'offBoost', 'speBoost', 'defBoost',
  'rocks', 'spikes', 'tspikes', 'web', 'screens', 'tailwind', 'offMatch', 'faster'];
export const NVF = VF.length;
const lg = n => Math.sign(n || 0) * Math.log2(1 + Math.abs(n || 0));
const speedOf = (base, level, boost, par, tail) => {
  const raw = Math.floor((2 * (base || 80) + 52) * (level || 100) / 100) + 5;
  const m = boost >= 0 ? (2 + boost) / 2 : 2 / (2 - boost);
  return raw * m * (par ? .5 : 1) * (tail ? 2 : 1);
};
// Normalised side: {left, mons:[{hp,status}], act:{hp,status,boosts,types,phys,spe,level}, field:{...}}
function sideVec(S, O, trickroom) {
  const x = new Float64Array(NVF), alive = S.mons.filter(m => m.hp > 0);
  const known = alive.length, left = Math.max(known, S.left);
  x[0] = left / 6;
  x[1] = (alive.reduce((n, m) => n + Math.min(1, m.hp), 0) + Math.max(0, left - known)) / 6;
  const a = S.act; x[2] = a ? Math.min(1, a.hp) : 0;
  for (const m of alive) { const k = {slp: 3, par: 4, brn: 5, tox: 6, psn: 7, frz: 8}[m.status]; if (k) x[k] += 1; }
  if (a) {
    const b = a.boosts || {};
    x[9] = lg(a.phys ? b.atk : b.spa); x[10] = lg(b.spe); x[11] = (lg(b.def) + lg(b.spd)) / 2;
  }
  const f = S.field || {}, bench = Math.max(0, left - 1) / 5;
  x[12] = (f.stealthrock ? 1 : 0) * bench; x[13] = Math.min(3, f.spikes || 0) * bench; x[14] = f.toxicspikes ? 1 : 0; x[15] = f.stickyweb ? 1 : 0;
  x[16] = ((f.reflect ? 1 : 0) + (f.lightscreen ? 1 : 0) + (f.auroraveil ? 2 : 0)) / 2; x[17] = f.tailwind ? 1 : 0;
  if (a && O.act) {
    let best = 0; for (const t of a.types || []) best = Math.max(best, effectiveness(t, O.act.types));
    x[18] = best <= 0 ? -1.5 : Math.max(-1, Math.min(1, Math.log2(best) / 2));
    const me = speedOf(a.spe, a.level, (a.boosts || {}).spe || 0, a.status === 'par', f.tailwind);
    const of = O.field || {}, op = speedOf(O.act.spe, O.act.level, (O.act.boosts || {}).spe || 0, O.act.status === 'par', of.tailwind);
    x[19] = me === op ? .5 : (me > op) !== !!trickroom ? 1 : 0;
  }
  return x;
}
export function valueVectors(A, B, trickroom = false) { return [sideVec(A, B, trickroom), sideVec(B, A, trickroom)]; }
// ---------- adapters ----------
export function sidesFromSnapshot(db, d) {
  const mk = (mon) => { const bs = db.dex[id(mon.species)]?.baseStats || {}; return {hp: mon.hp, status: mon.status || '', boosts: mon.boosts, types: mon.types, phys: (bs.atk || 0) >= (bs.spa || 0), spe: bs.spe || 80, level: mon.level || 100}; };
  const me = {left: d.myLeft, act: mk(d.me.active), mons: [d.me.active, ...d.me.bench.map(b => b.mon)].map(m => ({hp: m.hp, status: m.status || ''})), field: d.myField};
  const foe = {left: d.foeLeft, act: mk(d.foe.active), mons: [d.foe.active, ...d.foe.bench].map(m => ({hp: m.hp, status: m.status || ''})), field: d.foeField};
  return {A: me, B: foe, trickroom: !!d.trickroom};
}
export function sidesFromPS(b) {
  const side = s => {
    const act = s.active[0] && !s.active[0].fainted ? s.active[0] : null, f = {};
    for (const [k, v] of Object.entries(s.sideConditions || {})) f[k] = k === 'spikes' || k === 'toxicspikes' ? (v.layers || 1) : 1;
    const bs = act?.species?.baseStats || {};
    return {
      left: s.pokemon.filter(p => p.hp > 0 && !p.fainted).length, field: f,
      mons: s.pokemon.map(p => ({hp: p.fainted ? 0 : p.hp / p.maxhp, status: p.status || ''})),
      act: act ? {hp: act.hp / act.maxhp, status: act.status || '', boosts: act.boosts, types: act.getTypes(), phys: (bs.atk || 0) >= (bs.spa || 0), spe: bs.spe || 80, level: act.level} : null
    };
  };
  return {A: side(b.sides[0]), B: side(b.sides[1]), trickroom: !!b.field?.pseudoWeather?.trickroom};
}
// ---------- model ----------
export function gScore(W, xa, xb) {
  const H = W.H, n = NVF; let s = W.c || 0;
  for (let i = 0; i < n; i++) s += W.w[i] * xa[i] + W.u[i] * xb[i];
  for (let j = 0; j < H; j++) {
    let h = W.b[j]; const o = j * 2 * n;
    for (let i = 0; i < n; i++) h += W.W[o + i] * xa[i] + W.W[o + n + i] * xb[i];
    if (h > 0) s += W.v[j] * h;
  }
  return s;
}
export const valueLogit = (W, xa, xb) => gScore(W, xa, xb) - gScore(W, xb, xa);
// Expected outcome in [-1, 1] for PS side 0 (the AI inside the search).
export function learnedValue(b, W = VALUE_WEIGHTS) {
  if (!W) return 0;
  const {A, B, trickroom} = sidesFromPS(b), [xa, xb] = valueVectors(A, B, trickroom);
  return Math.tanh(valueLogit(W, xa, xb) / 2); // = 2*sigmoid(z) - 1
}
// Blend weight of the learned value against the hand-written leaf evaluation, per tier.
const VCFG = {enabled: true, mul: 1};
// A/B (tools/expert/gauntlet.mjs, head-to-head vs the unchanged AI, 48 paired games per tier):
//   champion +0.120 +/- 0.056 HP margin, wins 27 vs 23 (positive in both runs) -> on by default;
//   elite    +0.031 +/- 0.058, wins 27 vs 30 (no measurable effect)            -> opt-in: setValueConfig({blend:{elite:1}}).
// A 50% blend showed no gain. Other tiers keep the original evaluation.
export const VALUE_BLEND = {champion: 1};
export function setValueConfig(c = {}) { if ('enabled' in c) VCFG.enabled = !!c.enabled; if ('mul' in c) VCFG.mul = Number(c.mul); if (c.blend) Object.assign(VALUE_BLEND, c.blend); }
export function valueBlend(tier) { return VCFG.enabled && VALUE_WEIGHTS ? Math.min(1, (VALUE_BLEND[tier] || 0) * VCFG.mul) : 0; }
