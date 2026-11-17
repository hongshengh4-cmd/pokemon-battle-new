// TauriTavern 2.4 适配：documentElement 原生全屏会进入 top layer 并压住先打开的 popover 覆盖层。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../st-bridge/bridge.js', import.meta.url), 'utf8');
const fn = name => { const i = src.indexOf(`\nfunction ${name}(`); assert.ok(i >= 0, name + ' 缺失'); return src.slice(i, src.indexOf('\n}\n', i)); };

test('进入原生全屏后重新抬起覆盖层并做命中测试', () => {
  assert.match(fn('raiseBattleOverlay'), /hidePopover\(\)[\s\S]*showPopover\(\)/);
  assert.match(fn('battleOverlayCovered'), /elementFromPoint/);
  assert.match(fn('requestBattleFullscreen'), /scheduleBattleOverlayCheck\(m\)/);
  assert.match(fn('enterBattleOverlay'), /ensureBattleOverlayOnTop\(m\)/);
});
test('被遮挡时降级为伪全屏，且降级退出全屏不会关闭对战', () => {
  const ens = fn('ensureBattleOverlayOnTop');
  assert.match(ens, /m\.fsDowngraded = true/);
  assert.match(ens, /pkm-kanto-pseudo-fullscreen/);
  const sync = src.match(/const syncNativeFullscreen=\(\)=>\{.*?\};/)[0];
  assert.ok(sync.indexOf('fsDowngraded') < sync.indexOf('closeBattle()'), '降级分支必须在 closeBattle 之前');
  assert.match(sync, /if\(native\)\{scheduleBattleOverlayCheck/);
});
test('识别 TauriTavern 宿主', () => {
  assert.match(fn('isTauriTavernHost'), /__TAURITAVERN__/);
});
