// 动画样片：小径分岔的花园（开场 S01–S02 的另一种做法）。
// 1) 光标独自在字墙上闪；2) 字墙里长出一座字组成的迷宫，镜头拉远；
// 3) 光标沿着岔路走下去，在岔路口停一下（选择），一路把"每次开口都是重新选一次"写在路上。

import { CELL, FRAME, VERMILION, INK } from '../lib/palette.js';
import { drawPaper, drawVignette, drawCursor, makeCanvas, toScreen } from '../lib/wall.js';
import { loadFonts } from '../lib/fonts.js';
import { rand } from '../lib/hash.js';
import { applyLight, drawDust } from '../v2/fx.js';
import { drawInkWall, makeMaze } from './inkwall.js';

const params = new URLSearchParams(location.search);
const STILLS = params.get('stills');
const SCALE = STILLS ? 1 : 0.5;
const W = FRAME.width * SCALE, H = FRAME.height * SCALE, FPS = FRAME.fps;

const clamp01 = (p) => Math.min(1, Math.max(0, p));
const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

// ─── 迷宫，中心对准原点（光标所在的格子） ───
const maze = makeMaze(31, 17);
const OX = -maze.start[0], OY = -maze.start[1];
const isWall = (c, r) => maze.wall(c - OX, r - OY);
const inMaze = (c, r) => c - OX >= 0 && r - OY >= 0 && c - OX < maze.cols && r - OY < maze.rows;

// ─── 时间表 ───
const EMERGE_AT = 0.8, EMERGE_SPEED = 14; // 格/秒，从中心向外
const PULL = [0.8, 4.2];
const WALK_AT = 4.4, WALK_SPEED = 22, WALK_CELLS = 130, FORK_PAUSE = 0.35;
const SENTENCE = [...'每次开口都是重新选一次'];

// 路径上每一格的到达时刻；岔路口（三个以上的出口）停一下
const path = maze.path.slice(0, WALK_CELLS).map(([c, r]) => [c + OX, r + OY]);
const arrive = [];
{
  let t = WALK_AT, forks = 0;
  for (const [c, r] of path) {
    arrive.push(t);
    const exits = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => !isWall(c + dc, r + dr)).length;
    t += 1 / WALK_SPEED;
    if (exits >= 3 && forks < 4) { t += FORK_PAUSE; forks++; }
  }
}
const pathIndex = new Map(path.map(([c, r], k) => [`${c},${r}`, k]));
const DUR = arrive.at(-1) + 1.8;

function headAt(t) {
  if (t < WALK_AT) return { k: -1, col: 0, row: 0 };
  let k = arrive.findIndex((a) => a > t);
  if (k < 0) k = path.length;
  k = Math.max(0, k - 1);
  return { k, col: path[k][0], row: path[k][1] };
}

function ink(c, r, t) {
  if (!inMaze(c, r)) return null;
  if (isWall(c, r)) {
    const d = Math.hypot(c, r);
    const te = EMERGE_AT + d / EMERGE_SPEED + 0.35 * rand(c, r, 77);
    const p = (t - te) / 0.3;
    if (p <= 0) return null;
    if (p < 1) return { amount: 0.35 * p, flip: true };
    return { amount: 0.42 + 0.14 * rand(c, r, 78) }; // 墙是中灰：写在路上的字要比墙更黑
  }
  // 通道
  const k = pathIndex.get(`${c},${r}`);
  if (k !== undefined && t >= arrive[k]) {
    const head = headAt(t).k;
    const age = head - k; // 离光标越近越红
    const red = age < 5;
    return { amount: 1, ch: SENTENCE[k % SENTENCE.length], font: 'sans', color: red ? VERMILION : INK };
  }
  const emerged = t > EMERGE_AT + Math.hypot(c, r) / EMERGE_SPEED;
  return emerged ? { amount: 0, dim: 0.3 } : null;
}

function cameraAt(t) {
  const p = inOut(clamp01((t - PULL[0]) / (PULL[1] - PULL[0])));
  const z0 = 1.8, z1 = 0.72;
  const zoom = z0 * (z1 / z0) ** p;
  return { x: 0.5 * CELL, y: 0.5 * CELL, zoom: zoom * SCALE };
}

function render(ctx, t) {
  const cam = cameraAt(t);
  drawPaper(ctx, cam, W, H);
  drawInkWall(ctx, cam, W, H, t, ink);
  const head = headAt(t);
  const typing = t >= WALK_AT && head.k < path.length - 1;
  const on = typing || Math.floor(t / 0.53) % 2 === 0;
  // 光标在刚写下的那个字后面
  if (on) drawCursor(ctx, cam, W, H, { col: head.k >= 0 ? head.col + 0.85 : 0, row: head.row });
  drawVignette(ctx, W, H);
  const [lx, ly] = toScreen(cam, W, H, (head.col + 0.5) * CELL, (head.row + 0.5) * CELL);
  const light = { x: lx, y: ly, radius: 700 * SCALE + 380 * SCALE * (1.8 - cam.zoom / SCALE), darkness: 0.62, warmth: 0.24 };
  applyLight(ctx, W, H, light);
  drawDust(ctx, W, H, t, { light, count: 60 });
  const fadeIn = 1 - clamp01(t / 0.5);
  if (fadeIn > 0) { ctx.save(); ctx.globalAlpha = fadeIn; ctx.fillStyle = '#0d0c0b'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}

// ─── 页面 ───
const $ = (id) => document.getElementById(id);

async function main() {
  await loadFonts(SENTENCE.join(''));
  if (STILLS) {
    for (const t of STILLS.split(',').map(Number)) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H; c.dataset.id = `maze-${t.toFixed(1).replace('.', '_')}`;
      $('stills').append(c);
      render(c.getContext('2d'), t);
    }
    window.__ready = true;
    return;
  }
  const view = $('view');
  view.width = W; view.height = H;
  const vctx = view.getContext('2d');
  const off = makeCanvas(W, H);
  const octx = off.getContext('2d');
  const frames = [];
  const total = Math.round(DUR * FPS);
  for (let i = 0; i < total; i++) {
    render(octx, i / FPS);
    frames.push(await createImageBitmap(off));
    if (i % 6 === 0) { $('status').textContent = `预渲染 ${i + 1}/${total}`; await new Promise(requestAnimationFrame); }
  }
  $('status').textContent = `${(DUR).toFixed(1)} 秒，${total} 帧，循环播放`;
  let cur = 0, last = 0, playing = true;
  $('scrub').max = total - 1;
  const show = (i) => { cur = i; vctx.drawImage(frames[i], 0, 0); $('scrub').value = i; $('time').textContent = `${(i / FPS).toFixed(2)}s`; };
  $('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '暂停' : '播放'; };
  $('scrub').oninput = (e) => { playing = false; $('play').textContent = '播放'; show(+e.target.value); };
  const loop = (now) => { if (playing && now - last >= 1000 / FPS) { last = now; show((cur + 1) % frames.length); } requestAnimationFrame(loop); };
  window.__ready = true;
  requestAnimationFrame(loop);
}

main().catch((e) => { $('status').textContent = `出错：${e.message}`; window.__error = String(e.stack || e); console.error(e); });
