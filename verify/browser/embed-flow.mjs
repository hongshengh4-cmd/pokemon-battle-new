// Real-browser check: 6选3 picker -> ordered STARTED payload -> trainer gender visible -> Rollout lock/power in UI.
import { chromium } from '/home/user/宝可梦修复/qa/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url)), port = 8765 + Math.floor(Math.random() * 200);
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], { stdio: 'ignore' });
const out = { checks: [], console: [] }, ok = (name, pass, detail = '') => { out.checks.push({ name, pass: !!pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail); };
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) out.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => out.console.push('PAGEERROR ' + e.message));
  await page.goto(`http://127.0.0.1:${port}/verify/browser/host.html`);
  const frame = await (await page.waitForSelector('iframe')).contentFrame();
  const msgs = () => page.evaluate(() => window.__msgs.map(m => ({ type: m.type, payload: m.payload })));
  await frame.waitForSelector('#battle-roster-picker', { timeout: 30000 });
  const ready = (await msgs()).find(m => m.type === 'PKM_BATTLE_READY');
  ok('READY 握手携带新版本号', ready?.payload?.lifecycleVersion === '20261116-bond-npc-moves-team-v1' && ready?.payload?.selectionVersion === '20261116-bond-npc-moves-team-v1', JSON.stringify(ready?.payload));
  { // 与 st-bridge/bridge.js 实际的握手常量逐项比对，防止网站版本号与角色卡桥接不一致导致拒绝开战
    const src = fs.readFileSync(root + 'st-bridge/bridge.js', 'utf8');
    const site = src.match(/BATTLE_SITE_BUILD='([^']+)'/)?.[1], rules = src.match(/BATTLE_RULES_BUILD='([^']+)'/)?.[1];
    const v = ready?.payload || {};
    ok('READY 版本与 bridge 握手常量一致（不会被拒绝启动）', !!site && v.version === site && v.engineVersion === site && v.moveScriptsVersion === site && v.lifecycleVersion === rules && v.selectionVersion === rules, JSON.stringify({ site, rules, v }));
  }
  ok('开战前先发 SELECTING，未提前发 STARTED', (await msgs()).some(m => m.type === 'PKM_BATTLE_SELECTING') && !(await msgs()).some(m => m.type === 'PKM_BATTLE_STARTED'));
  const picks = frame.locator('.roster-pick');
  ok('选人界面列出全部 6 只', await picks.count() === 6, String(await picks.count()));
  const confirm = frame.locator('.roster-confirm');
  ok('未选满 3 只时不能开始', await confirm.isDisabled());
  await picks.nth(2).click(); await picks.nth(5).click(); await picks.nth(0).click();
  ok('选满后其他成员被禁用', await picks.nth(1).isDisabled());
  await picks.nth(5).click(); ok('可取消已选成员', !(await confirm.isEnabled()));
  await picks.nth(4).click();
  await page.screenshot({ path: fileURLToPath(new URL('picker.png', import.meta.url)) });
  await confirm.click();
  await page.waitForFunction(() => window.__msgs.some(m => m.type === 'PKM_BATTLE_STARTED'), null, { timeout: 15000 });
  const started = (await msgs()).find(m => m.type === 'PKM_BATTLE_STARTED');
  ok('STARTED 报告点选顺序与原队伍格号 [2,0,4]', JSON.stringify(started.payload.selectedPlayerSlots) === '[2,0,4]', JSON.stringify(started.payload));
  const fightMenu = async () => {
    await frame.waitForFunction(() => !/进行中/.test(document.getElementById('command-title')?.textContent || '') && (!document.getElementById('command-fight-panel').hidden || !document.getElementById('command-home').hidden), null, { timeout: 30000 });
    if (await frame.locator('#command-fight-panel').isHidden()) await frame.locator('#command-fight').click();
    await frame.waitForSelector('#moves .move-btn', { state: 'visible', timeout: 10000 });
  };
  await fightMenu();
  const badges = await frame.locator('.battle-gender').evaluateAll(els => els.filter(e => e.offsetParent).map(e => e.dataset.gender + ':' + e.textContent));
  ok('双方出战宝可梦都有性别（对手不再是“性别未记录”）', badges.length >= 2 && badges.every(b => !b.startsWith('unknown')), badges.join(' '));
  const rollBtn = () => frame.locator('#moves .move-btn').nth(0);
  const powerOf = async () => (await rollBtn().innerText()).match(/威力\s*(\d+)/)?.[1];
  const p0 = await powerOf(); ok('滚动初始威力 30', p0 === '30', p0);
  await rollBtn().click();
  await page.waitForTimeout(500);
  await fightMenu();
  const p1 = await powerOf(), dc = frame.locator('#moves .move-btn').nth(1), tk = frame.locator('#moves .move-btn').nth(2);
  ok('第二击按钮显示威力 60', p1 === '60', p1);
  ok('连续中变圆、撞击按钮被禁用', await dc.isDisabled() && await tk.isDisabled());
  ok('连续中滚动按钮标注“连续行动”', /连续行动/.test(await rollBtn().innerText()), await rollBtn().innerText());
  const sw = frame.locator('#switches .switch-btn:not([disabled])');
  ok('连续中没有可点的换人按钮', await sw.count() === 0, String(await sw.count()));
  const pp = (await rollBtn().innerText()).match(/招式点数\s*(\d+)\/(\d+)/);
  ok('只扣了首次 PP（19/20）', pp && pp[1] === '19' && pp[2] === '20', pp?.[0]);
  await page.screenshot({ path: fileURLToPath(new URL('rollout-lock.png', import.meta.url)) });
} catch (e) { ok('流程未抛错', false, e.stack); }
finally { fs.writeFileSync(new URL('embed-flow-result.json', import.meta.url), JSON.stringify(out, null, 2)); await browser.close(); server.kill(); }
process.exitCode = out.checks.every(c => c.pass) ? 0 : 1;
