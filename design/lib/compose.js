// 把一个"场景状态"画成一帧。场景状态由分镜在时间 t 上求出。
//
// scene = {
//   camera: { x, y, zoom },
//   lines:   [line...],        // 凝结出的句子，见 wall.js drawLine
//   cursors: [cursor...],      // 光标
//   noise:   { ...drawNoise 的参数 },
//   layers:  [(ctx, cam, W, H) => void],  // 额外图层，画在噪声之上、句子之下
//   attention: true | false,   // 句子周围的噪声是否变淡，默认 true
//   pages:   [{ c0, c1, r0, r1, gutter: 'left'|'right' }],  // 墙是一本书的书页（格子坐标）。省略则墙无边无际
//   background: '#13110f',     // 书页之外的颜色
//   fade:    0–1,              // 整体压黑（片头、片尾）
// }

import { CELL } from './palette.js';
import {
  drawPaper, drawVignette, drawNoise, drawLine, drawCursor,
  occupiedCells, attentionAround, toScreen,
} from './wall.js';

export function renderScene(ctx, W, H, scene) {
  const cam = scene.camera;
  const lines = scene.lines ?? [];
  const noiseOpts = {
    occupied: occupiedCells(lines),
    attention: scene.attention === false ? null : attentionAround(lines),
    ...(scene.noise ?? {}),
  };
  const drawWall = () => {
    drawPaper(ctx, cam, W, H);
    drawNoise(ctx, cam, W, H, noiseOpts);
  };

  if (!scene.pages) {
    drawWall();
  } else {
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
  for (const line of lines) drawLine(ctx, cam, W, H, line);
  for (const cursor of scene.cursors ?? []) drawCursor(ctx, cam, W, H, cursor);
  drawVignette(ctx, W, H);
  if (scene.fade > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, scene.fade);
    ctx.fillStyle = '#0d0c0b';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}

/** 书页下面压着的其余书页：外缘露出几层纸边，再落一层阴影 */
function drawPageStack(ctx, x0, y0, x1, y1, gutter) {
  const w = x1 - x0;
  const step = Math.max(0.6, w * 0.0035);
  const out = gutter === 'left' ? 1 : -1; // 外缘方向：右页向右，左页向左
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(x0 + out * step * 5, y0 + step * 4, w, y1 - y0);
  for (let k = 4; k >= 1; k--) {
    ctx.fillStyle = k % 2 ? '#d2c8b2' : '#ddd4bf';
    ctx.fillRect(x0 + out * step * k, y0 + step * k * 0.6, w, y1 - y0);
  }
  ctx.restore();
}

/** 书脊一侧的阴影 */
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
