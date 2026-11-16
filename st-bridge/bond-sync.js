/* Atomic NPC bond settlement and exact-source MVU binding.
 * COMMAND_PARSED and VARIABLE_UPDATE_ENDED signatures checked against MagVarUpdate
 * 6a11e2f8a90ea52166c3ca6fb12ec08b7440aa81. No dependency on the DOM or lodash.
 * A projection of the previous message is used, never `current love += delta`.
 * Unattributed/independent writes are warned about, not guessed or overwritten.
 */
(function (root) {
  'use strict';
  const VERSION = '20261116-bond-guard-hotfix2';
  const FIELDS = ['love', 'last', 'why'];
  const obj = x => x && typeof x === 'object' && !Array.isArray(x);
  const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
  const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const trio = rec => FIELDS.map(k => rec?.[k] ?? null);
  const textKey = text => String(text || '').replace(/<StatusPlaceHolder(?:Impl)?\s*\/>/gi, '').trim();
  function signature(text) { let h = 2166136261; for (const c of String(text || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(16); }
  function bind(messages, content, serial = 0) {
    const source = textKey(content), matches = [];
    if (!source) return null;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m && !m.is_user && !m.is_system && textKey(m.mes) === source) matches.push(i);
    }
    if (matches.length !== 1 || matches[0] !== messages.length - 1) return null;
    const id = matches[0], msg = messages[id];
    return { chat: messages, id, swipe: msg.swipe_id ?? 0, text: source, serial, signature: signature(source) };
  }
  function current(token, messages, serial = 0) {
    const m = token && messages[token.id];
    return !!token && token.chat === messages && token.id === messages.length - 1 && token.serial === serial && !!m && !m.is_user && !m.is_system && (m.swipe_id ?? 0) === token.swipe && textKey(m.mes) === token.text;
  }
  function commandSegments(value) {
    let s = String(value ?? '').trim();
    if (s[0] === '"') { try { s = JSON.parse(s); } catch (_) {} }
    else if ((s[0] === "'" && s.at(-1) === "'") || (s[0] === '`' && s.at(-1) === '`')) s = s.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (s.startsWith('/')) return s.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~')).filter(Boolean);
    const segs = [];
    for (const m of s.matchAll(/([^.[\]\s]+)|\[\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\d+))\s*\]/g)) {
      let part = m[1] ?? m[2] ?? m[3] ?? m[4];
      if (m[2] != null) { try { part = JSON.parse('"' + m[2] + '"'); } catch (_) {} }
      segs.push(part);
    }
    if (segs[0] === 'stat_data') segs.shift();
    return segs;
  }
  function protectedPath(segs) {
    if (!segs || segs[0] !== 'pkm') return false;
    if (segs.length === 1) return true;
    if (segs[1] !== 'npcs') return false;
    return segs.length <= 4 || segs[2] === 'records' && [...FIELDS, 'lastInteraction'].includes(segs[4]);
  }
  // MVU CommandInfo: set/add/delete [path,...], move [from,to], insert [container,key,value].
  function commandPaths(c) {
    const a = Array.isArray(c?.args) ? c.args : [];
    if (c?.type === 'move') return a.slice(0, 2).map(commandSegments);
    if (c?.type === 'insert' && a.length >= 3) {
      let key = String(a[1] ?? '').trim();
      if (key[0] === '"') { try { key = JSON.parse(key); } catch (_) {} }
      const container = commandSegments(a[0]);
      return [key === '-' ? container : [...container, key]];
    }
    return a.length ? [commandSegments(a[0])] : [];
  }
  function quarantine(commands) {
    if (!Array.isArray(commands)) return [];
    const removed = [];
    for (let i = commands.length - 1; i >= 0; i--) {
      const c = commands[i];
      if (commandPaths(c).some(protectedPath)) removed.unshift(...commands.splice(i, 1));
    }
    return removed;
  }
  function project(base, ops) {
    const root = { pkm: { npcs: clone(base?.npcs || { records: {} }) } };
    for (const o of ops || []) {
      const g = o.segs || [];
      if (g[0] !== 'pkm' || g[1] !== 'npcs' || g.some(x => ['__proto__', 'prototype', 'constructor'].includes(x))) continue;
      let parent = root;
      for (const k of g.slice(0, -1)) { if (!obj(parent)) { parent = null; break; } if (!(k in parent) && o.op === 'add') parent[k] = {}; parent = parent[k]; }
      if (!obj(parent)) continue;
      const k = g.at(-1);
      if (['replace', 'add'].includes(o.op)) parent[k] = clone(o.value);
      if (o.op === 'remove') delete parent[k];
      if (o.op === 'delta' && typeof o.value === 'number' && Number.isFinite(o.value)) parent[k] = Number(parent[k] || 0) + o.value;
    }
    return root.pkm.npcs?.records || {};
  }
  function settle(pkm, base, plan, meta = {}) {
    const result = { changed: false, accepted: [], rejected: [], conflicts: [], warnings: [] };
    if (!pkm || !base || !plan || plan.malformed) return result;
    const recs = pkm.npcs?.records;
    if (!obj(recs)) return result;
    const before = base.npcs?.records || {}, safe = project(base, plan.ops), raw = project(base, plan.rawOps);
    const keys = new Set();
    for (const o of plan.rawOps || []) {
      const g = o.segs || [];
      if (g[0] === 'pkm' && g[1] === 'npcs' && g[2] === 'records' && g[3] && protectedPath(g)) keys.add(g[3]);
    }
    const conflicts = (plan.conflicts || []).map(k => { try { return JSON.parse(k); } catch (_) { return []; } });
    const conflictFor = key => conflicts.some(g => g.length && g.slice(0, Math.min(g.length, 4)).every((x, i) => x === ['pkm', 'npcs', 'records', key][i]));
    const accepted = new Set(plan.acceptedNpcs || []);
    for (const key of keys) {
      if (conflictFor(key)) { result.conflicts.push(key); result.warnings.push(`人物 ${key} 的补丁路径冲突，未自动覆盖，请核对。`); continue; }
      let now = recs[key]; const was = before[key], want = safe[key], externallyRequested = raw[key];
      if (!obj(was)) {
        // A new named record may be created, but its first bond starts at zero.
        if (obj(want) && !obj(now)) { recs[key] = now = clone(want); result.changed = true; }
        if (obj(now) && obj(want) && !accepted.has(key) && (equal(trio(now), trio(externallyRequested)) || equal(trio(now), trio(want)))) {
          for (const field of [...FIELDS, 'lastInteraction']) if (!equal(now[field], want[field])) { now[field] = clone(want[field]); result.changed = true; }
        }
        continue;
      }
      if (!obj(now) || !obj(want)) { result.conflicts.push(key); result.warnings.push(`人物 ${key} 的整条记录被删除或替换，未猜测恢复。`); continue; }
      // A schema that clamps love to ±100 may have executed the raw patch; that is still the same source.
      const clampedRaw = obj(externallyRequested) && typeof externallyRequested.love === 'number' ? { ...externallyRequested, love: Math.max(-100, Math.min(100, externallyRequested.love)) } : null;
      const aligned = [was, want, externallyRequested, clampedRaw].some(rec => obj(rec) && equal(trio(now), trio(rec)));
      if (!aligned) { result.conflicts.push(key); result.warnings.push(`人物 ${key} 的好感三项与来源快照和可见结果不一致，未覆盖外部数值。`); continue; }
      for (const field of FIELDS) if (!equal(now[field], want[field])) { now[field] = clone(want[field]); result.changed = true; }
      if (accepted.has(key) && Number.isInteger(meta.messageId)) {
        if (now.lastInteraction !== meta.messageId) { now.lastInteraction = meta.messageId; result.changed = true; }
        if (now.met !== true) { now.met = true; result.changed = true; }
        result.accepted.push(key);
      } else {
        result.rejected.push(key);
        if (obj(externallyRequested) && !equal(externallyRequested.lastInteraction, was.lastInteraction) && equal(now.lastInteraction, externallyRequested.lastInteraction)) { now.lastInteraction = was.lastInteraction ?? -1; result.changed = true; }
      }
    }
    // Minimal, bounded audit: no transcript, no automatic old-save backfill.
    if (keys.size && Number.isInteger(meta.messageId) && meta.signature) {
      if (!obj(pkm.integration)) pkm.integration = {};
      const entry = { message: meta.messageId, swipe: meta.swipe ?? 0, source: meta.signature, accepted: result.accepted, rejected: result.rejected, conflicts: result.conflicts };
      const audit = Array.isArray(pkm.integration.bondAudit) ? pkm.integration.bondAudit : [];
      const at = audit.findIndex(x => x.message === entry.message && x.swipe === entry.swipe && x.source === entry.source);
      if (at < 0) { audit.push(entry); pkm.integration.bondAudit = audit.slice(-40); result.changed = true; }
      else if (!equal(audit[at], entry)) { audit[at] = entry; result.changed = true; }
    }
    return result;
  }
  function display(variables, base, outcome) {
    const now = variables?.stat_data?.pkm?.npcs?.records || {};
    for (const key of [...outcome.accepted, ...outcome.rejected]) for (const field of [...FIELDS, 'lastInteraction']) {
      const oldValue = base.npcs?.records?.[key]?.[field] ?? null, value = now[key]?.[field] ?? null;
      for (const type of ['display_data', 'delta_data']) {
        if (!obj(variables[type])) variables[type] = {};
        const data = variables[type]; if (!obj(data.pkm)) data.pkm = {}; if (!obj(data.pkm.npcs)) data.pkm.npcs = {}; if (!obj(data.pkm.npcs.records)) data.pkm.npcs.records = {}; if (!obj(data.pkm.npcs.records[key])) data.pkm.npcs.records[key] = {};
        data.pkm.npcs.records[key][field] = equal(oldValue, value) ? `${JSON.stringify(value)}（好感校验：维持原值）` : `${JSON.stringify(oldValue)}->${JSON.stringify(value)}（好感校验后）`;
      }
    }
  }
  const api = { version: VERSION, commandPaths, bind, current, signature, textKey, commandSegments, protectedPath, quarantine, project, settle, display };
  root.PKMBondSync = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
