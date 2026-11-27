// SPDX-License-Identifier: MIT
// 战斗结算统计（settle-v1）：只读已结算的 Showdown 战斗记录（battle._ps.log），不改变任何战斗状态。
// 统计每只宝可梦的造成伤害、击倒、会心一击、效果绝佳、承受伤害；没有 Showdown 记录时退回到只数统计。
export const SUMMARY_BUILD = 'settle-v1';

const sideOf = tok => /^p2/.test(tok) ? 1 : /^p1/.test(tok) ? 0 : -1;
function parseHp(text) {
  const s = String(text || '').trim();
  if (/^0(\s|$)/.test(s) || /\bfnt\b/.test(s)) return 0;
  const m = s.match(/^(\d+)\s*\/\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

export function summarizeBattle(b) {
  const teams = [0, 1].map(s => (b?.teams?.[s] || []));
  const blank = () => ({dealt: 0, kos: 0, crits: 0, se: 0, taken: 0, moves: 0});
  const mons = teams.map(t => t.map(blank));
  const side = [0, 1].map(() => ({dealt: 0, kos: 0, crits: 0, se: 0, taken: 0, indirect: 0}));
  const ps = b?._ps, log = Array.isArray(ps?.log) ? ps.log : null;
  const exact = !!log;
  if (log) {
    // "p1a: Name" -> team index, via the Showdown side roster (set._nativeIndex is the UI team slot).
    const cache = new Map();
    const who = tok => {
      const m = String(tok || '').match(/^(p[12])[a-d]?:\s*(.+)$/); if (!m) return null;
      const s = sideOf(m[1]), name = m[2].trim(), key = s + '|' + name;
      if (cache.has(key)) return cache.get(key);
      const roster = ps.sides?.[s]?.pokemon || [];
      let j = roster.findIndex(p => p?.name === name);
      if (j < 0) j = roster.findIndex(p => String(p?.name || '').toLowerCase() === name.toLowerCase());
      const idx = j < 0 ? -1 : (Number.isInteger(roster[j]?.set?._nativeIndex) ? roster[j].set._nativeIndex : j);
      const r = idx >= 0 && idx < teams[s].length ? {s, i: idx} : null; cache.set(key, r); return r;
    };
    const hp = new Map(), lastHit = new Map(), at = r => r.s + ':' + r.i;
    let turn = 0, source = null, skip = 0;
    for (const line of log) {
      if (skip > 0) { skip--; if (skip === 0) continue; }
      const parts = String(line).split('|'), tag = parts[1];
      if (tag === 'split') { skip = 2; continue; } // next line = exact HP, the one after = public duplicate
      if (tag === 'turn') { turn = Number(parts[2]) || turn + 1; source = null; continue; }
      if (tag === 'switch' || tag === 'drag' || tag === 'replace') { const r = who(parts[2]); if (r) { const h = parseHp(parts[4]); if (h != null) hp.set(at(r), h); } continue; }
      if (tag === 'move') { source = who(parts[2]); if (source) mons[source.s][source.i].moves++; continue; }
      if (tag === 'cant' || tag === 'upkeep') { source = null; continue; }
      if (tag === '-heal' || tag === '-sethp') { const r = who(parts[2]); const h = parseHp(parts[3]); if (r && h != null) hp.set(at(r), h); continue; }
      if (tag === '-crit' || tag === '-supereffective') {
        const t = who(parts[2]); if (!source || !t || t.s === source.s) continue;
        const k = tag === '-crit' ? 'crits' : 'se'; mons[source.s][source.i][k]++; side[source.s][k]++; continue;
      }
      if (tag === '-damage') {
        const t = who(parts[2]); if (!t) continue;
        const now = parseHp(parts[3]); if (now == null) continue;
        const before = hp.has(at(t)) ? hp.get(at(t)) : (teams[t.s][t.i]?.maxHp || now);
        hp.set(at(t), now);
        const d = Math.max(0, before - now); if (!d) continue;
        mons[t.s][t.i].taken += d; side[t.s].taken += d;
        const indirect = parts.slice(4).some(x => /^\[from\]/.test(x));
        if (!indirect && source && source.s !== t.s) { mons[source.s][source.i].dealt += d; side[source.s].dealt += d; lastHit.set(at(t), {by: source, turn}); }
        else if (indirect) side[1 - t.s].indirect += d;
        continue;
      }
      if (tag === 'faint') {
        const t = who(parts[2]); if (!t) continue; hp.set(at(t), 0);
        const h = lastHit.get(at(t)); side[1 - t.s].kos++;
        if (h && h.turn === turn && h.by.s !== t.s) mons[h.by.s][h.by.i].kos++;
        lastHit.delete(at(t));
      }
    }
  } else {
    for (const s of [0, 1]) side[1 - s].kos = teams[s].filter(p => p.fainted || p.hp <= 0).length;
  }
  const hpRatio = s => { const t = teams[s]; const max = t.reduce((n, p) => n + (p.maxHp || 0), 0); return max ? t.reduce((n, p) => n + Math.max(0, p.hp || 0), 0) / max : 0; };
  const fainted = s => teams[s].filter(p => p.fainted || p.hp <= 0).length;
  // MVP: most KOs, then most damage dealt (player side only).
  let mvp = -1, best = -1;
  mons[0].forEach((m, i) => { const sc = m.kos * 1e6 + m.dealt + m.moves * .01; if (sc > best && (m.kos || m.dealt || m.moves)) { best = sc; mvp = i; } });
  return {build: SUMMARY_BUILD, exact, turns: b?.turnCount || 0, mons, side, mvp, hp: [hpRatio(0), hpRatio(1)], fainted: [fainted(0), fainted(1)], size: [teams[0].length, teams[1].length]};
}

// 评价：剩余体力 60 分 + 未倒下比例 25 分 + 速度 15 分。只用于胜利。
export function battleGrade(sum) {
  const foes = Math.max(1, sum.size[1]), turns = Math.max(1, sum.turns);
  const speed = Math.max(0, Math.min(1, (foes * 4 - turns) / (foes * 3)));
  const score = sum.hp[0] * 60 + (1 - sum.fainted[0] / Math.max(1, sum.size[0])) * 25 + speed * 15;
  const grade = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';
  return {grade, score: Math.round(score)};
}
