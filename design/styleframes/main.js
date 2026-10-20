import { FRAME } from '../lib/palette.js';
import { loadFonts } from './fonts.js';
import { renderScene } from '../lib/compose.js';
import { renderWithMotionBlur } from '../lib/blur.js';
import { moments } from './moments.js';

const params = new URLSearchParams(location.search);
const only = params.get('m');           // ?m=m2 只渲染一张
const solo = params.has('solo');        // ?solo 截图模式
if (solo) document.body.classList.add('solo');

const status = document.getElementById('status');
const list = only ? moments.filter((m) => m.id === only) : moments;

async function main() {
  await loadFonts(moments.map((m) => m.scene(m.t).lines.map((l) => l.text).join('')).join('') + '三点十四分零一二三五侧面正的狗每片叶子条脉八年月日南方云那匹马根枝串颗葡萄呼吸');
  const { width: W, height: H, fps } = FRAME;
  const host = document.getElementById('frames');
  for (const m of list) {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.dataset.id = m.id;
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${m.label}</b>${m.note}`;
    fig.append(canvas, cap);
    host.append(fig);
    status.textContent = `渲染 ${m.label}……`;
    await new Promise(requestAnimationFrame);
    const ctx = canvas.getContext('2d');
    const draw = (c, t) => renderScene(c, W, H, m.scene(t));
    const t0 = performance.now();
    const info = renderWithMotionBlur(ctx, W, H, draw, (t) => m.cameraAt(t), m.t, { fps });
    console.log(m.id, `samples=${info.samples}`, `travel=${info.travel.toFixed(1)}px`, `${(performance.now() - t0).toFixed(0)}ms`);
  }
  status.textContent = '';
  window.__ready = true;
}

main().catch((e) => {
  status.textContent = `出错：${e.message}`;
  window.__error = String(e.stack || e);
  console.error(e);
});
