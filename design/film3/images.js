// 第三版：字成画的"图"。每张图告诉墙上某个格子应该有多少墨。
//
// image = {
//   id, box: { c0, r0, c1, r1 },          // 覆盖的格子范围（含）
//   inkAt(c, r, t, env) → null | cell,     // cell = { amount 0–1, flip?, ch?, font?, color?, dim? }
// }
// env 由分镜在时刻 t 给出：{ dim（全片暗下去的系数）, collapse（富内斯塌缩进度 0–1） }
//
// 所有图都是程序生成、确定性的。以后有了铜版画（assets/plates/），可以换成按图片明暗取墨。

import { rand } from '../lib/hash.js';
import { VERMILION, INK } from '../lib/palette.js';

const FLIP = 0.3; // 每个格子从翻动到锁定的时长

/** 从 (oc, or) 向外一圈圈长出来：返回 0（还没长到）/ 翻动中 / 1（已锁定） */
function emerge(c, r, t, { t0, oc, or, speed, seed }) {
  if (t0 === -Infinity) return { p: 1 };
  const te = t0 + Math.hypot(c - oc, r - or) / speed + 0.35 * rand(c, r, seed);
  const p = (t - te) / FLIP;
  if (p <= 0) return null;
  return p < 1 ? { p, flipping: true } : { p: 1 };
}

function shade(amount, e, extra = {}) {
  if (!e) return null;
  if (e.flipping) return { amount: 0.35 * e.p * Math.min(1, amount * 2), flip: true };
  return { amount, ...extra };
}

// ─── 迷宫：小径分岔的花园 ─────────────────────────────────────────────

export function makeMazeGrid(w, h, seed = 11) {
  const cols = 2 * w + 1, rows = 2 * h + 1;
  const open = new Uint8Array(cols * rows);
  const idx = (c, r) => r * cols + c;
  const seen = new Uint8Array(w * h);
  const sx = Math.floor(w / 2), sy = Math.floor(h / 2);
  const stack = [[sx, sy]];
  seen[sy * w + sx] = 1;
  open[idx(2 * sx + 1, 2 * sy + 1)] = 1;
  let n = 0;
  while (stack.length) {
    const [x, y] = stack.at(-1);
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = nb[Math.floor(rand(n++, 0, seed) * nb.length)];
    seen[ny * w + nx] = 1;
    open[idx(2 * x + 1 + dx, 2 * y + 1 + dy)] = 1;
    open[idx(2 * nx + 1, 2 * ny + 1)] = 1;
    stack.push([nx, ny]);
  }
  const ey = 2 * sy + 1;
  open[idx(cols - 1, ey)] = 1;
  const start = [2 * sx + 1, 2 * sy + 1], goal = [cols - 1, ey];
  const prev = new Int32Array(cols * rows).fill(-1);
  const q = [start];
  prev[idx(...start)] = idx(...start);
  while (q.length) {
    const [c, r] = q.shift();
    if (c === goal[0] && r === goal[1]) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      if (!open[idx(nc, nr)] || prev[idx(nc, nr)] !== -1) continue;
      prev[idx(nc, nr)] = idx(c, r);
      q.push([nc, nr]);
    }
  }
  const path = [];
  for (let k = idx(...goal); ; k = prev[k]) {
    path.push([k % cols, Math.floor(k / cols)]);
    if (k === idx(...start)) break;
  }
  path.reverse();
  return { cols, rows, start, path, isOpen: (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !!open[idx(c, r)] };
}

/**
 * 迷宫图，中心（起点）对准 (cc, rc)。光标沿路走并把 sentence 写在路上。
 * walk = { arrive: [每一格的到达时刻], head(t) → 当前写到第几格 }
 */
export function mazeImage({ cc = 0, rc = 0, emergeAt, speed = 14, sentence, walk }) {
  const g = makeMazeGrid(31, 17);
  const ox = cc - g.start[0], oy = rc - g.start[1];
  const pathCells = walk.cells.map(([c, r]) => [c + ox, r + oy]);
  const pathIndex = new Map(pathCells.map(([c, r], k) => [`${c},${r}`, k]));
  return {
    id: 'maze',
    box: { c0: ox, r0: oy, c1: ox + g.cols - 1, r1: oy + g.rows - 1 },
    pathCells,
    inkAt(c, r, t) {
      const k = pathIndex.get(`${c},${r}`);
      if (k !== undefined && t >= walk.arrive[k]) {
        const red = walk.head(t) - k < 4 && t < walk.arrive.at(-1) + 0.8;
        return { amount: 1, ch: sentence[k % sentence.length], font: 'sans', color: red ? VERMILION : INK, pen: true };
      }
      const open = g.isOpen(c - ox, r - oy);
      const e = emerge(c, r, t, { t0: emergeAt, oc: cc, or: rc, speed, seed: 77 });
      if (open) return e && !e.flipping ? { amount: 0, dim: 0.35 } : null;
      return shade(0.42 + 0.14 * rand(c, r, 78), e);
    },
  };
}

/** 迷宫路径上前 n 格的到达时刻：岔路口停一下 */
export function planWalk(n, t0, t1, forkPause = 0.3) {
  const g = makeMazeGrid(31, 17);
  const cells = g.path.slice(0, n);
  const forks = cells.map(([c, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => g.isOpen(c + dc, r + dr)).length >= 3);
  const nForks = Math.min(4, forks.filter(Boolean).length);
  const step = (t1 - t0 - nForks * forkPause) / Math.max(1, n - 1);
  const arrive = [];
  let t = t0, used = 0;
  cells.forEach((_, k) => {
    arrive.push(t);
    t += step;
    if (forks[k] && used < nForks) { t += forkPause; used++; }
  });
  return {
    cells,
    arrive,
    head(tt) {
      if (tt < arrive[0]) return -1;
      let k = arrive.findIndex((a) => a > tt);
      return (k < 0 ? arrive.length : k) - 1;
    },
  };
}

// ─── 六边形图书馆的平面图：巴别 ──────────────────────────────────────

/**
 * 无限重复的六边形回廊（俯视）：六边形的墙、中央天井的栏杆、四面墙上的书架。
 * 平顶六边形，半径 R 格。
 */
export function hexPlanImage({ box, origin, emergeAt, speed = 22, R = 9 }) {
  const s3 = Math.sqrt(3);
  const apothem = (R * s3) / 2;
  const normals = [[0, 1], [s3 / 2, 0.5], [s3 / 2, -0.5]]; // 平顶六边形三组对边的法向
  // 把点归到最近的六边形中心（平顶，轴坐标取整）
  function nearestCenter(x, y) {
    const q = ((2 / 3) * x) / R;
    const r = ((-1 / 3) * x + (s3 / 3) * y) / R;
    let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
    const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry - (-q - r));
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
    return [R * 1.5 * rx, R * s3 * (rz + rx / 2)];
  }
  return {
    id: 'hexplan',
    box,
    inkAt(c, r, t) {
      if (c < box.c0 || c > box.c1 || r < box.r0 || r > box.r1) return null;
      const x = c + 0.5 - origin.c, y = r + 0.5 - origin.r;
      const [hx, hy] = nearestCenter(x, y);
      const px = x - hx, py = y - hy;
      const proj = normals.map(([nx, ny]) => px * nx + py * ny);
      const m = Math.max(...proj.map(Math.abs));
      const edge = apothem - m; // 到最近一面墙的距离
      const dist = Math.hypot(px, py);
      let amount = 0;
      if (edge < 0.6) amount = 0.55;                                         // 墙
      else if (Math.abs(dist - 2.4) < 0.45) amount = 0.5;                    // 天井栏杆
      else if (edge > 1.1 && edge < 1.9) {                                   // 书架：六面里只有四面有
        const side = proj.findIndex((v) => Math.abs(v) === m);
        if (side !== 0) amount = 0.26;
      }
      if (amount === 0) return null;
      return shade(amount + 0.08 * rand(c, r, 91), emerge(c, r, t, { t0: emergeAt, oc: origin.c, or: origin.r, speed, seed: 92 }));
    },
  };
}

// ─── 一棵不停分叉的树：富内斯记得每一片叶子 ───────────────────────────

export function treeImage({ root, levels = 9, growFrom, levelDur, collapseCenter }) {
  const cells = new Map(); // "c,r" → { amount, tb, ch }
  const mark = (c, r, amount, tb, ch) => {
    const k = `${c},${r}`;
    const old = cells.get(k);
    if (!old || old.tb > tb) cells.set(k, { amount: Math.max(amount, old?.amount ?? 0), tb, ch: ch ?? old?.ch });
  };
  let n = 0;
  (function branch(x, y, ang, len, depth) {
    const steps = Math.ceil(len / 0.35);
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const px = x + (ex - x) * f, py = y + (ey - y) * f;
      const tb = growFrom + (depth + f) * levelDur;
      const amount = Math.max(0.35, 0.8 - depth * 0.05);
      mark(Math.floor(px), Math.floor(py), amount, tb);
      if (depth < 3) mark(Math.floor(px + 0.5), Math.floor(py), amount * 0.8, tb);
    }
    if (depth + 1 >= levels) {
      mark(Math.floor(ex), Math.floor(ey), 0.9, growFrom + (depth + 1) * levelDur, '叶');
      return;
    }
    const k = n++;
    const spread = 0.38 + 0.16 * rand(k, 1, 51);
    const tilt = (rand(k, 2, 51) - 0.5) * 0.2;
    const shrink = 0.72 + 0.06 * rand(k, 3, 51);
    branch(ex, ey, ang - spread + tilt, len * shrink, depth + 1);
    branch(ex, ey, ang + spread + tilt, len * shrink, depth + 1);
  })(root.c + 0.5, root.r + 0.5, -Math.PI / 2, 8.5, 0);

  let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
  for (const k of cells.keys()) {
    const [c, r] = k.split(',').map(Number);
    c0 = Math.min(c0, c); r0 = Math.min(r0, r); c1 = Math.max(c1, c); r1 = Math.max(r1, r);
  }
  const cc = collapseCenter;
  return {
    id: 'tree',
    box: { c0, r0, c1, r1 },
    inkAt(c, r, t, env) {
      const k = env.collapse ?? 0;
      if (k >= 1) return null;
      // 塌缩：整棵树向一点缩进去
      const s = 1 - k;
      const sc = Math.round(cc.c + (c - cc.c) / s), sr = Math.round(cc.r + (r - cc.r) / s);
      const cell = cells.get(`${sc},${sr}`);
      if (!cell) return null;
      const p = (t - cell.tb) / FLIP;
      if (p <= 0) return null;
      if (p < 1) return { amount: 0.3 * p, flip: true };
      return { amount: cell.amount * (1 - k), ch: cell.ch, font: cell.ch ? 'sans' : undefined };
    },
  };
}

// ─── 风车：梅纳尔段的同一幅画，A 用宋体字，B 用黑体字 ───────────────────

export function windmillImage({ id, hub, font, emergeAt, speed = 16, spin = 0.22, size = 0.72 }) {
  const k = size; // 整体缩放：样张里 1.0 太大，大过画面就认不出是风车
  const box = { c0: hub.c - Math.ceil(9.5 * k), r0: hub.r - Math.ceil(9.5 * k), c1: hub.c + Math.ceil(9.5 * k), r1: hub.r + Math.ceil(13 * k) };
  return {
    id,
    box,
    inkAt(c, r, t) {
      const dx = (c + 0.5 - (hub.c + 0.5)) / k, dy = (r + 0.5 - (hub.r + 0.5)) / k;
      let amount = 0;
      // 塔身：梯形，轮廓深、里面浅
      if (dy >= 0.5 && dy <= 12.5) {
        const half = 1.6 + (dy / 12.5) * 2.6;
        if (Math.abs(dx) <= half) amount = Math.abs(dx) > half - 1.2 || dy > 11.4 ? 0.72 : 0.14;
        if (Math.abs(dx) < 0.8 && dy > 9.2) amount = 0.85; // 门
      }
      // 四片风叶：框架深、帆面浅，绕风轴慢慢转
      const d = Math.hypot(dx, dy);
      if (d < 1.3) amount = 0.95;
      else if (d < 9.2) {
        for (let i = 0; i < 4; i++) {
          const a = spin * t + (i * Math.PI) / 2;
          const along = dx * Math.cos(a) + dy * Math.sin(a);
          const perp = -dx * Math.sin(a) + dy * Math.cos(a);
          if (along > 1 && along < 9 && perp > -0.5 && perp < 2) {
            const frame = perp < 0.4 || perp > 1.5 || (along % 2) < 0.55;
            amount = Math.max(amount, frame ? 0.8 : 0.12);
          }
        }
      }
      if (amount === 0) return null;
      const e = emerge(c, r, t, { t0: emergeAt, oc: hub.c, or: hub.r, speed, seed: 61 });
      return shade(amount, e, { font });
    },
  };
}
