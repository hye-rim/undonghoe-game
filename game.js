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
    lanes: 2,
    time: SORT.TIME, score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0,
    gauge: 0, fever: 0, stun: 0, swapped: false, swapWarn: 0, nextSwapAt: 0,
    queue: [], flying: [], popups: [], shake: 0, stageN: 1, stageBanner: 0, over: false,
    press: [0, 0],           // 버튼이 눌려 들어가 보이는 남은 시간
  };
  const kinds = () => { const s = sortStage(g.correct); return [...s.sides[0], ...s.sides[1]]; };
  const newAnimal = () => { const k = kinds(); return k[Math.floor(rng() * k.length)]; };
  // 편은 단계가 정하고, 바뀜(swapped)이 켜져 있으면 좌우를 뒤집는다
  const sides = () => { const s = sortStage(g.correct).sides; return g.swapped ? [s[1], s[0]] : s; };
  for (let i = 0; i < SORT.QUEUE; i++) g.queue.push(newAnimal());

  g.sides = sides;

  g.input = (dir) => {           // dir: 0 = 왼쪽, 1 = 오른쪽
    if (g.over || g.stun > 0) return null;
    g.press[dir] = 0.1;
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
    g.press = g.press.map((p) => Math.max(0, p - dt));
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

// ---------- 공통 그리기 도구 (스티커 느낌: 진한 테두리 + 아래로 떨어진 그림자) ----------
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 테두리 두른 판. lift 만큼 아래로 진한 그림자가 깔린다
function panel(ctx, x, y, w, h, r, fill, lift = 5, line = 3) {
  if (lift) { ctx.fillStyle = INK; roundRect(ctx, x, y + lift, w, h, r); ctx.fill(); }
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  roundRect(ctx, x, y, w, h, r); ctx.stroke();
}

// 테두리 두른 글자
function label(ctx, text, x, y, size, fill = '#fff', align = 'center', stroke = INK) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (stroke) { ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function emoji(ctx, e, x, y, size, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e, x, y + size * 0.06);
  ctx.globalAlpha = 1;
}

// 동물 토큰: 흰 동그라미에 테두리
function token(ctx, e, x, y, r, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(x, y + r * 0.12, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.globalAlpha = 1;
  emoji(ctx, e, x, y, r * 1.25, alpha);
}

// 배경: 진한 하늘빛 그라디언트 + 사선 줄무늬 + 떠다니는 방울. 피버 땐 분홍·주황으로 일렁인다
const BUBBLES = Array.from({ length: 9 }, (_, i) => ({ x: (i * 97) % W, r: 18 + (i * 37) % 40, s: 8 + (i % 4) * 5, o: i * 71 }));
function drawBackground(ctx, fever = 0) {
  const now = performance.now() / 1000;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  if (fever > 0) {
    const h = (now * 90) % 360;
    bg.addColorStop(0, `hsl(${(h + 320) % 360},95%,62%)`);
    bg.addColorStop(1, `hsl(${(h + 20) % 360},95%,58%)`);
  } else {
    bg.addColorStop(0, '#39c8ff');
    bg.addColorStop(1, '#6b5cff');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  const off = (now * 12) % 56;
  for (let x = -H; x < H; x += 56) ctx.fillRect(x + off, -H, 26, H * 2);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  for (const b of BUBBLES) {
    const y = H + 60 - ((now * b.s + b.o * 3) % (H + 120));
    ctx.beginPath(); ctx.arc(b.x + Math.sin(now + b.o) * 10, y, b.r, 0, Math.PI * 2); ctx.fill();
  }
}

// 모든 종목이 같이 쓰는 점수·콤보·시간·피버
function drawHud(ctx, g, totalTime, feverTime) {
  const now = performance.now() / 1000;
  drawBackground(ctx, g.fever);

  // 점수 배지
  panel(ctx, 14, 14, 164, 46, 23, '#ffd23f');
  emoji(ctx, '⭐', 38, 37, 24);
  label(ctx, g.score.toLocaleString(), 106, 37, 28, '#fff');

  // 시간
  const tw = W - 28;
  panel(ctx, 14, 74, tw, 28, 14, '#ffffff', 4);
  const tr = Math.max(0, g.time / totalTime);
  const low = g.time < 10;
  const tg = ctx.createLinearGradient(0, 78, 0, 98);
  tg.addColorStop(0, low ? '#ff8a8a' : '#7dffb0');
  tg.addColorStop(1, low ? '#ff3b5c' : '#1fc46b');
  ctx.fillStyle = tg;
  roundRect(ctx, 18, 78, Math.max(20, (tw - 8) * tr), 20, 10); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  roundRect(ctx, 24, 80, Math.max(8, (tw - 8) * tr - 12), 5, 3); ctx.fill();
  emoji(ctx, '⏰', 30, 88, 24);
  label(ctx, `${Math.ceil(g.time)}`, W - 30, 88, 18, low && Math.sin(now * 12) > 0 ? '#ff3b5c' : '#fff', 'right');

  // 피버 게이지
  panel(ctx, 14, 112, tw, 18, 9, '#ffffff', 3);
  const fr = g.fever > 0 ? g.fever / feverTime : g.gauge;
  const fg = ctx.createLinearGradient(18, 0, 18 + tw, 0);
  fg.addColorStop(0, '#ff7ac8');
  fg.addColorStop(1, '#ff3d8b');
  ctx.fillStyle = fg;
  roundRect(ctx, 17, 115, Math.max(12, (tw - 6) * fr), 12, 6); ctx.fill();
  label(ctx, g.fever > 0 ? '🔥 FEVER' : 'FEVER', 26, 121, 11, '#fff', 'left');
  // 막대 아래 줄: 가운데 FEVER, 오른쪽 콤보 (오른쪽 위는 소리·일시정지 버튼 자리라 비워 둔다)
  if (g.fever > 0) {
    const s = 1 + Math.sin(now * 10) * 0.06;
    ctx.save();
    ctx.translate(W / 2, 152);
    ctx.scale(s, s);
    label(ctx, 'FEVER ×2', 0, 0, 24, '#fff54f');
    ctx.restore();
  }
  if (g.combo >= 3) label(ctx, `${g.combo} 콤보!`, W - 16, 152, 20, '#ff9ad0', 'right');
}

// ---------- 이쪽저쪽 그리기 ----------
const BIN_Y = 330, FRONT_Y = 420, BTN_Y = 520;
const SIDE_COLOR = ['#ff9a3c', '#3fa9ff'];

function drawSort(ctx, g) {
  const now = performance.now() / 1000;
  drawHud(ctx, g, SORT.TIME, SORT.FEVER_TIME);

  // 가운데 줄: 반투명 트랙 위에 동물들이 줄 서 있다
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  roundRect(ctx, W / 2 - 46, 180, 92, 290, 46); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(43,29,82,.35)'; ctx.stroke();

  // 양쪽 편
  const sides = g.sides();
  const warn = g.swapWarn > 0 && Math.sin(now * 22) > 0;
  for (let d = 0; d < 2; d++) {
    const x = d ? W - 132 : 14, w = 118;
    panel(ctx, x, BIN_Y - 100, w, 200, 24, warn ? '#ff5a6e' : SIDE_COLOR[d]);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    roundRect(ctx, x + 10, BIN_Y - 58, w - 20, 146, 16); ctx.fill();
    label(ctx, d ? '저쪽 ▶' : '◀ 이쪽', x + w / 2, BIN_Y - 78, 20, '#fff');
    const list = sides[d];
    list.forEach((a, i) => token(ctx, SORT.ANIMALS[a], x + w / 2, BIN_Y + 15 - (list.length - 1) * 34 + i * 68, list.length > 1 ? 28 : 38));
  }
  if (g.swapWarn > 0) {
    panel(ctx, W / 2 - 90, 182, 180, 40, 20, '#ff3b5c', 4);
    label(ctx, '⇄ 편이 바뀐다!', W / 2, 202, 20, '#fff');
  }

  // 줄 선 동물: 맨 앞은 크게, 뒤로 갈수록 작게
  const sx = g.shake > 0 ? Math.sin(g.shake * 80) * 8 : 0;
  for (let i = g.queue.length - 1; i >= 1; i--) {
    token(ctx, SORT.ANIMALS[g.queue[i]], W / 2, FRONT_Y - 48 - i * 36, 25 - i * 1.5, 1 - i * 0.08);
  }
  // 맨 앞: 노란 빛 고리
  const glow = 50 + Math.sin(now * 6) * 3;
  ctx.fillStyle = 'rgba(255,230,80,.55)';
  ctx.beginPath(); ctx.arc(W / 2 + sx, FRONT_Y, glow, 0, Math.PI * 2); ctx.fill();
  token(ctx, SORT.ANIMALS[g.queue[0]], W / 2 + sx, FRONT_Y, 42);
  if (g.stun > 0) {
    ctx.lineCap = 'round';
    for (const [lw, col] of [[14, INK], [8, '#ff3b5c']]) {
      ctx.lineWidth = lw; ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 24, FRONT_Y - 24); ctx.lineTo(W / 2 + 24, FRONT_Y + 24);
      ctx.moveTo(W / 2 + 24, FRONT_Y - 24); ctx.lineTo(W / 2 - 24, FRONT_Y + 24);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // 편으로 날아가는 동물
  for (const f of g.flying) {
    const k = f.t / 0.25;
    const tx = f.dir ? W - 73 : 73;
    token(ctx, SORT.ANIMALS[f.a], W / 2 + (tx - W / 2) * k, FRONT_Y - Math.sin(k * Math.PI) * 70 - k * 60, 42 - k * 16, 1 - k * 0.4);
  }
  for (const p of g.popups) {
    ctx.globalAlpha = Math.min(1, (0.7 - p.t) * 3);
    label(ctx, p.text, p.dir ? W - 73 : 73, BIN_Y - 120 - p.t * 40, 24, p.bad ? '#ff3b5c' : '#fff54f');
    ctx.globalAlpha = 1;
  }

  // 아래 버튼 (화면 왼쪽·오른쪽 아무 데나 눌러도 된다). 누르면 쑥 들어간다
  for (let d = 0; d < 2; d++) {
    const x = d ? W / 2 + 6 : 14, w = W / 2 - 20;
    const down = g.press && g.press[d] > 0 ? 4 : 0;
    panel(ctx, x, BTN_Y + down, w, 84, 26, SIDE_COLOR[d], 7 - down, 3);
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    roundRect(ctx, x + 12, BTN_Y + down + 8, w - 24, 12, 6); ctx.fill();
    label(ctx, d ? '▶' : '◀', x + w / 2, BTN_Y + down + 44, 40, '#fff');
  }

  if (g.stageBanner > 0) {
    ctx.globalAlpha = Math.min(1, g.stageBanner * 2);
    label(ctx, g.stageN === 4 ? '이제 편이 바뀌어요!' : '새 친구 등장!', W / 2, 250, 30, '#fff54f');
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// 세 줄 쌓기: 내려오는 블록을 세 줄 중 하나에 쌓고, 맨 위 3개가 같은 색이면 사라진다
// ============================================================
const STACK = {
  TIME: 60,
  COLS: 3,
  CAP: 7,                  // 한 줄에 쌓을 수 있는 칸
  BURST_TIME: 5,           // 넘치면 그 줄이 터지고 이만큼 시간 감점
  FEVER_TIME: 6,
  FEVER_STEP: 0.12,        // 한 번 없앨 때마다 차는 피버 게이지
  RAINBOW: 0.05,           // 🌈 블록: 바로 아래 블록 색이 된다
  // 색마다 모양을 달리해 색을 구분하기 어려워도 알아볼 수 있게
  COLORS: [
    { light: '#ffa3b5', fill: '#ff4d6d', dark: '#c9184a', mark: '●' },
    { light: '#a8dcff', fill: '#3fa9ff', dark: '#1c6fd1', mark: '▲' },
    { light: '#a3f0c6', fill: '#2fd480', dark: '#12965a', mark: '■' },
    { light: '#fff0a8', fill: '#ffc93c', dark: '#e08a00', mark: '★' },
    { light: '#e6c9ff', fill: '#b56cff', dark: '#7b2fd1', mark: '♥' },
  ],
};
const RAINBOW = -1;

// 없앤 횟수로 색 수·떨어지는 시간 결정
function stackLevel(clears) {
  const colors = clears < 8 ? 3 : clears < 25 ? 4 : 5;
  const fall = Math.max(1.0, 3.2 - clears * 0.05);   // 이 시간 안에 안 고르면 가운데 줄로 떨어진다
  return { colors, fall };
}

function createStack(rng = Math.random) {
  const g = {
    lanes: 3,
    time: STACK.TIME, score: 0, combo: 0, maxCombo: 0, clears: 0, placed: 0, bursts: 0,
    gauge: 0, fever: 0, over: false, sinceClear: 0,
    cols: [[], [], []], cur: 0, next: 0, fall: 0, fallTime: 3,
    drops: [], pops: [], popups: [], shakeCol: -1, shake: 0, levelColors: 3, banner: 0,
    press: [0, 0, 0],
  };
  const newBlock = () => {
    if (rng() < STACK.RAINBOW) return RAINBOW;
    return Math.floor(rng() * stackLevel(g.clears).colors);
  };
  g.cur = newBlock();
  g.next = newBlock();
  g.fallTime = stackLevel(0).fall;

  function place(c) {
    const col = g.cols[c];
    let color = g.cur;
    if (color === RAINBOW) color = col.length ? col[col.length - 1] : Math.floor(rng() * stackLevel(g.clears).colors);
    g.drops.push({ c, color, t: 0, from: g.fall / g.fallTime });
    g.placed++;
    g.cur = g.next;
    g.next = newBlock();
    g.fall = 0;
    g.fallTime = stackLevel(g.clears).fall;

    if (col.length >= STACK.CAP) {
      // 넘침: 그 줄 전체가 터진다
      for (let i = 0; i < col.length; i++) g.pops.push({ c, i, color: col[i], t: 0 });
      col.length = 0;
      g.bursts++;
      g.combo = 0;
      g.sinceClear = 0;
      g.time = Math.max(0, g.time - STACK.BURST_TIME);
      g.shakeCol = c;
      g.shake = 0.35;
      g.popups.push({ text: `넘쳤다! -${STACK.BURST_TIME}초`, c, t: 0, bad: true });
      return 'burst';
    }
    col.push(color);
    const n = col.length;
    if (n >= 3 && col[n - 1] === col[n - 2] && col[n - 2] === col[n - 3]) {
      for (let i = n - 3; i < n; i++) g.pops.push({ c, i, color: col[i], t: 0 });
      col.length = n - 3;
      // 사이에 헛수가 2번 이하면 콤보가 이어진다 (같은 색 3개를 모으려면 보통 2번은 준비해야 하니까)
      g.combo = g.sinceClear <= 2 ? g.combo + 1 : 1;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      g.sinceClear = 0;
      g.clears++;
      const gain = Math.round(30 * (1 + (g.combo - 1) * 0.5)) * (g.fever > 0 ? 2 : 1);
      g.score += gain;
      g.popups.push({ text: `+${gain}`, c, t: 0 });
      if (g.fever <= 0) {
        g.gauge += STACK.FEVER_STEP;
        if (g.gauge >= 1) { g.gauge = 0; g.fever = STACK.FEVER_TIME; }
      }
      const lv = stackLevel(g.clears);
      if (lv.colors !== g.levelColors) { g.levelColors = lv.colors; g.banner = 1.5; }
      return 'clear';
    }
    g.score += 1;
    g.sinceClear++;
    if (g.sinceClear > 2) g.combo = 0;
    return 'ok';
  }

  g.input = (c) => {
    if (g.over) return null;
    g.press[c] = 0.1;
    return place(c);
  };

  g.update = (dt) => {
    for (const d of g.drops) d.t += dt;
    g.drops = g.drops.filter((d) => d.t < 0.12);
    for (const p of g.pops) p.t += dt;
    g.pops = g.pops.filter((p) => p.t < 0.4);
    for (const p of g.popups) p.t += dt;
    g.popups = g.popups.filter((p) => p.t < 0.8);
    g.shake = Math.max(0, g.shake - dt);
    g.banner = Math.max(0, g.banner - dt);
    g.press = g.press.map((p) => Math.max(0, p - dt));
    if (g.over) return null;
    g.time -= dt;
    g.fever = Math.max(0, g.fever - dt);
    let r = null;
    g.fall += dt;
    if (g.fall >= g.fallTime) r = place(1);    // 시간 안에 못 고르면 가운데로
    if (g.time <= 0) { g.time = 0; g.over = true; }
    return r;
  };

  g.stats = () => ({
    score: g.score,
    lines: [
      ['없앤 줄', `${g.clears}번`],
      ['최대 콤보', g.maxCombo],
      ['넘침', `${g.bursts}번`],
    ],
  });

  g.draw = (ctx) => drawStack(ctx, g);
  return g;
}

// ---------- 세 줄 쌓기 그리기 ----------
const ST = { colW: 108, gap: 12, blockH: 42, floor: 596 };
ST.left = (W - ST.colW * 3 - ST.gap * 2) / 2;
ST.x = (c) => ST.left + c * (ST.colW + ST.gap);
ST.y = (i) => ST.floor - (i + 1) * ST.blockH;            // i 번째 칸의 윗변
const DROP_TOP = 176;                                     // 내려오는 블록이 시작하는 높이 (FEVER 글자 아래)
const dropY = (k) => DROP_TOP + (ST.y(STACK.CAP - 1) - 54 - DROP_TOP) * k;

// 젤리 블록: 진한 테두리, 위는 밝고 아래는 진한 그라디언트, 윗부분 광택, 가운데 흰 기호
function drawBlock(ctx, color, x, y, w, h, alpha = 1) {
  ctx.globalAlpha = alpha;
  const r = 12;
  ctx.fillStyle = INK;
  roundRect(ctx, x + 3, y + 5, w - 6, h - 4, r); ctx.fill();
  let fill;
  if (color === RAINBOW) {
    fill = ctx.createLinearGradient(x, y, x + w, y + h);
    ['#ff4d6d', '#ffc93c', '#2fd480', '#3fa9ff', '#b56cff'].forEach((c, i) => fill.addColorStop(i / 4, c));
  } else {
    const c = STACK.COLORS[color];
    fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, c.light);
    fill.addColorStop(0.45, c.fill);
    fill.addColorStop(1, c.dark);
  }
  ctx.fillStyle = fill;
  roundRect(ctx, x + 3, y + 2, w - 6, h - 5, r); ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  roundRect(ctx, x + 3, y + 2, w - 6, h - 5, r); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  roundRect(ctx, x + 11, y + 6, w - 40, 7, 4); ctx.fill();
  ctx.beginPath(); ctx.arc(x + w - 20, y + 10, 3, 0, Math.PI * 2); ctx.fill();
  if (color === RAINBOW) emoji(ctx, '🌈', x + w / 2, y + h / 2, 22, alpha);
  else label(ctx, STACK.COLORS[color].mark, x + w / 2, y + h / 2 + 1, 20, '#fff');
  ctx.globalAlpha = 1;
}

function drawStack(ctx, g) {
  drawHud(ctx, g, STACK.TIME, STACK.FEVER_TIME);
  const now = performance.now() / 1000;
  const tubeTop = ST.y(STACK.CAP - 1) - 10;

  // 유리관 세 개
  for (let c = 0; c < 3; c++) {
    const x = ST.x(c) + (g.shake > 0 && g.shakeCol === c ? Math.sin(g.shake * 90) * 6 : 0);
    const n = g.cols[c].length;
    const danger = n >= STACK.CAP - 1;
    ctx.fillStyle = INK;
    roundRect(ctx, x - 4, tubeTop + 6, ST.colW + 8, ST.floor - tubeTop + 10, 20); ctx.fill();
    // 속은 밝고 불투명하게 (반투명이면 아래 그림자가 비쳐 어두워진다)
    const inner = ctx.createLinearGradient(0, tubeTop, 0, ST.floor);
    const flash = danger && Math.sin(now * 12) > 0;
    inner.addColorStop(0, flash ? '#ffd0da' : '#f6f3ff');
    inner.addColorStop(1, flash ? '#ffb3c4' : '#ddd5ff');
    ctx.fillStyle = inner;
    roundRect(ctx, x - 4, tubeTop, ST.colW + 8, ST.floor - tubeTop + 10, 20); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    roundRect(ctx, x + 4, tubeTop + 12, 6, ST.floor - tubeTop - 30, 3); ctx.fill();
    // 넘치기 직전 줄: 위쪽에 경고 띠
    if (danger) {
      ctx.save();
      roundRect(ctx, x - 2, tubeTop + 2, ST.colW + 4, 14, 7); ctx.clip();
      for (let k = -1; k < 8; k++) {
        ctx.fillStyle = k % 2 ? '#ffd23f' : INK;
        ctx.beginPath();
        ctx.moveTo(x + k * 16 + (now * 30) % 32, tubeTop + 2);
        ctx.lineTo(x + k * 16 + 16 + (now * 30) % 32, tubeTop + 2);
        ctx.lineTo(x + k * 16 + (now * 30) % 32, tubeTop + 16);
        ctx.lineTo(x + k * 16 - 16 + (now * 30) % 32, tubeTop + 16);
        ctx.fill();
      }
      ctx.restore();
    }
    g.cols[c].forEach((color, i) => drawBlock(ctx, color, x, ST.y(i), ST.colW, ST.blockH));
    // 아래 키 표시
    const down = g.press && g.press[c] > 0 ? 3 : 0;
    panel(ctx, x + ST.colW / 2 - 26, ST.floor + 20 + down, 52, 22, 11, '#ffffff', 4 - down, 2.5);
    label(ctx, ['◀ A', '▼ S', 'D ▶'][c], x + ST.colW / 2, ST.floor + 31 + down, 13, INK, 'center', null);
  }

  // 막 놓인 블록: 떨어지던 자리에서 툭
  for (const d of g.drops) {
    const k = d.t / 0.12, col = g.cols[d.c];
    const toY = ST.y(Math.max(0, col.length - 1));
    const fromY = dropY(d.from);
    drawBlock(ctx, d.color, ST.x(d.c), fromY + (toY - fromY) * k, ST.colW, ST.blockH, 0.6);
  }
  // 없어지는 블록: 부풀며 사라지고 별이 튄다
  for (const p of g.pops) {
    const k = p.t / 0.4, s = 1 + k * 0.5;
    const cx = ST.x(p.c) + ST.colW / 2, cy = ST.y(p.i) + ST.blockH / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    drawBlock(ctx, p.color, -ST.colW / 2, -ST.blockH / 2, ST.colW, ST.blockH, 1 - k);
    ctx.restore();
    for (let j = 0; j < 4; j++) {
      const a = j * 1.57 + p.i;
      emoji(ctx, '✨', cx + Math.cos(a) * (20 + k * 60), cy + Math.sin(a) * (10 + k * 40), 16, 1 - k);
    }
  }

  // 내려오는 블록 + 떨어질 자리 안내선 + 남은 시간
  if (!g.over) {
    const k = Math.min(1, g.fall / g.fallTime);
    const y = dropY(k);
    const x = ST.x(1);
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.moveTo(x + ST.colW / 2, y + ST.blockH + 12); ctx.lineTo(x + ST.colW / 2, tubeTop); ctx.stroke();
    ctx.setLineDash([]);
    drawBlock(ctx, g.cur, x, y, ST.colW, ST.blockH);
    panel(ctx, x + 10, y + ST.blockH + 4, ST.colW - 20, 10, 5, '#ffffff', 2, 2);
    ctx.fillStyle = k > 0.7 ? '#ff3b5c' : '#ffb000';
    roundRect(ctx, x + 12, y + ST.blockH + 6, (ST.colW - 24) * (1 - k), 6, 3); ctx.fill();

    // 다음 블록 말풍선
    const nx = ST.x(2) + 8, ny = DROP_TOP - 4;
    panel(ctx, nx, ny, ST.colW - 16, 66, 16, '#ffffff', 4);
    label(ctx, 'NEXT', nx + (ST.colW - 16) / 2, ny + 13, 13, INK, 'center', null);
    drawBlock(ctx, g.next, nx + 10, ny + 22, ST.colW - 36, 36);
  }

  for (const p of g.popups) {
    ctx.globalAlpha = Math.min(1, (0.8 - p.t) * 3);
    label(ctx, p.text, ST.x(p.c) + ST.colW / 2, ST.y(Math.max(0, g.cols[p.c].length)) - 20 - p.t * 40, p.bad ? 20 : 26, p.bad ? '#ff3b5c' : '#fff54f');
    ctx.globalAlpha = 1;
  }
  if (g.banner > 0) {
    ctx.globalAlpha = Math.min(1, g.banner * 2);
    label(ctx, '새 색깔 추가!', W / 2, 250, 32, '#fff54f');
    ctx.globalAlpha = 1;
  }
}

const GAMES = [
  { id: 'sort', title: '이쪽저쪽', icon: '🐱🐶', color: '#ffd23f', desc: '가운데 친구를 자기 편으로 보내요', create: createSort,
    help: '맨 앞 동물이 있는 편을 누르세요<br>⌨️ ← → · 📱 화면 왼쪽/오른쪽 탭<br>틀리면 1초 감점, 콤보를 모으면 FEVER!' },
  { id: 'stack', title: '세 줄 쌓기', icon: '🟥🟦', color: '#a8dcff', desc: '같은 색 3개를 쌓아서 없애요', create: createStack,
    help: '내려오는 블록을 세 줄 중 하나에 쌓으세요<br>맨 위 3개가 같은 색이면 사라져요 · 🌈는 아래 색이 돼요<br>⌨️ ← ↓ → (A S D) · 📱 줄을 탭<br>꾸물거리면 가운데로 떨어지고, 넘치면 5초 감점!' },
];

if (typeof document === 'undefined') {
  module.exports = { SORT, sortStage, createSort, STACK, stackLevel, createStack, GAMES };
} else {
// ============================================================
// 모음집 껍데기: 메뉴, 루프, 입력, 기록
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const scale = Math.min((innerWidth - 28) / W, (innerHeight - 40) / H);   // 테두리·아래 그림자 자리
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
  place: () => tone(240, 0.05, 'triangle', 0.1, -40),
  clear: (combo) => [0, 1, 2].forEach((k) => setTimeout(() => tone(600 + Math.min(combo, 10) * 40 + k * 120, 0.08, 'sine', 0.1), k * 45)),
  burst: () => tone(110, 0.35, 'sawtooth', 0.1, -50),
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
    <h1 class="inked">손가락<br><span class="y">운동회</span></h1>
    <span class="tag">짧고 빠른 미니게임 모음</span>
    <div class="cards">
      ${GAMES.map((g) => `<button class="card" data-game="${g.id}">
        <span class="ico" style="background:${g.color}">${g.icon}</span>
        <span class="txt"><b>${g.title}</b><small>${g.desc}</small><span class="best">${bestOf(g.id) ? `🏆 ${bestOf(g.id).toLocaleString()}` : ''}</span></span>
      </button>`).join('')}
      <div class="card soon"><span class="ico">🎁</span><span class="txt"><b>다음 종목 준비 중</b><small>곧 더 많은 게임이 추가돼요</small></span></div>
    </div>`);
}

function showIntro(g) {
  current = g;
  state = 'menu';
  showOverlay(`
    <div class="icon-big" style="background:${g.color}">${g.icon}</div>
    <h2 class="inked">${g.title}</h2>
    <button class="main" data-act="start">시작!</button>
    <div class="help">${g.help}</div>
    ${bestOf(g.id) ? `<span class="tag">🏆 최고 기록 ${bestOf(g.id).toLocaleString()}</span>` : ''}
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
    <h2 class="inked">끝!</h2>
    <div class="big inked">${s.score.toLocaleString()}</div>
    <span class="tag">${isBest ? '🏆 최고 기록!' : `최고 기록 ${bestOf(current.id).toLocaleString()}`}</span>
    <dl class="stats">${s.lines.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <button class="main" data-act="start">한 번 더</button>
    <button class="sub" data-act="menu">← 종목 고르기</button>`), 500);
}

function pause() {
  if (state !== 'play' && state !== 'ready') return;
  state = 'paused';
  showOverlay(`<h2 class="inked">일시정지</h2>
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
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));   // 첫 프레임 시각이 로드 시각보다 앞설 수 있다
  last = now;
  if (state === 'ready') {
    countdown -= dt;
    if (countdown <= 0) { countdown = 0; state = 'play'; tone(880, 0.15, 'square', 0.08); }
  }
  if (game && (state === 'play' || state === 'over')) {
    playResult(game.update(dt));
    if (game.fever > 0 && lastFever <= 0) sfx.fever();
    lastFever = game.fever;
    if (game.swapped !== lastSwap) { sfx.swap(); lastSwap = game.swapped; }
    if (state === 'play' && game.over) finish();
  }
  if (game) {
    game.draw(ctx);
    if (state === 'ready') {
      // 3, 2, 1: 숫자가 바뀔 때마다 크게 튀어나왔다가 자리 잡는다
      ctx.fillStyle = 'rgba(43,29,82,.45)';
      ctx.fillRect(0, 0, W, H);
      const frac = countdown % 1, s = 1 + Math.max(0, frac - 0.7) * 2;
      ctx.save();
      ctx.translate(W / 2, H / 2 - 30);
      ctx.scale(s, s);
      label(ctx, Math.ceil(countdown), 0, 0, 120, '#fff54f');
      ctx.restore();
      label(ctx, '준비!', W / 2, H / 2 + 60, 30, '#fff');
    }
  } else {
    drawBackground(ctx);
  }
  requestAnimationFrame(frame);
}

// ---------- Input ----------
// 종목마다 누를 칸 수(lanes)가 다르다: 이쪽저쪽 2칸, 세 줄 쌓기 3칸
function playResult(r) {
  if (!r) return;
  if (game.lanes === 3) {
    if (r === 'clear') sfx.clear(game.combo);
    else if (r === 'burst') sfx.burst();
    else sfx.place();
  } else if (r === 'ok') sfx.ok(game.combo);
  else if (r === 'wrong') sfx.wrong();
}
function act(lane) {
  if (state !== 'play' || !game) return;
  playResult(game.input(lane));
}
canvas.addEventListener('pointerdown', (e) => {
  if (!game) return;
  const rect = canvas.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  act(Math.min(game.lanes - 1, Math.floor(fx * game.lanes)));
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { state === 'paused' ? resume() : pause(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
  if (overlayOpen()) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('overlay').querySelector('.main')?.click(); }
    return;
  }
  if (e.repeat) return;   // 누르고 있기로 연타 금지
  if (!game) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  let lane = -1;
  if (k === 'ArrowLeft' || k === 'a' || k === '1') lane = 0;
  else if (k === 'ArrowRight' || k === 'd' || k === (game.lanes === 3 ? '3' : '2')) lane = game.lanes - 1;
  else if (game.lanes === 3 && (k === 'ArrowDown' || k === 's' || k === '2' || k === ' ')) lane = 1;
  if (lane >= 0) { e.preventDefault(); act(lane); }
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

if (document.fonts) document.fonts.load(`20px ${FONT}`).catch(() => {});
showMenu();
fit();
requestAnimationFrame(frame);
}
