import { NOISE_CHARS } from './charset.js';

/**
 * 等字体加载完再画：Canvas 不会等网络字体。text 是会用到的非噪声文字。
 * 页面需要先声明字体（见 design/film/fonts.css）。
 */
export async function loadFonts(text) {
  await Promise.all([
    document.fonts.load('300 40px "Noto Serif SC"', NOISE_CHARS),
    document.fonts.load('400 40px "Noto Serif SC"', text),
    document.fonts.load('500 40px "Noto Serif SC"', text),
    document.fonts.load('600 40px "Noto Serif SC"', text),
    document.fonts.load('350 40px "Noto Sans SC"', text),
    document.fonts.load('400 40px "Noto Sans SC"', text),
  ]);
  await document.fonts.ready;
}
