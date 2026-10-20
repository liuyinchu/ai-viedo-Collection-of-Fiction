// 确定性哈希。墙上每个位置的字、透明度、纸纹都由坐标哈希决定，渲染多少次都一样。

export function hash3(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** [0, 1) 的确定性随机数 */
export const rand = (x, y, seed = 0) => hash3(x, y, seed) / 4294967296;

const smooth = (t) => t * t * (3 - 2 * t);

/** 平滑的值噪声，用于纸面的大尺度斑驳 */
export function valueNoise(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const a = rand(x0, y0, seed), b = rand(x0 + 1, y0, seed);
  const c = rand(x0, y0 + 1, seed), d = rand(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
