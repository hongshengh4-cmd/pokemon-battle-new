// Train the position-value model on >=1800 ladder replay OUTCOMES. Held-out = 20% of games (by replay id).
// Usage: node value-train.mjs [H=32] [epochs=10]   (env NOWRITE=1 to only evaluate)
import fs from 'fs'; import zlib from 'zlib';
import {parseReplay} from './parse.mjs';
import {valueVectors, sidesFromSnapshot, NVF, VF, valueLogit} from './value-model.mjs';
const db = {dex: JSON.parse(fs.readFileSync('/home/user/work/pbn/src/data/pokedex.json')), moves: JSON.parse(fs.readFileSync('/home/user/work/pbn/src/data/moves.json'))};
const FORMATS = ['gen9ou', 'gen9randombattle', 'gen9nationaldex'];
const H = +(process.argv[2] || 32), EPOCHS = +(process.argv[3] || 10);
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const MAX = +(process.env.MAXS || 950000);
const XAf = new Float32Array(MAX * NVF), XBf = new Float32Array(MAX * NVF), Yb = new Uint8Array(MAX), HOLDb = new Uint8Array(MAX), FMTb = new Uint8Array(MAX), TURNb = new Uint16Array(MAX), HANDb = new Float32Array(MAX);
let N = 0; const FNAMES = ['gen9ou', 'gen9randombattle', 'gen9nationaldex'];
const XA = new Proxy({}, {get: (_, i) => XAf.subarray(i * NVF, i * NVF + NVF)}), XB = new Proxy({}, {get: (_, i) => XBf.subarray(i * NVF, i * NVF + NVF)});
let games = 0, skipped = 0;
// Hand-written evaluation (same terms as canonical-runtime evaluateSimulation, minus the damage-calc positional term).
function handRaw(S, O) {
  let v = 0; const alive = S.mons.filter(m => m.hp > 0), unk = Math.max(0, S.left - alive.length);
  for (const m of alive) { v += 100 + 70 * Math.min(1, m.hp); v -= {slp: 18, par: 14, brn: 12, tox: 18, psn: 10, frz: 25}[m.status] || 0; }
  v += unk * 170;
  const b = S.act?.boosts || {}, lg = n => Math.sign(n || 0) * Math.log2(1 + Math.abs(n || 0));
  if (S.act) v += lg(S.act.phys ? b.atk : b.spa) * 13 + lg(b.spe) * 9 + (lg(b.def) + lg(b.spd)) * 6;
  const f = S.field || {}, bench = Math.max(0, S.left - 1);
  v -= (f.stealthrock ? 5 : 0) * bench + (f.spikes || 0) * 3 * bench;
  v += (f.reflect ? 5 : 0) + (f.lightscreen ? 5 : 0) + (f.auroraveil ? 8 : 0) + (f.tailwind ? 5 : 0);
  return v;
}
for (const f of FORMATS) {
  const p = `/home/user/work/expert/replays/${f}.jsonl.gz`; if (!fs.existsSync(p)) continue;
  const lines = zlib.gunzipSync(fs.readFileSync(p), {finishFlush: zlib.constants.Z_SYNC_FLUSH}).toString().split('\n').filter(Boolean);
  const seen = new Set();
  for (const l of lines) {
    let rep; try { rep = JSON.parse(l); } catch (e) { continue; }
    if (seen.has(rep.id)) continue; seen.add(rep.id);
    const win = /\n\|win\|([^\n]*)/.exec(rep.log)?.[1]?.trim(); if (!win) { skipped++; continue; }
    const pl = {}; for (const m of rep.log.matchAll(/\n\|player\|(p[12])\|([^|\n]+)/g)) if (!pl[m[1]]) pl[m[1]] = m[2].trim();
    if (pl.p1 !== win && pl.p2 !== win) { skipped++; continue; }
    let ds; try { ds = parseReplay(db, rep); } catch (e) { skipped++; continue; }
    const hold = hash(rep.id) % 5 === 0 ? 1 : 0; games++;
    for (const d of ds) {
      if (d.kind !== 'turn' || !d.side) continue;
      const {A, B, trickroom} = sidesFromSnapshot(db, d), [xa, xb] = valueVectors(A, B, trickroom);
      if (N >= MAX) continue;
      XAf.set(xa, N * NVF); XBf.set(xb, N * NVF); Yb[N] = pl[d.side] === win ? 1 : 0;
      HOLDb[N] = hold; FMTb[N] = FNAMES.indexOf(f); TURNb[N] = Math.min(65535, d.turn); HANDb[N] = (handRaw(A, B) - handRaw(B, A)) / 170; N++;
    }
  }
  console.error(f, 'games', games, 'states', N);
}
const Y = Yb.subarray(0, N), HOLD = HOLDb, TURN = TURNb, HAND = HANDb, FMT = {length: N}; for (let i = 0; i < N; i++) FMT[i] = FNAMES[FMTb[i]];
const tr = [], te = []; for (let i = 0; i < N; i++) (HOLD[i] ? te : tr).push(i);
console.log(`games=${games} skipped=${skipped} states=${N} train=${tr.length} test=${te.length}`);
const sig = z => 1 / (1 + Math.exp(-z));
// --- baseline: hand evaluation with ONE fitted scale (tanh(x)*.94 in the engine; here logistic of k*x) ---
let k = 1; for (let it = 0; it < 200; it++) { let g = 0, h = 0; for (const i of tr) { const p = sig(k * HAND[i]); g += (p - Y[i]) * HAND[i]; h += p * (1 - p) * HAND[i] ** 2; } k -= g / Math.max(1e-9, h); }
// --- model ---
function newW(h) { const r = () => (Math.random() * 2 - 1) * .2; return {H: h, w: new Float64Array(NVF), u: new Float64Array(NVF), c: 0, W: Float64Array.from({length: h * 2 * NVF}, r), b: Float64Array.from({length: h}, () => .05), v: Float64Array.from({length: h}, r)}; }
function train(h, epochs, l2 = +(process.env.L2 || 1e-5)) {
  const W = newW(h), keys = ['w', 'u', 'W', 'b', 'v'], m1 = {}, m2 = {}; for (const kk of keys) { m1[kk] = new Float64Array(W[kk].length); m2[kk] = new Float64Array(W[kk].length); }
  const idx = tr.slice(); let t = 0; const B = 256, n = NVF, hid = new Float64Array(h);
  const accum = (G, xa, xb, coef) => { // gradient of g(xa,xb) scaled by coef
    for (let i = 0; i < n; i++) { G.w[i] += coef * xa[i]; G.u[i] += coef * xb[i]; }
    for (let j = 0; j < h; j++) {
      let s = W.b[j]; const o = j * 2 * n; for (let i = 0; i < n; i++) s += W.W[o + i] * xa[i] + W.W[o + n + i] * xb[i];
      if (s <= 0) continue; G.v[j] += coef * s; const cv = coef * W.v[j]; G.b[j] += cv;
      for (let i = 0; i < n; i++) { G.W[o + i] += cv * xa[i]; G.W[o + n + i] += cv * xb[i]; }
    }
  };
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let loss = 0; const lr = +(process.env.LR || .001) * (ep < epochs * .6 ? 1 : .3);
    for (let s0 = 0; s0 < idx.length; s0 += B) {
      const G = {}; for (const kk of keys) G[kk] = new Float64Array(W[kk].length);
      const end = Math.min(idx.length, s0 + B);
      for (let q = s0; q < end; q++) {
        const i = idx[q], z = valueLogit(W, XA[i], XB[i]), p = sig(z); loss -= Math.log(Y[i] ? p + 1e-12 : 1 - p + 1e-12);
        const d = p - Y[i]; accum(G, XA[i], XB[i], d); accum(G, XB[i], XA[i], -d);
      }
      t++; const nb = end - s0;
      for (const kk of keys) { const P = W[kk], g = G[kk], a = m1[kk], v2 = m2[kk]; for (let i = 0; i < P.length; i++) { const gi = g[i] / nb + l2 * P[i]; a[i] = .9 * a[i] + .1 * gi; v2[i] = .999 * v2[i] + .001 * gi * gi; P[i] -= lr * (a[i] / (1 - .9 ** t)) / (Math.sqrt(v2[i] / (1 - .999 ** t)) + 1e-8); } }
    }
    console.error(`H=${h} epoch ${ep} train logloss ${(loss / idx.length).toFixed(4)}`);
  }
  return W;
}
function report(name, pf) {
  const R = {};
  const add = (key, p, y) => { const r = R[key] ||= {n: 0, ll: 0, acc: 0, br: 0}; r.n++; r.ll -= Math.log(y ? p + 1e-12 : 1 - p + 1e-12); r.acc += (p > .5) === !!y ? 1 : (p === .5 ? .5 : 0); r.br += (p - y) ** 2; };
  for (const i of te) { const p = Math.min(1 - 1e-6, Math.max(1e-6, pf(i))); const tb = TURN[i] <= 5 ? 't01-05' : TURN[i] <= 15 ? 't06-15' : TURN[i] <= 30 ? 't16-30' : 't31+';
    add('all', p, Y[i]); add(FMT[i], p, Y[i]); add(tb, p, Y[i]); }
  const out = {}; for (const [kk, r] of Object.entries(R)) out[kk] = {n: r.n, logloss: +(r.ll / r.n).toFixed(4), acc: +(r.acc / r.n * 100).toFixed(1), brier: +(r.br / r.n).toFixed(4)};
  console.log(`\n== ${name} ==`); for (const [kk, r] of Object.entries(out)) console.log(`${kk.padEnd(18)} n=${String(r.n).padStart(6)}  logloss=${r.logloss}  acc=${r.acc}%  brier=${r.brier}`);
  return out;
}
const eHand = report(`hand-written leaf eval (fitted scale k=${k.toFixed(3)})`, i => sig(k * HAND[i]));
const Wlin = train(0, Math.max(4, EPOCHS >> 1)), eLin = report('linear (antisymmetric logistic)', i => sig(valueLogit(Wlin, XA[i], XB[i])));
const Wm = train(H, EPOCHS), eM = report(`MLP H=${H} (antisymmetric)`, i => sig(valueLogit(Wm, XA[i], XB[i])));
if (!process.env.NOWRITE) {
  const r4 = a => Array.from(a, x => +x.toFixed(5));
  const useLin = eLin.all.logloss <= eM.all.logloss, Wb = useLin ? Wlin : Wm; console.log('selected', useLin ? 'linear' : 'MLP');
  const pack = {H: Wb.H, w: r4(Wb.w), u: r4(Wb.u), c: 0, W: r4(Wb.W), b: r4(Wb.b), v: r4(Wb.v)};
  fs.writeFileSync('/home/user/work/expert/value-weights.mjs', `// SPDX-License-Identifier: MIT\n// Trained by tools/expert/value-train.mjs on ${games} rated>=1800 gen9 singles games (${N} turn states). Aggregate parameters only.\n// Features: ${VF.join(', ')}\nexport const VALUE_WEIGHTS = ${JSON.stringify(pack)};\nexport const VALUE_EVAL = ${JSON.stringify({games, states: N, hand: eHand.all, linear: eLin.all, mlp: eM.all, selected: useLin ? 'linear' : 'mlp', byTurn: Object.fromEntries(Object.entries(useLin ? eLin : eM).filter(([kk]) => kk.startsWith('t'))), handByTurn: Object.fromEntries(Object.entries(eHand).filter(([kk]) => kk.startsWith('t')))})};\n`);
  console.log('saved value-weights.mjs');
}
