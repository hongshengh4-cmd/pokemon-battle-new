// SPDX-License-Identifier: MIT
// Public record of the opponent's (player's) choices, for the in-battle read used by elite/champion.
// Source: the pinned Showdown protocol log of the live battle AFTER a turn has resolved — exactly what a
// spectator sees (move names, switch-ins). Never the queued choice of an unresolved turn.
export const FOE_READS_BUILD = 'foe-reads-v1';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// mem: {pending:{predict,at}, reads:[]}. foeSide: PS side index of the player (0 when the AI is side 1).
export function settleFoeRead(mem, ps, foeSide = 0) {
  const pend = mem?.pending; if (!pend || !ps?.log) return null;
  mem.pending = null;
  const tag = 'p' + (foeSide + 1), lines = ps.log.slice(pend.at);
  let actual = null;
  for (let i = 0; i < lines.length && !actual; i++) {
    let line = lines[i];
    if (line.startsWith('|split|')) { line = lines[i + 1] || ''; i += 2; if (!line) continue; }
    const a = line.split('|'), type = a[1], who = a[2] || '';
    if (!who.startsWith(tag + 'a:') && !(type === 'faint' && who.startsWith(tag))) continue;
    if (type === 'faint') break; // our side acted first and knocked it out: no choice revealed
    if (type === 'cant') break;  // asleep / flinched / recharging: choice not revealed
    if (type === 'move') { if (a.slice(4).some(x => x.startsWith('[from]'))) continue; actual = 'move:' + norm(a[3]); }
    else if (type === 'switch' || type === 'drag') {
      if (type === 'drag') break;
      const name = who.replace(/^p\da: /, ''), q = ps.sides[foeSide]?.pokemon.find(x => x.name === name || x.fullname === `${tag}: ${name}`);
      const idx = q?.set?._nativeIndex ?? q?.set?._aiIndex;
      actual = Number.isInteger(idx) ? 'switch:' + idx : 'switch:?';
    }
  }
  if (!actual) return null;
  const c = pend.predict.cands;
  if (actual.startsWith('switch:') && !c.some(x => x.k === actual)) actual = 'switch:?';
  if (actual.startsWith('move:') && !c.some(x => x.k === actual)) actual = 'move:?';
  const read = {turn: pend.predict.turn, k: actual, cands: c};
  mem.reads = [...(mem.reads || []), read].slice(-24);
  return read;
}
export function armFoeRead(mem, predict, ps) { if (mem && predict && ps?.log) mem.pending = {predict, at: ps.log.length}; }
