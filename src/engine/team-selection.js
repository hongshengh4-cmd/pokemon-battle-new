/* Ordered choose-N-from-up-to-six selection. Never renumber hostSlot/UID metadata. */
(function (root) {
  'use strict';
  const limitOf = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 6 ? Number(value) : 6;
  const healthy = team => (team || []).map((p, index) => ({ p, index })).filter(x => x.p && !x.p.fainted && x.p.hp > 0);
  function required(team, limit) { return Math.min(limitOf(limit), healthy(team).length); }
  function validate(team, indices, limit) {
    const want = required(team, limit), allowed = new Set(healthy(team).map(x => x.index));
    if (!Array.isArray(indices) || indices.length !== want) throw new Error(`请选择 ${want} 只参赛宝可梦。`);
    if (indices.some(i => !Number.isInteger(i) || !allowed.has(i))) throw new Error('参赛名单含无效或濒死成员。');
    if (new Set(indices).size !== indices.length) throw new Error('同一只宝可梦不能重复参赛。');
    return indices.slice();
  }
  function select(team, indices, limit) { return validate(team, indices, limit).map(i => team[i]); }
  const api = { version: '20261116-bond-npc-moves-team-v1', limitOf, healthy, required, validate, select };
  root.PKMTeamSelection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
