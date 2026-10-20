// 字成画：墙上的随机字按一张"墨量图"调整浓淡和字号，远看是一幅画，近看每一笔都是字。
// 墨量图可以来自程序生成（迷宫、六边形），也可以来自铜版画插图（Codex 生成后接入）。

import { NOISE_CHARS } from '../lib/charset.js';
import { hash3, rand } from '../lib/hash.js';
import { CELL, FONTS, INK, NOISE_ALPHA } from '../lib/palette.js';
import { toScreen } from '../lib/wall.js';

/**
 * 画字墙。ink(c, r, t) 返回这个格子的状态：
 *   { amount: 0–1 墨量（0 = 普通噪声，1 = 全黑的笔画）, flip: 是否在翻动, color?, ch? }
 * 返回 null 表示普通噪声格子。
 */
export function drawInkWall(ctx, cam, W, H, t, ink, { seed = 1 } = {}) {
  const z = cam.zoom;
  const c0 = Math.floor((cam.x - W / 2 / z) / CELL) - 1;
  const c1 = Math.ceil((cam.x + W / 2 / z) / CELL) + 1;
  const r0 = Math.floor((cam.y - H / 2 / z) / CELL) - 1;
  const r1 = Math.ceil((cam.y + H / 2 / z) / CELL) + 1;
  const N = NOISE_CHARS.length;
  const flipFrame = Math.floor(t * 14);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let lastFont = '';
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const s = ink(c, r, t);
      const base = NOISE_ALPHA * (0.7 + 0.6 * rand(c, r, seed + 101));
      let alpha = base, size = 0.6, weight = 300, color = INK;
      let ch = NOISE_CHARS[hash3(c, r, seed) % N];
      if (s) {
        const a = s.amount;
        alpha = base + (0.92 - base) * a;
        size = 0.6 + 0.12 * a;
        weight = a > 0.9 ? 500 : a > 0.35 ? 400 : 300;
        if (s.flip) ch = NOISE_CHARS[hash3(c, r, flipFrame + 7919) % N];
        if (s.ch) ch = s.ch;
        if (s.color) color = s.color;
        if (s.font === 'sans') weight = 400;
        if (s.dim !== undefined) alpha *= s.dim; // 迷宫的通道：比普通噪声更淡，让墙的笔画更清楚
      }
      if (alpha < 0.004) continue;
      const font = `${weight} ${CELL * z * size}px ${s?.font === 'sans' ? FONTS.sans : FONTS.serif}`;
      if (font !== lastFont) { ctx.font = font; lastFont = font; }
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.min(1, alpha);
      const [x, y] = toScreen(cam, W, H, (c + 0.5) * CELL, (r + 0.5) * CELL);
      ctx.fillText(ch, x, y);
    }
  }
  ctx.restore();
}

/**
 * 确定性迷宫（深度优先），每个"房间"和"墙"各占一个字格。
 * 返回 { cols, rows, wall(c, r) → bool, path: 从中心到出口的格子序列 }，坐标相对迷宫左上角。
 */
export function makeMaze(w, h, seed = 11) {
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
  // 出口：右边缘中间
  const ey = 2 * sy + 1;
  open[idx(cols - 1, ey)] = 1;
  // 从中心到出口的路
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
  return { cols, rows, wall: (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !open[idx(c, r)], path, start };
}
