// v1.3.71 对战奖金：只有 {{user}} 赢时对手付钱；训练家/劲敌/联盟大会 ×20，道馆 ×50（仅首次拿徽章）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../st-bridge/bridge.js', import.meta.url), 'utf8');
const line = name => { const m = src.match(new RegExp(`\\n((?:const|function) ${name}\\b[\\s\\S]*?)\\n(?=const |function |//)`)); assert.ok(m, name); return m[1]; };
const code = ['BATTLE_PRIZE_RATE', 'battlePrizeTopLevel', 'battlePrizeKey', 'awardBattlePrize', 'battlePrizeSkipReason'].map(line).join('\n');
const ctx = { isObj: o => !!o && typeof o === 'object' && !Array.isArray(o), badgeForGymConfig: cfg => cfg.knownBadge || null };
vm.createContext(ctx); vm.runInContext(code + '\nthis.award=awardBattlePrize;this.skip=battlePrizeSkipReason;', ctx);
const pkm = (money = 3000) => ({ player: { money }, integration: {} });
const pay = (...lv) => ({ enemyTeam: lv.map(level => ({ level })) });

test('训练家：最高等级 × 20，每次赢都付', () => {
  const p = pkm();
  assert.equal(ctx.award(p, {}, 'trainer', 'victory', pay(12, 20, 8), null).amount, 400);
  assert.equal(ctx.award(p, {}, 'trainer', 'victory', pay(20), null).amount, 400);
  assert.equal(p.player.money, 3800);
});
test('劲敌、联盟大会也是 × 20', () => {
  assert.equal(ctx.award(pkm(), {}, 'rival', 'victory', pay(25), null).amount, 500);
  assert.equal(ctx.award(pkm(), {}, 'league', 'victory', pay(40, 38), null).amount, 800);
});
test('道馆：首次拿徽章时 × 50，重赛不再付', () => {
  const p = pkm(0);
  assert.equal(ctx.award(p, { knownBadge: '灰色徽章' }, 'gym', 'victory', pay(10, 20), '灰色徽章').amount, 1000);
  assert.equal(ctx.award(p, { knownBadge: '灰色徽章' }, 'gym', 'victory', pay(20), null), null);
  assert.equal(p.player.money, 1000);
  assert.match(ctx.skip('gym', 'victory'), /首次/);
});
test('认不出徽章的道馆按馆主只付一次', () => {
  const p = pkm(0), cfg = { opponent: '某道馆 馆主' };
  assert.equal(ctx.award(p, cfg, 'gym', 'victory', pay(30), null).amount, 1500);
  assert.equal(ctx.award(p, cfg, 'gym', 'victory', pay(30), null), null);
});
test('输了、平局、野生、火箭队、强敌都不付钱，也不扣钱', () => {
  for (const [t, o] of [['trainer', 'defeat'], ['gym', 'defeat'], ['rival', 'draw'], ['wild', 'victory'], ['rocket', 'victory'], ['boss', 'victory'], ['trainer', 'escaped']]) {
    const p = pkm(500); assert.equal(ctx.award(p, {}, t, o, pay(30), null), null, t + o); assert.equal(p.player.money, 500);
  }
  assert.equal(ctx.skip('wild', 'victory'), '');
  assert.match(ctx.skip('trainer', 'defeat'), /输了不用付钱/);
  assert.match(ctx.skip('rocket', 'victory'), /不涉及/);
});
test('结算写在 applyResult 的同一事务里，并告知 AI 平常带过、不要再写金钱', () => {
  assert.match(src, /prizeAward=awardBattlePrize\(pkm,cfg,m\.type,outcome,payload,gymBadgeAward\)/);
  assert.match(src, /一笔带过即可，不特意描写、不解释缘由，在场的人都视为理所当然；不要再写入 \/pkm\/player\/money/);
  assert.match(src, /对战奖金。请按此结果续写战斗经过，不改写胜负，也不要重复写入这些变量。）/);
});
