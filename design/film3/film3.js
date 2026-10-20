// 3 分钟版 · 第三版（字成画）的入口模块。接口在第一版 film.js 的基础上多一个 post()：
//
//   await load()          加载台本、时间轴、逐字时间、字体
//   duration()            全片秒数
//   cameraAt(t, scale)    镜头（scale = 输出宽度 / 1920）
//   render(ctx, t)        画第 t 秒的场景。运动模糊时每个子帧调用
//   post(ctx, t)          屏幕空间后期（景深、光、灰尘、压黑）。运动模糊平均之后调用一次

import { FRAME } from '../lib/palette.js';
import { loadFonts } from '../lib/fonts.js';
import { build } from './storyboard3.js';
import { renderScene3, post3 } from './compose3.js';

let board = null;

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

export async function load({ fonts = true } = {}) {
  const script = await json(new URL('../film/script.json', import.meta.url));
  let timing, words = {};
  try {
    timing = await json(new URL('../../audio/vo/timing.json', import.meta.url));
    await Promise.all(timing.segments.map(async (s) => {
      try { words[s.id] = await json(new URL(`../../audio/vo/${s.id}.words.json`, import.meta.url)); } catch {}
    }));
  } catch {
    timing = await json(new URL('../film/timing.estimate.json', import.meta.url));
  }
  board = build(timing, script, words);
  if (fonts) await loadFonts(board.lineTexts + '每次开口都是重新选一次叶三点十四分零一二三五侧面正的狗每片叶子条脉八年月日南方云那匹马根枝串颗葡萄呼吸选书句风我');
  return board;
}

export const duration = () => board.duration;
export const storyboard = () => board;

export function cameraAt(t, scale = 1) {
  const c = board.cameraAt(t);
  return { ...c, zoom: c.zoom * scale };
}

export function render(ctx, t) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const scene = board.sceneAt(t);
  scene.camera = { ...scene.camera, zoom: scene.camera.zoom * (W / FRAME.width) };
  renderScene3(ctx, W, H, scene);
}

export function post(ctx, t) {
  post3(ctx, ctx.canvas.width, ctx.canvas.height, board.postAt(t));
}
