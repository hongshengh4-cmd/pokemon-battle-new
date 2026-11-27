// Train conditional-logit expert priors from >=1800 Showdown replays (singles).
import fs from 'fs'; import zlib from 'zlib';
import {parseReplay} from './parse.mjs'; import {candidates, FEATURES, NF} from './features.mjs';
const db = {dex: JSON.parse(fs.readFileSync('/home/user/work/pbn/src/data/pokedex.json')), moves: JSON.parse(fs.readFileSync('/home/user/work/pbn/src/data/moves.json'))};
const FORMATS = ['gen9ou', 'gen9randombattle', 'gen9nationaldex'];
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function makeSet() { return {dStart: [], label: [], fmt: [], hold: [], cStart: [], fIdx: [], fVal: [], kindIsSwitch: [], cands: 0, meta: []}; }
const sets = {turn: makeSet(), replace: makeSet()};
const FRAC = +(process.env.FRAC || 1);
const FMT = {ou: 0, rand: 1, natdex: 2};
let nrep = 0, ndec = 0, skipped = 0;
const stats = {turn: {ou: 0, rand: 0, natdex: 0}, replace: {ou: 0, rand: 0, natdex: 0}};
for (const f of FORMATS) {
  const lines = zlib.gunzipSync(fs.readFileSync(`/home/user/work/expert/replays/${f}.jsonl.gz`)).toString().split('\n').filter(Boolean);
  for (const l of lines) {
    const rep = JSON.parse(l); nrep++;
    let ds; try { ds = parseReplay(db, rep); } catch (e) { skipped++; continue; }
    const hold = hash(rep.id) % 5 === 0 ? 1 : 0;
    if (!hold && (hash(rep.id + '#f') % 1000) / 1000 >= FRAC) continue;
    for (const d of ds) {
      const forced = d.kind !== 'turn';
      const legal = forced ? [] : d.me.active.moves.filter(m => db.moves[m]);
      const {out} = candidates(db, d, legal, d.me.bench, forced);
      if (out.length < 2) continue;
      const li = out.findIndex(c => d.label.kind === 'move' ? c.kind === 'move' && c.move === d.label.move : c.kind === 'switch' && c.idx === d.label.idx);
      if (li < 0) { skipped++; continue; }
      const S = sets[forced ? 'replace' : 'turn'];
      S.dStart.push(S.cStart.length); S.label.push(li); S.fmt.push(FMT[d.format]); S.hold.push(hold);
      for (const c of out) { S.cStart.push(S.fIdx.length); S.kindIsSwitch.push(c.kind === 'switch' ? 1 : 0); for (let i = 0; i < NF; i++) if (c.x[i]) { S.fIdx.push(i); S.fVal.push(c.x[i]); } }
      stats[forced ? 'replace' : 'turn'][d.format]++; ndec++;
    }
  }
  console.error(f, 'replays', nrep, 'decisions', ndec, 'skipped', skipped);
}
for (const S of Object.values(sets)) { S.dStart.push(S.cStart.length); S.cStart.push(S.fIdx.length); S.fIdx = Uint8Array.from(S.fIdx); S.fVal = Float32Array.from(S.fVal); }
console.error(JSON.stringify(stats));
function scoresLin(S, w, d) { const a = S.dStart[d], b = S.dStart[d + 1], s = []; for (let c = a; c < b; c++) { let v = 0; for (let k = S.cStart[c]; k < S.cStart[c + 1]; k++) v += w[S.fIdx[k]] * S.fVal[k]; s.push(v); } return s; }
function probs(s) { const m = Math.max(...s), e = s.map(v => Math.exp(v - m)), z = e.reduce((x, y) => x + y, 0); return e.map(v => v / z); }
const H = +(process.env.H || 24);
function newModel() { const r = () => (Math.random() * 2 - 1) * .15; return {w: new Float64Array(NF), W: Float64Array.from({length: H * NF}, r), b: new Float64Array(H), v: Float64Array.from({length: H}, () => r() * .5)}; }
function fwd(S, M, c, h) { let s = 0; for (let j = 0; j < H; j++) h[j] = M.b[j]; for (let k = S.cStart[c]; k < S.cStart[c + 1]; k++) { const f = S.fIdx[k], x = S.fVal[k]; s += M.w[f] * x; const o = f; for (let j = 0; j < H; j++) h[j] += M.W[j * NF + o] * x; } for (let j = 0; j < H; j++) { if (h[j] < 0) h[j] = 0; s += M.v[j] * h[j]; } return s; }
function scores(S, M, d) { const a = S.dStart[d], b = S.dStart[d + 1], s = [], h = new Float64Array(H); for (let c = a; c < b; c++) s.push(fwd(S, M, c, h)); return s; }
function trainMLP(S, {epochs = 16, lr = .01, l2 = 2e-5} = {}) {
  const M = newModel(), keys = ['w', 'W', 'b', 'v'], mom = {}, vel = {}; for (const k of keys) { mom[k] = new Float64Array(M[k].length); vel[k] = new Float64Array(M[k].length); }
  const idx = []; for (let d = 0; d < S.label.length; d++) if (!S.hold[d]) idx.push(d);
  let t = 0; const B = 128; const hs = Array.from({length: 40}, () => new Float64Array(H));
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let nll = 0;
    for (let s0 = 0; s0 < idx.length; s0 += B) {
      const G = {}; for (const k of keys) G[k] = new Float64Array(M[k].length);
      const end = Math.min(idx.length, s0 + B);
      for (let q = s0; q < end; q++) {
        const d = idx[q], a = S.dStart[d], n = S.dStart[d + 1] - a, sc = [];
        for (let c = 0; c < n; c++) sc.push(fwd(S, M, a + c, hs[c]));
        const p = probs(sc); nll -= Math.log(p[S.label[d]] + 1e-12);
        for (let c = 0; c < n; c++) {
          const coef = p[c] - (c === S.label[d] ? 1 : 0); if (Math.abs(coef) < 1e-6) continue; const h = hs[c];
          for (let j = 0; j < H; j++) { G.v[j] += coef * h[j]; }
          for (let k = S.cStart[a + c]; k < S.cStart[a + c + 1]; k++) { const f = S.fIdx[k], x = S.fVal[k]; G.w[f] += coef * x; for (let j = 0; j < H; j++) if (h[j] > 0) G.W[j * NF + f] += coef * M.v[j] * x; }
          for (let j = 0; j < H; j++) if (h[j] > 0) G.b[j] += coef * M.v[j];
        }
      }
      t++; const nb = end - s0, lrt = lr * (ep < 10 ? 1 : .35);
      for (const k of keys) { const P = M[k], g = G[k], m1 = mom[k], v1 = vel[k]; for (let i = 0; i < P.length; i++) { const gi = g[i] / nb + l2 * P[i]; m1[i] = .9 * m1[i] + .1 * gi; v1[i] = .999 * v1[i] + .001 * gi * gi; P[i] -= lrt * (m1[i] / (1 - .9 ** t)) / (Math.sqrt(v1[i] / (1 - .999 ** t)) + 1e-8); } }
    }
    console.error(`epoch ${ep} train nll ${(nll / idx.length).toFixed(4)}`);
  }
  return M;
}
function train(S, {epochs = 14, lr = .05, l2 = 1e-4} = {}) {
  const w = new Float64Array(NF), m = new Float64Array(NF), v = new Float64Array(NF);
  const idx = []; for (let d = 0; d < S.label.length; d++) if (!S.hold[d]) idx.push(d);
  let t = 0; const B = 256;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let nll = 0;
    for (let s0 = 0; s0 < idx.length; s0 += B) {
      const g = new Float64Array(NF);
      const end = Math.min(idx.length, s0 + B);
      for (let q = s0; q < end; q++) {
        const d = idx[q], p = probs(scoresLin(S, w, d)), a = S.dStart[d];
        nll -= Math.log(p[S.label[d]] + 1e-12);
        for (let c = 0; c < p.length; c++) { const coef = p[c] - (c === S.label[d] ? 1 : 0); for (let k = S.cStart[a + c]; k < S.cStart[a + c + 1]; k++) g[S.fIdx[k]] += coef * S.fVal[k]; }
      }
      t++; const n = end - s0, lrt = lr * Math.min(1, 3 / (1 + ep * .35));
      for (let i = 0; i < NF; i++) { const gi = g[i] / n + l2 * w[i]; m[i] = .9 * m[i] + .1 * gi; v[i] = .999 * v[i] + .001 * gi * gi; w[i] -= lrt * (m[i] / (1 - .9 ** t)) / (Math.sqrt(v[i] / (1 - .999 ** t)) + 1e-8); }
    }
    console.error(`epoch ${ep} train nll ${(nll / idx.length).toFixed(4)}`);
  }
  return Array.from(w);
}
function evaluate(S, w, label, lin) {
  const R = {};
  const add = (k, ok, nll, base, greedy, sw, swPred) => { const r = R[k] ||= {n: 0, top1: 0, nll: 0, uni: 0, greedy: 0, sw: 0, swHit: 0, swPred: 0, swTrue: 0}; r.n++; r.top1 += ok; r.nll += nll; r.uni += base; r.greedy += greedy; r.swTrue += sw; r.swPred += swPred; r.swHit += sw && swPred ? 1 : 0; };
  const names = ['ou', 'rand', 'natdex'];
  for (let d = 0; d < S.label.length; d++) {
    if (!S.hold[d]) continue;
    const s = lin ? scoresLin(S, w, d) : scores(S, w, d), p = probs(s), a = S.dStart[d], n = p.length;
    const best = p.indexOf(Math.max(...p)), y = S.label[d];
    // greedy baseline: highest estimated damage move (feature m_dmg), else first switch
    let gb = 0, gv = -1; const di = FEATURES.indexOf('m_dmg');
    for (let c = 0; c < n; c++) { let val = 0; for (let k = S.cStart[a + c]; k < S.cStart[a + c + 1]; k++) if (S.fIdx[k] === di) val = S.fVal[k]; if (val > gv) { gv = val; gb = c; } }
    const sw = S.kindIsSwitch[a + y], swPred = S.kindIsSwitch[a + best];
    for (const k of ['all', names[S.fmt[d]]]) add(k, best === y ? 1 : 0, -Math.log(p[y] + 1e-12), Math.log(n), gb === y ? 1 : 0, sw, swPred);
  }
  console.log(`\n== ${label} (held-out 20% of replays) ==`);
  for (const [k, r] of Object.entries(R)) console.log(`${k.padEnd(7)} n=${r.n}  top1=${(r.top1 / r.n * 100).toFixed(1)}%  greedy-dmg=${(r.greedy / r.n * 100).toFixed(1)}%  nll=${(r.nll / r.n).toFixed(3)} (uniform ${(r.uni / r.n).toFixed(3)})  switch: true=${(r.swTrue / r.n * 100).toFixed(1)}% recall=${(r.swHit / Math.max(1, r.swTrue) * 100).toFixed(1)}% precision=${(r.swHit / Math.max(1, r.swPred) * 100).toFixed(1)}%`);
  return R;
}
const nTrain = sets.turn.hold.filter(h => !h).length;
console.log(`FRAC=${FRAC} H=${H} train decisions=${nTrain}`);
const MT = trainMLP(sets.turn, {epochs: +(process.env.EP || 16)}); evaluate(sets.turn, MT, `MLP turn FRAC=${FRAC} H=${H}`);
