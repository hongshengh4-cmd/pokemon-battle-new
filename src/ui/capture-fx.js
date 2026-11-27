/* Self-authored capture choreography (capture-fx v2). No ball animation is used for ordinary switching.
 * v2：每种球的矢量造型（SVG，上下半球可开合）＋投掷弧线拖尾与地面影子＋开球红光吸入＋落地弹跳＋
 * 以底部为支点的摇晃与按钮闪灯＋成功“咔嗒”星光／失败破球闪光。API 不变：PKMCaptureFX.play({...})。 */
(function (root) {
  'use strict';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // ---------- 1. 精灵球造型 ----------
  const DARK = '#2b2530';
  const ART = {
    pokeball:   { top: '#e3352b' },
    greatball:  { top: '#2d6fdb', deco: '<path d="M10 34 Q18 15 36 8 L40 22 Q27 27 21 40 Z" fill="#e8413a"/><path d="M90 34 Q82 15 64 8 L60 22 Q73 27 79 40 Z" fill="#e8413a"/>' },
    ultraball:  { top: '#2b2a30', deco: '<path d="M21 47 L21 13 Q27 8 35 6 L35 47 Z" fill="#f5c842"/><path d="M79 47 L79 13 Q73 8 65 6 L65 47 Z" fill="#f5c842"/>' },
    masterball: { top: '#7a3db8', deco: '<circle cx="21" cy="31" r="10" fill="#e9579c"/><circle cx="79" cy="31" r="10" fill="#e9579c"/><path d="M38 39 L38 20 L50 31 L62 20 L62 39" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>' },
    safariball: { top: '#77a043', bottom: '#e8d9a8', deco: '<ellipse cx="30" cy="22" rx="10" ry="6" fill="#4f7a2a"/><ellipse cx="62" cy="14" rx="9" ry="5" fill="#4f7a2a"/><ellipse cx="72" cy="34" rx="11" ry="6" fill="#4f7a2a"/><ellipse cx="44" cy="38" rx="7" ry="4" fill="#4f7a2a"/>', bottomDeco: '<ellipse cx="34" cy="70" rx="8" ry="4" fill="#cdb980"/><ellipse cx="66" cy="78" rx="9" ry="4" fill="#cdb980"/>' },
    quickball:  { top: '#2f86d9', deco: '<path d="M50 4 L59 26 L50 21 L41 26 Z" fill="#f6d33c"/><path d="M6 44 L24 28 L27 40 Z" fill="#f6d33c"/><path d="M94 44 L76 28 L73 40 Z" fill="#f6d33c"/>', bottomDeco: '<path d="M50 96 L58 74 L42 74 Z" fill="#f6d33c"/>', bottom: '#2f86d9' },
    duskball:   { top: '#1d3a26', bottom: '#262626', deco: '<path d="M6 42 Q50 14 94 42" stroke="#f05a28" stroke-width="6" fill="none"/><path d="M16 27 Q50 3 84 27" stroke="#f7a02a" stroke-width="3.5" fill="none"/>' },
    timerball:  { top: '#f4f4f4', deco: '<rect x="0" y="0" width="100" height="11" fill="#2a2a2a"/><rect x="0" y="15" width="100" height="8" fill="#e2412f"/><rect x="0" y="28" width="100" height="3.5" fill="#2a2a2a"/><rect x="0" y="36" width="100" height="3.5" fill="#2a2a2a"/>' },
    repeatball: { top: '#ea6d2a', deco: '<circle cx="50" cy="28" r="14" fill="none" stroke="#f6d14a" stroke-width="5"/><circle cx="50" cy="28" r="5" fill="#f6d14a"/>', bottomDeco: '<path d="M14 66 Q50 90 86 66" stroke="#ea6d2a" stroke-width="4" fill="none"/>' },
    netball:    { top: '#2aa89c', deco: '<path d="M0 10 L60 70 M20 0 L80 60 M40 -10 L100 50 M-20 30 L40 90 M100 10 L40 70 M80 0 L20 60 M60 -10 L0 50 M120 30 L60 90" stroke="#1d3138" stroke-width="2.6" fill="none"/>' },
    nestball:   { top: '#92c447', bottom: '#d9b56a', deco: '<path d="M14 40 Q30 18 50 16 Q70 18 86 40" stroke="#5e8f24" stroke-width="5" fill="none"/><path d="M28 44 Q50 28 72 44" stroke="#b9e070" stroke-width="3" fill="none"/>' },
    diveball:   { top: '#3a8fe2', deco: '<path d="M0 34 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0" stroke="#c4ebff" stroke-width="4" fill="none"/><path d="M0 20 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0" stroke="#8fd2ff" stroke-width="3" fill="none"/>' },
    luxuryball: { top: '#232323', bottom: '#232323', band: '#e0b44a', deco: '<path d="M8 40 Q50 24 92 40" stroke="#d93a3a" stroke-width="6" fill="none"/><path d="M22 22 Q50 10 78 22" stroke="#e0b44a" stroke-width="2.5" fill="none"/>', ring: '#e0b44a' },
    healball:   { top: '#f382b5', deco: '<rect x="0" y="24" width="100" height="7" fill="#ffc4dd"/><path d="M50 8 v12 M44 14 h12" stroke="#fff" stroke-width="4" stroke-linecap="round"/>' },
    premierball:{ top: '#f6f6f6', band: '#d23b3b', ring: '#d23b3b' },
  };
  function ballSVG(id, uid, opts = {}) {
    const a = ART[id] || ART.pokeball, u = String(uid), band = a.band || DARK, ring = a.ring || DARK;
    const cls = opts.parts !== false;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%" style="overflow:visible">
<defs>
 <clipPath id="c${u}"><circle cx="50" cy="50" r="45"/></clipPath>
 <clipPath id="t${u}"><rect x="-10" y="-10" width="120" height="60"/></clipPath>
 <clipPath id="b${u}"><rect x="-10" y="50" width="120" height="60"/></clipPath>
 <radialGradient id="s${u}" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></radialGradient>
</defs>
<g${cls ? ' class="cb-bottom"' : ''} clip-path="url(#b${u})"><g clip-path="url(#c${u})">
 <rect x="0" y="0" width="100" height="100" fill="${a.bottom || '#f4f4f4'}"/>${a.bottomDeco || ''}
 <rect x="0" y="50" width="100" height="5" fill="${band}"/>
 <circle cx="50" cy="50" r="45" fill="url(#s${u})"/></g>
 <circle cx="50" cy="50" r="45" fill="none" stroke="${DARK}" stroke-width="4"/></g>
<g${cls ? ' class="cb-top"' : ''}><g clip-path="url(#t${u})"><g clip-path="url(#c${u})">
 <rect x="0" y="0" width="100" height="100" fill="${a.top}"/>${a.deco || ''}
 <rect x="0" y="45" width="100" height="5" fill="${band}"/>
 <circle cx="50" cy="50" r="45" fill="url(#s${u})"/>
 <ellipse cx="33" cy="24" rx="13" ry="7" fill="#fff" opacity=".5" transform="rotate(-32 33 24)"/></g>
 <circle cx="50" cy="50" r="45" fill="none" stroke="${DARK}" stroke-width="4"/></g></g>
<g${cls ? ' class="cb-btn"' : ''}><circle cx="50" cy="50" r="12.5" fill="#fafafa" stroke="${ring}" stroke-width="4.5"/>
 <circle${cls ? ' class="cb-light"' : ''} cx="50" cy="50" r="6.5" fill="#f3f3f3" stroke="#c9c4cf" stroke-width="1.6"/></g>
</svg>`;
  }
  // 菜单／仓库里的小球统一换成同一套造型（data URI，无外部资源）。
  function injectMiniBallStyles() {
    if (typeof document === 'undefined' || document.getElementById('cfx-mini-balls')) return;
    const url = id => `url("data:image/svg+xml,${encodeURIComponent(ballSVG(id, 'm' + id, { parts: false }))}")`;
    const css = ['.mini-ball{background:' + url('pokeball') + ' center/100% 100% no-repeat !important;border:0 !important;box-shadow:none !important;border-radius:50%;filter:drop-shadow(0 1px 1px rgba(40,24,50,.28))}',
      '.mini-ball::after{display:none !important}',
      ...Object.keys(ART).map(id => `.mini-ball.ball-${id}{background-image:${url(id)} !important}`)].join('\n');
    const st = document.createElement('style'); st.id = 'cfx-mini-balls'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectMiniBallStyles, { once: true }); else injectMiniBallStyles();
  }

  // ---------- 2. 轻量合成音效（WebAudio，无外部文件；音量很低） ----------
  let actx = null;
  function ac() { try { actx ||= new (root.AudioContext || root.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (_) { return null; } }
  function tone(freq, dur, { type = 'sine', vol = .12, slide = 0, delay = 0 } = {}) {
    const c = ac(); if (!c) return; const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
  }
  function noise(dur, { vol = .08, from = 2400, to = 600, delay = 0, q = .8 } = {}) {
    const c = ac(); if (!c) return; const t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf;
    f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t + dur + .02);
  }
  const SFX = {
    throw: () => noise(.32, { vol: .07, from: 700, to: 2600 }),
    open: () => { tone(880, .12, { type: 'triangle', vol: .08, slide: 1.8 }); noise(.25, { vol: .05, from: 3000, to: 900 }); },
    absorb: () => tone(300, .5, { type: 'sine', vol: .07, slide: 3.2 }),
    close: () => { tone(520, .05, { type: 'square', vol: .05 }); tone(260, .09, { type: 'sine', vol: .1, delay: .02 }); },
    bounce: k => tone(190 - k * 30, .09, { type: 'sine', vol: .1 - k * .03 }),
    shake: () => { tone(1250, .03, { type: 'square', vol: .035 }); tone(140, .08, { vol: .08, delay: .01 }); },
    click: () => { tone(1800, .03, { type: 'square', vol: .06 }); tone(900, .05, { type: 'square', vol: .04, delay: .03 }); },
    success: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, .22, { type: 'triangle', vol: .07, delay: .12 + i * .09 })),
    burst: () => { noise(.45, { vol: .1, from: 4000, to: 300 }); tone(600, .3, { type: 'sawtooth', vol: .04, slide: .4 }); },
  };

  // ---------- 3. 动画工具 ----------
  const ease = {
    linear: t => t, outCubic: t => 1 - Math.pow(1 - t, 3), inQuad: t => t * t,
    inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, outBack: t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2),
  };
  // rAF 补间；后台标签页 rAF 停止时用定时器兜底，保证流程一定走完。
  function tween(ms, fn, ez = ease.linear) {
    return new Promise(resolve => {
      let done = false; const start = performance.now();
      const end = () => { if (done) return; done = true; fn(1, 1); resolve(); };
      const timer = setTimeout(end, ms + 450);
      const step = now => { if (done) return; const k = Math.min(1, (now - start) / Math.max(1, ms)); fn(ez(k), k); if (k < 1) requestAnimationFrame(step); else { clearTimeout(timer); end(); } };
      requestAnimationFrame(step);
    });
  }
  let uidSeq = 0;
  // 同一组滤镜函数便于插值：k=0 原色，k=1 发光的红色剪影（被精灵球光线包裹）。
  const RED = k => `brightness(${1 - k}) invert(${.38 * k}) sepia(${k}) saturate(${1 + 39 * k}) hue-rotate(${-12 * k}deg) brightness(${1 + .35 * k}) drop-shadow(0 0 ${10 * k}px rgba(255, 70, 70, ${.9 * k}))`;
  function el(tag, cls, parent) { const n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; }

  async function play({ arena, player, target, point, attempt, name, onPhase = () => {} }) {
    document.querySelectorAll('.cfx-ball,.cfx-layer,.cfx-caption').forEach(n => n.remove()); // 清掉任何残留（含旧版本留下的球）
    const ar = arena.getBoundingClientRect(), pr = player.getBoundingClientRect(), tr = target.getBoundingClientRect();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // ?cfxslow=4 仅用于调试慢放检查演出。
    const slow = Math.max(1, Math.min(10, Number(new URLSearchParams(location.search).get('cfxslow')) || 1));
    const unit = (reduced ? .3 : 1) * slow, T = ms => ms * unit;
    const ballName = root.PKMCapture?.BALLS?.[attempt.ball]?.name || '精灵球';
    const d = innerWidth <= 680 ? 30 : 40, r = d / 2;
    const color = root.PKMCapture?.BALLS?.[attempt.ball]?.color || '#fb5f87';
    const hx = point.x - ar.left, hy = point.y - ar.top;              // 命中点（宝可梦身体）
    // 球底接触地面的 y：落在目标脚下（精灵图底边略上），并且不低于命中点、不出场地。
    const floorY = Math.max(hy + r * 1.2, Math.min(ar.height - 12, tr.bottom - ar.top - Math.min(14, tr.height * .06)));
    const sx = pr.left - ar.left + pr.width * .72, sy = pr.top - ar.top + pr.height * .38;

    // DOM
    const layer = el('div', 'cfx-layer', arena);
    const shadow = el('i', 'cfx-shadow', layer);
    const ball = el('div', 'cfx-ball ball-' + attempt.ball, arena);
    ball.style.width = ball.style.height = `${d}px`; ball.style.setProperty('--ball-color', color);
    const spin = el('div', 'cfx-spin', ball); spin.innerHTML = ballSVG(attempt.ball, 'f' + (++uidSeq));
    const caption = el('div', 'capture-caption cfx-caption', arena); caption.setAttribute('role', 'status');
    const pips = el('span', 'cfx-pips'); for (let i = 0; i < 3; i++) el('i', '', pips);
    const ctext = el('span', 'cfx-text');
    caption.append(ctext, pips);
    const phase = (text, shakes = null) => { ctext.textContent = text; onPhase(text); if (shakes != null) [...pips.children].forEach((p, i) => p.classList.toggle('on', i < shakes)); };

    let bx = sx, by = sy, scale = 1.5, rot = 0;
    const place = () => {
      ball.style.transform = `translate(${bx - r}px, ${by - r}px) scale(${scale})`;
      spin.style.transform = `rotate(${rot}deg)`;
      const h = Math.max(0, floorY - (by + r * scale));
      const k = Math.max(.25, 1 - h / 220);
      shadow.style.transform = `translate(${bx - r}px, ${floorY - r * .22}px) scale(${k * scale}, ${k})`;
      shadow.style.opacity = String(.15 + .45 * k);
    };
    place();

    // 宝可梦替身：原图隐藏，替身负责吸入／弹出
    const flip = parseFloat(getComputedStyle(target).getPropertyValue('--flip')) || 1;
    const gwrap = el('div', 'cfx-ghost-wrap', layer);
    Object.assign(gwrap.style, { left: `${tr.left - ar.left}px`, top: `${tr.top - ar.top}px`, width: `${tr.width}px`, height: `${tr.height}px`, transform: flip < 0 ? 'scaleX(-1)' : 'none' });
    const ghost = target.cloneNode(false); ghost.className = 'cfx-ghost'; ghost.removeAttribute('id'); ghost.removeAttribute('style'); ghost.style.opacity = '0';
    gwrap.appendChild(ghost);
    const baseScale = parseFloat(getComputedStyle(target).scale) || 1;
    const prevVis = target.style.visibility;

    try {
      // 1) 投掷：二次贝塞尔弧线、旋转、近大远小、拖尾
      phase(`去吧，${ballName}！`, 0); SFX.throw();
      const cx = (sx + hx) / 2, cy = Math.max(14, Math.min(sy, hy) - 120);
      let lastTrail = 0;
      await tween(T(620), (t, k) => {
        const u = 1 - t; bx = u * u * sx + 2 * u * t * cx + t * t * hx; by = u * u * sy + 2 * u * t * cy + t * t * hy;
        scale = 1.5 - .5 * t; rot = -40 + 760 * t; place();
        const now = performance.now();
        if (!reduced && k < .98 && now - lastTrail > 28) {
          lastTrail = now; const g = el('i', 'cfx-trail', layer);
          g.style.cssText = `left:${bx}px;top:${by}px;width:${d * scale * .7}px;height:${d * scale * .7}px;background:${color}`;
          g.addEventListener('animationend', () => g.remove(), { once: true });
        }
      }, ease.linear);

      // 2) 命中：小幅回弹 + 上半球打开 + 红光吸入
      const hit = el('i', 'cfx-ring', layer); hit.style.left = `${hx}px`; hit.style.top = `${hy}px`;
      hit.addEventListener('animationend', () => hit.remove(), { once: true });
      const fx0 = bx, fy0 = by, hoverX = hx - 12, hoverY = Math.max(r + 6, Math.min(hy - 40, tr.top - ar.top + tr.height * .1 - r));
      await tween(T(260), t => { bx = fx0 + (hoverX - fx0) * t; by = fy0 + (hoverY - fy0) * t - Math.sin(t * Math.PI) * 18; rot = 20 * (1 - t); place(); }, ease.outCubic);
      rot = 0; place();
      ball.classList.add('open'); SFX.open();
      const beam = el('i', 'cfx-beam', layer);
      const tcx = tr.left - ar.left + tr.width / 2, tcy = tr.top - ar.top + tr.height * .55;
      const dx = tcx - bx, dy = tcy - by, len = Math.hypot(dx, dy);
      Object.assign(beam.style, { left: `${bx}px`, top: `${by}px`, width: `${len}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)` });
      ghost.style.opacity = '1'; target.style.visibility = 'hidden'; SFX.absorb(); phase(`${name} 被收进了${ballName}…`, 0);
      const ox = ((bx - (tr.left - ar.left)) / tr.width) * 100, oy = ((by - (tr.top - ar.top)) / tr.height) * 100;
      ghost.style.transformOrigin = `${flip < 0 ? 100 - ox : ox}% ${oy}%`;
      if (!reduced) for (let i = 0; i < 14; i++) {
        const p = el('i', 'cfx-spark', layer), a = Math.random() * Math.PI * 2, rad = 30 + Math.random() * Math.max(40, tr.width * .45);
        Object.assign(p.style, { left: `${tcx + Math.cos(a) * rad}px`, top: `${tcy + Math.sin(a) * rad * .8}px`, animationDelay: `${Math.random() * 180}ms` });
        p.style.setProperty('--tx', `${bx - (tcx + Math.cos(a) * rad)}px`); p.style.setProperty('--ty', `${by - (tcy + Math.sin(a) * rad * .8)}px`);
        p.addEventListener('animationend', () => p.remove(), { once: true });
      }
      await ghost.animate([
        { filter: RED(0), scale: '1', opacity: 1 },
        { filter: RED(1), scale: '1.04', opacity: 1, offset: .32 },
        { filter: RED(1), scale: '0.02', opacity: 0 },
      ], { duration: T(560), easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' }).finished.catch(() => {});
      beam.classList.add('out'); setTimeout(() => beam.remove(), 260);

      // 3) 合球 + 落地弹跳
      ball.classList.remove('open'); ball.classList.add('snap'); SFX.close();
      await wait(T(170));
      const restY = floorY - r;
      const y0 = by;
      await tween(T(340), t => { by = y0 + (restY - y0) * t; rot = -12 * t; place(); }, ease.inQuad);
      SFX.bounce(0); ball.classList.add('squash'); setTimeout(() => ball.classList.remove('squash'), 110);
      for (const [hgt, ms, k] of [[22, 300, 1], [8, 200, 2]]) {
        await tween(T(ms), t => { by = restY - Math.sin(t * Math.PI) * hgt; rot = -12 + 12 * t; place(); }, ease.linear);
        SFX.bounce(k);
      }
      by = restY; rot = 0; place(); ball.classList.remove('snap');
      await wait(T(260));

      // 4) 摇晃：底部为支点，按钮闪红灯，扬起尘土
      for (let i = 0; i < attempt.shakes; i++) {
        phase(`正在捕获 ${name}…`, i + 1);
        ball.classList.add('blink'); SFX.shake();
        if (!reduced) for (const side of [-1, 1]) { const dust = el('i', 'cfx-dust', layer); dust.style.left = `${bx + side * r * .9}px`; dust.style.top = `${floorY - 4}px`; dust.style.setProperty('--dx', `${side * 14}px`); dust.addEventListener('animationend', () => dust.remove(), { once: true }); }
        await spin.animate([0, -26, 20, -10, 4, 0].map(a => ({ transform: `rotate(${a}deg)` })), { duration: T(560), easing: 'ease-in-out' }).finished.catch(() => {});
        ball.classList.remove('blink');
        await wait(T(420));
      }

      if (attempt.success) {
        // 5a) 成功：咔嗒 + 星光 + 金色光环，球静静留在原地
        SFX.click(); ball.classList.add('locked');
        phase(`收服成功！${name} 成为了新伙伴。`, 3);
        const halo = el('i', 'cfx-halo', layer); halo.style.left = `${bx}px`; halo.style.top = `${by}px`;
        if (!reduced) for (let i = 0; i < 3; i++) {
          const s = el('i', 'cfx-star', layer); s.textContent = '★';
          Object.assign(s.style, { left: `${bx}px`, top: `${by - r * .6}px`, animationDelay: `${i * 70}ms` });
          s.style.setProperty('--sx', `${(i - 1) * 34}px`); s.style.setProperty('--sy', `${-38 - (i === 1 ? 14 : 0)}px`);
        }
        SFX.success();
        await wait(T(1250));
        halo.remove(); layer.querySelectorAll('.cfx-star').forEach(n => n.remove());
        // 收服完成：球和影子一起淡出，不在场上留下任何东西。
        await tween(T(420), t => { ball.style.opacity = String(1 - t); shadow.style.opacity = String(1 - t); scale = 1 - .25 * t; place(); }, ease.inQuad);
      } else {
        // 5b) 失败：剧烈晃动 → 球弹开 → 白光 → 宝可梦跳出
        phase(`${name} 挣脱了精灵球！`);
        await spin.animate([0, -14, 14, -14, 14, 0].map(a => ({ transform: `rotate(${a}deg)` })), { duration: T(300) }).finished.catch(() => {});
        ball.classList.add('burst'); SFX.burst();
        const flash = el('i', 'cfx-flash', layer); flash.style.left = `${bx}px`; flash.style.top = `${by}px`;
        flash.addEventListener('animationend', () => flash.remove(), { once: true });
        target.style.visibility = prevVis; ghost.style.opacity = '0';
        target.animate([
          { scale: String(baseScale * .15), filter: 'brightness(4)', opacity: .2 },
          { scale: String(baseScale * 1.1), filter: 'brightness(2)', opacity: 1, offset: .55 },
          { scale: String(baseScale), filter: 'brightness(1)', opacity: 1 },
        ], { duration: T(460), easing: 'cubic-bezier(.2,1.4,.4,1)' });
        const y1 = by, x1 = bx;
        await tween(T(460), t => { bx = x1 - 34 * t; by = y1 - Math.sin(t * Math.PI) * 30 + 10 * t; rot = -200 * t; scale = 1 - .2 * t; place(); ball.style.opacity = String(1 - t); }, ease.outCubic);
      }
    } finally {
      target.style.visibility = prevVis; // 成功时由 .sprite.is-captured 负责隐藏
      caption.remove(); layer.querySelectorAll('.cfx-ghost-wrap,.cfx-beam,.cfx-trail,.cfx-spark,.cfx-dust,.cfx-ring,.cfx-halo,.cfx-star,.cfx-flash').forEach(n => n.remove());
      ball.remove(); layer.remove();
    }
  }
  root.PKMCaptureFX = { play, ballSVG, version: 'capture-fx-v2.1' };
})(typeof globalThis !== 'undefined' ? globalThis : this);
