// Showdown replay log -> public decision states (actor's perspective) with the action actually chosen.
import {id} from './features.mjs';
const FWD = new Set(['outrage', 'petaldance', 'thrash', 'ragingfury', 'rollout', 'iceball', 'uproar']);
const clone = o => JSON.parse(JSON.stringify(o));
function speciesId(db, s) {
  let k = id(s.replace(/-\*$/, ''));
  if (db.dex[k]) return k;
  const base = id(s.split('-')[0]); return db.dex[base] ? base : k;
}
function parseDetails(db, det) {
  const parts = det.split(',').map(s => s.trim());
  const o = {species: speciesId(db, parts[0]), level: 100};
  for (const p of parts.slice(1)) { if (/^L\d+$/.test(p)) o.level = +p.slice(1); if (p.startsWith('tera:')) o.teraType = p.slice(5); }
  return o;
}
function parseHP(s) {
  if (!s) return {};
  const [hp, st] = s.split(' ');
  if (hp === '0' || st === 'fnt') return {hp: 0, fnt: true};
  const [a, b] = hp.split('/').map(Number);
  return {hp: b ? a / b : 1, status: st || ''};
}
export function parseReplay(db, rep) {
  const L = rep.log.split('\n');
  const fmt = /randombattle/.test(rep.formatid || rep.id) ? 'rand' : /nationaldex/.test(rep.formatid || rep.id) ? 'natdex' : /doubles/.test(rep.formatid || rep.id) ? 'doubles' : 'ou';
  if (fmt === 'doubles') return [];
  const S = {p1: {team: [], active: null, field: {}, size: 6}, p2: {team: [], active: null, field: {}, size: 6}};
  const G = {weather: '', terrain: '', trickroom: false, turn: 0};
  const byNick = {p1: {}, p2: {}};
  const ensure = (side, nick, det) => {
    if (byNick[side][nick]) return byNick[side][nick];
    const d = det ? parseDetails(db, det) : null;
    let m = d && S[side].team.find(t => !t.nick && (t.species === d.species || id(t.preview || '').startsWith(id(d.species).slice(0, 5)) && t.wild));
    if (!m) { m = {species: d?.species || id(nick), level: 100, hp: 1, status: '', boosts: {}, movesAll: [], movesSeen: [], item: null, ability: null, types: null}; S[side].team.push(m); }
    if (d) { m.species = d.species; m.level = d.level; if (d.teraType) m.teraType = d.teraType; }
    m.nick = nick; byNick[side][nick] = m;
    if (!m.types) m.types = [...(db.dex[m.species]?.types || ['Normal'])];
    return m;
  };
  const who = ident => { const mm = /^(p[12])[ab]?: (.*)$/.exec(ident || ''); return mm ? {side: mm[1], nick: mm[2]} : null; };
  const mon = ident => { const w = who(ident); return w ? ensure(w.side, w.nick) : null; };
  // pass 1: whole-game revealed moves (actor knows own moveset) and team list
  for (const line of L) {
    const a = line.split('|');
    if (a[1] === 'poke') { const d = parseDetails(db, a[3]); S[a[2]].team.push({species: d.species, preview: a[3].split(',')[0], wild: /-\*/.test(a[3]), level: d.level, hp: 1, status: '', boosts: {}, movesAll: [], movesSeen: [], item: null, ability: null, types: [...(db.dex[d.species]?.types || ['Normal'])]}); }
    if (a[1] === 'teamsize') S[a[2]].size = +a[3];
    if (a[1] === 'switch' || a[1] === 'drag' || a[1] === 'replace') { const w = who(a[2]); ensure(w.side, w.nick, a[3]); }
    if (a[1] === 'move') { const m = mon(a[2]); const tag = a.slice(4).join('|'); if (m && !/\[from\]/.test(tag)) { const mid = id(a[3]); if (db.moves[mid] && mid !== 'struggle' && !m.movesAll.includes(mid) && m.movesAll.length < 4) m.movesAll.push(mid); } }
  }
  // reset dynamic state for pass 2
  const nickMap = {p1: {...byNick.p1}, p2: {...byNick.p2}};
  for (const sd of ['p1', 'p2']) for (const m of S[sd].team) { m.hp = 1; m.status = ''; m.boosts = {}; m.movesSeen = []; m.item = null; m.ability = null; m.fnt = false; m.types = [...(db.dex[m.species]?.types || ['Normal'])]; m.tera = false; m.lastMove = null; m.revealed = false; }
  const out = [];
  const snapshot = (side, kind) => {
    const foeS = side === 'p1' ? 'p2' : 'p1', me = S[side].active, foe = S[foeS].active;
    if (!me || !foe) return null;
    const pub = (m, own) => ({species: m.species, level: m.level, hp: m.hp, status: m.status, boosts: {...m.boosts}, types: [...m.types], moves: own ? [...m.movesAll] : [...m.movesSeen], item: m.item, ability: m.ability, tera: m.tera, teraType: m.teraType, lastMove: m.lastMove});
    const benchAll = S[side].team.filter(m => m !== me && !m.fnt && m.nick);
    const fainted = t => t.team.filter(m => m.fnt).length;
    return {
      format: fmt, turn: G.turn, kind, side,
      me: {active: pub(me, true), bench: benchAll.map(m => ({idx: S[side].team.indexOf(m), mon: pub(m, true)}))},
      foe: {active: pub(foe, false), bench: S[foeS].team.filter(m => m !== foe && !m.fnt && (m.revealed || (fmt !== 'rand' && m.preview))).map(m => pub(m, false))},
      myField: clone(S[side].field), foeField: clone(S[foeS].field), weather: G.weather, terrain: G.terrain, trickroom: G.trickroom,
      myLeft: S[side].size - fainted(S[side]), foeLeft: S[foeS].size - fainted(S[foeS])
    };
  };
  let pending = null; // per turn decision tracking
  const startTurn = () => {
    pending = {};
    for (const sd of ['p1', 'p2']) {
      const me = S[sd].active;
      const forcedLock = me && me.lastMove && FWD.has(me.lastMove) && me.lockTurns > 0;
      const recharge = me && me.mustRecharge, charging = me && me.charging;
      pending[sd] = {snap: (forcedLock || recharge || charging) ? null : snapshot(sd, 'turn'), done: false, active: me};
    }
  };
  const decide = (sd, label) => {
    const p = pending?.[sd]; if (!p || p.done) return; p.done = true;
    if (p.snap && label) out.push({...p.snap, label, rating: rep.rating, id: rep.id});
  };
  let faintedSide = {p1: false, p2: false};
  for (const line of L) {
    const a = line.split('|'), t = a[1];
    if (!t) continue;
    if (t === 'turn') { G.turn = +a[2]; faintedSide = {p1: false, p2: false}; startTurn(); continue; }
    if (t === 'win' || t === 'tie') { pending = null; break; }
    if (t === 'switch' || t === 'drag' || t === 'replace') {
      const w = who(a[2]), m = ensure(w.side, w.nick, a[3]), hp = parseHP(a[4]), tag = a.slice(5).join('|');
      const prev = S[w.side].active;
      if (t === 'switch') {
        if (faintedSide[w.side] || /\[from\]/.test(tag) || (pending?.[w.side]?.done && prev && prev.pivoted)) {
          // forced replacement or pivot follow-up: choice of who comes in
          if (prev !== m) {
            const saveActive = S[w.side].active;
            const snap = snapshot(w.side, 'replace');
            if (snap && S[w.side].team.filter(x => x !== saveActive && !x.fnt && x.nick).length >= 2) out.push({...snap, forced: faintedSide[w.side] ? 'faint' : 'pivot', label: {kind: 'switch', idx: S[w.side].team.indexOf(m)}, rating: rep.rating, id: rep.id});
          }
          faintedSide[w.side] = false;
        } else if (pending?.[w.side] && !pending[w.side].done) decide(w.side, {kind: 'switch', idx: S[w.side].team.indexOf(m)});
      }
      if (prev && prev !== m) { prev.boosts = {}; prev.lastMove = null; prev.pivoted = false; prev.mustRecharge = false; prev.charging = false; prev.lockTurns = 0; if (prev.status === 'tox') prev.status = 'tox'; if (!prev.fnt) prev.tera = prev.tera; }
      S[w.side].active = m; m.revealed = true; if (hp.hp !== undefined) m.hp = hp.hp; if (hp.status !== undefined) m.status = hp.status;
      continue;
    }
    if (t === 'move') {
      const w = who(a[2]); if (!w) continue; const m = ensure(w.side, w.nick), mid = id(a[3]), tag = a.slice(4).join('|');
      const from = /\[from\]/.test(tag);
      if (!from) {
        if (pending?.[w.side] && !pending[w.side].done) decide(w.side, db.moves[mid] ? {kind: 'move', move: mid} : null);
        if (db.moves[mid] && !m.movesSeen.includes(mid)) m.movesSeen.push(mid);
        if (FWD.has(mid)) m.lockTurns = m.lastMove === mid ? m.lockTurns - 1 : 2; else m.lockTurns = 0;
        m.lastMove = mid; m.pivoted = ['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'chillyreception', 'shedtail', 'batonpass'].includes(mid);
        m.charging = false;
      }
      continue;
    }
    if (t === 'cant') { const w = who(a[2]); if (w && pending?.[w.side]) pending[w.side].done = true; continue; }
    if (t === '-prepare') { const m = mon(a[2]); if (m) m.charging = true; continue; }
    if (t === '-mustrecharge') { const m = mon(a[2]); if (m) m.mustRecharge = true; continue; }
    if (t === 'faint') { const w = who(a[2]); if (!w) continue; const m = ensure(w.side, w.nick); m.fnt = true; m.hp = 0; faintedSide[w.side] = true; if (pending?.[w.side] && !pending[w.side].done) pending[w.side].done = true; continue; }
    if (t === '-damage' || t === '-heal' || t === '-sethp') { const m = mon(a[2]); const hp = parseHP(a[3]); if (m && hp.hp !== undefined) { m.hp = hp.hp; if (hp.status !== undefined && hp.status !== '') m.status = hp.status; } continue; }
    if (t === '-status') { const m = mon(a[2]); if (m) m.status = a[3]; continue; }
    if (t === '-curestatus') { const m = mon(a[2]); if (m) m.status = ''; continue; }
    if (t === '-cureteam') { const w = who(a[2]); if (w) for (const m of S[w.side].team) m.status = ''; continue; }
    if (t === '-boost' || t === '-unboost') { const m = mon(a[2]); if (m) { const k = a[3]; if (k === 'evasion' || k === 'accuracy') continue; m.boosts[k] = Math.max(-6, Math.min(6, (m.boosts[k] || 0) + (t === '-boost' ? 1 : -1) * +a[4])); } continue; }
    if (t === '-setboost') { const m = mon(a[2]); if (m) m.boosts[a[3]] = +a[4]; continue; }
    if (t === '-clearboost' || t === '-clearallboost') { if (t === '-clearallboost') { for (const sd of ['p1', 'p2']) if (S[sd].active) S[sd].active.boosts = {}; } else { const m = mon(a[2]); if (m) m.boosts = {}; } continue; }
    if (t === '-clearnegativeboost') { const m = mon(a[2]); if (m) for (const k in m.boosts) if (m.boosts[k] < 0) m.boosts[k] = 0; continue; }
    if (t === '-invertboost') { const m = mon(a[2]); if (m) for (const k in m.boosts) m.boosts[k] = -m.boosts[k]; continue; }
    if (t === '-terastallize') { const m = mon(a[2]); if (m) { m.tera = true; m.teraType = a[3]; m.types = [a[3]]; } continue; }
    if (t === 'detailschange') { const m = mon(a[2]); if (m) { const d = parseDetails(db, a[3]); m.species = d.species; m.types = m.tera ? m.types : [...(db.dex[d.species]?.types || m.types)]; } continue; }
    if (t === '-item') { const m = mon(a[2]); if (m) m.item = id(a[3]); continue; }
    if (t === '-enditem') { const m = mon(a[2]); if (m) m.item = ''; continue; }
    if (t === '-ability') { const m = mon(a[2]); if (m) m.ability = id(a[3]); continue; }
    if (t === '-sidestart' || t === '-sideend') {
      const sd = a[2].slice(0, 2), c = id(a[3].replace(/^move: /, ''));
      const f = S[sd].field;
      if (t === '-sidestart') f[c] = c === 'spikes' || c === 'toxicspikes' ? (f[c] || 0) + 1 : 1; else delete f[c];
      continue;
    }
    if (t === '-weather') { G.weather = a[2] === 'none' ? '' : id(a[2]); continue; }
    if (t === '-fieldstart') { const c = id(a[2].replace(/^move: /, '')); if (c === 'trickroom') G.trickroom = true; else if (/terrain/.test(c)) G.terrain = c; continue; }
    if (t === '-fieldend') { const c = id(a[2].replace(/^move: /, '')); if (c === 'trickroom') G.trickroom = false; else if (/terrain/.test(c)) G.terrain = ''; continue; }
  }
  return out;
}
