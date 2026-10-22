'use strict';

// 손가락 운동회: 미니게임 규칙만 모아 둔 파일 (그리기·입력·소리 없음). 브라우저와 테스트(Node)가 같이 쓴다.
// create() 가 돌려주는 객체는 update(dt) · input(action) · stats() 를 가진다 (그리기 draw 는 game.js 가 붙인다).
const LOGIC_UNDONGHOE = (() => {
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

  return g;
}

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

  return g;
}

return { SORT, sortStage, createSort, STACK, RAINBOW, stackLevel, createStack };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_UNDONGHOE;
