(() => {
'use strict';
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* palette */
const PINK = '#ff7eb6', PINK_D = '#e0559a', MINT = '#6ee7c8', MINT_D = '#38c0a2', BUTTER = '#ffd96b', BUTTER_D = '#f0b43c',
      SKY = '#7cc4ff', SKY_D = '#4aa3e8', LAV = '#b69cff', LAV_D = '#8b6fe0', INK = '#2b1f5e',
      ORG1 = '#ff9a3c', ORG1_D = '#e0701a', ORG2 = '#ff7a1a', ORG2_D = '#d4560a', ORG3 = '#ffb347', ORG3_D = '#e08f1d', BROW = '#4a1d08';
const FONT = `"Bagel Fat One","Arial Rounded MT Bold","Trebuchet MS",sans-serif`;

/* storage */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const settings = { diff: store.get('pp_diff', 'normal'), sound: store.get('pp_sound', true), haptics: store.get('pp_haptics', true) };
const DIFFS = {
  easy:   { lives: 5, spd: .8,  fire: .7,  drop: .2,  boss: .8 },
  normal: { lives: 3, spd: 1,   fire: 1,   drop: .14, boss: 1 },
  hard:   { lives: 2, spd: 1.25, fire: 1.4, drop: .09, boss: 1.3 }
};
let D = DIFFS[settings.diff] || DIFFS.normal;
const bestKey = () => 'pp_best_' + settings.diff;

/* haptics */
const hasVib = 'vibrate' in navigator;
function vib(p) { if (settings.haptics && hasVib) { try { navigator.vibrate(p); } catch (e) {} } }

/* ---------- audio ---------- */
const Snd = (() => {
  let ac = null, master, sfx, mus, timer = null, step = 0, nextT = 0, tempo = 1;
  const mel = [659,0,523,0,587,659,0,523, 440,0,523,0,587,0,523,0, 659,0,784,0,659,587,0,523, 587,0,440,0,523,0,0,0];
  const bass = [131, 98, 110, 87];
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = settings.sound ? 1 : 0; master.connect(ac.destination);
      sfx = ac.createGain(); sfx.gain.value = .5; sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = .16; mus.connect(master);
    } catch (e) { ac = null; }
  }
  function tone(f, t, dur, type, vol, dest, to) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .03);
  }
  const T = () => ac.currentTime;
  const seq = (arr, gap, dur, type, vol) => { if (!ac) return; const t = T(); arr.forEach((f, i) => tone(f, t + i * gap, dur, type, vol, sfx)); };
  function sched() {
    if (!ac) return;
    while (nextT < ac.currentTime + .3) {
      const i = step % 32, d = .19 / tempo;
      if (mel[i]) tone(mel[i], nextT, d * 1.7, 'triangle', .5, mus);
      if (i % 4 === 0) tone(bass[Math.floor(i / 8)], nextT, d * 3, 'sine', .8, mus);
      nextT += d; step++;
    }
  }
  return {
    init,
    setEnabled(v) { if (master) master.gain.setTargetAtTime(v ? 1 : 0, ac.currentTime, .02); },
    startMusic(t) { tempo = t || 1; if (!ac || timer) return; nextT = ac.currentTime + .05; timer = setInterval(sched, 100); },
    stopMusic() { clearInterval(timer); timer = null; },
    setTempo(t) { tempo = t; },
    shoot() { if (ac) tone(880, T(), .09, 'square', .12, sfx, 420); },
    pop() { if (!ac) return; const t = T(); tone(520, t, .14, 'triangle', .28, sfx, 160); tone(1040, t, .07, 'sine', .12, sfx, 700); },
    hit() { if (ac) tone(240, T(), .4, 'sawtooth', .22, sfx, 50); },
    bossHit() { if (ac) tone(300, T(), .08, 'square', .1, sfx, 190); },
    ufo() { if (ac) { const t = T(); tone(820, t, .08, 'sine', .1, sfx, 1000); tone(1000, t + .08, .08, 'sine', .1, sfx, 820); } },
    power() { seq([523, 659, 784, 1047], .06, .13, 'triangle', .22); },
    wave() { seq([392, 523, 659, 784], .09, .16, 'triangle', .22); },
    life() { seq([659, 880, 1175], .07, .14, 'triangle', .22); },
    bossDie() { seq([784, 659, 587, 523, 659, 784, 1047], .08, .2, 'triangle', .24); },
    over() { seq([392, 330, 262, 196], .22, .32, 'triangle', .24); }
  };
})();

/* ---------- world ---------- */
const MODES = { port: { W: 360, H: 560 }, land: { W: 600, H: 380 } };
let mode = 'port', W = 360, H = 560, scale = 1, dpr = 1;
const canvas = $('c'), ctx = canvas.getContext('2d');
const field = $('field');
const SHIELD_W = 15, SHIELD_H = 11, CELL = 4;
const shieldTop = () => H - 118;
const baseOy = () => mode === 'port' ? 68 : 64;
const UFO_Y = 26;

const S = { state: 'menu', score: 0, lives: 3, wave: 0, best: 0, clock: 0, shake: 0, banner: 0, clearT: 0, ufoT: 12, fireT: 1.2, ufoSnd: 0,
            isBoss: false, newBest: false, nextUp: 2500, fx: { triple: 0, rapid: 0, slow: 0, bubble: 0, super: 0 }, hudDirty: true };
const input = { tl: false, tr: false, kl: false, kr: false, tf: false, kf: false };
let P, form, aliens = [], shields = [], pB = [], eB = [], parts = [], pops = [], pows = [], ufo = null, boss = null;

const stars = Array.from({ length: 80 }, () => ({ x: rand(0, 600), y: rand(0, 560), r: rand(.6, 1.7), v: rand(3, 14), ph: rand(0, TAU) }));

function newPlayer() { P = { x: W / 2, y: H - 34, cd: 0, inv: 0, superHits: 0 }; }

function buildForm() {
  const port = mode === 'port';
  const cols = port ? 8 : 9, rows = 5, sx = port ? 36 : 44, sy = port ? 34 : 30;
  form = { cols, rows, sx, sy, ox: (W - (cols - 1) * sx) / 2, oy: baseOy() + Math.min(Math.max(S.wave - 1, 0), 4) * 5,
           dir: 1, animT: 0, drop: port ? 16 : 12, alive: cols * rows, total: cols * rows };
  aliens = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    aliens.push({ c, r, alive: true, kind: r === 0 ? 0 : r < 3 ? 1 : 2, pts: r === 0 ? 30 : r < 3 ? 20 : 10 });
}
const ax = a => form.ox + a.c * form.sx, ay = a => form.oy + a.r * form.sy;

function buildShields() {
  shields = [];
  for (let i = 0; i < 4; i++) {
    const cells = new Uint8Array(SHIELD_W * SHIELD_H);
    for (let cy = 0; cy < SHIELD_H; cy++) for (let cx = 0; cx < SHIELD_W; cx++) {
      let on = 1;
      if (cy === 0 && (cx < 3 || cx > 11)) on = 0;
      if (cy === 1 && (cx < 1 || cx > 13)) on = 0;
      if (cy >= 8 && cx >= 5 && cx <= 9) on = 0;
      cells[cy * SHIELD_W + cx] = on;
    }
    shields.push(cells);
  }
}
const shieldX = i => W * (i + .5) / 4 - SHIELD_W * CELL / 2;

function eraseAt(i, px, py, r) {
  const cells = shields[i], x0 = shieldX(i), y0 = shieldTop();
  const cx = (px - x0) / CELL, cy = (py - y0) / CELL;
  let any = false;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    if (x < 0 || y < 0 || x >= SHIELD_W || y >= SHIELD_H) continue;
    if (!cells[y * SHIELD_W + x]) continue;
    const d = Math.hypot(x + .5 - cx, y + .5 - cy);
    if (d <= r + Math.random() * .7) { cells[y * SHIELD_W + x] = 0; any = true; }
  }
  return any;
}
function hitShield(px, py, r) {
  const y0 = shieldTop();
  if (py < y0 || py > y0 + SHIELD_H * CELL) return false;
  for (let i = 0; i < 4; i++) {
    const x0 = shieldX(i);
    if (px < x0 || px > x0 + SHIELD_W * CELL) continue;
    const cx = Math.floor((px - x0) / CELL), cy = Math.floor((py - y0) / CELL);
    if (shields[i][cy * SHIELD_W + cx]) { eraseAt(i, px, py, r); return true; }
  }
  return false;
}
function crushShields(x, y, hw, hh) {
  const y0 = shieldTop();
  if (y + hh < y0 || y - hh > y0 + SHIELD_H * CELL) return;
  for (let i = 0; i < 4; i++) {
    const x0 = shieldX(i), cells = shields[i];
    if (x + hw < x0 || x - hw > x0 + SHIELD_W * CELL) continue;
    for (let cy = 0; cy < SHIELD_H; cy++) for (let cx = 0; cx < SHIELD_W; cx++) {
      if (!cells[cy * SHIELD_W + cx]) continue;
      const px = x0 + cx * CELL + CELL / 2, py = y0 + cy * CELL + CELL / 2;
      if (Math.abs(px - x) < hw && Math.abs(py - y) < hh) cells[cy * SHIELD_W + cx] = 0;
    }
  }
}

/* ---------- effects ---------- */
function burst(x, y, n, cols, o = {}) {
  if (reduced) n = Math.ceil(n / 3);
  for (let i = 0; i < n && parts.length < 320; i++) {
    const a = rand(0, TAU), s = rand(o.min || 40, o.max || 190);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 40), life: rand(.5, o.life || 1), max: 1,
                 col: cols[i % cols.length], r: rand(2.5, o.size || 5), star: Math.random() < .6, rot: rand(0, TAU), g: o.g === undefined ? 260 : o.g });
  }
}
function pop(x, y, txt, col) { pops.push({ x, y, txt, col: col || '#fff', life: 1.1 }); }
const hud = () => { S.hudDirty = true; };
function addScore(n) {
  S.score += n;
  while (S.score >= S.nextUp) {
    S.nextUp += 2500;
    if (S.lives < 6) { S.lives++; pop(P.x, P.y - 40, '1UP', PINK); Snd.life(); vib(25); }
  }
  hud();
}
function showBanner(txt) {
  const b = $('banner'); b.textContent = txt; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); S.banner = 1.4;
}

/* ---------- game flow ---------- */
function startGame() {
  D = DIFFS[settings.diff] || DIFFS.normal;
  Snd.init(); Snd.setEnabled(settings.sound);
  S.score = 0; S.lives = D.lives; S.wave = 0; S.nextUp = 2500; S.newBest = false;
  S.fx.triple = S.fx.rapid = S.fx.slow = S.fx.bubble = S.fx.super = 0;
  S.best = store.get(bestKey(), 0);
  pB = []; eB = []; parts = []; pops = []; pows = []; ufo = null; boss = null;
  newPlayer();
  showScreen(null);
  S.state = 'play';
  Snd.startMusic(1);
  nextWave();
}
function nextWave() {
  S.wave++; S.clearT = 0; S.isBoss = S.wave % 3 === 0;
  pB = []; eB = []; ufo = null; pows = [];
  buildShields();
  S.ufoT = rand(10, 16); S.fireT = 1;
  if (S.isBoss) {
    const k = S.wave / 3;
    const max = Math.round((20 + 9 * k) * D.boss);
    boss = { x: W / 2, y: -70, w: 100, hp: max, max, t: 0, enter: 1.3, fireT: 1.4, flash: 0, open: 0, blink: 0, vol: 0, drops: [.7, .4, .15], k };
    aliens = []; form = { alive: 0, total: 1 };
    showBanner('Boss wave!'); Snd.setTempo(1.3);
  } else {
    boss = null; buildForm(); showBanner('Wave ' + S.wave); Snd.setTempo(1 + Math.min(S.wave, 10) * .03);
  }
  Snd.wave(); hud();
}
function waveClear() {
  S.clearT = 1.6; eB = [];
  const bonus = 100 * S.wave; addScore(bonus); pop(W / 2, H * .45, 'Wave clear! +' + bonus, BUTTER);
  Snd.wave();
}
function gameOver() {
  S.state = 'over'; Snd.stopMusic(); Snd.over();
  S.newBest = S.score > S.best;
  if (S.newBest) { S.best = S.score; store.set(bestKey(), S.best); }
  $('finalScore').textContent = S.score; $('overBest').textContent = S.best; $('overWave').textContent = S.wave;
  $('newBest').hidden = !S.newBest;
  hud();
  setTimeout(() => { if (S.state === 'over') showScreen('over'); }, 700);
}
function pauseGame() { if (S.state === 'play') { S.state = 'paused'; Snd.stopMusic(); input.tl = input.tr = input.tf = false; clearPads(); showScreen('pause'); } }
function resumeGame() { if (S.state === 'paused') { S.state = 'play'; showScreen(null); Snd.startMusic(S.isBoss ? 1.3 : 1 + Math.min(S.wave, 10) * .03); last = performance.now(); } }
function quitToMenu() { S.state = 'menu'; Snd.stopMusic(); pB = []; eB = []; parts = []; pops = []; pows = []; ufo = null; boss = null; S.wave = 0; buildForm(); newPlayer(); S.best = store.get(bestKey(), 0); $('menuBest').textContent = S.best; hud(); showScreen('menu'); }

function showScreen(name) {
  const ov = $('overlay');
  ov.hidden = !name;
  for (const id of ['menu', 'pause', 'over']) $(id).hidden = id !== name;
  if (name === 'menu') { const f = $('btnPlay'); try { f.focus({ preventScroll: true }); } catch (e) {} }
}

/* ---------- player actions ---------- */
function shoot() {
  const sp = -540;
  if (S.fx.triple > 0) pB.push({ x: P.x, y: P.y - 24, vx: 0, vy: sp }, { x: P.x - 6, y: P.y - 18, vx: -95, vy: sp }, { x: P.x + 6, y: P.y - 18, vx: 95, vy: sp });
  else pB.push({ x: P.x, y: P.y - 24, vx: 0, vy: sp });
  P.cd = S.fx.rapid > 0 ? .17 : .36;
  Snd.shoot(); vib(6);
}
function hitPlayer() {
  if (P.inv > 0) return;
  if (activeShield()) { shieldHit(); P.inv = .9; return; }
  S.lives--; P.inv = 2.2; S.shake = .35; eB = [];
  burst(P.x, P.y, 24, [PINK, BUTTER, '#fff']); Snd.hit(); vib([60, 40, 80]); hud();
  if (S.lives <= 0) gameOver();
}
function invade() {
  S.lives--; eB = []; form.oy = Math.max(baseOy(), form.oy - 90); P.inv = 2; S.shake = .4;
  burst(P.x, P.y, 24, [PINK, BUTTER, '#fff']); Snd.hit(); vib([60, 40, 80]); hud();
  if (S.lives <= 0) gameOver();
}
/* Shields: the bubble lasts 10s and pops on one hit. The super shield has 3x the radius, lasts 3x as long (30s) and takes 3 hits. */
const BUBBLE_R = 28, BUBBLE_T = 10, SUPER_R = BUBBLE_R * 3, SUPER_T = BUBBLE_T * 3, SUPER_HITS = 3;
const activeShield = () => S.fx.super > 0 ? 'super' : S.fx.bubble > 0 ? 'bubble' : null;
const shieldRadius = () => activeShield() === 'super' ? SUPER_R : BUBBLE_R;
function shieldHit() {
  const sup = activeShield() === 'super';
  burst(P.x, P.y - 3, sup ? 18 : 14, sup ? [BUTTER, '#fff', PINK] : [SKY, '#fff'], { g: 0 });
  Snd.pop(); vib(20);
  if (sup) { if (--P.superHits <= 0) { S.fx.super = 0; pop(P.x, P.y - 40, 'Shield gone', BUTTER); } }
  else S.fx.bubble = 0;
}
const POW_TYPES = ['triple', 'triple', 'triple', 'rapid', 'rapid', 'rapid', 'bubble', 'bubble', 'slow', 'slow', 'super'];
function spawnPow(x, y) { pows.push({ x, y, type: POW_TYPES[Math.floor(Math.random() * POW_TYPES.length)], t: rand(0, TAU) }); }
function collect(p) {
  const names = { triple: 'Triple shot!', rapid: 'Rapid fire!', bubble: 'Bubble shield!', slow: 'Slow-mo!', super: 'SUPER shield!' };
  const secs = { triple: 10, rapid: 10, slow: 6, bubble: BUBBLE_T, super: SUPER_T };
  S.fx[p.type] = secs[p.type];
  if (p.type === 'super') P.superHits = SUPER_HITS;
  pop(P.x, P.y - 36, names[p.type], BUTTER); Snd.power(); vib(18); burst(p.x, p.y, 10, [BUTTER, '#fff'], { g: 0, max: 120 });
}
function killAlien(a) {
  a.alive = false; form.alive--; addScore(a.pts);
  const col = a.kind === 0 ? ORG1 : a.kind === 1 ? ORG2 : ORG3;
  burst(ax(a), ay(a), 11, [col, ORG1_D, '#fff', BUTTER]); Snd.pop(); vib(10);
  if (Math.random() < D.drop) spawnPow(ax(a), ay(a));
  if (form.alive <= 0) waveClear();
}
function hitUfo() {
  addScore(ufo.pts); pop(ufo.x, ufo.y - 8, '+' + ufo.pts, PINK);
  burst(ufo.x, ufo.y, 22, [LAV, PINK, BUTTER, '#fff']); spawnPow(ufo.x, ufo.y + 10); Snd.pop(); vib(25); ufo = null;
}
function hitBoss(b) {
  b.hp--; b.flash = .09; addScore(10); Snd.bossHit(); vib(8);
  burst(b.x + rand(-20, 20), b.y + rand(-10, 20), 3, [LAV, '#fff'], { max: 100 });
  const r = b.hp / b.max;
  if (b.drops.length && r <= b.drops[0]) { b.drops.shift(); spawnPow(b.x, b.y + 46); }
  if (b.hp <= 0) {
    const pts = 400 * b.k; addScore(pts); pop(b.x, b.y, '+' + pts, BUTTER);
    burst(b.x, b.y, 70, [PINK, BUTTER, MINT, SKY, LAV], { max: 260, life: 1.4 }); S.shake = .5; Snd.bossDie(); vib([40, 30, 40, 30, 90]);
    boss = null; waveClear();
  }
}
function collidePB(b) {
  if (ufo && Math.abs(b.x - ufo.x) < 20 && Math.abs(b.y - ufo.y) < 11) { hitUfo(); return true; }
  if (boss && boss.enter <= 0) {
    const dx = (b.x - boss.x) / 50, dy = (b.y - boss.y) / 42;
    if (dx * dx + dy * dy < 1) { hitBoss(boss); return true; }
  }
  for (const a of aliens) {
    if (!a.alive) continue;
    if (Math.abs(b.x - ax(a)) < 14 && Math.abs(b.y - ay(a)) < 13) { killAlien(a); return true; }
  }
  return false;
}

/* ---------- update ---------- */
function updForm(dt, ts) {
  let minC = 99, maxC = -1, lowY = -1;
  for (const a of aliens) if (a.alive) { if (a.c < minC) minC = a.c; if (a.c > maxC) maxC = a.c; const y = ay(a); if (y > lowY) lowY = y; }
  if (maxC < 0) return;
  const frac = 1 - form.alive / form.total;
  const mul = 1 + 2.8 * frac;
  const base = (mode === 'port' ? 26 : 38) * D.spd * (1 + (S.wave - 1) * .06);
  form.ox += form.dir * base * mul * ts * dt;
  const L = form.ox + minC * form.sx - 15, R = form.ox + maxC * form.sx + 15;
  if (form.dir > 0 && R >= W - 8) { form.dir = -1; form.ox -= R - (W - 8); form.oy += form.drop; }
  else if (form.dir < 0 && L <= 8) { form.dir = 1; form.ox += 8 - L; form.oy += form.drop; }
  form.animT += dt * ts * (1.4 + mul);
  lowY = lowY + 0; // recomputed next frame after drop
  if (lowY + 14 > shieldTop()) for (const a of aliens) if (a.alive) crushShields(ax(a), ay(a), 15, 14);
  if (lowY + 13 >= P.y - 18) invade();
}
function alienFire(dt, ts) {
  S.fireT -= dt * ts;
  if (S.fireT > 0) return;
  S.fireT = rand(.5, 1.1) * (1.15 - Math.min(S.wave, 10) * .05) / D.fire;
  if (eB.length >= 2 + Math.min(Math.floor(S.wave / 2), 5)) return;
  const cols = [];
  for (let c = 0; c < form.cols; c++) for (let r = form.rows - 1; r >= 0; r--) { const a = aliens[r * form.cols + c]; if (a.alive) { cols.push(a); break; } }
  if (!cols.length) return;
  let pick;
  if (Math.random() < .5) { pick = cols[0]; for (const a of cols) if (Math.abs(ax(a) - P.x) < Math.abs(ax(pick) - P.x)) pick = a; }
  else pick = cols[Math.floor(Math.random() * cols.length)];
  eB.push({ x: ax(pick), y: ay(pick) + 12, vx: 0, vy: 110 + Math.min(S.wave, 10) * 8, col: PINK, r: 5 });
}
function ufoLogic(dt) {
  if (ufo) {
    ufo.x += ufo.vx * dt;
    if (ufo.x < -40 || ufo.x > W + 40) ufo = null;
    else { S.ufoSnd -= dt; if (S.ufoSnd <= 0) { Snd.ufo(); S.ufoSnd = .17; } }
    return;
  }
  S.ufoT -= dt;
  if (S.ufoT <= 0 && !S.isBoss && form.alive > 2) {
    const d = Math.random() < .5 ? 1 : -1;
    ufo = { x: d > 0 ? -24 : W + 24, y: UFO_Y, vx: d * (80 + S.wave * 3), pts: [50, 100, 150, 300][Math.floor(Math.random() * 4)] };
    S.ufoT = rand(16, 26);
  }
}
function updBoss(dt, ts) {
  const b = boss; b.t += dt * ts;
  if (b.enter > 0) { b.enter -= dt; const p = clamp(1 - b.enter / 1.3, 0, 1); b.y = -70 + (86 + 70) * (1 - Math.pow(1 - p, 3)); return; }
  const r = b.hp / b.max, sp = r > .6 ? .7 : r > .3 ? .95 : 1.25;
  b.x = W / 2 + Math.sin(b.t * sp) * (W / 2 - b.w / 2 - 14);
  b.y = 86;
  b.flash -= dt; b.open -= dt; b.blink -= dt;
  if (Math.random() < dt * .35) b.blink = .14;
  b.fireT -= dt * ts;
  if (b.fireT <= 0) {
    const v = 140 * (.9 + .1 * D.fire), mk = (a, s) => eB.push({ x: b.x, y: b.y + 36, vx: Math.sin(a) * s, vy: Math.cos(a) * s, col: '#d6bcff', r: 6 });
    if (r > .6) { [-.4, 0, .4].forEach(a => mk(a, v)); b.fireT = 1.6 / D.fire; }
    else if (r > .3) { [-.6, -.3, 0, .3, .6].forEach(a => mk(a, v)); mk(Math.atan2(P.x - b.x, P.y - b.y), v * 1.1); b.fireT = 1.5 / D.fire; }
    else {
      for (let i = 0; i < 9; i++) mk(-1.2 + i * .3 + (Math.floor(b.t) % 2 ? .15 : 0), v * .95);
      mk(Math.atan2(P.x - b.x, P.y - b.y), v * 1.2); b.fireT = 1.15 / D.fire;
    }
    b.open = .35;
  }
}
function update(dt) {
  const ts = S.fx.slow > 0 ? .45 : 1;
  for (const k of ['triple', 'rapid', 'slow', 'bubble', 'super']) if (S.fx[k] > 0) S.fx[k] = Math.max(0, S.fx[k] - dt);
  P.inv = Math.max(0, P.inv - dt);
  const dir = ((input.tl || input.kl) ? -1 : 0) + ((input.tr || input.kr) ? 1 : 0);
  P.x = clamp(P.x + dir * 250 * dt, 18, W - 18);
  P.cd -= dt;
  if (S.banner > 0) S.banner -= dt;
  if ((input.tf || input.kf) && P.cd <= 0 && S.banner <= 0 && S.state === 'play') shoot();

  if (S.clearT > 0) { S.clearT -= dt; if (S.clearT <= 0) nextWave(); }
  else if (S.banner <= 0 || (boss && boss.enter > 0)) {
    if (S.isBoss) { if (boss) updBoss(dt, ts); }
    else { updForm(dt, ts); if (S.state === 'play' && S.clearT <= 0) alienFire(dt, ts); }
    if (S.state === 'play' && S.clearT <= 0) ufoLogic(dt);
  }
  if (S.state !== 'play') return;

  for (let i = pB.length - 1; i >= 0; i--) {
    const b = pB[i]; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < -14 || b.x < -10 || b.x > W + 10 || collidePB(b)) pB.splice(i, 1);
    if (S.state !== 'play') return;
  }
  for (let i = eB.length - 1; i >= 0; i--) {
    const b = eB[i]; b.x += b.vx * dt * ts; b.y += b.vy * dt * ts;
    if (b.y > H + 10 || b.x < -10 || b.x > W + 10) { eB.splice(i, 1); continue; }
    if (hitShield(b.x, b.y, b.r > 5 ? 2.1 : 1.7)) { eB.splice(i, 1); continue; }
    if (activeShield() && Math.hypot(b.x - P.x, b.y - (P.y - 3)) < shieldRadius() + b.r) { eB.splice(i, 1); shieldHit(); continue; }
    if (Math.abs(b.x - P.x) < 11 + b.r * .4 && b.y > P.y - 18 && b.y < P.y + 16) { eB.splice(i, 1); hitPlayer(); if (S.state !== 'play') return; }
  }
  for (let i = pows.length - 1; i >= 0; i--) {
    const p = pows[i]; p.y += 70 * dt; p.t += dt * 4;
    if (Math.abs(p.x - P.x) < 24 && Math.abs(p.y - P.y) < 26) { collect(p); pows.splice(i, 1); }
    else if (p.y > H + 20) pows.splice(i, 1);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += dt * 6;
  }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.life -= dt; p.y -= 24 * dt; if (p.life <= 0) pops.splice(i, 1); }
}

/* ---------- drawing ---------- */
function ell(x, y, rx, ry, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, TAU); ctx.fill(); }
function eyes(x, y, sep, r, dx, pr) {
  pr = pr || r * .52;
  for (const s of [-1, 1]) {
    ell(x + s * sep, y, r, r * 1.08, '#fff');
    ell(x + s * sep + dx, y + .4, pr, pr * 1.1, INK);
    ell(x + s * sep + dx - pr * .35, y - pr * .3, pr * .3, pr * .3, '#fff');
  }
}
function smile(x, y, r, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 1.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r, .15 * Math.PI, .85 * Math.PI); ctx.stroke(); }
function star(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* Three original orange critters, each with its own ugly face: Grumpus (top row), Squint (middle) and Goober (bottom). */
function brow(x1, y1, x2, y2, w) { ctx.strokeStyle = BROW; ctx.lineWidth = w || 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function drawAlien(kind, x, y, fr, dx) {
  ctx.save(); ctx.translate(x, y);
  const blotch = 'rgba(190,50,0,.3)';
  if (kind === 0) {                                   // Grumpus: spiky tufts, furious brows, snarling teeth
    ctx.fillStyle = ORG1_D;
    for (const t of [-1, 0, 1]) { const w = fr ? 1.5 : -1; ctx.beginPath(); ctx.moveTo(t * 6 - 3, -9); ctx.lineTo(t * 6 + w * t, -19 + (t === 0 ? -2 : 0)); ctx.lineTo(t * 6 + 3, -9); ctx.closePath(); ctx.fill(); }
    ell(-6, 11.5 + (fr ? 0 : 1.4), 4.2, 2.6, ORG1_D); ell(6, 11.5 + (fr ? 1.4 : 0), 4.2, 2.6, ORG1_D);
    ell(0, 0, 13, 11.5, ORG1); ell(0, 5, 9, 4.5, 'rgba(255,255,255,.22)');
    ell(-9.5, 3, 3, 2.2, blotch); ell(9.5, 3, 3, 2.2, blotch);
    for (const t of [-1, 1]) { ell(t * 5, -2, 3.3, 2.9, '#fff'); ell(t * 5 + dx, -1.6, 1.7, 1.8, INK); }
    brow(-10, -8.5, -2, -5); brow(10, -8.5, 2, -5);
    ell(0, 6, 5.8, 3.4, INK);
    ctx.fillStyle = '#fff';
    for (const tx of [-3.4, -.6, 2.2]) { ctx.beginPath(); ctx.moveTo(tx, 3.2); ctx.lineTo(tx + 2.4, 3.2); ctx.lineTo(tx + 1.2, 5.6); ctx.closePath(); ctx.fill(); }
  } else if (kind === 1) {                            // Squint: slit eyes, puffed cheeks, jagged scowl
    const ax2 = fr ? -4 : 4;
    ctx.strokeStyle = ORG2_D; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(ax2, -18); ctx.stroke();
    ell(ax2, -19, 2.7, 2.7, BUTTER);
    ell(-14, 3 + (fr ? -2 : 2), 3.2, 2.2, ORG2_D); ell(14, 3 + (fr ? 2 : -2), 3.2, 2.2, ORG2_D);
    ell(-6, 12, 3.4, 2.4, ORG2_D); ell(6, 12, 3.4, 2.4, ORG2_D);
    ell(0, 0, 13.5, 12, ORG2); ell(0, 6, 9, 4.5, 'rgba(255,255,255,.2)');
    ell(-10, 4, 3.4, 2.8, blotch); ell(10, 4, 3.4, 2.8, blotch);
    for (const t of [-1, 1]) { ell(t * 5.5, -2, 4.2, 2.1, '#fff'); ell(t * 5.5 + dx * .9, -1.8, 1.5, 1.5, INK); brow(t * 10.5, -5.2, t * 1.5, -3.6, 2.4); }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-7, 8.5);
    for (let i = 1; i <= 4; i++) ctx.lineTo(-7 + i * 3.5, i % 2 ? 5.5 : 8.5);
    ctx.stroke();
  } else {                                            // Goober: crossed eyes, bucktooth, tongue and drool
    ctx.fillStyle = ORG3; ctx.beginPath(); ctx.arc(0, -2, 13, Math.PI, 0); ctx.lineTo(13, 9);
    for (let i = 0; i < 4; i++) { const x2 = 13 - (i + 1) * 6.5, x1 = 13 - (i + .5) * 6.5; ctx.quadraticCurveTo(x1, 10 + ((i + fr) % 2 ? 5 : -2), x2, 9); }
    ctx.closePath(); ctx.fill();
    ell(-5, -9, 4, 2.4, 'rgba(255,255,255,.45)');
    ell(-9, 2.5, 2.6, 1.9, blotch); ell(9, 2.5, 2.6, 1.9, blotch);
    for (const t of [-1, 1]) { ell(t * 4.4, -2, 3.5, 3.5, '#fff'); ell(t * 4.4 - t * 1.8, -1.6, 1.5, 1.6, INK); }
    brow(-9, -8, -2, -6.6, 1.8); brow(2, -7.6, 9, -5.8, 1.8);
    ell(0, 4.2, 3.4, 2.2, INK);
    ctx.fillStyle = '#fff'; ctx.fillRect(-1.7, 2.8, 3.4, 3);
    ell(2.2, 6.8 + (fr ? .6 : 0), 1.9, 2.8, PINK); ell(-4.2, 8.4 + (fr ? 1 : 0), 1, 1.6, '#bfe6ff');
  }
  ctx.restore();
}
function drawBoss(b) {                               // the boss: a big orange grump in a crown
  ctx.save(); ctx.translate(b.x, b.y + Math.sin(b.t * 3) * 3);
  ell(-24, 41, 13, 7, ORG2_D); ell(24, 41, 13, 7, ORG2_D);
  const wv = Math.sin(b.t * 4) * .25;
  ctx.save(); ctx.translate(-49, 6); ctx.rotate(-.5 + wv); ell(0, 0, 8, 16, ORG2_D); ctx.restore();
  ctx.save(); ctx.translate(49, 6); ctx.rotate(.5 - wv); ell(0, 0, 8, 16, ORG2_D); ctx.restore();
  ctx.fillStyle = BUTTER;
  for (const x of [-22, 0, 22]) { const tip = x === 0 ? -56 : -52; ctx.beginPath(); ctx.moveTo(x - 9, -33); ctx.lineTo(x, tip); ctx.lineTo(x + 9, -33); ctx.closePath(); ctx.fill(); ell(x, tip, 3, 3, PINK); }
  ell(0, 0, 50, 42, '#ff8a2a'); ell(0, 15, 32, 22, '#ffc27a');
  ell(-34, 10, 9, 6, 'rgba(190,50,0,.3)'); ell(34, 10, 9, 6, 'rgba(190,50,0,.3)');
  const lx = clamp((P.x - b.x) / 120, -1, 1) * 3;
  for (const s of [-1, 1]) {
    ell(s * 18, -6, 11, 9, '#fff');
    if (b.blink > 0) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s * 18 - 9, -6); ctx.lineTo(s * 18 + 9, -6); ctx.stroke(); }
    else { ell(s * 18 + lx, -5, 5.2, 5.4, INK); ell(s * 18 + lx - 1.8, -7, 1.8, 1.8, '#fff'); }
    brow(s * 31, -25, s * 7, -13, 5.5);
  }
  if (b.open > 0) {
    const h = 4 + Math.min(b.open / .35, 1) * 9;
    ell(0, 19, 15, h, INK); ctx.fillStyle = '#fff';
    for (const tx of [-9, -3, 3]) { ctx.beginPath(); ctx.moveTo(tx, 19 - h + 1); ctx.lineTo(tx + 6, 19 - h + 1); ctx.lineTo(tx + 3, 19 - h + 6); ctx.closePath(); ctx.fill(); }
  } else {
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-16, 22);
    for (let i = 1; i <= 8; i++) ctx.lineTo(-16 + i * 4, i % 2 ? 15 : 22);
    ctx.stroke();
  }
  if (b.flash > 0) { ctx.globalAlpha = .65; ell(0, 0, 50, 42, '#fff'); ctx.globalAlpha = 1; }
  ctx.restore();
}
function drawPlayer() {
  if (P.inv > 0 && Math.floor(P.inv * 14) % 2) return;
  ctx.save(); ctx.translate(P.x, P.y);
  const fl = 6 + Math.random() * 5;
  ell(0, 17 + fl / 2, 5, fl, PINK); ell(0, 16 + fl / 3, 2.6, fl * .6, BUTTER);
  ctx.fillStyle = SKY_D;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 8, 2); ctx.quadraticCurveTo(s * 20, 8, s * 19, 18); ctx.lineTo(s * 8, 13); ctx.closePath(); ctx.fill(); }
  ell(0, 0, 11, 17, '#fff3fb'); ell(0, 9, 10, 5, '#ffd0e6');
  ctx.fillStyle = PINK; ctx.beginPath(); ctx.moveTo(-9.5, -9); ctx.quadraticCurveTo(0, -32, 9.5, -9); ctx.quadraticCurveTo(0, -13, -9.5, -9); ctx.fill();
  ell(0, -1, 6.4, 6.4, SKY_D); ell(0, -1, 5, 5, SKY);
  ell(-1.9, -1.8, .9, 1.1, INK); ell(1.9, -1.8, .9, 1.1, INK); smile(0, -1.2, 2, 1.1);
  ctx.restore();
}
function drawShield() {
  const kind = activeShield();
  if (!kind) return;
  const sup = kind === 'super', R = shieldRadius(), left = sup ? S.fx.super : S.fx.bubble;
  if (left < 2.5 && Math.floor(S.clock * 8) % 2) return;            // blink when about to run out
  ctx.save(); ctx.translate(P.x, P.y - 3);
  if (sup) {
    const g = ctx.createRadialGradient(0, 0, R * .55, 0, 0, R);
    g.addColorStop(0, 'rgba(255,217,107,.04)'); g.addColorStop(1, 'rgba(255,217,107,.3)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,160,.95)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,126,182,.6)'; ctx.lineWidth = 2; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -S.clock * 30;
    ctx.beginPath(); ctx.arc(0, 0, R - 7, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, R * .78, 3.7, 4.5); ctx.stroke();
    ctx.fillStyle = BUTTER;                                            // one orbiting star per hit left
    for (let i = 0; i < P.superHits; i++) star(Math.cos(S.clock * 2 + i * TAU / 3) * (R - 3), Math.sin(S.clock * 2 + i * TAU / 3) * (R - 3), 6, S.clock * 3);
  } else {
    ctx.fillStyle = 'rgba(124,196,255,.2)'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,235,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, 21, 3.7, 4.5); ctx.stroke();
  }
  ctx.restore();
}
function drawPow(p) {
  const cols = { triple: PINK, rapid: '#f5b72b', bubble: SKY_D, slow: '#2fbf9c', super: '#e8a100' };
  ctx.save(); ctx.translate(p.x, p.y + Math.sin(p.t) * 2);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill();
  ell(0, 0, 13, 13, cols[p.type]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (p.type === 'triple') { ctx.beginPath(); for (const x of [-6, 0, 6]) { ctx.moveTo(x * .3, 6); ctx.lineTo(x, -6); } ctx.stroke(); }
  else if (p.type === 'rapid') { ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(-4, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 8); ctx.lineTo(4, -2); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill(); }
  else if (p.type === 'bubble') { ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3.2, 3.7, 4.6); ctx.stroke(); }
  else if (p.type === 'super') { ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, TAU); ctx.stroke(); star(0, .5, 5, 0); }
  else { ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 0); ctx.lineTo(3, 2); ctx.stroke(); }
  ctx.restore();
}
function drawShields() {
  const y0 = shieldTop();
  for (let i = 0; i < shields.length; i++) {
    const cells = shields[i], x0 = shieldX(i);
    for (let cy = 0; cy < SHIELD_H; cy++) {
      ctx.fillStyle = cy < 3 ? '#fff6fc' : cy < 7 ? '#ffe0f0' : '#ffc4e0';
      for (let cx = 0; cx < SHIELD_W; cx++) if (cells[cy * SHIELD_W + cx]) ctx.fillRect(x0 + cx * CELL, y0 + cy * CELL, CELL + .5, CELL + .5);
    }
  }
}
function drawStars(t) {
  for (const s of stars) {
    if (s.x > W || s.y > H) continue;
    ctx.globalAlpha = .45 + .45 * Math.sin(t * 2 + s.ph);
    ctx.fillStyle = s.r > 1.4 ? BUTTER : '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function draw() {
  const t = S.clock;
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (S.shake > 0 && !reduced) ctx.translate(rand(-1, 1) * S.shake * 12, rand(-1, 1) * S.shake * 12);
  drawStars(t);
  if (S.state !== 'menu') drawShields();
  const fr = Math.floor(form ? form.animT * 2 : 0) % 2;
  if (form && aliens.length) for (const a of aliens) {
    if (!a.alive) continue;
    const x = ax(a), y = ay(a) + (S.state === 'menu' ? Math.sin(t * 2 + a.c * .7) * 2 : 0);
    drawAlien(a.kind, x, y, fr, clamp((P.x - x) / 160, -1, 1) * 1.5);
  }
  if (ufo) drawUfo(ufo, t);
  if (boss) drawBoss(boss);
  for (const b of pB) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vx, -b.vy)); ell(0, 0, 3, 8.5, BUTTER); ell(0, 0, 1.4, 5.5, '#fff'); ctx.restore(); }
  for (const b of eB) { ell(b.x - b.vx * .03, b.y - b.vy * .03, b.r * .7, b.r * 1.1, 'rgba(255,255,255,.25)'); ell(b.x, b.y, b.r, b.r, b.col); ell(b.x - 1, b.y - 1, b.r * .5, b.r * .5, '#fff3fb'); }
  for (const p of pows) drawPow(p);
  if (S.state !== 'over' || S.lives > 0) { drawPlayer(); drawShield(); }
  for (const p of parts) { ctx.globalAlpha = clamp(p.life * 1.6, 0, 1); ctx.fillStyle = p.col; if (p.star) star(p.x, p.y, p.r * 1.4, p.rot); else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * .8, 0, TAU); ctx.fill(); } }
  ctx.globalAlpha = 1;
  ctx.font = `15px ${FONT}`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const p of pops) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(p.txt, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y); }
  ctx.globalAlpha = 1;
  if (boss && boss.enter <= 0) {
    const w = W - 80, x = 40, y = 8, pct = clamp(boss.hp / boss.max, 0, 1);
    ctx.fillStyle = 'rgba(10,6,40,.55)'; rr(x - 2, y - 2, w + 4, 14, 7); ctx.fill();
    ctx.fillStyle = PINK; if (pct > 0) { rr(x, y, Math.max(w * pct, 10), 10, 5); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.font = `10px ${FONT}`; ctx.fillText('BOSS', W / 2, y + 8.5);
  }
}

/* ---------- HUD, layout, input ---------- */
const el = { score: $('score'), best: $('best'), wave: $('wave'), lives: $('livesN'), menuBest: $('menuBest'),
  chips: { triple: $('chipTriple'), rapid: $('chipRapid'), slow: $('chipSlow'), bubble: $('chipBubble'), super: $('chipSuper') } };
const lastChip = { triple: -1, rapid: -1, slow: -1, bubble: -1, super: -1 };
const FX_MAX = { triple: 10, rapid: 10, slow: 6, bubble: BUBBLE_T, super: SUPER_T };
function syncHud() {
  if (S.hudDirty) {
    S.hudDirty = false;
    el.score.textContent = S.score; el.best.textContent = Math.max(S.best, S.score);
    el.wave.textContent = Math.max(S.wave, 1); el.lives.textContent = S.lives;
  }
  for (const k of ['triple', 'rapid', 'slow', 'bubble', 'super']) {
    const v = S.fx[k], q = Math.ceil(v * 10);
    if (q === lastChip[k]) continue; lastChip[k] = q;
    el.chips[k].hidden = v <= 0;
    if (v > 0) el.chips[k].lastElementChild.style.transform = `scaleX(${v / FX_MAX[k]})`;
  }
}

function applyMode(m) {
  const o = { W, H }; mode = m; W = MODES[m].W; H = MODES[m].H;
  document.body.dataset.mode = m;
  const rx = W / o.W, ry = H / o.H;
  if (!P) return;
  const sc = a => { for (const e of a) { e.x *= rx; e.y *= ry; } };
  sc(pB); sc(eB); sc(pows); sc(parts); sc(pops);
  P.x *= rx; P.y = H - 34;
  if (ufo) ufo.x *= rx;
  if (boss) boss.x *= rx;
  if (form && form.cols) {
    form.sy = m === 'port' ? 34 : 30; form.drop = m === 'port' ? 16 : 12;
    const maxSx = (W - 60) / (form.cols - 1);
    form.sx = Math.min(m === 'port' ? 36 : 44, maxSx);
    form.ox = clamp(form.ox, 20, Math.max(20, W - 20 - (form.cols - 1) * form.sx));
    form.oy = clamp(form.oy, baseOy(), H - 150);
  }
}
function layout() {
  const m = innerWidth > innerHeight * 1.05 ? 'land' : 'port';
  if (m !== mode) { applyMode(m); if (S.state === 'play') pauseGame(); }
  const r = field.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  scale = Math.min(r.width / W, r.height / H); dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr);
}

/* touch pads */
const dpad = $('dpad'), fire = $('fire');
let dpadId = null, fireId = null;
function dpadUpdate(e) {
  const r = dpad.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2;
  const dz = 8; input.tl = x < -dz; input.tr = x > dz;
  dpad.dataset.dir = input.tl ? 'l' : input.tr ? 'r' : '';
}
function clearPads() { dpadId = null; fireId = null; input.tl = input.tr = input.tf = false; delete dpad.dataset.dir; fire.classList.remove('down'); }
dpad.addEventListener('pointerdown', e => { e.preventDefault(); try { dpad.setPointerCapture(e.pointerId); } catch (x) {} dpadId = e.pointerId; dpadUpdate(e); Snd.init(); });
dpad.addEventListener('pointermove', e => { if (e.pointerId === dpadId) dpadUpdate(e); });
const dpadEnd = e => { if (e.pointerId === dpadId) { dpadId = null; input.tl = input.tr = false; delete dpad.dataset.dir; } };
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => dpad.addEventListener(n, dpadEnd));
fire.addEventListener('pointerdown', e => { e.preventDefault(); try { fire.setPointerCapture(e.pointerId); } catch (x) {} fireId = e.pointerId; input.tf = true; fire.classList.add('down'); Snd.init(); });
const fireEnd = e => { if (e.pointerId === fireId) { fireId = null; input.tf = false; fire.classList.remove('down'); } };
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => fire.addEventListener(n, fireEnd));
document.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');

/* keyboard */
const KEYS = { ArrowLeft: 'kl', KeyA: 'kl', ArrowRight: 'kr', KeyD: 'kr', Space: 'kf', ArrowUp: 'kf', KeyW: 'kf' };
window.addEventListener('keydown', e => {
  if (e.repeat && !KEYS[e.code]) return;
  if (KEYS[e.code] && S.state === 'play') { input[KEYS[e.code]] = true; e.preventDefault(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (S.state === 'play') pauseGame(); else if (S.state === 'paused') resumeGame(); }
  else if (e.code === 'KeyM') setSound(!settings.sound);
  else if (e.code === 'Enter' && S.state === 'menu') startGame();
});
window.addEventListener('keyup', e => { if (KEYS[e.code]) input[KEYS[e.code]] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
window.addEventListener('blur', pauseGame);
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 150));
if (window.ResizeObserver) new ResizeObserver(layout).observe(field);

/* buttons */
function setSound(v) {
  settings.sound = v; store.set('pp_sound', v);
  $('btnSound').setAttribute('aria-pressed', v); $('tgSound').setAttribute('aria-pressed', v);
  Snd.setEnabled(v);
}
function setHaptics(v, buzz) { settings.haptics = v; store.set('pp_haptics', v); $('tgVib').setAttribute('aria-pressed', v); if (v && buzz) vib(30); }
function setDiff(d) {
  settings.diff = d; store.set('pp_diff', d); D = DIFFS[d];
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', b.dataset.d === d);
  S.best = store.get(bestKey(), 0); $('menuBest').textContent = S.best; hud();
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setDiff(b.dataset.d)));
$('btnSound').addEventListener('click', () => { Snd.init(); setSound(!settings.sound); });
$('tgSound').addEventListener('click', () => { Snd.init(); setSound(!settings.sound); });
$('tgVib').addEventListener('click', () => setHaptics(!settings.haptics, true));
$('btnPlay').addEventListener('click', startGame);
$('btnAgain').addEventListener('click', startGame);
$('btnPause').addEventListener('click', () => { if (S.state === 'play') pauseGame(); else if (S.state === 'paused') resumeGame(); });
$('btnResume').addEventListener('click', resumeGame);
$('btnQuit').addEventListener('click', quitToMenu);
$('btnMenu').addEventListener('click', quitToMenu);

/* ---------- main loop ---------- */
const STEP = 1 / 90;
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  S.clock += dt;
  for (const s of stars) { s.y += s.v * dt; if (s.y > H) { s.y = 0; s.x = rand(0, W); } }
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt);
  if (S.state === 'play') { acc += dt; while (acc >= STEP && S.state === 'play') { update(STEP); acc -= STEP; } }
  else if (S.state === 'menu' && form) { form.animT += dt * 1.6; form.ox = (W - (form.cols - 1) * form.sx) / 2 + Math.sin(S.clock * .8) * 18; }
  else if (S.state === 'over') {
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += dt * 6; }
  }
  syncHud(); draw();
}

/* ---------- boot ---------- */
function boot() {
  $('hint').textContent = document.body.classList.contains('touch')
    ? 'Hold the arrows to glide, hold the star to fire. Grab the bubbles for power-ups.'
    : 'Arrow keys or A / D to move, Space to fire, P to pause, M to mute.';
  if (!hasVib) $('tgVib').hidden = true;
  mode = innerWidth > innerHeight * 1.05 ? 'land' : 'port'; W = MODES[mode].W; H = MODES[mode].H; document.body.dataset.mode = mode;
  newPlayer(); buildForm();
  S.best = store.get(bestKey(), 0); $('menuBest').textContent = S.best;
  setDiff(settings.diff); setSound(settings.sound); setHaptics(settings.haptics);
  layout(); hud(); showScreen('menu');
  last = performance.now(); requestAnimationFrame(frame);
}
let booted = false;
const bootOnce = () => { if (!booted) { booted = true; boot(); } };
setTimeout(bootOnce, 1200);
if (document.fonts && document.fonts.load) Promise.all([document.fonts.load(`15px "Bagel Fat One"`), document.fonts.load(`700 14px "Nunito"`)]).catch(() => {}).then(bootOnce);
else bootOnce();
})();
