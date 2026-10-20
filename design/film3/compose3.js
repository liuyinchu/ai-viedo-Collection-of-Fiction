// 第三版的合成：在第一版 compose.js 的基础上，把噪声换成"字成画"的墨墙，
// 再加上字的聚合（粒子）、前景视差，以及屏幕空间的后期（景深、光、灰尘）。
//
// 分两步，供渲染管线使用：
//   renderScene3(ctx, W, H, scene)  场景本身。运动模糊时每个子帧都调用它
//   post3(ctx, W, H, post)          屏幕空间后期。运动模糊平均之后只调用一次

import { CELL, FONTS, INK, NOISE_ALPHA } from '../lib/palette.js';
import { NOISE_CHARS } from '../lib/charset.js';
import { hash3, rand } from '../lib/hash.js';
import {
  drawPaper, drawVignette, drawLine, drawCursor, drawFree,
  occupiedCells, attentionAround, toScreen, layout,
} from '../lib/wall.js';
import { applyLight, applyDepthOfField, drawDust, drawForeground } from '../v2/fx.js';

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 墨墙：普通噪声 + 图（images）。图的格子按墨量加深、加大；LOD 时退化成色块。 */
function drawInkNoise(ctx, cam, W, H, t, { occupied, attention, images = [], env = {} }) {
  const z = cam.zoom, px = CELL * z;
  const glyphMix = smoothstep(3, 7, px);
  const c0 = Math.floor((cam.x - W / 2 / z) / CELL) - 1, c1 = Math.ceil((cam.x + W / 2 / z) / CELL) + 1;
  const r0 = Math.floor((cam.y - H / 2 / z) / CELL) - 1, r1 = Math.ceil((cam.y + H / 2 / z) / CELL) + 1;
  const dim = env.dim ?? 1;
  const visibleImages = images.filter((im) => im.box.c1 >= c0 && im.box.c0 <= c1 && im.box.r1 >= r0 && im.box.r0 <= r1);
  const flipFrame = Math.floor(t * 14);
  const N = NOISE_CHARS.length;

  ctx.save();
  if (glyphMix < 1) { // 远景：噪声的平均灰度
    ctx.globalAlpha = (1 - glyphMix) * NOISE_ALPHA * 0.14;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
  }
  // 远景里的图：逐格色块（图的范围有限，格子数可控）
  if (glyphMix < 1 && visibleImages.length) {
    ctx.fillStyle = INK;
    for (const im of visibleImages) {
      const a0 = Math.max(c0, im.box.c0), a1 = Math.min(c1, im.box.c1);
      const b0 = Math.max(r0, im.box.r0), b1 = Math.min(r1, im.box.r1);
      for (let r = b0; r <= b1; r++) for (let c = a0; c <= a1; c++) {
        const s = im.inkAt(c, r, t, env);
        if (!s || !(s.amount > 0.05)) continue;
        ctx.globalAlpha = (1 - glyphMix) * Math.min(1, s.amount * (s.pen ? (env.penDim ?? 1) : dim)) * 0.6;
        const [x, y] = toScreen(cam, W, H, c * CELL, r * CELL);
        ctx.fillRect(x, y, Math.max(0.6, px), Math.max(0.6, px));
      }
    }
  }
  if (glyphMix <= 0) { ctx.restore(); return; }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let lastFont = '';
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (occupied.has(`${c},${r}`)) continue;
      let s = null;
      for (const im of visibleImages) {
        if (c < im.box.c0 || c > im.box.c1 || r < im.box.r0 || r > im.box.r1) continue;
        s = im.inkAt(c, r, t, env);
        if (s) break;
      }
      const base = NOISE_ALPHA * (0.7 + 0.6 * rand(c, r, 101));
      let alpha = base * (attention ? attention(c, r) : 1), size = 0.6, weight = 300, color = INK, family = FONTS.serif;
      let ch = NOISE_CHARS[hash3(c, r, 1) % N];
      if (s) {
        const a = s.amount * (s.pen ? (env.penDim ?? 1) : dim);
        // 图的笔画不被注意力压得太淡
        const att = attention ? 0.6 + 0.4 * attention(c, r) : 1;
        alpha = (base + (0.92 - base) * a) * (s.pen ? 1 : att);
        size = 0.6 + 0.12 * Math.min(1, a);
        weight = a > 0.9 ? 500 : a > 0.35 ? 400 : 300;
        if (s.flip) ch = NOISE_CHARS[hash3(c, r, flipFrame + 7919) % N];
        if (s.ch) ch = s.ch;
        if (s.color) color = s.color;
        if (s.font === 'sans') { family = FONTS.sans; weight = s.pen ? 400 : Math.min(weight, 400); }
        if (s.dim !== undefined) alpha *= s.dim;
      }
      alpha *= glyphMix;
      if (alpha < 0.004) continue;
      const font = `${weight} ${px * size}px ${family}`;
      if (font !== lastFont) { ctx.font = font; lastFont = font; }
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.min(1, alpha);
      const [x, y] = toScreen(cam, W, H, (c + 0.5) * CELL, (r + 0.5) * CELL);
      ctx.fillText(ch, x, y);
    }
  }
  ctx.restore();
}

/** 字的聚合：一行字的每个字从远处飞来落定。line.assemble = { arrive: [每个字的落定时刻], from: [[dc, dr]] } */
function drawAssemble(ctx, cam, W, H, t, line) {
  const { glyphs, scale } = layout(line);
  const size = CELL * scale * cam.zoom * (line.sizeRatio ?? 0.68);
  ctx.save();
  ctx.font = `${line.weight ?? 350} ${size}px ${line.font === 'sans' ? FONTS.sans : FONTS.serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = line.color ?? INK;
  const FLY = 0.75;
  glyphs.forEach((g, i) => {
    if (g.ch === ' ') return;
    const ta = line.assemble.arrive[i];
    const p = (t - (ta - FLY)) / FLY;
    if (p <= 0) return;
    const e = p >= 1 ? 1 : 1 - (1 - p) ** 3;
    const [dc, dr] = line.assemble.from[i];
    const tx = (g.x + g.w / 2) * CELL, ty = (line.row + 0.5) * CELL;
    const x = tx + dc * CELL * (1 - e), y = ty + dr * CELL * (1 - e) - Math.sin(Math.PI * e) * 2.5 * CELL * (1 - e);
    const [sx, sy] = toScreen(cam, W, H, x, y);
    ctx.globalAlpha = (line.alpha ?? 1) * (0.25 + 0.75 * e);
    ctx.fillText(g.ch, sx, sy);
  });
  ctx.restore();
}

export function renderScene3(ctx, W, H, scene) {
  const cam = scene.camera;
  const lines = scene.lines ?? [];
  const occupied = occupiedCells(lines);
  const attention = attentionAround(lines.filter((l) => !l.assemble));
  const drawWall = () => {
    drawPaper(ctx, cam, W, H);
    drawInkNoise(ctx, cam, W, H, scene.t, { occupied, attention, images: scene.images, env: scene.env });
  };
  if (!scene.pages) drawWall();
  else {
    ctx.save();
    ctx.fillStyle = scene.background ?? '#13110f';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    for (const pg of scene.pages) {
      const [x0, y0] = toScreen(cam, W, H, pg.c0 * CELL, pg.r0 * CELL);
      const [x1, y1] = toScreen(cam, W, H, pg.c1 * CELL, pg.r1 * CELL);
      if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) continue;
      drawPageStack(ctx, x0, y0, x1, y1, pg.gutter);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      drawWall();
      drawGutter(ctx, x0, y0, x1, y1, pg.gutter);
      ctx.restore();
    }
  }
  for (const layer of scene.layers ?? []) layer(ctx, cam, W, H);
  for (const line of lines) {
    if (line.assemble) drawAssemble(ctx, cam, W, H, scene.t, line);
    else drawLine(ctx, cam, W, H, line);
  }
  for (const cursor of scene.cursors ?? []) drawCursor(ctx, cam, W, H, cursor);
  if (scene.foreground?.length) drawForeground(ctx, cam, W, H, scene.foreground);
  drawVignette(ctx, W, H);
}

/** 屏幕空间后期：景深 → 光 → 灰尘 → 片头片尾压黑 */
export function post3(ctx, W, H, p) {
  const s = W / 1920;
  const light = { x: W * p.light.x, y: H * p.light.y, radius: p.light.radius * s, darkness: p.light.darkness, warmth: p.light.warmth };
  if (p.dof) applyDepthOfField(ctx, W, H, { x: light.x, y: light.y, inner: p.dof.inner * s, outer: p.dof.outer * s, blur: p.dof.blur * s });
  applyLight(ctx, W, H, light);
  if (p.fade < 1) drawDust(ctx, W, H, p.t, { light, count: Math.round(55 * (1 - p.fade)) });
  if (p.fade > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.fade);
    ctx.fillStyle = '#0d0c0b';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

// 书页（与第一版 compose.js 相同）
function drawPageStack(ctx, x0, y0, x1, y1, gutter) {
  const w = x1 - x0;
  const step = Math.max(0.6, w * 0.0035);
  const out = gutter === 'left' ? 1 : -1;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x0 + out * step * 5, y0 + step * 4, w, y1 - y0);
  for (let k = 4; k >= 1; k--) {
    ctx.fillStyle = k % 2 ? '#d2c8b2' : '#ddd4bf';
    ctx.fillRect(x0 + out * step * k, y0 + step * k * 0.6, w, y1 - y0);
  }
  ctx.restore();
}
function drawGutter(ctx, x0, y0, x1, y1, gutter) {
  const w = x1 - x0;
  const g = gutter === 'left'
    ? ctx.createLinearGradient(x0, 0, x0 + w * 0.08, 0)
    : ctx.createLinearGradient(x1, 0, x1 - w * 0.08, 0);
  g.addColorStop(0, 'rgba(50, 35, 20, 0.35)');
  g.addColorStop(1, 'rgba(50, 35, 20, 0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, y1 - y0);
  ctx.restore();
}

export { drawFree };
