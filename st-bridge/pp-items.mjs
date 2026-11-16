const RULES = Object.freeze({
  'pp回复药': Object.freeze({
    name: 'PP回复药', scope: 'single', amount: 10, sprite: 'ether',
    description: '选择一项招式，恢复最多 10 PP。',
  }),
  'pp单项小补剂': Object.freeze({
    name: 'PP单项小补剂', scope: 'single', amount: 10, sprite: 'ether',
    description: '选择一项招式，恢复最多 10 PP。',
  }),
  'pp多项小补剂': Object.freeze({
    name: 'PP多项小补剂', scope: 'all', amount: 10, sprite: 'elixir',
    description: '为一只宝可梦的每项招式各恢复最多 10 PP。',
  }),
  'pp单项全补剂': Object.freeze({
    name: 'PP单项全补剂', scope: 'single', amount: 'full', sprite: 'max-ether',
    description: '选择一项招式，将 PP 恢复至上限。',
  }),
  'pp多项全补剂': Object.freeze({
    name: 'PP多项全补剂', scope: 'all', amount: 'full', sprite: 'max-elixir',
    description: '将一只宝可梦的所有可识别招式 PP 恢复至上限。',
  }),
});

const ALIASES = Object.freeze({
  ether: 'pp回复药',
  elixir: 'pp多项小补剂',
  'max-ether': 'pp单项全补剂',
  'max-elixir': 'pp多项全补剂',
});

function itemKey(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/[\s\u200b]+/g, '').toLowerCase();
}

const LOOKUP = new Map();
for (const [key, rule] of Object.entries(RULES)) LOOKUP.set(itemKey(key), rule);
for (const [alias, canonical] of Object.entries(ALIASES)) LOOKUP.set(itemKey(alias), RULES[canonical]);

export function ppItemInfo(name) {
  return LOOKUP.get(itemKey(name)) || null;
}

export function isPPItem(name) {
  return ppItemInfo(name) !== null;
}

// Use the exact inventory key when possible; this also accepts legacy English IDs
// and ASCII/full-width PP spellings without renaming the player's saved item.
export function ppItemBagKey(bag, name) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  if (Object.prototype.hasOwnProperty.call(bag, name)) return name;
  const info = ppItemInfo(name);
  if (!info) return null;
  return Object.keys(bag).find(key => ppItemInfo(key)?.name === info.name) || null;
}

function moveIdentity(name, moveIdOf) {
  const id = typeof moveIdOf === 'function' ? String(moveIdOf(name) || '').trim().toLowerCase() : '';
  if (id) return `id:${id}`;
  return `name:${String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase()}`;
}

export function currentMovePP(mon, name, maxValue, moveIdOf) {
  const max = Number(maxValue);
  if (!Number.isFinite(max) || max <= 0) return null;
  const pp = mon?.pp && typeof mon.pp === 'object' && !Array.isArray(mon.pp) ? mon.pp : {};
  const identity = moveIdentity(name, moveIdOf);
  const matching = Object.keys(pp).filter(key => moveIdentity(key, moveIdOf) === identity);
  const values = matching
    .map(key => Number(pp[key]))
    .filter(Number.isFinite)
    .map(value => Math.max(0, Math.min(max, Math.floor(value))));
  return {
    current: values.length ? Math.min(...values) : max,
    max,
    keys: matching,
  };
}

export function previewPPItem(mon, itemName, { maxPP, moveIdOf } = {}, moveSlot = null) {
  const info = ppItemInfo(itemName);
  if (!info) return { valid: false, reason: 'unsupported', info: null, moves: [], totalRestored: 0 };
  if (typeof maxPP !== 'function') return { valid: false, reason: 'move-data', info, moves: [], totalRestored: 0 };

  const sourceMoves = Array.isArray(mon?.moves) ? mon.moves : [];
  const hasSelectedSlot = moveSlot !== null && moveSlot !== undefined;
  let selectedSlot = null;
  if (info.scope === 'single' && hasSelectedSlot) {
    selectedSlot = Number(moveSlot);
    if (!Number.isInteger(selectedSlot) || selectedSlot < 0 || selectedSlot >= sourceMoves.length || !sourceMoves[selectedSlot]) {
      return { valid: false, reason: 'move', info, moves: [], totalRestored: 0 };
    }
  }

  const moves = sourceMoves.map((name, slot) => ({ name, slot }))
    .filter(x => x.name && (selectedSlot === null || x.slot === selectedSlot))
    .map(({ name, slot }) => {
      const max = Number(maxPP(name));
      if (!Number.isFinite(max) || max <= 0) return null;
      const state = currentMovePP(mon, name, max, moveIdOf);
      if (!state) return null;
      const current = state.current;
      const restored = info.amount === 'full' ? max - current : Math.min(info.amount, max - current);
      return { name, slot, current, max, next: current + restored, restored, keys: state.keys };
    })
    .filter(Boolean);

  const valid = moves.some(move => move.restored > 0);
  const totalRestored = info.scope === 'single' && !hasSelectedSlot
    ? null
    : moves.reduce((sum, move) => sum + move.restored, 0);
  return {
    valid,
    reason: moves.length ? (valid ? null : 'no-pp') : 'no-moves',
    info,
    moves,
    totalRestored,
  };
}

/**
 * Apply one PP item to a party member in-place. A single item is consumed only
 * when at least one recorded move actually gains PP; multi-move items still
 * consume exactly one item regardless of how many moves they restore.
 */
export function applyPPItem(pkm, { itemName, monUid, moveSlot = null } = {}, deps = {}) {
  const info = ppItemInfo(itemName);
  if (!info) return { ok: false, reason: 'unsupported' };
  const bag = pkm?.player?.bag;
  const bagKey = ppItemBagKey(bag, itemName);
  const count = bagKey == null ? 0 : Math.max(0, Math.floor(Number(bag[bagKey]) || 0));
  if (!bagKey || count < 1) return { ok: false, reason: 'stock', item: info.name };

  const slots = Array.isArray(pkm?.party?.slots) ? pkm.party.slots : [];
  const mon = slots.find(candidate => candidate?.uid === monUid);
  if (!mon) return { ok: false, reason: 'target', item: info.name };

  const plan = previewPPItem(mon, itemName, deps, moveSlot);
  if (!plan.valid) return { ok: false, reason: plan.reason, item: info.name, moves: plan.moves };

  const changed = plan.moves.filter(move => move.restored > 0);
  const nextPP = mon.pp && typeof mon.pp === 'object' && !Array.isArray(mon.pp) ? { ...mon.pp } : {};
  for (const move of changed) {
    const identity = moveIdentity(move.name, deps.moveIdOf);
    for (const key of Object.keys(nextPP)) {
      if (moveIdentity(key, deps.moveIdOf) === identity) delete nextPP[key];
    }
    if (move.next < move.max) nextPP[move.name] = move.next;
  }
  mon.pp = Object.keys(nextPP).length ? nextPP : null;

  const left = count - 1;
  if (left > 0) bag[bagKey] = left;
  else delete bag[bagKey];

  return {
    ok: true,
    item: info.name,
    itemKey: bagKey,
    monUid,
    moves: changed.map(({ name, slot, current, next, max, restored }) => ({ name, slot, before: current, after: next, max, restored })),
    totalRestored: changed.reduce((sum, move) => sum + move.restored, 0),
    remaining: left,
  };
}
