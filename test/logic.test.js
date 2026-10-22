'use strict';
// 손가락 운동회 규칙 시험 (이쪽저쪽 · 세 줄 쌓기). 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

function rng(seed) {                                   // mulberry32 (시험용 고정 난수)
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const { SORT, STACK, RAINBOW } = L;
const rightDir = (g) => (g.sides()[0].includes(g.queue[0]) ? 0 : 1);

// ---------- 이쪽저쪽 ----------
test('sort: stages add animals at 25, 60 and 100 correct; every animal belongs to exactly one side', () => {
  assert.strictEqual(L.sortStage(0).n, 1);
  assert.strictEqual(L.sortStage(25).n, 2);
  assert.strictEqual(L.sortStage(60).n, 3);
  assert.strictEqual(L.sortStage(100).n, 4);
  assert.ok(L.sortStage(100).swapping);
  for (const c of [0, 30, 70, 120]) {
    const [a, b] = L.sortStage(c).sides;
    assert.ok(!a.some((k) => b.includes(k)), 'no animal on both sides');
  }
});

test('sort: right answers score with combo and fill the fever; wrong answers cost time and stun', () => {
  const g = L.createSort(rng(1));
  assert.strictEqual(g.queue.length, SORT.QUEUE);
  assert.strictEqual(g.input(rightDir(g)), 'ok');
  assert.strictEqual(g.score, 11);
  assert.strictEqual(g.input(rightDir(g)), 'ok');
  assert.strictEqual(g.score, 11 + 12);
  assert.strictEqual(g.queue.length, SORT.QUEUE, 'the line refills');
  assert.ok(Math.abs(g.gauge - 2 * SORT.FEVER_STEP) < 1e-9);
  assert.strictEqual(g.input(1 - rightDir(g)), 'wrong');
  assert.strictEqual(g.combo, 0);
  assert.strictEqual(g.time, SORT.TIME - SORT.WRONG_TIME);
  assert.strictEqual(g.input(rightDir(g)), null, 'stunned');
  g.update(SORT.STUN + 0.01);
  assert.strictEqual(g.input(rightDir(g)), 'ok');
});

test('sort: fever doubles the score; time running out ends the game', () => {
  const g = L.createSort(rng(2));
  g.gauge = 1 - SORT.FEVER_STEP / 2;
  g.input(rightDir(g));
  assert.strictEqual(g.fever, SORT.FEVER_TIME);
  const before = g.score;
  g.input(rightDir(g));
  assert.strictEqual(g.score - before, (10 + 2) * 2);
  g.update(SORT.TIME + 1);
  assert.ok(g.over);
  assert.strictEqual(g.input(0), null);
});

test('sort: after 100 correct the sides swap every 15, with a warning first', () => {
  const g = L.createSort(rng(3));
  g.time = 1e9;                                          // 편 바뀜만 보려고 시간은 넉넉히
  let swaps = 0, last = g.swapped;
  for (let k = 0; k < 160; k++) {
    g.input(rightDir(g));
    g.update(SORT.SWAP_WARN / 2);
    if (g.swapped !== last) { swaps++; last = g.swapped; assert.ok(g.correct >= 100 + 15); }
  }
  assert.strictEqual(g.wrong, 0, 'pressing the side the rules say is always right, even around swaps');
  assert.ok(swaps >= 2, 'swaps: ' + swaps);
});

test('sort: a steady player (0.3 s per animal) reaches the last stage within the minute', () => {
  const g = L.createSort(rng(4));
  while (!g.over) { g.input(rightDir(g)); g.update(0.3); }
  assert.strictEqual(g.stageN, 4);
  assert.ok(g.score > 5000);
});

// ---------- 세 줄 쌓기 ----------
function stackWith(cols, cur) {
  const g = L.createStack(rng(5));
  g.cols = cols.map((c) => c.slice());
  g.cur = cur;
  return g;
}

test('stack: three of a colour on top clear and score; combos grow when clears come close together', () => {
  const g = stackWith([[0, 0], [], []], 0);
  assert.strictEqual(g.input(0), 'clear');
  assert.deepStrictEqual(g.cols[0], []);
  assert.strictEqual(g.clears, 1);
  assert.strictEqual(g.score, 30);
  g.cols[0] = [1, 1]; g.cur = 1;
  g.input(0);
  assert.strictEqual(g.combo, 2);
  assert.strictEqual(g.score, 30 + 45);
  const h = stackWith([[2, 0, 0], [], []], 1);
  assert.strictEqual(h.input(0), 'ok', 'only the top three count');
  assert.deepStrictEqual(h.cols[0], [2, 0, 0, 1]);
});

test('stack: a rainbow takes the colour below it', () => {
  const g = stackWith([[3, 3], [], []], RAINBOW);
  assert.strictEqual(g.input(0), 'clear');
  const h = stackWith([[], [4], []], RAINBOW);
  h.input(1);
  assert.deepStrictEqual(h.cols[1], [4, 4]);
});

test('stack: a full column bursts and costs 5 seconds', () => {
  const g = stackWith([[0, 1, 0, 1, 0, 1, 0], [], []], 2);
  assert.strictEqual(g.input(0), 'burst');
  assert.deepStrictEqual(g.cols[0], []);
  assert.strictEqual(g.time, STACK.TIME - STACK.BURST_TIME);
  assert.strictEqual(g.bursts, 1);
});

test('stack: waiting too long drops the block into the middle column; it gets faster with clears', () => {
  const g = L.createStack(rng(6));
  const t = g.fallTime;
  assert.strictEqual(g.update(t - 0.01), null);
  assert.strictEqual(g.cols[1].length, 0);
  g.update(0.02);
  assert.strictEqual(g.cols[1].length, 1);
  assert.ok(L.stackLevel(30).fall < L.stackLevel(0).fall);
  assert.strictEqual(L.stackLevel(100).fall, 1.0);
  assert.deepStrictEqual([0, 8, 25].map((c) => L.stackLevel(c).colors), [3, 4, 5]);
});

test('stack: a sensible player never overflows and keeps clearing all minute', () => {
  for (const seed of [1, 2, 3]) {
    const g = L.createStack(rng(seed));
    while (!g.over) {
      // 같은 색 위에 → 빈 줄 → 가장 낮은 줄 순서로 고른다
      const color = g.cur === RAINBOW ? null : g.cur;
      const top = (c) => g.cols[c][g.cols[c].length - 1];
      let c = [0, 1, 2].find((i) => color !== null && top(i) === color && g.cols[i].length < STACK.CAP);
      if (c === undefined) c = [0, 1, 2].find((i) => !g.cols[i].length);
      if (c === undefined) c = [0, 1, 2].sort((a, b) => g.cols[a].length - g.cols[b].length)[0];
      g.input(c);
      g.update(0.5);
    }
    assert.ok(g.clears >= 15, `seed ${seed}: ${g.clears} clears`);
    assert.ok(g.bursts <= 2, `seed ${seed}: ${g.bursts} bursts`);
  }
});
