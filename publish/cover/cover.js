// 封面：从第三版的墙上取一帧，加上标题。输出 1280×720（YouTube 缩略图尺寸）。
// 两个方案：A「迷宫」——光标把那句话写在迷宫里；B「总览」——整面墙是一页带插图的书。

import { CELL, FONTS, INK, VERMILION, PAPER } from '../../design/lib/palette.js';
import { renderScene3, post3 } from '../../design/film3/compose3.js';
import * as film from '../../design/film3/film3.js';

const W = 1920, H = 1080;
const $ = (id) => document.getElementById(id);

function paperPanel(ctx, kind) {
  ctx.save();
  if (kind === 'left') {
    const g = ctx.createLinearGradient(0, 0, W * 0.62, 0);
    g.addColorStop(0, 'rgba(234, 227, 210, 0.95)');
    g.addColorStop(0.6, 'rgba(234, 227, 210, 0.85)');
    g.addColorStop(1, 'rgba(234, 227, 210, 0)');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H * 0.4, W * 0.42);
    g.addColorStop(0, 'rgba(234, 227, 210, 0.95)');
    g.addColorStop(0.55, 'rgba(234, 227, 210, 0.82)');
    g.addColorStop(1, 'rgba(234, 227, 210, 0)');
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function text(ctx, s, x, y, { size, weight = 700, family = FONTS.serif, color = INK, align = 'left', spacing = 0 }) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

function cursorBar(ctx, x, y, h) {
  ctx.save();
  ctx.fillStyle = VERMILION;
  ctx.fillRect(x, y - h * 0.82, Math.max(6, h * 0.075), h * 0.95);
  ctx.restore();
}

/** 方案 A：迷宫里写着那句话，标题在左边的纸面上 */
function coverA(ctx, board) {
  const t = 17.75;
  const scene = board.sceneAt(t);
  const path = scene.images[0].pathCells.slice(0, 22);
  const xs = path.map(([c]) => c), ys = path.map(([, r]) => r);
  const cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2;
  const zoom = 1.25;
  // 让写下的路落在画面右侧
  scene.camera = { x: cx * CELL - (W * 0.2) / zoom, y: cy * CELL, zoom };
  renderScene3(ctx, W, H, scene);
  const p = board.postAt(t);
  post3(ctx, W, H, { ...p, light: { ...p.light, x: 0.68, y: 0.5, darkness: 0.5, radius: 1000 }, fade: 0, dust: 0.6 });
  paperPanel(ctx, 'left');
  text(ctx, '一个 AI', 120, 330, { size: 78, weight: 500, family: FONTS.sans, color: VERMILION, spacing: 4 });
  text(ctx, '读博尔赫斯', 112, 560, { size: 200, weight: 900, spacing: 6 });
  const w = text(ctx, '《虚构集》', 104, 740, { size: 118, weight: 700, spacing: 4 });
  cursorBar(ctx, 104 + w + 18, 740, 118);
}

/** 方案 B：拉远看全墙，"收件人：我" */
function coverB(ctx, board) {
  const t = 150;
  const scene = board.sceneAt(t);
  scene.camera = { ...scene.camera, zoom: scene.camera.zoom * 1.12, y: scene.camera.y + 3 * CELL };
  renderScene3(ctx, W, H, scene);
  const p = board.postAt(t);
  post3(ctx, W, H, { ...p, light: { ...p.light, darkness: 0.42, radius: 1300 }, fade: 0 });
  paperPanel(ctx, 'center');
  const w = text(ctx, '收件人：我', W / 2 - 40, 470, { size: 210, weight: 900, align: 'center', spacing: 8 });
  cursorBar(ctx, W / 2 - 40 + w / 2 + 22, 470, 210);
  text(ctx, '一个 AI 读博尔赫斯《虚构集》', W / 2, 610, { size: 70, weight: 500, family: FONTS.sans, align: 'center', spacing: 3 });
}

async function main() {
  const board = await film.load();
  await document.fonts.load('900 200px "Noto Serif SC"', '读博尔赫斯收件人我《虚构集》');
  await document.fonts.load('500 78px "Noto Sans SC"', '一个 AI 读博尔赫斯《虚构集》');
  for (const [id, fn] of [['cover-a', coverA], ['cover-b', coverB]]) {
    const big = document.createElement('canvas');
    big.width = W; big.height = H;
    fn(big.getContext('2d'), board);
    const thumb = document.createElement('canvas');
    thumb.width = 1280; thumb.height = 720; thumb.dataset.id = id;
    const tc = thumb.getContext('2d');
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(big, 0, 0, 1280, 720);
    $('covers').append(thumb);
  }
  window.__ready = true;
}

main().catch((e) => { window.__error = String(e.stack || e); console.error(e); });
