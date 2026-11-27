// SPDX-License-Identifier: MIT
// Expert-prior feature space. Shared VERBATIM by the offline replay trainer and the
// in-game AI, so a decision is described identically in both places.
// Input is a public "decision state" (see stateFromView in human-prior.mjs);
// nothing here reads a Battle object, RNG, or the opponent's private set.
export const FEATURE_BUILD = 'expert-features-v1';
const CHART = {Normal:{Rock:.5,Ghost:0,Steel:.5},Fire:{Fire:.5,Water:.5,Grass:2,Ice:2,Bug:2,Rock:.5,Dragon:.5,Steel:2},Water:{Fire:2,Water:.5,Grass:.5,Ground:2,Rock:2,Dragon:.5},Electric:{Water:2,Electric:.5,Grass:.5,Ground:0,Flying:2,Dragon:.5},Grass:{Fire:.5,Water:2,Grass:.5,Poison:.5,Ground:2,Flying:.5,Bug:.5,Rock:2,Dragon:.5,Steel:.5},Ice:{Fire:.5,Water:.5,Grass:2,Ice:.5,Ground:2,Flying:2,Dragon:2,Steel:.5},Fighting:{Normal:2,Ice:2,Poison:.5,Flying:.5,Psychic:.5,Bug:.5,Rock:2,Ghost:0,Dark:2,Steel:2,Fairy:.5},Poison:{Grass:2,Poison:.5,Ground:.5,Rock:.5,Ghost:.5,Steel:0,Fairy:2},Ground:{Fire:2,Electric:2,Grass:.5,Poison:2,Flying:0,Bug:.5,Rock:2,Steel:2},Flying:{Electric:.5,Grass:2,Fighting:2,Bug:2,Rock:.5,Steel:.5},Psychic:{Fighting:2,Poison:2,Psychic:.5,Dark:0,Steel:.5},Bug:{Fire:.5,Grass:2,Fighting:.5,Poison:.5,Flying:.5,Psychic:2,Ghost:.5,Dark:2,Steel:.5,Fairy:.5},Rock:{Fire:2,Ice:2,Fighting:.5,Ground:.5,Flying:2,Bug:2,Steel:.5},Ghost:{Normal:0,Psychic:2,Ghost:2,Dark:.5},Dragon:{Dragon:2,Steel:.5,Fairy:0},Dark:{Fighting:.5,Psychic:2,Ghost:2,Dark:.5,Fairy:.5},Steel:{Fire:.5,Water:.5,Electric:.5,Ice:2,Rock:2,Steel:.5,Fairy:2},Fairy:{Fire:.5,Fighting:2,Poison:.5,Dragon:2,Dark:2,Steel:.5}};
export const id = x => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const log2 = x => Math.log(x) / Math.LN2;
const IMMUNE_ABIL = {Ground: ['levitate', 'eartheater'], Water: ['waterabsorb', 'stormdrain', 'dryskin'], Fire: ['flashfire', 'wellbakedbody'], Electric: ['voltabsorb', 'lightningrod', 'motordrive'], Grass: ['sapsipper']};
const HAZARDS = {stealthrock: 1, spikes: 3, toxicspikes: 2, stickyweb: 1};
const REMOVAL = new Set(['defog', 'rapidspin', 'courtchange', 'tidyup', 'mortalspin']);
const PIVOT = new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'shedtail', 'batonpass']);
const PHAZE = new Set(['roar', 'whirlwind', 'dragontail', 'circlethrow']);
const CLEAR = new Set(['haze', 'clearsmog']);
const PROTECT = new Set(['protect', 'detect', 'kingsshield', 'spikyshield', 'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark', 'endure']);
const LOCKED = new Set(['outrage', 'petaldance', 'thrash', 'ragingfury', 'rollout', 'iceball', 'uproar']);
const BOOST_KEYS = ['atk', 'def', 'spa', 'spd', 'spe'];
export const FEATURES = [
  // move candidates
  'm_attack', 'm_dmg', 'm_ko', 'm_ko_first', 'm_eff', 'm_immune', 'm_stab', 'm_prio_use', 'm_miss', 'm_selfdrop',
  'm_status_cat', 'm_setup', 'm_setup_threat', 'm_setup_stack', 'm_setup_hp', 'm_hazard', 'm_hazard_dup', 'm_removal', 'm_removal_dup',
  'm_recover', 'm_recover_full', 'm_inflict', 'm_inflict_waste', 'm_protect', 'm_protect_repeat', 'm_pivot', 'm_pivot_threat',
  'm_phaze', 'm_clear', 'm_repeat', 'm_knock', 'm_lowhp_attack', 'm_status_threat', 'm_explode', 'm_dmg_slow', 'm_screen', 'm_screen_dup',
  'm_sub', 'm_trick_taunt',
  // switch candidates
  's_bias', 's_in_taken', 's_in_dmg', 's_in_hp', 's_in_fast', 's_in_status', 's_in_hazard', 's_out_danger', 's_out_dmg', 's_out_boost',
  's_out_unboost', 's_out_tox', 's_out_hp', 's_foe_boost', 's_in_resist_last', 's_in_ko_risk', 's_out_ko_risk', 's_left',
  's_bias_rand', 's_bias_nat', 's_out_locked_bad',
  // v2: foe-bench coverage + shared context (context only matters through the MLP's interactions)
  'm_cov_bench', 'm_bench_resist', 's_in_vs_bench', 'is_move', 'is_switch',
  'c_danger', 'c_myhp', 'c_foehp', 'c_faster', 'c_mybest', 'c_left', 'c_turn', 'c_foeboost', 'c_myboost', 'c_mystatus', 'c_foestatus'
];
export const NF = FEATURES.length;
const FI = Object.fromEntries(FEATURES.map((f, i) => [f, i]));
export function effectiveness(type, types) { return (types || []).reduce((m, t) => m * (CHART[type]?.[t] ?? 1), 1); }
function effOn(type, d) {
  if (!type || type === '???') return 1;
  const ab = id(d.ability);
  if (IMMUNE_ABIL[type]?.includes(ab)) return 0;
  if (type === 'Ground' && (id(d.item) === 'airballoon')) return 0;
  return effectiveness(type, d.types);
}
const stageMul = n => n >= 0 ? (2 + n) / 2 : 2 / (2 - n);
export function stat(db, p, k) {
  if (p.stats && p.stats[k]) return p.stats[k];
  const b = db.dex[id(p.species)]?.baseStats?.[k] || 80, L = p.level || 100;
  if (k === 'hp') return Math.floor((2 * b + 31 + 21) * L / 100) + L + 10;
  return Math.floor((2 * b + 31 + 21) * L / 100) + 5;
}
export function speed(db, p, side, st) {
  let s = stat(db, p, 'spe') * stageMul(p.boosts?.spe || 0);
  if (p.status === 'par') s *= .5;
  if (side?.tailwind) s *= 2;
  if (id(p.item) === 'choicescarf') s *= 1.5;
  return s;
}
function bpOf(db, m, att, def) {
  let bp = m.basePower || 0;
  if (['seismictoss', 'nightshade'].includes(m.id || id(m.name))) return {fixed: att.level || 100};
  if (m.id === 'superfang' || m.id === 'ruination') return {fraction: .5};
  if (!bp && m.category !== 'Status') bp = 60;
  if (Array.isArray(m.multihit)) bp *= 3; else if (m.multihit) bp *= m.multihit;
  if (m.id === 'knockoff' && def.item !== '') bp *= 1.5;
  return {bp};
}
// Expected damage as a fraction of the defender's max HP (rough, public-information calc).
export function dmgFrac(db, att, def, mid, st, attSide, moveObj) {
  const m = moveObj || db.moves[mid]; if (!m || m.category === 'Status') return 0;
  const b = bpOf(db, {...m, id: mid}, att, def);
  const eff = effOn(m.type, def); if (eff === 0) return 0;
  const hpD = stat(db, def, 'hp');
  if (b.fixed) return b.fixed / hpD;
  if (b.fraction) return b.fraction * (def.hp ?? 1);
  const phys = m.category === 'Physical';
  let A = stat(db, att, phys ? 'atk' : 'spa') * stageMul(att.boosts?.[phys ? 'atk' : 'spa'] || 0);
  if (mid === 'bodypress') A = stat(db, att, 'def') * stageMul(att.boosts?.def || 0);
  if (mid === 'foulplay') A = stat(db, def, 'atk') * stageMul(def.boosts?.atk || 0);
  let D = stat(db, def, phys ? 'def' : 'spd') * stageMul(def.boosts?.[phys ? 'def' : 'spd'] || 0);
  if (['psyshock', 'psystrike', 'secretsword'].includes(mid)) D = stat(db, def, 'def') * stageMul(def.boosts?.def || 0);
  const L = att.level || 100;
  let dmg = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * b.bp * A / Math.max(1, D)) / 50) + 2;
  const stab = (att.types || []).includes(m.type) || (att.teraType && att.tera && att.teraType === m.type);
  dmg *= stab ? (id(att.ability) === 'adaptability' ? 2 : 1.5) : 1;
  dmg *= eff;
  const w = id(st?.weather);
  if (/sun|desolate/.test(w)) dmg *= m.type === 'Fire' ? 1.5 : m.type === 'Water' ? .5 : 1;
  if (/rain|primordial/.test(w)) dmg *= m.type === 'Water' ? 1.5 : m.type === 'Fire' ? .5 : 1;
  if (phys && att.status === 'brn' && id(att.ability) !== 'guts' && mid !== 'facade') dmg *= .5;
  const scr = attSide === 'me' ? st.foeField : st.myField;
  if (scr?.auroraveil || (phys ? scr?.reflect : scr?.lightscreen)) dmg *= .5;
  if (id(att.item) === 'choiceband' && phys || id(att.item) === 'choicespecs' && !phys) dmg *= 1.5;
  if (id(att.item) === 'lifeorb') dmg *= 1.3;
  return dmg * .925 / hpD;
}
// Opponent threat: revealed attacks + an 80 BP STAB stand-in per type (players know species' common STABs).
function threatMoves(db, foe) {
  const out = [];
  for (const mid of foe.moves || []) { const m = db.moves[mid]; if (m && m.category !== 'Status') out.push(mid); }
  return out;
}
function stabProxy(db, att, def, st, attSide) {
  const bs = db.dex[id(att.species)]?.baseStats || {}, phys = (bs.atk || 0) >= (bs.spa || 0);
  let best = 0;
  for (const t of (att.tera && att.teraType ? [att.teraType] : att.types || [])) {
    const eff = effOn(t, def); if (!eff) continue;
    const fake = {basePower: 80, type: t, category: phys ? 'Physical' : 'Special'};
    best = Math.max(best, dmgFrac(db, att, def, '__proxy', st, attSide, fake));
  }
  return best;
}
export function bestDmg(db, att, def, st, attSide, known) {
  let best = 0, bestType = null;
  for (const mid of known) { const d = dmgFrac(db, att, def, mid, st, attSide); if (d > best) { best = d; bestType = db.moves[mid]?.type; } }
  return {best, bestType};
}
function threatTo(db, foe, me, st) {
  const k = bestDmg(db, foe, me, st, 'foe', threatMoves(db, foe));
  const proxy = stabProxy(db, foe, me, st, 'foe') * ((foe.moves || []).length >= 4 ? 0 : 1);
  return Math.max(k.best, proxy);
}
export function entryHazard(p, side) {
  if (!side || id(p.item) === 'heavydutyboots' || id(p.ability) === 'magicguard') return 0;
  const grounded = !(p.types || []).includes('Flying') && id(p.ability) !== 'levitate' && id(p.item) !== 'airballoon';
  return (side.stealthrock ? effectiveness('Rock', p.types) / 8 : 0) + (grounded ? [0, 1 / 8, 1 / 6, 1 / 4][clamp(side.spikes || 0, 0, 3)] : 0);
}
const boostSum = (p, sign) => BOOST_KEYS.reduce((n, k) => n + (sign > 0 ? Math.max(0, p.boosts?.[k] || 0) : Math.min(0, p.boosts?.[k] || 0)), 0);
const statusImmune = (m, foe) => {
  const s = m.status, t = foe.types || [];
  if (s === 'tox' || s === 'psn') return t.includes('Poison') || t.includes('Steel');
  if (s === 'brn') return t.includes('Fire');
  if (s === 'par') return t.includes('Electric') || (m.type === 'Electric' && t.includes('Ground'));
  if (m.flags?.powder) return t.includes('Grass');
  return false;
};
// state: {me:{active, bench[]}, foe:{active}, myField, foeField, weather, terrain, trickroom, myLeft, foeLeft, format}
// Returns shared context reused by every candidate.
export function context(db, st) {
  const me = st.me.active, foe = st.foe.active;
  const sMe = speed(db, me, st.myField, st), sFoe = speed(db, foe, st.foeField, st);
  let faster = sMe === sFoe ? .5 : (sMe > sFoe ? 1 : 0); if (st.trickroom) faster = 1 - faster;
  const threat = threatTo(db, foe, me, st);
  const myHp = clamp(me.hp ?? 1, 0, 1), foeHp = clamp(foe.hp ?? 1, 0.01, 1);
  const myBest = bestDmg(db, me, foe, st, 'me', me.moves || []).best;
  const foeBench = (st.foe.bench || []).filter(b => (b.hp ?? 1) > 0);
  const c = [clamp(threat / Math.max(.01, myHp), 0, 2.5), myHp, foeHp, faster, clamp(myBest / foeHp, 0, 1.5), ((st.myLeft || 3) - (st.foeLeft || 3)) / 6, Math.min(st.turn || 1, 40) / 40, boostSum(foe, 1) / 2, boostSum(me, 1) / 2, me.status ? 1 : 0, foe.status ? 1 : 0];
  return {faster, threat, myHp, foeHp, myBest, foeBench, ctx: c, dangerRel: c[0], koRisk: threat >= myHp ? 1 : 0};
}
const CTX0 = FEATURES.indexOf('c_danger');
function putCtx(x, cx) { for (let i = 0; i < cx.ctx.length; i++) x[CTX0 + i] = cx.ctx[i]; }
export function moveFeatures(db, st, cx, mid) {
  const x = new Float32Array(NF), me = st.me.active, foe = st.foe.active, m = db.moves[mid];
  if (!m) return x;
  const prio = m.priority || 0, acc = m.accuracy === true ? 1 : (m.accuracy || 100) / 100;
  x[FI.is_move] = 1; putCtx(x, cx);
  if (m.category !== 'Status') {
    if (cx.foeBench.length) { let cov = 0, res = 0; for (const b of cx.foeBench) { cov += clamp(dmgFrac(db, me, b, mid, st, 'me') / Math.max(.05, b.hp ?? 1), 0, 1.5); if (effOn(m.type, b) < 1) res++; } x[FI.m_cov_bench] = cov / cx.foeBench.length; x[FI.m_bench_resist] = res / cx.foeBench.length; }
    const d = dmgFrac(db, me, foe, mid, st, 'me'), rel = d / cx.foeHp, eff = effOn(m.type, foe);
    x[FI.m_attack] = 1; x[FI.m_dmg] = clamp(rel, 0, 1.5) * acc; const ko = rel >= 1 ? acc : 0; x[FI.m_ko] = ko;
    const first = prio > 0 ? 1 : prio < 0 ? 0 : cx.faster; x[FI.m_ko_first] = ko * first;
    x[FI.m_eff] = eff ? clamp(log2(eff), -2, 2) : 0; x[FI.m_immune] = eff ? 0 : 1;
    x[FI.m_stab] = (me.types || []).includes(m.type) ? 1 : 0;
    x[FI.m_prio_use] = prio > 0 ? (cx.foeHp < .3 || cx.faster < .5 ? 1 : 0) + (rel >= 1 ? 1 : 0) : 0;
    x[FI.m_miss] = 1 - acc;
    const sb = m.self?.boosts; x[FI.m_selfdrop] = sb ? -Object.values(sb).reduce((n, v) => n + Math.min(0, v), 0) / 2 : 0;
    x[FI.m_lowhp_attack] = cx.myHp < .25 ? 1 : 0;
    x[FI.m_knock] = mid === 'knockoff' && foe.item !== '' ? 1 : 0;
    x[FI.m_explode] = m.selfdestruct ? (cx.myHp < .35 ? 1 : -1) : 0;
    x[FI.m_dmg_slow] = cx.faster < .5 && prio <= 0 ? clamp(rel, 0, 1.5) * cx.koRisk : 0;
    if (PIVOT.has(mid)) { x[FI.m_pivot] = 1; x[FI.m_pivot_threat] = cx.dangerRel; }
    if (PHAZE.has(mid)) x[FI.m_phaze] = boostSum(foe, 1);
    if (CLEAR.has(mid)) x[FI.m_clear] = boostSum(foe, 1);
  } else {
    x[FI.m_status_cat] = 1; x[FI.m_status_threat] = cx.dangerRel;
    const up = m.target === 'self' || m.target === 'allySide' ? (m.boosts || m.self?.boosts) : m.self?.boosts;
    const gain = up ? Object.values(up).reduce((n, v) => n + Math.max(0, v), 0) : 0;
    if (gain && !m.heal) { x[FI.m_setup] = gain / 2; x[FI.m_setup_threat] = gain / 2 * cx.dangerRel; x[FI.m_setup_stack] = gain / 2 * boostSum(me, 1) / 2; x[FI.m_setup_hp] = gain / 2 * cx.myHp; }
    const hz = m.sideCondition && HAZARDS[id(m.sideCondition)];
    if (hz) { const have = st.foeField?.[id(m.sideCondition)] || 0; if (have >= hz) x[FI.m_hazard_dup] = 1; else x[FI.m_hazard] = (st.foeLeft || 3) / 6; }
    if (['reflect', 'lightscreen', 'auroraveil'].includes(mid)) { if (st.myField?.[mid]) x[FI.m_screen_dup] = 1; else x[FI.m_screen] = 1; }
    if (m.heal || ['roost', 'wish', 'rest', 'synthesis', 'morningsun', 'moonlight', 'shoreup', 'slackoff', 'softboiled', 'recover', 'milkdrink', 'strengthsap', 'painsplit'].includes(mid)) { x[FI.m_recover] = 1 - cx.myHp; x[FI.m_recover_full] = cx.myHp > .9 ? 1 : 0; }
    if (m.status || mid === 'yawn') { if (foe.status || statusImmune(m, foe)) x[FI.m_inflict_waste] = 1; else x[FI.m_inflict] = 1; }
    if (PROTECT.has(mid)) { x[FI.m_protect] = 1; x[FI.m_protect_repeat] = PROTECT.has(me.lastMove) ? 1 : 0; }
    if (PIVOT.has(mid)) { x[FI.m_pivot] = 1; x[FI.m_pivot_threat] = cx.dangerRel; }
    if (PHAZE.has(mid)) x[FI.m_phaze] = boostSum(foe, 1);
    if (CLEAR.has(mid)) x[FI.m_clear] = boostSum(foe, 1);
    if (mid === 'substitute') x[FI.m_sub] = cx.myHp > .5 ? 1 : -1;
    if (['trick', 'switcheroo', 'taunt', 'encore', 'disable', 'torment'].includes(mid)) x[FI.m_trick_taunt] = 1;
  }
  if (REMOVAL.has(mid)) { const hz = st.myField || {}; const n = (hz.stealthrock ? 1 : 0) + (hz.spikes || 0) + (hz.toxicspikes ? 1 : 0) + (hz.stickyweb ? 1 : 0); if (n) x[FI.m_removal] = n; else x[FI.m_removal_dup] = 1; }
  if (me.lastMove && me.lastMove === mid) x[FI.m_repeat] = LOCKED.has(mid) ? 2 : 1;
  return x;
}
export function switchFeatures(db, st, cx, cand, forced) {
  const x = new Float32Array(NF), me = st.me.active, foe = st.foe.active;
  const tk = threatTo(db, foe, cand, st), hz = entryHazard(cand, st.myField), hp = clamp((cand.hp ?? 1) - hz, 0.01, 1);
  const off = bestDmg(db, cand, foe, st, 'me', cand.moves && cand.moves.length ? cand.moves : []).best || stabProxy(db, cand, foe, st, 'me');
  const sC = speed(db, cand, st.myField, st), sF = speed(db, foe, st.foeField, st);
  let fast = sC === sF ? .5 : sC > sF ? 1 : 0; if (st.trickroom) fast = 1 - fast;
  x[FI.s_bias] = forced ? 0 : 1; x[FI.is_switch] = 1; putCtx(x, cx);
  if (cx.foeBench.length) { let worst = 0; for (const b of cx.foeBench) worst = Math.max(worst, stabProxy(db, b, cand, st, 'foe') / hp); x[FI.s_in_vs_bench] = clamp(worst, 0, 2.5); }
  if (!forced && st.format === 'rand') x[FI.s_bias_rand] = 1;
  if (!forced && st.format === 'natdex') x[FI.s_bias_nat] = 1;
  x[FI.s_in_taken] = clamp(tk / hp, 0, 2.5);
  x[FI.s_in_ko_risk] = tk >= hp ? 1 : 0;
  x[FI.s_in_dmg] = clamp(off / cx.foeHp, 0, 1.5);
  x[FI.s_in_hp] = hp;
  x[FI.s_in_fast] = fast;
  x[FI.s_in_status] = cand.status ? 1 : 0;
  x[FI.s_in_hazard] = hz * 4;
  const last = foe.lastMove && db.moves[foe.lastMove];
  if (last && last.category !== 'Status') x[FI.s_in_resist_last] = clamp(-log2(Math.max(.125, effOn(last.type, cand))), -2, 3);
  x[FI.s_foe_boost] = boostSum(foe, 1) / 2;
  if (!forced && me) {
    x[FI.s_out_danger] = cx.dangerRel; x[FI.s_out_ko_risk] = cx.koRisk;
    x[FI.s_out_dmg] = clamp(cx.myBest / cx.foeHp, 0, 1.5);
    x[FI.s_out_boost] = boostSum(me, 1) / 2; x[FI.s_out_unboost] = -boostSum(me, -1) / 2;
    x[FI.s_out_tox] = me.status === 'tox' ? 1 : 0; x[FI.s_out_hp] = cx.myHp;
    x[FI.s_left] = (st.myLeft || 3) / 6;
    if (me.locked && me.lastMove) { const lm = db.moves[me.lastMove]; if (lm && lm.category !== 'Status' && effOn(lm.type, foe) <= .5) x[FI.s_out_locked_bad] = 1; }
  }
  return x;
}
// Candidate list for a normal turn. legalMoves: ids; bench: [{idx, mon}]
export function candidates(db, st, legalMoves, bench, forced = false) {
  const cx = context(db, st), out = [];
  if (!forced) for (const mid of legalMoves) out.push({kind: 'move', move: mid, x: moveFeatures(db, st, cx, mid)});
  for (const b of bench) out.push({kind: 'switch', idx: b.idx, x: switchFeatures(db, st, cx, b.mon, forced)});
  return {cx, out};
}
export function score(w, x) { let s = 0; for (let i = 0; i < x.length; i++) if (x[i]) s += w[i] * x[i]; return s; }
export function softmax(w, cands, temp = 1) {
  const s = cands.map(c => score(w, c.x) / temp), mx = Math.max(...s), e = s.map(v => Math.exp(v - mx)), z = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / z);
}
