// 第二版样张：同样的墙，加上光、景深、灰尘、前景视差、大字号和富内斯的暗场。
// C、D、E、F 直接复用第一版样张的场景（design/styleframes/moments.js），方便前后对比。

import { CELL, VERMILION } from '../lib/palette.js';
import { moments as v1 } from '../styleframes/moments.js';

const byId = Object.fromEntries(v1.map((m) => [m.id, m]));
const me = (text, col, row, extra = {}) => ({ text, col, row, font: 'sans', weight: 350, ...extra });
const book = (text, col, row, extra = {}) => ({ text, col, row, font: 'serif', weight: 500, ...extra });

// ─── A · 开场钩子（S01）：光标和两个书名，暗场里的一盏灯 ─────────────────
const A = {
  id: 'v2-a',
  label: 'A · 开场（S01）',
  note: '第一版开场只有一面平光的墙。第二版：暗场里一盏暖灯照着光标，两个书名从噪声里凝结出来，左边掠过一个巨大的失焦前景字，光里浮着灰尘。',
  t: 7.2,
  cameraAt: () => ({ x: 6 * CELL, y: 0.5 * CELL, zoom: 1.75 }),
  scene(t) {
    return {
      camera: this.cameraAt(t),
      lines: [book('《虚构集》', 2, -2), book('《哥德尔、艾舍尔、巴赫》', 2, 2)],
      cursors: [{ col: 0, row: 0 }],
    };
  },
  fx: {
    light: { col: 3, row: 0, radius: 760, darkness: 0.72, warmth: 0.26 },
    dof: { inner: 380, outer: 1050, blur: 7 },
    foreground: [{ x: 1 * CELL, y: 2.7 * CELL, ch: '选', size: 520, alpha: 0.2, depth: 2.3 }],
  },
};

// ─── B · 大字号（S03）：「所有可能的句子」撑满画面 ────────────────────────
const B = {
  id: 'v2-b',
  label: 'B · 大字号（S03）',
  note: '关键句不再是小字。每个字占 3×3 格，撑满画面，周围的噪声还是正常大小，尺度对比本身就是"无穷"。',
  t: 0,
  cameraAt: () => ({ x: 50.5 * CELL, y: 0.5 * CELL, zoom: 1.0 }),
  scene(t) {
    return {
      camera: this.cameraAt(t),
      lines: [book('所有可能的句子', 40, -1, { scale: 3, weight: 600, sizeRatio: 0.74 })],
    };
  },
  fx: {
    light: { col: 50, row: 0.5, radius: 1100, darkness: 0.5, warmth: 0.2 },
    dof: { inner: 520, outer: 1250, blur: 5 },
    foreground: [{ x: 59.1 * CELL, y: 5.6 * CELL, ch: '书', size: 520, alpha: 0.14, depth: 2.0 }],
  },
};

// ─── C · 停（S07）：和第一版同一个画面 ───────────────────────────────────
const C = {
  ...byId.m1,
  id: 'v2-c',
  label: 'C · 停（S07），对比第一版',
  note: '和第一版样张同一个场景，只加了光、景深、灰尘和一个前景字。下方附第一版做对比。',
  fx: {
    light: { col: 66.5, row: 0, radius: 820, darkness: 0.55, warmth: 0.22 },
    dof: { inner: 420, outer: 1100, blur: 6 },
    foreground: [{ x: 72.6 * CELL, y: 3.1 * CELL, ch: '句', size: 480, alpha: 0.17, depth: 2.2 }],
  },
  compareWith: 'm1',
};

// ─── D · 富内斯的黑屋子（S09）：转暗 ─────────────────────────────────────
const D = {
  ...byId.m3,
  id: 'v2-d',
  label: 'D · 富内斯（S09），转暗',
  note: '原作里富内斯躺在一间黑屋子里。这一段整体转暗，只有一小圈烛光照出那些不停复制的细节，光圈外的字还在，只是看不清。',
  fx: {
    light: { col: 56, row: -60, radius: 560, darkness: 0.93, warmth: 0.34 },
    dof: { inner: 300, outer: 900, blur: 5 },
    foreground: [],
  },
  compareWith: 'm3',
};

// ─── E · 移动（S03 落地）：前景视差 ──────────────────────────────────────
const E = {
  ...byId.m2b,
  id: 'v2-e',
  label: 'E · 移动（S03 落地），前景视差',
  note: '前景的大字离镜头更近，移动时比墙滑得快，拖影也更长，墙就有了纵深。这一帧在减速段。',
  fx: {
    light: { col: 63.5, row: 0, radius: 950, darkness: 0.5, warmth: 0.2 },
    dof: null, // 移动帧只用运动模糊
    foreground: [
      { x: 51.8 * CELL, y: -1.5 * CELL, ch: '可', size: 520, alpha: 0.16, depth: 2.4 },
      { x: 62.3 * CELL, y: 3.5 * CELL, ch: '能', size: 420, alpha: 0.13, depth: 1.9 },
    ],
  },
  blur: true,
};

// ─── F · 署名（S14） ─────────────────────────────────────────────────────
const F = {
  ...byId.m4,
  id: 'v2-f',
  label: 'F · 署名（S14）',
  note: '光从上方偏左打下来，两行字和朱色署名在光里，四周沉下去。',
  fx: {
    light: { col: 519, row: -2, radius: 880, darkness: 0.55, warmth: 0.2 },
    dof: { inner: 420, outer: 1100, blur: 6 },
    foreground: [{ x: 515.5 * CELL, y: 1.9 * CELL, ch: '我', size: 460, alpha: 0.12, depth: 2.2, color: VERMILION }],
  },
  compareWith: 'm4',
};

export const moments = [A, B, C, D, E, F];
export const v1ById = byId;
