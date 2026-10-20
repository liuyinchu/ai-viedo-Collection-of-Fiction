// 动态样张：S02 → S03 的"停 → 动 → 停"，约 5.6 秒。
// 先把每一帧（含运动模糊）预渲染好，再按 30fps 播放。预览用半分辨率 960×540。

import { CELL, FRAME } from '../lib/palette.js';
import { renderScene } from '../lib/compose.js';
import { renderWithMotionBlur } from '../lib/blur.js';
import { frontCol, makeCanvas } from '../lib/wall.js';
import { loadFonts } from './fonts.js';

const params = new URLSearchParams(location.search);
const BLUR = params.get('blur') !== '0';
const STILLS = params.get('stills'); // ?stills=24,72,120 原尺寸导出这几帧（给 design/tools/snap.mjs 用）
const PREVIEW = STILLS ? 1 : 0.5;
const W = FRAME.width * PREVIEW, H = FRAME.height * PREVIEW, FPS = FRAME.fps;
const DUR = 5.6;

const clamp01 = (p) => Math.min(1, Math.max(0, p));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const smooth = (p) => p * p * (3 - 2 * p);
const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

// 时间表（秒）
const T = {
  condense1: [0.25, 1.35], // 「每次开口，都是重新选一次」凝结，光标跟着前沿走
  move: [2.0, 3.6],        // 全片第一次移动
  condense2: [3.85, 4.55], // 「所有可能的句子」凝结
};

const L1 = { text: '每次开口，都是重新选一次', col: -6, row: 0, font: 'sans', weight: 350 };
const L2 = { text: '所有可能的句子', col: 60, row: 0, font: 'serif', weight: 500 };
const A = { x: 0 * CELL, y: 0.5 * CELL };
const B = { x: (L2.col + 3.5) * CELL, y: 0.5 * CELL };

function cameraAt(t) {
  const p = easeInOutCubic(seg(t, ...T.move));
  return { x: A.x + (B.x - A.x) * p, y: A.y + (B.y - A.y) * p, zoom: 1.5 * PREVIEW };
}

function scene(t) {
  const p1 = seg(t, ...T.condense1), p2 = seg(t, ...T.condense2);
  const flip = Math.floor(t * 14);
  const l1 = { ...L1, progress: p1, focus: smooth(p1), flip };
  const l2 = { ...L2, progress: p2, focus: smooth(p2), flip };
  // 光标：凝结时常亮并跟着前沿走，其余时间以约 1.06 秒为周期闪烁
  const typing = p1 > 0 && p1 < 1;
  const on = typing || Math.floor(t / 0.53) % 2 === 0;
  return {
    camera: cameraAt(t),
    lines: [l1, l2],
    cursors: on ? [{ col: p1 > 0 ? frontCol(l1) : L1.col, row: 0 }] : [],
  };
}

function phase(t) {
  if (t >= T.move[0] && t < T.move[1]) return '动';
  if ((t >= T.condense1[0] && t < T.condense1[1]) || (t >= T.condense2[0] && t < T.condense2[1])) return '凝结';
  return '停';
}

const $ = (id) => document.getElementById(id);
const view = $('view');
view.width = W; view.height = H;
const vctx = view.getContext('2d');
const frames = [];
let playing = true, cur = 0, last = 0;

function show(i) {
  cur = i;
  vctx.drawImage(frames[i], 0, 0);
  $('scrub').value = i;
  const t = i / FPS;
  $('time').textContent = `${t.toFixed(2)}s · 第 ${i} 帧 · ${phase(t)}`;
}

function loop(now) {
  if (playing && frames.length && now - last >= 1000 / FPS) {
    last = now;
    show((cur + 1) % frames.length);
  }
  requestAnimationFrame(loop);
}

async function exportStills() {
  for (const i of STILLS.split(',').map(Number)) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H; c.dataset.id = `motion-f${i}`;
    c.style.cssText = 'width:100%;margin-bottom:8px';
    document.body.append(c);
    renderWithMotionBlur(c.getContext('2d'), W, H, (cc, tt) => renderScene(cc, W, H, scene(tt)), cameraAt, i / FPS, { fps: FPS });
  }
  window.__ready = true;
}

async function main() {
  await loadFonts(L1.text + L2.text);
  if (STILLS) return exportStills();
  const off = makeCanvas(W, H);
  const octx = off.getContext('2d');
  const total = Math.round(DUR * FPS);
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    const draw = (c, tt) => renderScene(c, W, H, scene(tt));
    if (BLUR) renderWithMotionBlur(octx, W, H, draw, cameraAt, t, { fps: FPS });
    else draw(octx, t);
    frames.push(await createImageBitmap(off));
    $('status').textContent = `预渲染 ${i + 1}/${total}`;
    if (i % 4 === 0) await new Promise(requestAnimationFrame);
  }
  $('status').textContent = `${total} 帧，用时 ${((performance.now() - t0) / 1000).toFixed(1)}s。运动模糊：${BLUR ? '开' : '关'}`;
  $('scrub').max = total - 1;
  $('controls').hidden = false;
  window.__ready = true;
  requestAnimationFrame(loop);
}

$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '暂停' : '播放'; };
$('scrub').oninput = (e) => { playing = false; $('play').textContent = '播放'; show(+e.target.value); };
$('blur').href = `?blur=${BLUR ? 0 : 1}`;
$('blur').textContent = BLUR ? '对比：关掉运动模糊' : '对比：打开运动模糊';

main().catch((e) => { $('status').textContent = `出错：${e.message}`; window.__error = String(e.stack || e); console.error(e); });
