// Headless A/B arena for the REAL repo engine + AI (battle.js + Showdown adapter + search worker decide()).
// Usage: node arena.mjs <tier> <pairs> <seed> [outfile]
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import {pathToFileURL} from 'url';
const ROOT = '/home/user/work/pbn';
globalThis.window = globalThis; globalThis.self = globalThis;
const WARP = Number(process.env.WARP || 1); if (WARP !== 1) { const real = performance.now.bind(performance), t0w = real(); performance.now = () => t0w + (real() - t0w) * WARP; }
// Workers/DOM are not needed; fetch() of local files is shimmed for the AI boot.
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { const s = String(u); if (s.startsWith('file:')) { const p = decodeURIComponent(new URL(s).pathname); const buf = fs.readFileSync(p); return new Response(buf, {status: 200, headers: {'content-type': p.endsWith('.wasm') ? 'application/wasm' : 'application/json'}}); } return realFetch(u, o); };
const scripts = ['src/data/official-names.js', 'src/engine/name-policy.js', 'src/engine/opponent-training.js', 'st-bridge/gender.js', 'st-bridge/battle-mechanics.js', 'src/engine/gear-resolve.js', 'st-bridge/ability-random.js', 'src/engine/ability-choice.js', 'src/engine/typechart.js', 'src/engine/mechanics.js', 'src/ui/mechanic-items.js', 'src/engine/move-lifecycle.js', 'src/engine/ps-move-data.js', 'src/engine/move-scripts.js', 'src/engine/team-selection.js', 'src/engine/battle.js', 'src/engine/showdown/ps-engine.js', 'src/engine/showdown/rule-text.js', 'src/engine/field-environment.js', 'src/engine/anime-mode.js', 'src/engine/battle-showdown-adapter.js', 'src/engine/team.js', 'src/data/presets.js'];
const _log = console.log; console.log = () => {}; // engine chatter
for (const s of scripts) { try { vm.runInThisContext(fs.readFileSync(path.join(ROOT, s), 'utf8'), {filename: s}); } catch (e) { console.error('load fail', s, String(e.message).slice(0, 200)); } }
console.log = _log;
const J = n => JSON.parse(fs.readFileSync(`${ROOT}/src/data/${n}.json`));
const dex = J('pokedex'), moves = J('moves'), learnsets = J('learnsets');
PKMBattle.setData(dex, moves); PKMTeam.setData(dex, moves, learnsets); PKMBattle._circuitLearnsets = learnsets; PKMBattle._dex = dex; PKMBattle._moves = moves;
const bv = await import(pathToFileURL(`${ROOT}/src/ai/battle-view.mjs`).href + '?v=20261118-ai-elite-v3&cmd=kanto-crown-v72');
const prof = await import(pathToFileURL(`${ROOT}/src/ai/profile.mjs`).href + '?v=npc-tier-wiring-v1&cmd=kanto-crown-v72');
const worker = await import(pathToFileURL(`${ROOT}/src/ai/search-worker.mjs`).href + '?v=x');
const rp = await import(pathToFileURL(`${ROOT}/src/ai/replacement-policy.mjs`).href + '?v=public-reserves-v71');
const HP = await import(pathToFileURL(`${ROOT}/src/ai/expert/human-prior.mjs`).href + '?v=human-prior-v2');
const env = await worker.boot();
if (!env.native) console.error('WASM not loaded:', env.wasmError);

const VM = await import(pathToFileURL(`${ROOT}/src/ai/expert/value-model.mjs`).href + '?v=value-v1');
const setCfg = c => { HP.setExpertConfig(c); VM.setValueConfig({enabled: !!c.value, mul: c.vmul || 1}); };
const FR = await import(pathToFileURL(`${ROOT}/src/ai/expert/foe-reads.mjs`).href + '?v=foe-reads-v1');
const [tier, proxy, pairs = 4, seed0 = 1, configsArg = 'v1,v2', handicap = 0, outFile] = process.argv.slice(2);
const CONFIGS = {off: {enabled: false, adapt: false, crownRead: false, alphaMul: 1}, v1: {enabled: true, adapt: false, crownRead: false, alphaMul: 1}, v2: {enabled: true, adapt: true, crownRead: true, alphaMul: 1}, adapt: {enabled: true, adapt: true, crownRead: false, alphaMul: 1}, crown: {enabled: true, adapt: false, crownRead: true}, v1a: {enabled: true, adapt: false, crownRead: false, alphaMul: 1.6}, adapta: {enabled: true, adapt: true, crownRead: false, alphaMul: 1.6}};
Object.assign(CONFIGS, {base: {enabled: true, adapt: true, crownRead: false, alphaMul: 1}, val: {enabled: true, adapt: true, crownRead: false, alphaMul: 1, value: true}, val2: {enabled: true, adapt: true, crownRead: false, alphaMul: 1, value: true, vmul: 1}, valhalf: {enabled: true, adapt: true, crownRead: false, alphaMul: 1, value: true, vmul: .5}, valonly: {enabled: false, adapt: false, crownRead: false, alphaMul: 1, value: true}});
Object.assign(CONFIGS, {blind: {...CONFIGS.val2}, master: {...CONFIGS.val2, tier: 'master'}});
const configs = configsArg.split(',');
const PROXYCFG = CONFIGS[process.env.PROXYCFG || 'base'];
const profile = {tier, label: prof.TIERS[tier].label, settings: {...prof.TIERS[tier]}, style: 'balanced', intent: 'serious'};
const POOL = src_pool();
function src_pool() { return 'venusaur charizard blastoise butterfree beedrill pidgeot raticate arbok raichu sandslash nidoqueen nidoking clefable ninetales wigglytuff vileplume parasect venomoth dugtrio persian golduck primeape arcanine poliwrath alakazam machamp victreebel tentacruel golem rapidash slowbro magneton dodrio dewgong muk cloyster gengar hypno kingler electrode exeggutor marowak hitmonlee hitmonchan weezing rhydon chansey tangela kangaskhan seaking starmie mrmime scyther jynx electabuzz magmar pinsir tauros gyarados lapras vaporeon jolteon flareon porygon omastar kabutops aerodactyl snorlax dragonite'.split(' '); }
let rs = Number(seed0) >>> 0; const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
function makeTeamSpec(n = 6) { const pick = new Set(); while (pick.size < n) pick.add(POOL[(rnd() * POOL.length) | 0]); return [...pick].map(s => ({s, moves: PKMTeam.chooseAutoMoves(s, 50)})); }
const build = (spec, lv) => spec.map(x => PKMBattle.createPokemon(x.s, lv, x.moves, {generateIdentity: false}));
function mirror(b) {
  const swap = s => 1 - s;
  return new Proxy(b, {get(t, k) {
    if (k === 'teams') return [t.teams[1], t.teams[0]];
    if (k === 'activeSlots') return [t.activeSlots[1], t.activeSlots[0]];
    if (k === 'mechanicUsed') return [t.mechanicUsed?.[1] || {}, t.mechanicUsed?.[0] || {}];
    if (k === 'field') return {...t.field, sides: t.field.sides ? [t.field.sides[1], t.field.sides[0]] : t.field.sides};
    if (k === 'cur') return (s, slot) => t.cur(swap(s), slot);
    if (k === 'activeMons') return s => t.activeMons(swap(s));
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  }});
}
// ---------- proxies for the human player (side 0) ----------
function eff(ps, type, p) { try { if (!ps.dex.getImmunity(type, p)) return 0; return Math.pow(2, ps.dex.getEffectiveness(type, p)); } catch (e) { return 1; } }
function estFrac(ps, src, tgt, mid) {
  const m = ps.dex.moves.get(mid); if (!m || m.category === 'Status' || !m.basePower) return 0;
  const phys = m.category === 'Physical', A = src.getStat(phys ? 'atk' : 'spa', false, true), D = tgt.getStat(phys ? 'def' : 'spd', false, true);
  const base = Math.floor(Math.floor(Math.floor(2 * src.level / 5 + 2) * m.basePower * A / Math.max(1, D)) / 50) + 2;
  const d = base * (src.hasType(m.type) ? 1.5 : 1) * eff(ps, m.type, tgt) * .925 * (m.accuracy === true ? 1 : m.accuracy / 100);
  return Math.min(1.2, d / Math.max(1, tgt.hp));
}
function casualMove(b, rng, stubborn) {
  const ps = b._ps, me = ps.sides[0].active[0], foe = ps.sides[1].active[0], legal = b.legalActions ? null : null;
  const view = bv.observation(mirror(b), profile, {}), acts = view.legal[0].filter(a => !a.mechanic);
  const nat = b.cur(0);
  const score = a => {
    if (a.kind !== 'move') return -1; if (a.struggle) return .1;
    const mid = nat.moves[a.index]?.id, m = ps.dex.moves.get(mid); let f = estFrac(ps, me, foe, mid);
    if (f >= 1) f = 1.2 + (m.priority > 0 ? .3 : 0);
    if (m.category === 'Status') f = (m.status && !foe.status) ? .18 : (m.heal && me.hp < me.maxhp * .5) ? .45 : (m.boosts && !stubborn) ? .12 : .03;
    return f;
  };
  const moves = acts.filter(a => a.kind === 'move'), sws = acts.filter(a => a.kind === 'switch');
  if (!moves.length) return acts[0] || {kind: 'pass'};
  const sc = moves.map(score), best = moves[sc.indexOf(Math.max(...sc))];
  if (stubborn) return best;
  const r = rng();
  if (r < .10) return moves[(rng() * moves.length) | 0];
  if (Math.max(...sc) < .22 && sws.length && r < .40) { // bad matchup: switch to the bench member with the best hit
    const bs = sws.map(a => { const q = ps.sides[0].pokemon.find(x => x.set._nativeIndex === a.index); return q ? Math.max(0, ...q.moveSlots.map(s => estFrac(ps, q, foe, s.id))) : 0; });
    return sws[bs.indexOf(Math.max(...bs))];
  }
  return best;
}
function casualReplace(b) {
  const ps = b._ps, foe = ps.sides[1].active[0], opts = b.replacementOptions();
  const bs = opts.map(i => { const q = ps.sides[0].pokemon.find(x => x.set._nativeIndex === i); return q && foe ? Math.max(0, ...q.moveSlots.map(s => estFrac(ps, q, foe, s.id))) : 0; });
  return opts[bs.indexOf(Math.max(...bs))];
}
function sampleMap(m, rng) { let r = rng(), last = null; for (const [k, p] of m) { last = k; r -= p; if (r <= 0) return k; } return last; }
function ladderMove(b, rng) {
  setCfg({enabled: true});
  const view = bv.observation(mirror(b), profile, {}), am = new Map(view.legal[0].filter(a => !a.mechanic).map(a => [bv.actionKey ? bv.actionKey(a) : JSON.stringify(a), [a]]));
  const pr = HP.ownPrior(view, am, dbAll); const k = pr ? sampleMap(pr, rng) : [...am.keys()][0];
  return am.get(k)[0];
}
function ladderReplace(b, rng) {
  setCfg({enabled: true});
  const B = mirror(b), view = bv.replacementObservation(B, profile), opts = b.replacementOptions();
  const pr = opts.length > 1 ? HP.replacementPrior(view, dbAll, opts) : null; return pr ? sampleMap(pr, rng) : opts[0];
}
const dbAll = {dex, moves, learnsets};
function aiReplacement(b, side, P = profile) {
  const B = side === 1 ? b : mirror(b);
  const candidates = B.teams[1].map((p, i) => ({p, i})).filter(({p, i}) => p.hp > 0 && !p.fainted && !B.activeSlots[1].includes(i)).map(({i}) => i);
  if (!candidates.length) return -1;
  const view = bv.replacementObservation(B, P), request = {totalSlots: 1, switchesLeft: 1, passesLeft: 0, slots: [{slot: 0, kind: 'switch', phase: 'faint', candidates}]};
  const plans = rp.rankReplacementPlans(view, request, dbAll);
  return rp.chooseReplacementPlan(plans, view.profile, {rng: () => 1}).actions.find(a => a.kind === 'switch')?.index ?? candidates[0];
}
function proxyProfile(t) { return ({tier: t, label: prof.TIERS[t].label, settings: {...prof.TIERS[t]}, style: 'balanced', intent: 'serious'}); }
const _unusedProxyProfile = t => ({tier: t, label: prof.TIERS[t].label, settings: {...prof.TIERS[t]}, style: 'balanced', intent: 'serious'});
function play(specAI, specP, cfgName, seed) {
  const cfg = CONFIGS[cfgName], P = cfg.tier ? proxyProfile(cfg.tier) : profile, PP = proxy.startsWith('mirror-') ? proxyProfile(proxy.slice(7)) : profile;
  const b = new PKMBattle.Battle(build(specP, 50 + Number(handicap)), build(specAI, 50), {double: false, difficulty: 'hard', encounterType: 'trainer', seed});
  let gs = seed >>> 0; const rng = () => { gs = (Math.imul(gs, 1664525) + 1013904223) >>> 0; return gs / 4294967296; };
  let planned = null; const mem = {pending: null, reads: []};
  b.aiController = {consume: () => planned, replacement: () => (setCfg(cfg), aiReplacement(b, 1, P)), replacements: () => [{kind: 'switch', index: (setCfg(cfg), aiReplacement(b, 1, P)), slot: 0}], replacementFailure: () => {}};
  b.aiObserver = {see: p => { if (p?._side === 0) bv.rememberPublic(p); }};
  let guard = 0, last = null, ms = 0, n = 0;
  while (b.winner === null && guard++ < 300) {
    if (b.pendingSwitch !== null) { b.forceSwitch(proxy === 'ladder' ? ladderReplace(b, rng) : proxy.startsWith('mirror-') ? (setCfg(PROXYCFG), aiReplacement(b, 0, PP)) : proxy.startsWith('ai-') ? (setCfg(CONFIGS.off), aiReplacement(b, 0)) : casualReplace(b)); continue; }
    const s = (seed * 7919 + b.turnCount * 104729) >>> 0;
    setCfg(cfg);
    const t0 = Date.now(), r = worker.decide(bv.observation(b, P, {foeReads: mem.reads}), env, {seed: s}); ms += Date.now() - t0; n++;
    last = r.info; planned = r.actions[0];
    if (cfg.adapt && r.info?.foePredict) FR.armFoeRead(mem, r.info.foePredict, b._ps);
    let pa;
    if (proxy === 'ladder') pa = ladderMove(b, rng);
    else if (proxy.startsWith('mirror-')) { setCfg(PROXYCFG); const pt = proxy.slice(7); pa = worker.decide(bv.observation(mirror(b), proxyProfile(pt), {}), env, {seed: s ^ 0x5bd1e995}).actions[0]; }
    else if (proxy.startsWith('ai-')) { setCfg(CONFIGS.off); const pt = proxy.slice(3); pa = worker.decide(bv.observation(mirror(b), proxyProfile(pt), {}), env, {seed: s ^ 0x5bd1e995}).actions[0]; }
    else pa = casualMove(b, rng, proxy === 'stubborn');
    b.turn(pa);
    FR.settleFoeRead(mem, b._ps, 0);
  }
  const hp = side => b.teams[side].reduce((n, p) => n + Math.max(0, p.hp) / p.maxHp, 0) / b.teams[side].length;
  return {oracle: !!last?.master?.oracle, winner: b.winner, turns: b.turnCount, margin: +(hp(1) - hp(0)).toFixed(3), msPer: Math.round(ms / Math.max(1, n)), read: last?.foeRead || null, reads: mem.reads.length};
}
const results = [], agg = Object.fromEntries(configs.map(c => [c, {g: 0, w: 0, m: 0}])); const t0 = Date.now();
for (let p = 0; p < Number(pairs); p++) {
  const A = makeTeamSpec(), B = makeTeamSpec(), base = (Number(seed0) * 1000 + p * 17) >>> 0;
  for (const [ta, tb, k] of [[A, B, 0], [B, A, 1]]) for (const c of configs) {
    let r; try { r = play(ta, tb, c, base + k); } catch (e) { console.error('game error', String(e.stack || e).slice(0, 500)); continue; }
    const a = agg[c]; a.g++; a.w += r.winner === 1 ? 1 : 0; a.m += r.margin;
    results.push({pair: p, k, cfg: c, ...r});
    console.error(`[${tier} vs ${proxy} h${handicap}] p${p}${'ab'[k]} ${c.padEnd(5)} win=${r.winner === 1 ? 'AI' : 'P '} m=${r.margin} t=${r.turns} ${r.msPer}ms reads=${r.reads}${r.read ? ` a=${r.read.a} b=${r.read.beta} r=${r.read.rho} x${r.read.alphaScale}` : ''} | ` + configs.map(c => `${c} ${agg[c].w}/${agg[c].g} m${(agg[c].m / Math.max(1, agg[c].g)).toFixed(3)}`).join('  ') + ` ${((Date.now() - t0) / 1000) | 0}s`);
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({tier, proxy, handicap, agg, results}, null, 1));
}
console.log(JSON.stringify({tier, proxy, handicap, agg}));
