// 预览播放器：实时渲染整片，配上当前这段口播的字幕。
// 有真实配音时（audio/vo/timing.json 和 audio/vo/Sxx.wav），按时间轴同步播放配音。
// ?stills=12.5,40,88  原尺寸、带运动模糊导出这几个时刻（给 design/tools/snap.mjs 用）

import { FRAME } from '../lib/palette.js';
import { renderWithMotionBlur } from '../lib/blur.js';
import * as film from './film3.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

async function exportStills(list) {
  document.body.classList.add('stills');
  const { width: W, height: H, fps } = FRAME;
  for (const t of list) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.dataset.id = `film-${t.toFixed(2).replace('.', '_')}`;
    $('stills').append(c);
    renderWithMotionBlur(c.getContext('2d'), W, H, (cc, tt) => film.render(cc, tt), (tt) => film.cameraAt(tt), t, { fps });
    film.post(c.getContext('2d'), t);
    await new Promise(requestAnimationFrame);
  }
  window.__ready = true;
}

async function main() {
  const board = await film.load();
  const D = board.duration;
  $('meta').innerHTML = `时长 <b>${fmt(D)}</b> · 时间轴：<b>${board.source === 'estimate' ? '按字数估算（配音还没出来）' : '真实配音'}</b>`;

  const stills = params.get('stills');
  if (stills) return exportStills(stills.split(',').map(Number));

  const view = $('view');
  const ctx = view.getContext('2d');
  const scrub = $('scrub');
  scrub.max = D;

  // 段落按钮
  const segButtons = {};
  for (const s of Object.values(board.texts)) {
    const b = document.createElement('button');
    b.textContent = s.id;
    b.title = s.text;
    b.onclick = () => seek(Math.max(0, startOf(s.id) - 0.6));
    $('segs').append(b);
    segButtons[s.id] = b;
  }
  function startOf(id) {
    for (let t = 0; t < D; t += 0.05) if (board.segmentAt(t)?.id === id) return t;
    return 0;
  }

  // 真实配音
  const audio = {};
  if (board.source !== 'estimate') {
    for (const id of Object.keys(board.texts)) audio[id] = new Audio(new URL(`../../audio/vo/${id}.wav`, import.meta.url));
  }
  function syncAudio(t, playing) {
    const seg = board.segmentAt(t);
    for (const [id, a] of Object.entries(audio)) {
      if (playing && seg?.id === id) {
        const want = t - seg.start;
        if (a.paused) { a.currentTime = want; a.play().catch(() => {}); }
        else if (Math.abs(a.currentTime - want) > 0.15) a.currentTime = want;
      } else if (!a.paused) a.pause();
    }
  }

  let t = 0, playing = false, anchor = 0, anchorT = 0, lastSeg = null;
  function seek(nt) {
    t = Math.min(D, Math.max(0, nt));
    anchor = performance.now(); anchorT = t;
    draw();
  }
  function setPlaying(p) {
    playing = p;
    $('play').textContent = p ? '暂停' : '播放';
    if (p && t >= D) t = 0;
    anchor = performance.now(); anchorT = t;
    syncAudio(t, playing);
  }
  function draw() {
    film.render(ctx, t);
    film.post(ctx, t);
    scrub.value = t;
    $('time').textContent = `${fmt(t)} / ${fmt(D)}`;
    const seg = board.segmentAt(t);
    if (seg?.id !== lastSeg) {
      lastSeg = seg?.id ?? null;
      $('caption').innerHTML = seg ? `<span class="id">${seg.id}</span>${board.texts[seg.id].text}` : '';
      for (const [id, b] of Object.entries(segButtons)) b.classList.toggle('on', id === lastSeg);
    }
  }
  function loop(now) {
    if (playing) {
      t = anchorT + (now - anchor) / 1000;
      if (t >= D) { t = D; setPlaying(false); }
      syncAudio(t, playing);
    }
    draw();
    requestAnimationFrame(loop);
  }

  $('play').onclick = () => setPlaying(!playing);
  scrub.oninput = () => { seek(+scrub.value); syncAudio(t, playing); };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    if (e.code === 'ArrowRight') seek(t + 2);
    if (e.code === 'ArrowLeft') seek(t - 2);
  });
  const t0 = params.get('t');
  if (t0) seek(+t0);
  window.__ready = true;
  requestAnimationFrame(loop);
}

main().catch((e) => { $('meta').textContent = `出错：${e.message}`; window.__error = String(e.stack || e); console.error(e); });
