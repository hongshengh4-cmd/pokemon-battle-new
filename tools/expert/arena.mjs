// Headless A/B arena for the REAL repo engine + AI (battle.js + Showdown adapter + search worker decide()).
// Usage: node arena.mjs <tier> <pairs> <seed> [outfile]
import fs from 'fs'; import vm from 'vm'; import path from 'path'; import {pathToFileURL, fileURLToPath} from 'url';
const ROOT = process.env.PBN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.window = globalThis; globalThis.self = globalThis;
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
const [tier, pairs = 10, seed0 = 1, outFile] = process.argv.slice(2);
const profile = {tier, label: prof.TIERS[tier].label, settings: {...prof.TIERS[tier]}, style: 'balanced', intent: 'serious'};
const POOL = 'venusaur charizard blastoise butterfree beedrill pidgeot raticate arbok raichu sandslash nidoqueen nidoking clefable ninetales wigglytuff vileplume parasect venomoth dugtrio persian golduck primeape arcanine poliwrath alakazam machamp victreebel tentacruel golem rapidash slowbro magneton dodrio dewgong muk cloyster gengar hypno kingler electrode exeggutor marowak hitmonlee hitmonchan weezing rhydon chansey tangela kangaskhan seaking starmie mrmime scyther jynx electabuzz magmar pinsir tauros gyarados lapras vaporeon jolteon flareon omastar kabutops aerodactyl snorlax dragonite'.split(' ');
let rs = Number(seed0) >>> 0; const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
function makeTeamSpec(n = 6) { const pick = new Set(); while (pick.size < n) pick.add(POOL[(rnd() * POOL.length) | 0]); return [...pick].map(s => ({s, level: 50, moves: PKMTeam.chooseAutoMoves(s, 50)})); }
const build = spec => spec.map(x => PKMBattle.createPokemon(x.s, x.level, x.moves, {generateIdentity: false}));
// A side-swapped facade so the same observation() code can drive the player side too.
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
function decideFor(b, side, expertOn, seed) {
  HP.setExpertEnabled(expertOn);
  const view = side === 1 ? bv.observation(b, profile, {}) : bv.observation(mirror(b), profile, {});
  const r = worker.decide(view, env, {seed});
  return {action: r.actions[0], info: r.info};
}
function replacementFor(b, side, expertOn) {
  HP.setExpertEnabled(expertOn);
  const B = side === 1 ? b : mirror(b);
  const candidates = B.teams[1].map((p, i) => ({p, i})).filter(({p, i}) => p.hp > 0 && !p.fainted && !B.activeSlots[1].includes(i)).map(({i}) => i);
  if (!candidates.length) return -1;
  const view = bv.replacementObservation(B, profile), request = {totalSlots: 1, switchesLeft: 1, passesLeft: 0, slots: [{slot: 0, kind: 'switch', phase: 'faint', candidates}]};
  const plans = rp.rankReplacementPlans(view, request, {dex, moves, learnsets});
  return rp.chooseReplacementPlan(plans, profile, {rng: () => 1}).actions.find(a => a.kind === 'switch')?.index ?? candidates[0];
}
function play(specA, specB, onSide, seed) {
  // onSide: which side runs the expert-enabled AI. Team A is always side 0's team.
  const b = new PKMBattle.Battle(build(specA), build(specB), {double: false, difficulty: 'hard', encounterType: 'trainer', seed});
  let planned = null;
  b.aiController = {consume: () => planned, replacement: () => replacementFor(b, 1, onSide === 1), replacements: req => [{kind: 'switch', index: replacementFor(b, 1, onSide === 1), slot: 0}], replacementFailure: () => {}};
  b.aiObserver = {see: p => { if (p?._side === 0) bv.rememberPublic(p); }};
  let guard = 0, notes = {expertUsed: 0, decisions: 0};
  while (b.winner === null && guard++ < 300) {
    if (b.pendingSwitch !== null) { const idx = replacementFor(b, 0, onSide === 0); b.forceSwitch(idx); continue; }
    const s = (seed * 7919 + b.turnCount * 104729) >>> 0;
    const enemy = decideFor(b, 1, onSide === 1, s), player = decideFor(b, 0, onSide === 0, s ^ 0x5bd1e995);
    for (const x of [enemy, player]) { notes.decisions++; if (x.info?.humanPrior || x.info?.canonical?.humanModel) notes.expertUsed++; }
    planned = enemy.action;
    b.turn(player.action);
  }
  return {winner: b.winner, turns: b.turnCount, notes};
}
const results = []; let onWins = 0, games = 0, t0 = Date.now();
for (let p = 0; p < Number(pairs); p++) {
  const A = makeTeamSpec(), B = makeTeamSpec(), base = (Number(seed0) * 1000 + p * 17) >>> 0;
  for (const [ta, tb, on] of [[A, B, 1], [B, A, 1], [A, B, 0], [B, A, 0]]) {
    let r; try { r = play(ta, tb, on, base + games); } catch (e) { console.error('game error', String(e.stack || e).slice(0, 400)); continue; }
    if (r.winner === null) continue;
    games++; const won = r.winner === on; onWins += won ? 1 : 0;
    results.push({pair: p, on, winner: r.winner, turns: r.turns, ...r.notes});
    console.error(`[${tier}] pair ${p} on=side${on} winner=side${r.winner} turns=${r.turns} expertUsed=${r.notes.expertUsed}/${r.notes.decisions} | expert ${onWins}/${games} (${(onWins / games * 100).toFixed(1)}%) ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({tier, games, onWins, results}, null, 1));
}
console.log(JSON.stringify({tier, games, onWins, rate: onWins / games}));
