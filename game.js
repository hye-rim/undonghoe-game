'use strict';

// 손가락 운동회: 짧은 미니게임 모음. 게임마다 { id, title, icon, desc, create } 를 GAMES 에 등록한다.
// create() 가 돌려주는 객체는 update(dt) · draw(ctx) · input(action) · stats() 를 가진다.

const W = 400, H = 640;

// ============================================================
// 이쪽저쪽: 가운데 줄 맨 앞 동물을 자기 편(왼쪽·오른쪽)으로 보낸다
// ============================================================
const SORT = {
  TIME: 60,
  QUEUE: 6,
  WRONG_TIME: 1,          // 틀리면 깎이는 시간(초). 2초는 빠르게 치는 사람일수록 손해가 너무 컸다
  STUN: 0.3,              // 틀린 뒤 잠깐 못 누름
  FEVER_TIME: 6,
  FEVER_STEP: 0.06,       // 맞힐 때마다 차는 피버 게이지
  SWAP_EVERY: 15,         // 4단계부터 이만큼 맞힐 때마다 양쪽 편이 바뀐다
  SWAP_WARN: 1.2,
  ANIMALS: ['🐱', '🐶', '🐰', '🐻'],
};

// 맞힌 개수로 단계 결정: 동물 종류가 늘고, 마지막엔 편이 바뀐다
function sortStage(correct) {
  if (correct < 25) return { n: 1, sides: [[0], [1]] };
  if (correct < 60) return { n: 2, sides: [[0, 2], [1]] };
  if (correct < 100) return { n: 3, sides: [[0, 2], [1, 3]] };
  return { n: 4, sides: [[0, 2], [1, 3]], swapping: true };
}

function createSort(rng = Math.random) {
  const g = {
    time: SORT.TIME, score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0,
    gauge: 0, fever: 0, stun: 0, swapped: false, swapWarn: 0, nextSwapAt: 0,
    queue: [], flying: [], popups: [], shake: 0, stageN: 1, stageBanner: 0, over: false,
  };
  const kinds = () => { const s = sortStage(g.correct); return [...s.sides[0], ...s.sides[1]]; };
  const newAnimal = () => { const k = kinds(); return k[Math.floor(rng() * k.length)]; };
  // 편은 단계가 정하고, 바뀜(swapped)이 켜져 있으면 좌우를 뒤집는다
  const sides = () => { const s = sortStage(g.correct).sides; return g.swapped ? [s[1], s[0]] : s; };
  for (let i = 0; i < SORT.QUEUE; i++) g.queue.push(newAnimal());

  g.sides = sides;

  g.input = (dir) => {           // dir: 0 = 왼쪽, 1 = 오른쪽
    if (g.over || g.stun > 0) return null;
    const front = g.queue[0];
    if (sides()[dir].includes(front)) {
      g.queue.shift();
      g.queue.push(newAnimal());
      g.correct++;
      g.combo++;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      const gain = (10 + Math.min(g.combo, 50)) * (g.fever > 0 ? 2 : 1);
      g.score += gain;
      g.flying.push({ a: front, dir, t: 0 });
      g.popups.push({ text: `+${gain}`, dir, t: 0 });
      if (g.fever <= 0) {
        g.gauge += SORT.FEVER_STEP;
        if (g.gauge >= 1) { g.gauge = 0; g.fever = SORT.FEVER_TIME; }
      }
      const s = sortStage(g.correct);
      if (s.n !== g.stageN) {
        g.stageN = s.n;
        g.stageBanner = 1.5;
        if (s.swapping) g.nextSwapAt = g.correct + SORT.SWAP_EVERY;
        // 새 동물이 섞이도록 줄 뒤쪽을 다시 뽑는다
        for (let i = 2; i < g.queue.length; i++) g.queue[i] = newAnimal();
      }
      if (s.swapping && g.correct >= g.nextSwapAt && g.swapWarn <= 0) g.swapWarn = SORT.SWAP_WARN;
      return 'ok';
    }
    g.wrong++;
    g.combo = 0;
    g.time = Math.max(0, g.time - SORT.WRONG_TIME);
    g.stun = SORT.STUN;
    g.shake = 0.3;
    g.gauge = Math.max(0, g.gauge - 0.25);
    g.popups.push({ text: `-${SORT.WRONG_TIME}초`, dir, t: 0, bad: true });
    return 'wrong';
  };

  g.update = (dt) => {
    for (const f of g.flying) f.t += dt;
    g.flying = g.flying.filter((f) => f.t < 0.25);
    for (const p of g.popups) p.t += dt;
    g.popups = g.popups.filter((p) => p.t < 0.7);
    g.shake = Math.max(0, g.shake - dt);
    g.stageBanner = Math.max(0, g.stageBanner - dt);
    if (g.over) return;
    g.time -= dt;
    g.stun = Math.max(0, g.stun - dt);
    g.fever = Math.max(0, g.fever - dt);
    if (g.swapWarn > 0) {
      g.swapWarn -= dt;
      if (g.swapWarn <= 0) { g.swapped = !g.swapped; g.nextSwapAt = g.correct + SORT.SWAP_EVERY; }
    }
    if (g.time <= 0) { g.time = 0; g.over = true; }
  };

  g.stats = () => ({
    score: g.score,
    lines: [
      ['맞힌 수', `${g.correct}마리`],
      ['정확도', g.correct + g.wrong ? `${Math.round((g.correct / (g.correct + g.wrong)) * 100)}%` : '-'],
      ['최대 콤보', g.maxCombo],
    ],
  });

  g.draw = (ctx) => drawSort(ctx, g);
  return g;
}

// ---------- 이쪽저쪽 그리기 ----------
const BIN_Y = 410, FRONT_Y = 420, BTN_Y = 540;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function emoji(ctx, e, x, y, size, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y);
  ctx.globalAlpha = 1;
}

function drawSort(ctx, g) {
  const now = performance.now() / 1000;
  // 배경: 피버 때는 무지개빛으로 일렁인다
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (g.fever > 0) {
    const h = (now * 120) % 360;
    bg.addColorStop(0, `hsl(${h},90%,85%)`);
    bg.addColorStop(1, `hsl(${(h + 60) % 360},90%,75%)`);
  } else {
    bg.addColorStop(0, '#fff8e1');
    bg.addColorStop(1, '#ffe0a3');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 위: 점수 · 콤보 · 시간 · 피버
  ctx.fillStyle = '#4a2a08';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 30px sans-serif';
  ctx.fillText(g.score.toLocaleString(), 18, 46);
  if (g.combo >= 3) {
    ctx.font = '900 16px sans-serif';
    ctx.fillStyle = '#ff5a36';
    ctx.fillText(`${g.combo} 콤보`, 20, 68);
  }
  const tw = W - 36;
  ctx.fillStyle = 'rgba(120,60,0,.15)';
  roundRect(ctx, 18, 82, tw, 14, 7); ctx.fill();
  const tr = Math.max(0, g.time / SORT.TIME);
  ctx.fillStyle = g.time < 10 ? '#ff4d4d' : '#4cc36b';
  roundRect(ctx, 18, 82, Math.max(14, tw * tr), 14, 7); ctx.fill();
  // 남은 초는 막대 안에 (오른쪽 위는 소리·일시정지 버튼 자리)
  ctx.fillStyle = '#fff';
  ctx.font = '900 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.ceil(g.time)}초`, 18 + Math.max(14, tw * tr) / 2, 89);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = 'rgba(120,60,0,.12)';
  roundRect(ctx, 18, 102, tw, 8, 4); ctx.fill();
  ctx.fillStyle = g.fever > 0 ? '#ff5acd' : '#ffb000';
  roundRect(ctx, 18, 102, Math.max(8, tw * (g.fever > 0 ? g.fever / SORT.FEVER_TIME : g.gauge)), 8, 4); ctx.fill();
  if (g.fever > 0) {
    ctx.textAlign = 'center';
    ctx.font = '900 18px sans-serif';
    ctx.fillStyle = '#ff2fa0';
    ctx.fillText('FEVER ×2', W / 2, 136);
  }

  // 양쪽 편
  const sides = g.sides();
  const warn = g.swapWarn > 0 && Math.sin(now * 20) > 0;
  for (let d = 0; d < 2; d++) {
    const x = d ? W - 118 : 18;
    ctx.fillStyle = warn ? '#ffd1d1' : '#ffffff';
    roundRect(ctx, x, BIN_Y - 70, 100, 140, 22); ctx.fill();
    ctx.strokeStyle = warn ? '#ff4d4d' : d ? '#5aa9ff' : '#ff8a3d';
    ctx.lineWidth = 4;
    ctx.stroke();
    const list = sides[d];
    list.forEach((a, i) => emoji(ctx, SORT.ANIMALS[a], x + 50, BIN_Y - (list.length - 1) * 26 + i * 52, list.length > 1 ? 40 : 54));
    ctx.fillStyle = d ? '#2f7fd9' : '#e0661a';
    ctx.font = '900 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(d ? '저쪽 →' : '← 이쪽', x + 50, BIN_Y + 92);
  }
  if (g.swapWarn > 0) {
    ctx.font = '900 22px sans-serif';
    ctx.fillStyle = '#ff3b3b';
    ctx.textAlign = 'center';
    ctx.fillText('편이 바뀌어요!', W / 2, 180);
  }

  // 가운데 줄: 맨 앞이 아래, 뒤로 갈수록 작고 흐리게
  const sx = g.shake > 0 ? Math.sin(g.shake * 80) * 8 : 0;
  for (let i = g.queue.length - 1; i >= 0; i--) {
    const y = FRONT_Y - i * 44 - (i ? 30 : 0);
    const size = i ? 44 - i * 3 : 76;
    emoji(ctx, SORT.ANIMALS[g.queue[i]], W / 2 + (i ? 0 : sx), y, size, i ? 0.85 - i * 0.1 : 1);
  }
  if (g.stun > 0) {
    ctx.strokeStyle = '#ff3b3b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 26, FRONT_Y - 26); ctx.lineTo(W / 2 + 26, FRONT_Y + 26);
    ctx.moveTo(W / 2 + 26, FRONT_Y - 26); ctx.lineTo(W / 2 - 26, FRONT_Y + 26);
    ctx.stroke();
  }

  // 편으로 날아가는 동물
  for (const f of g.flying) {
    const k = f.t / 0.25;
    const tx = f.dir ? W - 68 : 68;
    const x = W / 2 + (tx - W / 2) * k, y = FRONT_Y - Math.sin(k * Math.PI) * 60;
    emoji(ctx, SORT.ANIMALS[f.a], x, y, 76 - k * 30, 1 - k * 0.5);
  }
  for (const p of g.popups) {
    ctx.globalAlpha = Math.min(1, (0.7 - p.t) * 3);
    ctx.font = '900 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.bad ? '#ff3b3b' : '#ff7a1a';
    ctx.fillText(p.text, p.dir ? W - 68 : 68, BIN_Y - 90 - p.t * 40);
    ctx.globalAlpha = 1;
  }

  // 아래 버튼 (화면 왼쪽·오른쪽 아무 데나 눌러도 된다)
  for (let d = 0; d < 2; d++) {
    const x = d ? W / 2 + 6 : 18;
    ctx.fillStyle = d ? '#5aa9ff' : '#ff8a3d';
    roundRect(ctx, x, BTN_Y, W / 2 - 24, 78, 22); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    roundRect(ctx, x, BTN_Y + 70, W / 2 - 24, 8, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '900 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d ? '▶' : '◀', x + (W / 2 - 24) / 2, BTN_Y + 38);
  }

  if (g.stageBanner > 0) {
    ctx.globalAlpha = Math.min(1, g.stageBanner * 2);
    ctx.font = '900 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#fff';
    const msg = g.stageN === 4 ? '이제 편이 바뀌어요!' : '새 친구 등장!';
    ctx.strokeText(msg, W / 2, 220);
    ctx.fillStyle = '#ff5a36';
    ctx.fillText(msg, W / 2, 220);
    ctx.globalAlpha = 1;
  }
}

const GAMES = [
  { id: 'sort', title: '이쪽저쪽', icon: '🐱🐶', desc: '가운데 친구를 자기 편으로 보내요', create: createSort,
    help: '맨 앞 동물이 있는 편을 누르세요<br>⌨️ ← → · 📱 화면 왼쪽/오른쪽 탭<br>틀리면 1초 감점, 콤보를 모으면 FEVER!' },
];

if (typeof document === 'undefined') {
  module.exports = { SORT, sortStage, createSort, GAMES };
} else {
// ============================================================
// 모음집 껍데기: 메뉴, 루프, 입력, 기록
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const scale = Math.min((innerWidth - 16) / W, (innerHeight - 16) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}
addEventListener('resize', fit);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
const bestOf = (id) => Number(store.get(`undonghoe_${id}`)) || 0;
function saveBest(id, score) {
  if (score <= bestOf(id)) return false;
  store.set(`undonghoe_${id}`, String(score));
  // 로비 카드에는 모든 미니게임 최고 점수의 합을 보여준다
  store.set('undonghoeBest', String(GAMES.reduce((a, g) => a + bestOf(g.id), 0)));
  return true;
}

// ---------- Sound ----------
let audio = null;
let muted = store.get('undonghoeMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  ok: (combo) => tone(520 + Math.min(combo, 20) * 25, 0.06, 'triangle', 0.12, 120),
  wrong: () => tone(160, 0.18, 'square', 0.08, -60),
  fever: () => [660, 880, 1100].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'square', 0.06), i * 70)),
  swap: () => tone(300, 0.3, 'sawtooth', 0.06, 300),
  end: () => [784, 659, 523, 392].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.1), i * 140)),
};

// ---------- State ----------
let state = 'menu';        // menu | ready | play | paused | over
let current = null;        // GAMES 항목
let game = null;           // create() 결과
let countdown = 0;

function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }
const overlayOpen = () => !$('overlay').classList.contains('hidden');

function showMenu() {
  state = 'menu';
  game = null;
  showOverlay(`
    <h1>손가락 운동회</h1>
    <p>짧고 빠른 미니게임 모음</p>
    <div class="cards">
      ${GAMES.map((g) => `<button class="card" data-game="${g.id}">
        <span class="ico">${g.icon}</span>
        <span><b>${g.title}</b><small>${g.desc}</small></span>
        <span class="best">${bestOf(g.id) ? `🏆 ${bestOf(g.id).toLocaleString()}` : ''}</span>
      </button>`).join('')}
      <div class="card soon"><span class="ico">🎁</span><span><b>다음 종목 준비 중</b><small>곧 더 많은 게임이 추가돼요</small></span><span></span></div>
    </div>`);
}

function showIntro(g) {
  current = g;
  state = 'menu';
  showOverlay(`
    <div style="font-size:56px">${g.icon}</div>
    <h2>${g.title}</h2>
    <p class="help">${g.help}</p>
    <span class="record">${bestOf(g.id) ? `최고 기록 ${bestOf(g.id).toLocaleString()}` : ''}</span>
    <button class="main" data-act="start">시작!</button>
    <button class="sub" data-act="menu">← 종목 고르기</button>`);
}

function start() {
  game = current.create();
  state = 'ready';
  countdown = 3;
  hideOverlay();
}

let lastFever = 0, lastSwap = false;
function finish() {
  state = 'over';
  sfx.end();
  const s = game.stats();
  const isBest = saveBest(current.id, s.score);
  setTimeout(() => showOverlay(`
    <h2>끝!</h2>
    <div class="big">${s.score.toLocaleString()}</div>
    <span class="record">${isBest ? '🏆 최고 기록!' : `최고 기록 ${bestOf(current.id).toLocaleString()}`}</span>
    <dl class="stats">${s.lines.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <button class="main" data-act="start">한 번 더</button>
    <button class="sub" data-act="menu">← 종목 고르기</button>`), 500);
}

function pause() {
  if (state !== 'play' && state !== 'ready') return;
  state = 'paused';
  showOverlay(`<h2>일시정지</h2>
    <button class="main" data-act="resume">계속하기</button>
    <button class="sub" data-act="menu">← 그만하고 종목 고르기</button>`);
}
function resume() {
  if (state !== 'paused') return;
  state = countdown > 0 ? 'ready' : 'play';
  hideOverlay();
}

$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.game) return showIntro(GAMES.find((g) => g.id === btn.dataset.game));
  const act = btn.dataset.act;
  if (act === 'start') start();
  else if (act === 'menu') showMenu();
  else if (act === 'resume') resume();
});

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'ready') {
    countdown -= dt;
    if (countdown <= 0) { countdown = 0; state = 'play'; tone(880, 0.15, 'square', 0.08); }
  }
  if (game && (state === 'play' || state === 'over')) {
    game.update(dt);
    if (game.fever > 0 && lastFever <= 0) sfx.fever();
    lastFever = game.fever;
    if (game.swapped !== lastSwap) { sfx.swap(); lastSwap = game.swapped; }
    if (state === 'play' && game.over) finish();
  }
  if (game) {
    game.draw(ctx);
    if (state === 'ready') {
      ctx.fillStyle = 'rgba(255,248,225,.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = '900 96px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#fff';
      ctx.strokeText(Math.ceil(countdown), W / 2, H / 2 - 40);
      ctx.fillStyle = '#ff7a1a';
      ctx.fillText(Math.ceil(countdown), W / 2, H / 2 - 40);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fff8e1');
    bg.addColorStop(1, '#ffe0a3');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

// ---------- Input ----------
function act(dir) {
  if (state !== 'play' || !game) return;
  const r = game.input(dir);
  if (r === 'ok') sfx.ok(game.combo);
  else if (r === 'wrong') sfx.wrong();
}
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  act((e.clientX - rect.left) / rect.width < 0.5 ? 0 : 1);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { state === 'paused' ? resume() : pause(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
  if (overlayOpen()) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('overlay').querySelector('.main')?.click(); }
    return;
  }
  if (e.repeat) return;   // 누르고 있기로 연타 금지
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); act(0); }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); act(1); }
});
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('undonghoeMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

showMenu();
fit();
requestAnimationFrame(frame);
}
