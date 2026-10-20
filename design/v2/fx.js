// 第二版画面的"层次"：光、景深、灰尘、前景视差。
// 都是叠在 renderScene() 结果之上的后期层，纯函数，确定性。
// 设计意图见 docs/decisions.md「导演意见：第二版方向」。

import { CELL, FONTS, INK } from '../lib/palette.js';
import { rand } from '../lib/hash.js';
import { makeCanvas, toScreen } from '../lib/wall.js';

/**
 * 光：一盏暖色的灯照在墙上。光圈里亮而暖，光圈外沉进暗处。
 * light = { x, y（屏幕坐标）, radius, darkness 0–1, warmth 0–1 }
 */
export function applyLight(ctx, W, H, { x = W / 2, y = H / 2, radius = 900, darkness = 0.45, warmth = 0.18 } = {}) {
  ctx.save();
  // 暗部：正片叠底一层深棕
  const g = ctx.createRadialGradient(x, y, radius * 0.25, x, y, radius * 1.35);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.45, `rgba(${mix(255, 120, darkness * 0.6)}, ${mix(255, 92, darkness * 0.6)}, ${mix(255, 66, darkness * 0.6)}, 1)`);
  g.addColorStop(1, `rgba(${mix(255, 26, darkness)}, ${mix(255, 20, darkness)}, ${mix(255, 15, darkness)}, 1)`);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 亮部：光圈中心一点暖色
  const w = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.9);
  w.addColorStop(0, `rgba(255, 196, 128, ${warmth})`);
  w.addColorStop(1, 'rgba(255, 196, 128, 0)');
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = w;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
const mix = (a, b, k) => Math.round(a + (b - a) * k);

/**
 * 景深：画面中心清楚，越往边缘越虚。用整帧的模糊副本，按径向遮罩叠回去。
 * dof = { x, y, inner（完全清楚的半径）, outer（完全虚的半径）, blur（px） }
 */
export function applyDepthOfField(ctx, W, H, { x = W / 2, y = H / 2, inner = 420, outer = 1100, blur = 6 } = {}) {
  if (blur <= 0) return;
  const src = makeCanvas(W, H);
  src.getContext('2d').drawImage(ctx.canvas, 0, 0);
  const blurred = makeCanvas(W, H);
  const b = blurred.getContext('2d');
  b.filter = `blur(${blur}px)`;
  b.drawImage(src, 0, 0);
  b.filter = 'none';
  const m = b.createRadialGradient(x, y, inner, x, y, outer);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(1, 'rgba(0,0,0,1)');
  b.globalCompositeOperation = 'destination-in';
  b.fillStyle = m;
  b.fillRect(0, 0, W, H);
  ctx.drawImage(blurred, 0, 0);
}

/**
 * 灰尘：光柱里浮着的微粒。光圈里亮，光圈外几乎看不见。少量大而虚的光斑当作焦外。
 * 位置由序号哈希决定，随时间缓慢漂移。
 */
export function drawDust(ctx, W, H, t, { light = { x: W / 2, y: H / 2, radius: 900 }, count = 70, seed = 5 } = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < count; i++) {
    const big = rand(i, 9, seed) < 0.12;
    const speed = 6 + 14 * rand(i, 3, seed);
    const x = ((rand(i, 1, seed) * (W + 200) + Math.sin(t * 0.21 + i) * 30 + t * speed * (rand(i, 4, seed) - 0.3)) % (W + 200) + W + 200) % (W + 200) - 100;
    const y = ((rand(i, 2, seed) * (H + 200) - t * speed * 0.6 + Math.cos(t * 0.17 + i * 1.7) * 20) % (H + 200) + H + 200) % (H + 200) - 100;
    const d = Math.hypot(x - light.x, y - light.y) / light.radius;
    const lit = Math.max(0, 1 - d * d);
    if (lit <= 0.01) continue;
    const r = big ? 7 + 9 * rand(i, 5, seed) : 0.8 + 2.2 * rand(i, 5, seed);
    const a = (big ? 0.06 : 0.22 + 0.35 * rand(i, 6, seed)) * lit;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 238, 205, ${a})`);
    g.addColorStop(1, 'rgba(255, 238, 205, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}

/**
 * 前景视差：离镜头更近的几个巨大的字，失焦，移动时比墙滑得快。
 * item = { x, y（墙面坐标）, ch, size（墙面单位）, alpha, depth（>1，越大越近、越快、越虚） }
 */
export function drawForeground(ctx, cam, W, H, items) {
  for (const it of items) {
    const d = it.depth ?? 2;
    const sx = (it.x - cam.x) * cam.zoom * d + W / 2;
    const sy = (it.y - cam.y) * cam.zoom * d + H / 2;
    const size = it.size * cam.zoom; // 景深只影响位置和虚化，不再放大字号
    if (sx < -size || sx > W + size || sy < -size || sy > H + size) continue;
    ctx.save();
    ctx.filter = `blur(${Math.round(size * 0.011 * (d - 0.6))}px)`;
    ctx.globalAlpha = it.alpha ?? 0.16;
    ctx.fillStyle = it.color ?? INK;
    ctx.font = `${it.weight ?? 500} ${size}px ${FONTS.serif}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.ch, sx, sy);
    ctx.restore();
  }
}

/** 墙面坐标的格子中心 → 屏幕坐标（给光圈定位用） */
export const cellToScreen = (cam, W, H, col, row) => toScreen(cam, W, H, (col + 0.5) * CELL, (row + 0.5) * CELL);
