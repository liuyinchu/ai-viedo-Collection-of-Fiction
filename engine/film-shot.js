// Preserve the design's reference blur exactly. Multiplane must not blur this output a second time.
import * as film from '../design/film/film.js';
import { renderWithMotionBlur } from '../design/lib/blur.js';
const canvas = document.querySelector('#film');
const scale = window.devicePixelRatio || 1;
canvas.width = Math.round(1920 * scale);
canvas.height = Math.round(1080 * scale);
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const spec = {
  duration: 1,
  fps: 30,
  post: { motionBlur: 1, grain: 0 },
  meta: { project: 'proj1-1019', timingSource: 'loading', motionBlur: 'design/lib/blur.js, 180 degree shutter, linear light, max 128 samples' },
  async setup() {
    const board = await film.load();
    spec.duration = film.duration();
    spec.meta.timingSource = board.source;
  },
  render(t) {
    renderWithMotionBlur(ctx, canvas.width, canvas.height,
      (target, time) => film.render(target, time),
      time => film.cameraAt(time, scale), t,
      { fps: 30, shutterAngle: 180, maxSamples: 128 });
  },
};
Shot.define(spec);
