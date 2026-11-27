// SPDX-License-Identifier: MIT
// Human-expert prior learned from rated >=1800 Pokémon Showdown replays (Gen 9 OU, Random Battle,
// National Dex; see expert/README). Two small conditional-logit MLPs:
//   turn    : P(action | public state) over {own moves, switches}
//   replace : P(incoming | public state) after a faint or pivot
// Uses ONLY public information plus the acting side's own set, i.e. exactly what a human at the
// keyboard knows. It is a PRIOR and an OPPONENT MODEL; Showdown rules/search still decide outcomes.
import {candidates, NF, FEATURES, FEATURE_BUILD, id} from './features.mjs?v=expert-features-v1';
const F_DMG = FEATURES.indexOf('m_dmg'), F_KO = FEATURES.indexOf('m_ko');
// 'Greedy' cue: how much this action looks like clicking the biggest damage number.
const greedOf = c => c.kind === 'move' ? (c.x[F_DMG] || 0) + (c.x[F_KO] || 0) : 0;
import {EXPERT_WEIGHTS} from './weights.mjs?v=expert-weights-v1';
export const EXPERT_BUILD = 'human-prior-v2';
if (EXPERT_WEIGHTS.features.length !== NF || EXPERT_WEIGHTS.features.some((f, i) => f !== FEATURES[i]) || FEATURE_BUILD !== 'expert-features-v1') throw Error('高分对局先验：特征版本不匹配');
const H = EXPERT_WEIGHTS.H;
// A/B switch (headless arena only). Production keeps it on.
let ENABLED = true;
const CFG = {adapt: true, crownRead: false, alphaMul: 1}; // crownRead: A/B showed no gain over adapt alone; kept as an opt-in switch
export function setExpertEnabled(on) { ENABLED = !!on; }
export function setExpertConfig(c = {}) { if ('enabled' in c) ENABLED = !!c.enabled; for (const k of Object.keys(CFG)) if (k in c) CFG[k] = typeof CFG[k] === 'number' ? Number(c[k]) : !!c[k]; }
export const expertEnabled = () => ENABLED;
export const expertConfig = () => ({enabled: ENABLED, ...CFG});
function mlp(M, x) {
  let s = 0; const h = new Float64Array(H); for (let j = 0; j < H; j++) h[j] = M.b[j];
  for (let f = 0; f < NF; f++) { const v = x[f]; if (!v) continue; s += M.w[f] * v; for (let j = 0; j < H; j++) h[j] += M.W[j * NF + f] * v; }
  for (let j = 0; j < H; j++) if (h[j] > 0) s += M.v[j] * h[j];
  return s;
}
function softmax(xs, temp = 1) { const m = Math.max(...xs), e = xs.map(v => Math.exp((v - m) / temp)), z = e.reduce((a, b) => a + b, 0); return e.map(v => v / z); }
const KEYS = ['atk', 'def', 'spa', 'spd', 'spe'];
const boostsOf = s => Object.fromEntries(KEYS.map(k => [k, s?.[k] || 0]));
// Tier strengths. Wild Pokémon act on instinct, so they get no expert prior.
export const EXPERT_LAMBDA = Object.freeze({wild: 0, novice: .18, regular: .32, veteran: .38, leader: .30, ace: .26, elite: .24, champion: .22});
export const EXPLOIT_ALPHA = Object.freeze({leader: .22, ace: .28, elite: .32, champion: .34});
// ---------- view (AI side = own) ----------
function ownMon(p) {
  return {species: p.species || p.speciesId, level: p.level, hp: p.maxHp ? p.hp / p.maxHp : 1, status: p.status || '', boosts: boostsOf(p.stages), types: [...(p.types || [])],
    moves: (p.moves || []).map(m => m.id), item: p.item ?? null, ability: p.ability ?? null, tera: !!p.terastallized, teraType: p.teraType, lastMove: p._lastMoveId || null,
    stats: p.stats ? {...p.stats, hp: p.maxHp || p.stats.hp} : null, locked: !!p.choiceLockedMove};
}
function pubMon(p, extraMoves) {
  const moves = [...new Set([...(p.moves || []).map(m => m.id || m), ...(extraMoves || [])])];
  return {species: p.species, level: p.level, hp: (p.hpPercent ?? 100) / 100, status: p.status || '', boosts: boostsOf(p.stages), types: [...(p.types || [])], moves,
    item: p.itemKnown ? (p.item || '') : null, ability: p.ability || null, tera: !!p.terastallized, lastMove: p.lastMove || null};
}
function fieldOf(view, sideIndex) { const s = view.field?.sides?.[sideIndex] || {}; return {stealthrock: s.stealthrock ? 1 : 0, spikes: Number(s.spikes) || 0, toxicspikes: Number(s.toxicspikes) || 0, stickyweb: s.stickyweb ? 1 : 0, reflect: !!s.reflect, lightscreen: !!s.lightscreen, auroraveil: !!s.auroraveil, tailwind: !!s.tailwind}; }
function weatherOf(view) { return id(view.weatherId || view.weather || ''); }
const trickRoom = view => !!(view.field?.trickRoom || view.field?.pseudoWeather?.trickroom);
// perspective 'own': the AI deciding. 'foe': the player (as the AI sees them) deciding.
export function stateFromView(view, {slot = 0, foeSlot = 0, persp = 'own', extraFoeMoves = null} = {}) {
  const own = view.own, opp = view.opponent;
  const ownAlive = own.filter(p => p.hp > 0).length, oppFainted = opp.filter(p => !p.unseen && p.hpPercent === 0).length;
  const oActive = own[view.active[0][slot]], fActive = opp[view.active[1][foeSlot]];
  if (!oActive || !fActive || fActive.unseen) return null;
  const ownBench = own.map((p, idx) => ({p, idx})).filter(({p, idx}) => p.hp > 0 && !view.active[0].includes(idx));
  const oppBench = opp.map((p, idx) => ({p, idx})).filter(({p, idx}) => !p.unseen && p.hpPercent > 0 && !view.active[1].includes(idx));
  const base = {format: 'rand', turn: view.turn || 1, weather: weatherOf(view), terrain: id(view.field?.terrain || ''), trickroom: trickRoom(view)};
  if (persp === 'own') return {...base, me: {active: ownMon(oActive), bench: ownBench.map(({p, idx}) => ({idx, mon: ownMon(p)}))}, foe: {active: pubMon(fActive), bench: oppBench.map(({p}) => pubMon(p))},
    myField: fieldOf(view, 1), foeField: fieldOf(view, 0), myLeft: ownAlive, foeLeft: opp.length - oppFainted};
  // The player sees our public face: revealed moves only (threat model adds STAB stand-ins).
  const asPub = p => ({...ownMon(p), moves: (p.revealed?.moves || []).map(m => m.id || m), item: p.revealed?.itemKnown ? (p.revealed.item || '') : null, ability: p.revealed?.ability || null, stats: null});
  return {...base, me: {active: pubMon(fActive, extraFoeMoves), bench: oppBench.map(({p, idx}) => ({idx, mon: pubMon(p)}))}, foe: {active: asPub(oActive), bench: ownBench.map(({p}) => asPub(p))},
    myField: fieldOf(view, 0), foeField: fieldOf(view, 1), myLeft: opp.length - oppFainted, foeLeft: ownAlive};
}
function scoreCands(st, db, legalMoves, bench, forced, foe = false) {
  const {out} = candidates(db, st, legalMoves, bench, forced);
  const M = forced ? EXPERT_WEIGHTS.replace : EXPERT_WEIGHTS.turn;
  const logits = out.map(c => mlp(M, c.x));
  // Opponent-side predictions are re-shaped by the in-battle read of THIS player (see fitAdaptation).
  return {out, logits, p: softmax(foe && !forced ? adaptLogits(out, logits, st.me.active.lastMove) : logits)};
}
// ---------- In-battle opponent read (elite / champion) ----------
// The ladder model says what a strong human would do. A specific player deviates: some never switch,
// some always click the biggest number, some repeat moves. From the PUBLIC record of this player's
// previous choices (paired with what the model predicted at that moment) we fit three numbers:
//   a    : sharpness (1/temperature) of the ladder model's preferences
//   gamma: weight on the 'greedy' cue (biggest damage / KO) -- casual players click the big number
//   beta : log-odds bias for switching
//   rho  : bias toward repeating the last used move
// with a Gaussian prior centred on "plays like the ladder" (a=1, beta=rho=0). The fitted gain over a
// uniform guess also scales how hard the AI leans on its read (exploit alpha). No hidden data is used.
let ADAPT = null;
const IDENT = {a: 1, gamma: 0, beta: 0, rho: 0};
function adaptLogits(out, logits, lastMove) {
  if (!ENABLED || !CFG.adapt || !ADAPT) return logits;
  const {a, gamma, beta, rho} = ADAPT;
  return logits.map((l, i) => a * l + gamma * greedOf(out[i]) + (out[i].kind === 'switch' ? beta : 0) + (out[i].kind === 'move' && lastMove && out[i].move === lastMove ? rho : 0));
}
const logSumExp = xs => { const m = Math.max(...xs); return m + Math.log(xs.reduce((n, x) => n + Math.exp(x - m), 0)); };
function readLL(r, t) {
  const z = r.cands.map(c => t.a * c.l + t.gamma * (c.g || 0) + (c.s ? t.beta : 0) + (c.r ? t.rho : 0)), all = logSumExp(z);
  const hit = r.cands.map((c, i) => i).filter(i => r.k === 'switch:?' ? r.cands[i].s : r.k === 'move:?' ? !r.cands[i].s : r.cands[i].k === r.k);
  return hit.length ? logSumExp(hit.map(i => z[i])) - all : null;
}
export function fitAdaptation(reads) {
  const rs = (reads || []).filter(r => r && Array.isArray(r.cands) && r.cands.length >= 2 && readLL(r, IDENT) !== null).slice(-24);
  if (rs.length < 2) return null;
  const SD = {a: .6, gamma: 1.6, beta: .9, rho: .9}, LIM = {a: [.2, 3], gamma: [-2, 6], beta: [-3, 3], rho: [-2, 3]}, K = Object.keys(SD); // prior std around 'plays like the ladder'
  let t = {...IDENT};
  const obj = t => rs.reduce((n, r) => n + readLL(r, t), 0) - K.reduce((n, k) => n + (t[k] - IDENT[k]) ** 2 / SD[k] ** 2, 0) / 2;
  for (let it = 0; it < 120; it++) { // numeric gradient ascent; four parameters, tiny data
    const f0 = obj(t), g = {}, h = 1e-4;
    for (const k of K) g[k] = (obj({...t, [k]: t[k] + h}) - f0) / h;
    const step = .3 / Math.sqrt(1 + it * .15), nt = {};
    for (const k of K) nt[k] = Math.min(LIM[k][1], Math.max(LIM[k][0], t[k] + step * g[k] / rs.length * 4));
    t = nt;
  }
  const ll = rs.reduce((n, r) => n + readLL(r, t), 0), ll0 = rs.reduce((n, r) => n + readLL(r, IDENT), 0);
  const uni = rs.reduce((n, r) => { const hit = r.k === 'switch:?' ? r.cands.filter(c => c.s).length : r.k === 'move:?' ? r.cands.filter(c => !c.s).length : 1; return n + Math.log(hit / r.cands.length); }, 0);
  const gain = (ll - uni) / rs.length, conf = rs.length / (rs.length + 5);
  // Predictable player -> lean harder on the read; unpredictable -> fall back toward the equilibrium.
  const alphaScale = 1 + conf * (Math.min(1.8, Math.max(.5, .55 + .7 * gain)) - 1);
  // How much the crown review should trust this reply model instead of its generic plausibility prior.
  const crownWeight = .15 + .5 * conf * Math.min(1, Math.max(0, gain) / .9);
  return {a: +t.a.toFixed(3), gamma: +t.gamma.toFixed(3), beta: +t.beta.toFixed(3), rho: +t.rho.toFixed(3), n: rs.length, gain: +gain.toFixed(3), gainLadder: +((ll0 - uni) / rs.length).toFixed(3), alphaScale: +alphaScale.toFixed(3), crownWeight: +crownWeight.toFixed(3)};
}
export function setFoeAdaptation(memory) { ADAPT = ENABLED && CFG.adapt ? fitAdaptation(memory?.foeReads) : null; return ADAPT; }
export function crownReadWeight() { return ENABLED && CFG.crownRead ? (ADAPT ? ADAPT.crownWeight : .15) : 0; }
export function exploitAlpha(tier) { const a = (EXPLOIT_ALPHA[tier] || 0) * CFG.alphaMul; return a && ADAPT ? Math.min(.7, a * ADAPT.alphaScale) : Math.min(.7, a); }
// The candidate set + raw model logits for the player's NEXT choice, from the AI's public view. The
// main thread stores it and, once the turn's public log shows what the player did, sends it back as a read.
export function foePredict(view, db) {
  if (!ENABLED || !CFG.adapt || view.double) return null;
  const st = stateFromView(view, {persp: 'foe'}); if (!st) return null;
  const moves = st.me.active.moves.filter(m => db.moves[m]);
  const {out, logits} = scoreCands(st, db, moves, st.me.bench, false);
  const cands = out.map((c, i) => ({k: c.kind === 'move' ? 'move:' + c.move : 'switch:' + c.idx, l: +logits[i].toFixed(3), g: +greedOf(c).toFixed(3), s: c.kind === 'switch' ? 1 : 0, r: c.kind === 'move' && c.move === st.me.active.lastMove ? 1 : 0}));
  // Unrevealed moves: one pooled 'move:?' option, so the read still learns whether you attack or switch.
  if (moves.length < 4) { const ml = cands.filter(c => !c.s).map(c => c.l); cands.push({k: 'move:?', l: ml.length ? +(Math.max(...ml) - .3).toFixed(3) : .2, g: 0, s: 0, r: 0}); }
  const unseen = view.opponent.some(p => p.unseen);
  if (unseen) { const sl = cands.filter(c => c.s).map(c => c.l); cands.push({k: 'switch:?', l: sl.length ? +(Math.max(...sl) - .4).toFixed(3) : -1.2, s: 1, r: 0}); }
  return cands.length >= 2 ? {turn: view.turn, foe: view.active[1][0], cands} : null;
}
// Per-slot distribution over this slot's legal actions (keys via actionKey-compatible strings).
export function slotPrior(view, db, slot, foeSlot = 0) {
  const st = stateFromView(view, {slot, foeSlot}); if (!st) return null;
  const me = view.own[view.active[0][slot]], legal = view.legal[slot] || [];
  const moveIds = [...new Set(legal.filter(a => a.kind === 'move' && !a.struggle).map(a => me.moves[a.index]?.id).filter(Boolean))];
  const benchIdx = new Set(legal.filter(a => a.kind === 'switch').map(a => a.index));
  const bench = st.me.bench.filter(b => benchIdx.has(b.idx));
  if (moveIds.length + bench.length < 2) return null;
  const {out, p} = scoreCands(st, db, moveIds, bench, false);
  const byMove = new Map(), bySwitch = new Map();
  out.forEach((c, i) => c.kind === 'move' ? byMove.set(c.move, p[i]) : bySwitch.set(c.idx, p[i]));
  return {byMove, bySwitch, st};
}
// Joint prior for the AI's own root actions. Returns Map(key -> probability) or null.
export function ownPrior(view, actionMap, db) {
  if (!ENABLED) return null;
  if (!view || !actionMap?.size) return null;
  const slots = view.legal.length, per = [];
  for (let s = 0; s < slots; s++) {
    const foes = view.active[1].map((i, k) => k).filter(k => { const f = view.opponent[view.active[1][k]]; return f && !f.unseen && f.hpPercent > 0; });
    per.push(foes.map(k => ({k, pr: slotPrior(view, db, s, k)})).filter(x => x.pr));
  }
  if (per.every(x => !x.length)) return null;
  const out = new Map(); let z = 0;
  for (const [key, actions] of actionMap) {
    let prob = 1;
    actions.forEach((a, s) => {
      const opts = per[s]; if (!opts?.length || a.kind === 'pass') return;
      const me = view.own[view.active[0][s]];
      let pick = opts[0];
      if (a.target && a.target.side === 0) pick = opts.find(o => o.k === a.target.slot) || pick;
      const pr = pick.pr;
      if (a.kind === 'switch') prob *= pr.bySwitch.get(a.index) ?? .02;
      else if (a.kind === 'move') {
        const mid = me?.moves[a.index]?.id, n = [...actionMap.values()].filter(xs => xs[s]?.kind === 'move' && view.own[view.active[0][s]]?.moves[xs[s].index]?.id === mid).length || 1;
        prob *= (pr.byMove.get(mid) ?? .02) / Math.sqrt(n); // mechanic / target variants share the base move's mass
        if (a.target && a.target.side === 1) prob *= .15; // hitting an ally is rare among experts
      }
    });
    out.set(key, prob); z += prob;
  }
  if (!(z > 0)) return null;
  for (const [k, v] of out) out.set(k, v / z);
  return out;
}
// Geometric blend: policy^(1-λ) · prior^λ. Keeps support of the search policy; never adds illegal keys.
export function blendRoot(policy, actionMap, view, db, lambda) {
  if (!ENABLED || !(lambda > 0) || !policy?.length) return {policy, used: false};
  let prior; try { prior = ownPrior(view, actionMap, db); } catch (e) { return {policy, used: false, error: String(e.message || e)}; }
  if (!prior) return {policy, used: false};
  const floor = .01, keys = new Set(policy.map(p => p.key));
  let out = policy.map(p => ({...p, weight: Math.pow(Math.max(1e-6, p.weight), 1 - lambda) * Math.pow(Math.max(floor, prior.get(p.key) ?? floor), lambda)}));
  const z = out.reduce((n, p) => n + p.weight, 0); out = out.map(p => ({...p, weight: p.weight / z})).sort((a, b) => b.weight - a.weight);
  const top = [...prior].filter(([k]) => keys.has(k)).sort((a, b) => b[1] - a[1])[0];
  return {policy: out, used: true, top: top ? {key: top[0], p: Math.round(top[1] * 1000) / 1000} : null};
}
// Replacement (after faint / pivot): Map(index -> probability)
export function replacementPrior(view, db, candidatesIdx, slot = 0) {
  if (!ENABLED) return null;
  const st = stateFromView(view, {slot}); if (!st) return null;
  const bench = st.me.bench.filter(b => candidatesIdx.includes(b.idx)); if (bench.length < 2) return null;
  const {out, p} = scoreCands(st, db, [], bench, true);
  return new Map(out.map((c, i) => [c.idx, p[i]]));
}
// Opponent (player) model for the council: P(move id) for the player's active + P(switch).
export function foeModel(view, db, extraMoves) {
  if (!ENABLED) return null;
  const st = stateFromView(view, {persp: 'foe', extraFoeMoves: extraMoves}); if (!st) return null;
  const moves = st.me.active.moves.filter(m => db.moves[m]); if (!moves.length) return null;
  const {out, p} = scoreCands(st, db, moves, st.me.bench, false, true);
  const byMove = new Map(); let sw = 0;
  out.forEach((c, i) => c.kind === 'move' ? byMove.set(c.move, p[i]) : sw += p[i]);
  return {byMove, switchProb: sw};
}
// ---------- Showdown simulation state (canonical search worlds) ----------
const simMon = (b, p) => ({species: p.species.id, level: p.level, hp: p.maxhp ? p.hp / p.maxhp : 0, status: p.status || '', boosts: boostsOf(p.boosts), types: p.getTypes ? p.getTypes() : [...p.types],
  moves: p.moveSlots.map(m => m.id), item: p.item || '', ability: p.ability || '', tera: !!p.terastallized, lastMove: p.lastMove?.id || null,
  stats: {...p.storedStats, hp: p.maxhp}});
function simField(side) { const c = side.sideConditions || {}; return {stealthrock: c.stealthrock ? 1 : 0, spikes: c.spikes?.layers || 0, toxicspikes: c.toxicspikes?.layers || 0, stickyweb: c.stickyweb ? 1 : 0, reflect: !!c.reflect, lightscreen: !!c.lightscreen, auroraveil: !!c.auroraveil, tailwind: !!c.tailwind}; }
export function stateFromSim(b, side, slot = 0) {
  const S = b.sides[side], F = b.sides[1 - side], me = S.active[slot], foe = F.active.find(p => p && !p.fainted && p.hp > 0);
  if (!me || me.fainted || !foe) return null;
  const alive = p => p && !p.fainted && p.hp > 0;
  return {format: 'rand', turn: b.turn || 1, weather: id(b.field.weather), terrain: id(b.field.terrain), trickroom: !!b.field.pseudoWeather?.trickroom,
    me: {active: simMon(b, me), bench: S.pokemon.filter(p => alive(p) && !S.active.includes(p)).map(p => ({idx: p.set._aiIndex, mon: simMon(b, p)}))},
    foe: {active: simMon(b, foe), bench: F.pokemon.filter(p => alive(p) && !F.active.includes(p) && p.set?._aiRevealed !== false).map(p => simMon(b, p))},
    myField: simField(S), foeField: simField(F), myLeft: S.pokemon.filter(alive).length, foeLeft: F.pokemon.filter(alive).length};
}
// Probability of each opponent column (joint actions) under the human model, singles only.
export function simReplyPrior(b, side, columns, db) {
  if (!ENABLED) return null;
  if (b.gameType === 'doubles') return null;
  const st = stateFromSim(b, side); if (!st) return null;
  const me = b.sides[side].active[0];
  const moveIds = [...new Set(me.moveSlots.filter(m => m.pp > 0 && !m.disabled).map(m => m.id))];
  const {out, p} = scoreCands(st, db, moveIds, st.me.bench, false, true);
  const byMove = new Map(), bySwitch = new Map();
  out.forEach((c, i) => c.kind === 'move' ? byMove.set(c.move, p[i]) : bySwitch.set(c.idx, p[i]));
  const q = columns.map(actions => { const a = actions[0]; if (!a) return .01; if (a.kind === 'switch') return bySwitch.get(a.index) ?? .01; if (a.kind === 'move') return (byMove.get(me.moveSlots[a.index]?.id) ?? .01) * (a.mechanic ? .5 : 1); return .01; });
  const z = q.reduce((n, x) => n + x, 0); return z > 0 ? q.map(x => x / z) : null;
}
// Mix the equilibrium with a best response to the predicted human reply ("reads"), per world.
export function exploitMix(eq, matrices, qs, alpha, temp = .035) {
  if (!ENABLED) return null;
  if (!(alpha > 0) || !qs?.length || qs.some(q => !q)) return null;
  const rows = eq.length, v = Array(rows).fill(0);
  for (let w = 0; w < matrices.length; w++) for (let i = 0; i < rows; i++) v[i] += matrices[w][i].reduce((n, x, j) => n + x * qs[w][j], 0) / matrices.length;
  const br = softmax(v, temp);
  return {policy: eq.map((p, i) => (1 - alpha) * p + alpha * br[i]), values: v};
}
