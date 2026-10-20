// 运动模糊的参考实现：180° 快门，在曝光区间内采样子帧，在线性光空间中平均。
// 正式管线由 Codex 实现（docs/render-contract.md）；这里用于样张，也作为画面验收的基准。

import { makeCanvas } from './wall.js';

const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLinear[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const LUT = 4096;
const toSrgb = new Uint8ClampedArray(LUT + 1);
for (let i = 0; i <= LUT; i++) {
  const l = i / LUT;
  toSrgb[i] = Math.round((l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055) * 255);
}

/** 曝光区间内镜头在屏幕上移动了多少像素 */
export function shutterTravel(cameraAt, t, shutter) {
  const a = cameraAt(t), b = cameraAt(t + shutter);
  const z = (a.zoom + b.zoom) / 2;
  return Math.hypot(b.x - a.x, b.y - a.y) * z + Math.abs(Math.log(b.zoom / a.zoom)) * 1000;
}

/**
 * 渲染带运动模糊的一帧到 ctx。
 * draw(ctx, t) 必须是 t 的纯函数。
 * 自适应采样：样本间距不超过约 1.5 像素，静止时只采 1 个样本。
 */
export function renderWithMotionBlur(ctx, W, H, draw, cameraAt, t, { fps = 30, shutterAngle = 180, maxSamples = 128 } = {}) {
  const shutter = (shutterAngle / 360) / fps;
  const travel = shutterTravel(cameraAt, t, shutter);
  const samples = Math.max(1, Math.min(maxSamples, Math.ceil(travel / 1.5)));
  if (samples === 1) {
    draw(ctx, t);
    return { samples, travel };
  }
  const off = makeCanvas(W, H);
  const octx = off.getContext('2d', { willReadFrequently: true });
  const acc = new Float32Array(W * H * 3);
  for (let k = 0; k < samples; k++) {
    draw(octx, t + shutter * (k + 0.5) / samples);
    const d = octx.getImageData(0, 0, W, H).data;
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
      acc[j] += toLinear[d[i]];
      acc[j + 1] += toLinear[d[i + 1]];
      acc[j + 2] += toLinear[d[i + 2]];
    }
  }
  const out = ctx.createImageData(W, H);
  const k = LUT / samples;
  for (let i = 0, j = 0; i < out.data.length; i += 4, j += 3) {
    out.data[i] = toSrgb[Math.min(LUT, Math.round(acc[j] * k))];
    out.data[i + 1] = toSrgb[Math.min(LUT, Math.round(acc[j + 1] * k))];
    out.data[i + 2] = toSrgb[Math.min(LUT, Math.round(acc[j + 2] * k))];
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return { samples, travel };
}
