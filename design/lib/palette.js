// 视觉系统的常量。数值来源：docs/brief.md「视觉系统」。

export const PAPER = '#EAE3D2';     // 纸：墙面底色
export const INK = '#1D1B18';       // 墨：有意义的字
export const VERMILION = '#A8322A'; // 朱：唯一强调色（光标、凝结瞬间、署名）

export const NOISE_ALPHA = 0.15;    // 淡墨：噪声字的平均不透明度（样张 v1 的 0.18 太抢）

// 墙的网格。1 格 = CELL 个墙面单位；镜头 zoom = 1 时 1 墙面单位 = 1 像素。
export const CELL = 40;

export const FONTS = {
  serif: '"Noto Serif SC", serif', // 书的世界
  sans: '"Noto Sans SC", sans-serif', // 我
};

export const FRAME = { width: 1920, height: 1080, fps: 30 };
