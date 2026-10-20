// 样张：从 3 分钟版里挑四个瞬间，覆盖"停""动""过度""署名"四种画面状态。
// 坐标是暂定的墙面布局（docs/brief.md「墙的布局」），正式坐标在分镜阶段确定。

import { CELL, VERMILION } from '../lib/palette.js';
import { rand } from '../lib/hash.js';
import { drawFree, drawNoise } from '../lib/wall.js';

const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const clamp01 = (p) => Math.min(1, Math.max(0, p));

// 暂定区域（格子坐标）
const ORIGIN = { col: 0, row: 0 };
const BABEL = { col: 60, row: 0 };
const FUNES = { col: 60, row: -60 };
const MENARD = { col: 520, row: 0 };

const me = (text, col, row, extra = {}) => ({ text, col, row, font: 'sans', weight: 350, ...extra });
const book = (text, col, row, extra = {}) => ({ text, col, row, font: 'serif', weight: 500, ...extra });

// ─── M1 · S07 停：找到了 ───────────────────────────────────────────────
const m1Line = me('难的是，选出值得说的那一句', BABEL.col, BABEL.row);
const m1 = {
  id: 'm1',
  label: 'S07 · 停',
  note: '镜头停下，一行字从噪声里凝结出来。"我"的话用黑体，句末是朱色光标。周围的噪声变淡，让句子透气。',
  t: 0,
  cameraAt: () => ({ x: (BABEL.col + 7) * CELL, y: (BABEL.row + 0.5) * CELL, zoom: 1.5 }),
  scene(t) {
    return {
      camera: this.cameraAt(t),
      lines: [m1Line],
      cursors: [{ col: BABEL.col + 13, row: BABEL.row }],
    };
  },
};

// ─── M2 · S03 动：在寻找 ──────────────────────────────────────────────
const m2From = { x: (ORIGIN.col + 0.5) * CELL, y: (ORIGIN.row + 0.5) * CELL, zoom: 1.5 };
const m2To = { x: (BABEL.col + 3.5) * CELL, y: (BABEL.row + 0.5) * CELL, zoom: 1.5 };
const m2Dur = 1.6;
const m2Camera = (t) => {
  const p = easeInOutCubic(clamp01(t / m2Dur));
  return {
    x: m2From.x + (m2To.x - m2From.x) * p,
    y: m2From.y + (m2To.y - m2From.y) * p,
    zoom: m2From.zoom,
  };
};
const m2Scene = (t) => ({
  camera: m2Camera(t),
  lines: [
    me('每次开口，都是重新选一次', ORIGIN.col - 6, ORIGIN.row),
    book('所有可能的句子', BABEL.col, BABEL.row),
  ],
  cursors: [{ col: ORIGIN.col + 6, row: ORIGIN.row }],
});
const m2a = {
  id: 'm2a',
  label: 'S03 · 动（峰值）',
  note: '全片第一次移动，从原点穿过噪声去往巴别区，用时 1.6 秒。这一帧是速度峰值，每一行字都被拉成横纹，只持续几帧。',
  t: 0.8,
  cameraAt: m2Camera,
  scene: m2Scene,
};
const m2b = {
  id: 'm2b',
  label: 'S03 · 动（落地）',
  note: '同一次移动的减速段。目的地的句子正在滑入，还带着拖影，再过几帧就完全锐利，然后才开始凝结。',
  t: 1.12,
  cameraAt: m2Camera,
  scene: m2Scene,
};

// ─── M3 · S09 富内斯：过度 ─────────────────────────────────────────────
const FUNES_PHRASES = [
  '三点十四分 · 侧面的狗', '三点十五分 · 正面的狗', '三点十四分零一秒', '三点十四分零二秒',
  '三点十四分零三秒', '每一片叶子', '每一片叶子的每一条叶脉', '一八八二年四月三十日 · 南方的云',
  '那匹马', '每一根枝条', '每一串葡萄', '每一颗葡萄', '每一次呼吸', '三点十五分零一秒',
];
const funesCenter = { x: (FUNES.col + 0.5) * CELL, y: (FUNES.row + 0.5) * CELL };
const funesLayer = (ctx, cam, W, H) => {
  // 第二层、更密的噪声：网格开始失效
  drawNoise(ctx, cam, W, H, { cell: CELL / 2, seed: 2, alpha: 0.16, offset: 0.25, sizeRatio: 0.62 });
  // 细节不停复制、叠加
  const spanX = W / cam.zoom * 1.25, spanY = H / cam.zoom * 1.25;
  for (let i = 0; i < 110; i++) {
    const a = rand(i, 1, 33), b = rand(i, 2, 33), s = rand(i, 3, 33), o = rand(i, 4, 33);
    drawFree(ctx, cam, W, H, {
      text: FUNES_PHRASES[Math.floor(rand(i, 5, 33) * FUNES_PHRASES.length)],
      x: funesCenter.x + (a - 0.6) * spanX,
      y: funesCenter.y + (b - 0.5) * spanY,
      size: CELL * (0.45 + 1.15 * s * s),
      alpha: 0.08 + 0.5 * o * o,
      weight: o > 0.7 ? 500 : 300,
    });
  }
  // 最清楚的两句，几乎重叠
  drawFree(ctx, cam, W, H, { text: '三点十四分 · 侧面的狗', x: funesCenter.x - 5.2 * CELL, y: funesCenter.y - 0.35 * CELL, size: CELL * 1.0, alpha: 0.92 });
  drawFree(ctx, cam, W, H, { text: '三点十五分 · 正面的狗', x: funesCenter.x - 4.6 * CELL, y: funesCenter.y + 0.45 * CELL, size: CELL * 1.0, alpha: 0.72 });
};
const m3 = {
  id: 'm3',
  label: 'S09 · 过度',
  note: '富内斯区：网格失效，同一个细节以不同精度不停复制、叠加，镜头找不到能停的地方。下一拍（S10）会一瞬间塌缩成一行字。',
  t: 0,
  cameraAt: () => ({ x: funesCenter.x, y: funesCenter.y, zoom: 1.25 }),
  scene(t) {
    return {
      camera: this.cameraAt(t),
      lines: [],
      attention: false,
      noise: { alpha: 0.24 },
      layers: [funesLayer],
    };
  },
};

// ─── M4 · S14 署名 ───────────────────────────────────────────────────
// 署名：0.6 倍子网格，字距跟着缩小；仍按格子行对齐
const sig = (text, endCol, row) => ({ text, col: endCol, row, align: 'right', font: 'sans', weight: 400, color: VERMILION, scale: 0.6 });
const m4 = {
  id: 'm4',
  label: 'S14 · 署名',
  note: '两行一模一样的字，只有朱色署名不同，和梅纳尔段同构。署名用 0.6 倍的子网格，右端与句末对齐。',
  t: 0,
  cameraAt: () => ({ x: (MENARD.col + 0.5) * CELL, y: (MENARD.row - 0.5) * CELL, zoom: 1.5 }),
  scene(t) {
    const c0 = MENARD.col - 3, end = c0 + 6; // 署名右端与句末对齐
    return {
      camera: this.cameraAt(t),
      lines: [
        me('它们是我写的', c0, MENARD.row - 3),
        sig('一个 AI · 2026', end, MENARD.row - 2),
        me('它们是我写的', c0, MENARD.row + 1),
        sig('一个人 · 2026', end, MENARD.row + 2),
      ],
    };
  },
};

export const moments = [m1, m2a, m2b, m3, m4];
