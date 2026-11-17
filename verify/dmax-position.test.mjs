// 极巨化位置 + 极巨防壁中文名回归
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app = fs.readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
const battle = fs.readFileSync(new URL('../src/engine/battle.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('巨大化防出界位移用布局坐标，不用受动画影响的矩形', () => {
  const i = app.indexOf('if(giant&&arena){'), block = app.slice(i, app.indexOf('img.style.setProperty(\'--sprite-scale\'', i));
  assert.match(block, /layoutOffsetWithin\(box,arena\)/);
  assert.doesNotMatch(block, /box\.getBoundingClientRect\(\)/);
});
test('场地/精灵框/窗口尺寸变化后重新对齐所有精灵', () => {
  assert.match(app, /function realignAllSprites\(\)/);
  assert.match(app, /querySelectorAll\('\.arena, \.arena \[data-role="sprite"\]'\)/);
  assert.match(app, /window\.addEventListener\('resize', realignAllSprites\)/);
});
test('极巨防壁带 id，按钮只显示中文', () => {
  assert.match(battle, /\{ \.\.\.guard, id: 'maxguard', _isMax: true/);
  assert.match(app, /ZH\.moves\?\.maxguard \|\| '极巨防壁'/);
});
test('index.html 刷新了 app.js / battle.js 缓存参数，版本常量未动', () => {
  assert.match(html, /app\.js\?v=20261117-dmax-position/);
  assert.match(html, /battle\.js\?v=20261117-dmax-position/);
  assert.match(app, /const APP_VERSION = '20261116-ps-move-scripts-v1'/);
});
