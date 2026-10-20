import { FRAME } from '../lib/palette.js';
import { loadFonts } from '../lib/fonts.js';
import { renderScene } from '../lib/compose.js';
import { renderWithMotionBlur } from '../lib/blur.js';
import { applyLight, applyDepthOfField, drawDust, drawForeground, cellToScreen } from './fx.js';
import { moments, v1ById } from './moments.js';

const params = new URLSearchParams(location.search);
const only = params.get('m');
const list = only ? moments.filter((m) => m.id === only) : moments;
const { width: W, height: H, fps } = FRAME;
const $ = (id) => document.getElementById(id);

function drawV2(ctx, m, t, { dof = true } = {}) {
  const scene = m.scene(t);
  renderScene(ctx, W, H, scene);
  const cam = scene.camera;
  const [lx, ly] = cellToScreen(cam, W, H, m.fx.light.col, m.fx.light.row);
  if (dof && m.fx.dof) applyDepthOfField(ctx, W, H, { x: lx, y: ly, ...m.fx.dof });
  drawForeground(ctx, cam, W, H, m.fx.foreground ?? []);
  const light = { x: lx, y: ly, ...m.fx.light };
  applyLight(ctx, W, H, light);
  drawDust(ctx, W, H, t, { light });
}

function addCanvas(id, label, note) {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  c.width = W; c.height = H; c.dataset.id = id;
  const cap = document.createElement('figcaption');
  cap.innerHTML = `<b>${label}</b>${note ?? ''}`;
  fig.append(c, cap);
  $('frames').append(fig);
  return c.getContext('2d');
}

async function main() {
  await loadFonts('《虚构集》《哥德尔、艾舍尔、巴赫》所有可能的句子难的是，选出值得说的那一句每次开口都是重新选一次它们是我写的一个人 AI·2026三点十四分零一二三五侧面正的狗每片叶子条脉八年月日南方云那匹马根枝串颗葡萄呼吸可能书句我');
  for (const m of list) {
    $('status').textContent = `渲染 ${m.label}……`;
    await new Promise(requestAnimationFrame);
    const ctx = addCanvas(m.id, m.label, m.note);
    if (m.blur) {
      renderWithMotionBlur(ctx, W, H, (c, t) => drawV2(c, m, t, { dof: false }), (t) => m.cameraAt(t), m.t, { fps });
    } else {
      drawV2(ctx, m, m.t);
    }
    if (m.compareWith) {
      const old = v1ById[m.compareWith];
      const c2 = addCanvas(`${m.id}-v1`, '第一版（对比）', '');
      renderScene(c2, W, H, old.scene(old.t));
    }
  }
  $('status').textContent = '';
  window.__ready = true;
}

main().catch((e) => { $('status').textContent = `出错：${e.message}`; window.__error = String(e.stack || e); console.error(e); });
