// SPDX-License-Identifier: MIT
// settle-v3：结算画面的经验值／努力值数据。
// - 角色卡模式：角色卡（st-bridge）把真实写入存档的结果回传（PKM_BATTLE_REWARDS），这里只做展示。
// - 独立网页模式：没有存档，用与角色卡完全相同的公式本地计算一份“本场收益预览”（不写入任何数据）。
//   公式与 st-bridge/bridge.js 的 awardBattleExperience / awardBattleEffort 保持一致：
//   经验 = floor(对手最高等级² × 1.2 × (野生 1 ／ 训练家 1.25))，出场者全额、未出场者 50%；
//   努力值 = 本场全部对手的努力值之和，发给队伍全员，单项 ≤252、合计 ≤510。

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_ZH = { hp: 'HP', atk: '攻击', def: '防御', spa: '特攻', spd: '特防', spe: '速度' };

let tablesPromise = null;
export function loadRewardTables(base = '.') {
  if (!tablesPromise) {
    const get = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); });
    tablesPromise = Promise.all([
      get(`${base}/src/data/exp-growth.json?v=settle-v3`).then(d => d.growth || {}).catch(() => ({})),
      get(`${base}/st-bridge/effort-yields.json?v=20261113-reward-v3`).then(d => d.yields || {}).catch(() => ({})),
    ]).then(([growth, yields]) => ({ growth, yields }));
  }
  return tablesPromise;
}

// 52poke 经验值页面：目标等级所需的累计经验（与 bridge.js expAtGroupLevel 相同）。
export function expAtGroupLevel(group, level) {
  const lv = Math.max(1, Math.min(100, Math.floor(Number(level) || 1))); if (lv === 1) return 0;
  let n = 0;
  if (group === 'erratic') {
    if (lv <= 50) n = -0.02 * lv ** 4 + 2 * lv ** 3;
    else if (lv <= 68) n = -0.01 * lv ** 4 + 1.5 * lv ** 3;
    else if (lv <= 98) n = 0.002 * lv ** 3 * Math.floor((1911 - 10 * lv) / 3);
    else n = -0.01 * lv ** 4 + 1.6 * lv ** 3;
  } else if (group === 'fast') n = 0.8 * lv ** 3;
  else if (group === 'mediumFast') n = lv ** 3;
  else if (group === 'slow') n = 1.25 * lv ** 3;
  else if (group === 'fluctuating') {
    if (lv <= 15) n = 0.02 * lv ** 3 * Math.floor((lv + 73) / 3);
    else if (lv <= 36) n = 0.02 * lv ** 4 + 0.28 * lv ** 3;
    else n = 0.02 * lv ** 3 * Math.floor((lv + 64) / 2);
  } else n = 1.2 * lv ** 3 - 15 * lv ** 2 + 100 * lv - 140;
  return Math.max(0, Math.floor(n));
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function idsOf(p, dex) {
  const ids = [p.originalSpeciesId, p.baseSpeciesId, p.speciesId].map(norm).filter(Boolean);
  for (const id of [...ids]) { const base = dex?.[id]?.baseSpecies; if (base) ids.push(norm(base)); }
  return [...new Set(ids)];
}

/**
 * 本地计算（独立模式预览）。返回与角色卡回传相同的结构。
 * @param {object} b battle
 * @param {{growth:object,yields:object}} tables
 * @param {{outcome:string,isWild:boolean,dex?:object,calcStats?:Function,name?:Function}} opt
 */
export function estimateRewards(b, tables, opt) {
  const { outcome, isWild, dex = {}, calcStats = null, name = p => p.name } = opt || {};
  const earns = outcome === 'victory' || (outcome === 'captured' && isWild);
  const view = { version: 'settle-v3', saved: false, experience: [], effort: [], prize: 0, warnings: [] };
  if (!earns || !b?.teams) return view;
  const foes = b.teams[1] || [];
  const enemyLv = Math.max(1, ...foes.map(e => Number(e.level) || 1));
  const baseGain = Math.max(1, Math.floor(enemyLv * enemyLv * 1.2 * (isWild ? 1 : 1.25)));
  if (!isWild) view.prize = Math.min(100, enemyLv) * 20;
  const defeated = {};
  for (const e of foes) {
    const y = idsOf(e, dex).map(id => tables.yields?.[id]).find(Boolean); if (!y) continue;
    for (const k of STAT_KEYS) defeated[k] = (defeated[k] || 0) + (Number(y[k]) || 0);
  }
  (b.teams[0] || []).forEach((p, i) => {
    const slot = p.hostSlot ?? i, ids = idsOf(p, dex);
    const group = ids.map(id => tables.growth?.[id]).find(Boolean) || 'mediumSlow';
    const thr = lv => expAtGroupLevel(group, lv);
    const species = ids.map(id => dex[id]).find(Boolean);
    const stat = (lv, evs) => { try { return calcStats && species ? calcStats(species, lv, { ivs: p.ivs, evs, nature: p.nature }) : null; } catch (_) { return null; } };
    // 努力值
    const evs = { ...(p.evs || {}) }, changes = [];
    let total = STAT_KEYS.reduce((n, k) => n + Math.max(0, Math.min(252, Math.floor(Number(evs[k]) || 0))), 0);
    for (const k of STAT_KEYS) {
      const amount = Math.max(0, Math.floor(Number(defeated[k]) || 0)); if (!amount) continue;
      const cur = Math.max(0, Math.min(252, Math.floor(Number(evs[k]) || 0)));
      const gain = Math.max(0, Math.min(amount, 252 - cur, 510 - total)); if (!gain) continue;
      evs[k] = cur + gain; total += gain; changes.push({ stat: k, gain, total: evs[k] });
    }
    if (changes.length) view.effort.push({ slot, name: name(p), changes, total, evs: { ...evs } });
    // 经验
    const oldLv = Math.max(1, Math.min(100, Math.floor(Number(p.level) || 5)));
    if (oldLv >= 100) return;
    const entered = !!p._participated, gain = entered ? baseGain : Math.max(1, Math.floor(baseGain / 2));
    const start = thr(oldLv), saved = Number.isFinite(Number(p.exp)) ? Math.max(start, Number(p.exp)) : start;
    const expTo = Math.min(thr(100), saved + gain);
    let newLv = oldLv; while (newLv < 100 && expTo >= thr(newLv + 1)) newLv++;
    const thresholds = []; for (let l = oldLv; l <= Math.min(100, newLv + 1); l++) thresholds.push(thr(l));
    view.experience.push({ slot, name: name(p), exp: gain, from: oldLv, to: newLv, entered, share: entered ? '全额' : '50%',
      evolutions: [], learned: [], pending: [], expFrom: saved, expTo, thresholds,
      statsFrom: stat(oldLv, p.evs || {}), statsTo: stat(newLv, evs) });
  });
  return view;
}

/** 经验条进度：把累计经验换算成“已升级数 + 当前级进度(0..1)”，用于等速动画。 */
export function levelProgress(exp, thresholds) {
  const t = thresholds || []; if (t.length < 2) return 0;
  let j = 0; while (j + 1 < t.length - 1 && exp >= t[j + 1]) j++;
  if (j + 1 >= t.length) return j;
  const span = t[j + 1] - t[j]; if (span <= 0) return j + 1;
  return j + Math.max(0, Math.min(1, (exp - t[j]) / span));
}
export function expAtProgress(pos, thresholds) {
  const t = thresholds || []; if (!t.length) return 0;
  const j = Math.min(Math.floor(pos), t.length - 1), f = pos - j;
  if (j + 1 >= t.length) return t[t.length - 1];
  return Math.round(t[j] + (t[j + 1] - t[j]) * f);
}
