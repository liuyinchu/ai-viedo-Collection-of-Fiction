// 巴别墙：纸面、噪声字、凝结出的句子、光标。
// 所有函数都只依赖传入的参数，是纯绘制，没有内部动画状态。
//
// 坐标约定
//   墙面坐标 (x, y)：单位为墙面单位，原点是开场光标所在的格子左上角。
//   格子坐标 (col, row)：第 col 列第 row 行的格子覆盖 [col*CELL, (col+1)*CELL)。
//   镜头 cam = { x, y, zoom }：(x, y) 是画面中心对准的墙面坐标。

import { NOISE_CHARS } from './charset.js';
import { hash3, rand, valueNoise } from './hash.js';
import { PAPER, INK, VERMILION, CELL, NOISE_ALPHA, FONTS } from './palette.js';

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toScreen(cam, W, H, x, y) {
  return [(x - cam.x) * cam.zoom + W / 2, (y - cam.y) * cam.zoom + H / 2];
}

// ─── 纸 ──────────────────────────────────────────────────────────────

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const n = 256;
  const c = makeCanvas(n, n);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = rand(x, y, 7);
      const i = (y * n + x) * 4;
      if (r < 0.5) { // 暗点
        img.data[i] = 60; img.data[i + 1] = 45; img.data[i + 2] = 30;
        img.data[i + 3] = Math.round((0.5 - r) * 2 * 22);
      } else { // 亮点
        img.data[i] = 255; img.data[i + 1] = 252; img.data[i + 2] = 240;
        img.data[i + 3] = Math.round((r - 0.5) * 2 * 18);
      }
    }
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

const GRAIN_TEXEL = 1.2;  // 1 个纸纹像素 = 多少墙面单位
const MOTTLE_SCALE = 900; // 斑驳的特征尺寸（墙面单位）

/** 纸面：底色 + 大尺度斑驳 + 细颗粒。斑驳和颗粒都钉在墙面上，随镜头移动。 */
export function drawPaper(ctx, cam, W, H) {
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // 斑驳：低分辨率采样世界坐标的值噪声，再平滑放大
  const step = 24;
  const mw = Math.ceil(W / step) + 2, mh = Math.ceil(H / step) + 2;
  const m = makeCanvas(mw, mh);
  const mg = m.getContext('2d');
  const img = mg.createImageData(mw, mh);
  for (let j = 0; j < mh; j++) {
    for (let i = 0; i < mw; i++) {
      const wx = cam.x + ((i - 0.5) * step - W / 2) / cam.zoom;
      const wy = cam.y + ((j - 0.5) * step - H / 2) / cam.zoom;
      const v = 0.65 * valueNoise(wx / MOTTLE_SCALE, wy / MOTTLE_SCALE, 3)
              + 0.35 * valueNoise(wx / (MOTTLE_SCALE / 3), wy / (MOTTLE_SCALE / 3), 4);
      const k = (j * mw + i) * 4;
      img.data[k] = 120; img.data[k + 1] = 95; img.data[k + 2] = 60;
      img.data[k + 3] = Math.round(Math.max(0, v - 0.35) * 40);
    }
  }
  mg.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(m, -0.5 * step, -0.5 * step, mw * step, mh * step);

  // 颗粒
  const pattern = ctx.createPattern(getGrainTile(), 'repeat');
  const s = GRAIN_TEXEL * cam.zoom;
  const [ox, oy] = toScreen(cam, W, H, 0, 0);
  pattern.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 暗角：屏幕空间，不随镜头移动 */
export function drawVignette(ctx, W, H) {
  const d = Math.hypot(W, H) / 2;
  const g = ctx.createRadialGradient(W / 2, H / 2, d * 0.45, W / 2, H / 2, d * 1.05);
  g.addColorStop(0, 'rgba(70, 50, 30, 0)');
  g.addColorStop(1, 'rgba(70, 50, 30, 0.20)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ─── 句子 ────────────────────────────────────────────────────────────

// 汉字和全角标点占 1 格；拉丁字母、数字、间隔号接近自然字宽（0.4 格），空格 0.3 格。
// 样张 v1 让拉丁字符占半格，"2026"被拉散了。
const isWide = (ch) => ch.codePointAt(0) >= 0x2e80 || ch === '—' || ch === '…';
const advance = (ch) => (isWide(ch) ? 1 : ch === ' ' ? 0.3 : 0.4);

/**
 * 句子排版。line = { col, row, text, align?: 'left'|'right', scale?: 1 }
 * align 为 'right' 时，col 是句子结束的位置。
 */
export function layout(line) {
  const scale = line.scale ?? 1;
  const widths = [...line.text].map((ch) => advance(ch) * scale);
  const width = widths.reduce((a, b) => a + b, 0);
  let x = line.align === 'right' ? line.col - width : line.col;
  const start = x;
  const glyphs = [...line.text].map((ch, i) => {
    const g = { ch, x, w: widths[i] };
    x += widths[i];
    return g;
  });
  return { glyphs, start, end: x, width, scale };
}

/** 句子占用的格子。被占用的格子里不画噪声字：句子是从噪声里"凝结"出来的，不是叠在上面的。 */
export function occupiedCells(lines) {
  const set = new Set();
  for (const line of lines) {
    if ((line.progress ?? 1) <= 0) continue; // 还没开始凝结的句子不占格子
    const { glyphs, scale } = layout(line);
    for (const g of glyphs) {
      if (g.ch === ' ') continue;
      for (let c = Math.floor(g.x + 1e-6); c < Math.ceil(g.x + g.w - 1e-6); c++) {
        for (let r = line.row; r < line.row + scale; r++) set.add(`${c},${r}`);
      }
    }
  }
  return set;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 注意力：句子周围的噪声变淡，让句子透气。返回 (col, row) => 乘数。
 * line.focus（0–1，默认 1）控制变淡的程度，凝结过程中由分镜逐渐拉满。
 */
export function attentionAround(lines, { inner = 0.5, outer = 5, floor = 0.3 } = {}) {
  const boxes = lines.filter((l) => (l.alpha ?? 1) > 0.5 && (l.progress ?? 1) > 0).map((l) => {
    const { start, end, scale } = layout(l);
    return { c0: start, c1: end, r0: l.row, r1: l.row + Math.max(scale, 1), focus: l.focus ?? 1 };
  });
  if (!boxes.length) return null;
  return (col, row) => {
    const cx = col + 0.5, cy = row + 0.5;
    let m = 1;
    for (const b of boxes) {
      const dx = Math.max(b.c0 - cx, 0, cx - b.c1);
      const dy = Math.max(b.r0 - cy, 0, cy - b.r1);
      const base = floor + (1 - floor) * smoothstep(inner, outer, Math.hypot(dx, dy * 1.3));
      m = Math.min(m, 1 - (1 - base) * b.focus);
    }
    return m;
  };
}

const LOD_MIN = 3, LOD_MAX = 7;
const NOISE_TONE = 0.14; // 一个噪声字在格子里的平均墨量（相对于它的不透明度），用于远景的等效灰度

/**
 * 噪声字。每个格子的字和透明度由 (col, row, seed) 决定。
 * opts: { cell, seed, occupied, attention, alpha, sizeRatio, weight, offset }
 */
export function drawNoise(ctx, cam, W, H, opts = {}) {
  const {
    cell = CELL, seed = 1, occupied = null, attention = null,
    alpha = NOISE_ALPHA, sizeRatio = 0.6, weight = 300, offset = 0,
  } = opts;
  const z = cam.zoom;
  // 细节层级：格子小到 7px 以下时，字逐渐淡出，换成等效的平均灰度；3px 以下只画灰度。
  const px = cell * z;
  const glyphMix = smoothstep(LOD_MIN, LOD_MAX, px);
  if (glyphMix < 1) {
    ctx.save();
    ctx.globalAlpha = (1 - glyphMix) * alpha * NOISE_TONE;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (glyphMix <= 0) return;
  const c0 = Math.floor((cam.x - W / 2 / z) / cell - offset) - 1;
  const c1 = Math.ceil((cam.x + W / 2 / z) / cell - offset) + 1;
  const r0 = Math.floor((cam.y - H / 2 / z) / cell - offset) - 1;
  const r1 = Math.ceil((cam.y + H / 2 / z) / cell - offset) + 1;
  const N = NOISE_CHARS.length;

  ctx.save();
  ctx.font = `${weight} ${cell * z * sizeRatio}px ${FONTS.serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (occupied && occupied.has(`${c},${r}`)) continue;
      let a = glyphMix * alpha * (0.7 + 0.6 * rand(c, r, seed + 101));
      if (attention) a *= attention(c, r);
      if (a < 0.004) continue;
      ctx.globalAlpha = Math.min(1, a);
      const [x, y] = toScreen(cam, W, H, (c + offset + 0.5) * cell, (r + offset + 0.5) * cell);
      ctx.fillText(NOISE_CHARS[hash3(c, r, seed) % N], x, y);
    }
  }
  ctx.restore();
}

/**
 * 凝结出的句子。
 * line = { col, row, text, font: 'serif'|'sans', weight, color, alpha, scale, sizeRatio, align,
 *          progress?: 0–1, flip?: 整数 }
 *
 * 凝结：progress 是已经锁定的字所占的比例，从左到右推进。
 *   progress = 0：句子还不存在，格子里是普通噪声。
 *   0 < progress < 1：还没锁定的字在翻动（每个 flip 值换一个随机字，比普通噪声深），
 *     锁定前沿上的那个字在翻动字和真字之间交叉淡入。
 *   progress = 1（默认）：整句锁定。
 */
const FLIP_ALPHA = 0.34;
export function drawLine(ctx, cam, W, H, line) {
  const p = line.progress ?? 1;
  if (p <= 0) return;
  const { glyphs, scale } = layout(line);
  const z = cam.zoom;
  const realFont = `${line.weight ?? 500} ${CELL * scale * z * (line.sizeRatio ?? 0.68)}px ${line.font === 'sans' ? FONTS.sans : FONTS.serif}`;
  const flipFont = `300 ${CELL * scale * z * 0.6}px ${FONTS.serif}`;
  const base = line.alpha ?? 1;
  const front = p * glyphs.length;
  const cy = (line.row + Math.max(scale, 1) / 2) * CELL; // 小于一格的字（署名）在行内垂直居中
  const size = CELL * scale * z * (line.sizeRatio ?? 0.68);
  if (size < 2.5) { // 远景：字小到看不清，画成一道墨痕
    const [x0, y] = toScreen(cam, W, H, glyphs[0].x * CELL, cy);
    const [x1] = toScreen(cam, W, H, (glyphs[0].x + (glyphs.at(-1).x + glyphs.at(-1).w - glyphs[0].x) * Math.min(1, p)) * CELL, cy);
    ctx.save();
    ctx.globalAlpha = base * 0.55;
    ctx.fillStyle = line.color ?? INK;
    ctx.fillRect(x0, y - size / 2, Math.max(0.5, x1 - x0), Math.max(0.5, size));
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  glyphs.forEach((g, i) => {
    if (g.ch === ' ') return;
    const [x, y] = toScreen(cam, W, H, (g.x + g.w / 2) * CELL, cy);
    const k = Math.min(1, Math.max(0, front - i)); // 这个字锁定了多少
    if (k < 1) {
      ctx.font = flipFont;
      ctx.fillStyle = INK;
      ctx.globalAlpha = base * FLIP_ALPHA * (1 - k);
      ctx.fillText(NOISE_CHARS[hash3(Math.floor(g.x * 2), line.row, (line.flip ?? 0) + 7919) % NOISE_CHARS.length], x, y);
    }
    if (k > 0) {
      ctx.font = realFont;
      ctx.fillStyle = line.color ?? INK;
      ctx.globalAlpha = base * k;
      ctx.fillText(g.ch, x, y);
    }
  });
  ctx.restore();
}

/** 锁定前沿所在的列（光标跟着它走）。 */
export function frontCol(line) {
  const { glyphs, start, end } = layout(line);
  const p = line.progress ?? 1;
  if (p >= 1) return end;
  const front = p * glyphs.length;
  const i = Math.floor(front);
  if (i >= glyphs.length) return end;
  return i === 0 && front === 0 ? start : glyphs[i].x + glyphs[i].w * (front - i);
}

/** 光标：朱色竖线，立在 (col, row) 格子的左缘。"我"在画面里唯一的形象。 */
export function drawCursor(ctx, cam, W, H, { col, row, scale = 1, alpha = 1 }) {
  const [x, y] = toScreen(cam, W, H, (col + 0.12) * CELL, (row + 0.5 - 0.37 * scale) * CELL);
  const w = Math.max(2, 0.075 * CELL * cam.zoom);
  const h = Math.max(5, 0.74 * scale * CELL * cam.zoom); // 远景里也要看得见
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = VERMILION;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** 不在网格上的自由文字（富内斯段的"过度"）。item = { x, y, text, size, alpha, weight, font, color } */
export function drawFree(ctx, cam, W, H, item) {
  const [x, y] = toScreen(cam, W, H, item.x, item.y);
  ctx.save();
  ctx.font = `${item.weight ?? 500} ${item.size * cam.zoom}px ${item.font === 'sans' ? FONTS.sans : FONTS.serif}`;
  ctx.fillStyle = item.color ?? INK;
  ctx.globalAlpha = item.alpha ?? 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.text, x, y);
  ctx.restore();
}
