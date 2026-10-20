// 3 分钟版的入口模块（docs/render-contract.md「画面代码的形状」）。
//
//   await load()          加载台本、时间轴、字体
//   duration()            全片秒数
//   cameraAt(t, scale)    镜头（scale = 输出宽度 / 1920）
//   render(ctx, t)        画第 t 秒，分辨率取 ctx.canvas 的尺寸
//
// 时间轴：优先读 audio/vo/timing.json（真实配音）和 audio/vo/Sxx.words.json（逐字时间），
// 没有就用 design/film/timing.estimate.json（按字数估算）。

import { FRAME } from '../lib/palette.js';
import { renderScene } from '../lib/compose.js';
import { loadFonts } from '../lib/fonts.js';
import { build } from './storyboard.js';

let board = null;

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

export async function load({ fonts = true } = {}) {
  const script = await json(new URL('./script.json', import.meta.url));
  let timing, words = {};
  try {
    timing = await json(new URL('../../audio/vo/timing.json', import.meta.url));
    // 逐字时间（ASR 估计），有就用来把凝结对到具体的字上
    await Promise.all(timing.segments.map(async (s) => {
      try { words[s.id] = await json(new URL(`../../audio/vo/${s.id}.words.json`, import.meta.url)); } catch {}
    }));
  } catch {
    timing = await json(new URL('./timing.estimate.json', import.meta.url));
  }
  board = build(timing, script, words);
  if (fonts) await loadFonts(board.lineTexts + '三点十四分零一二三五侧面正的狗每片叶子条脉八年月日南方云那匹马根枝串颗葡萄呼吸');
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
  renderScene(ctx, W, H, scene);
}
