// 配音出来之前，按台本字数估算每段的起止时间，供分镜和预览使用。
// 真实时间戳到了以后（audio/vo/timing.json），画面会自动改用真实值，这份估算就不再需要了。
// 同时把每段口播抽成 design/film/script.json，供分镜把画面对到具体的词上。
// 用法：node design/tools/estimate-timing.mjs（台本改了就重跑）

import { readFileSync, writeFileSync } from 'node:fs';

const CPS = 4.3;      // 平静语速：每秒 4.3 个字
const LEAD_IN = 1.2;  // 第一段开口前，只有光标在闪

const script = readFileSync('script/short-3min.md', 'utf8');
const re = /\*\*(S\d+)\*\*\n- 口播：(.+)\n(?:.*\n)*?- 段后停：([\d.]+)/g;
const segments = [];
const texts = [];
let t = LEAD_IN;
for (const [, id, text, pause] of script.matchAll(re)) {
  texts.push({ id, text, pauseAfter: +pause });
  const spoken = text.replace(/[，。：？、《》“”"…—\s]/g, '').length;
  const dur = +(spoken / CPS).toFixed(2);
  segments.push({ id, start: +t.toFixed(2), end: +(t + dur).toFixed(2), pauseAfter: +pause });
  t += dur + +pause;
}
const out = {
  source: 'estimate',
  note: `由 design/tools/estimate-timing.mjs 按 ${CPS} 字/秒估算，不是真实配音时长`,
  total: +t.toFixed(2),
  segments,
};
writeFileSync('design/film/timing.estimate.json', JSON.stringify(out, null, 2) + '\n');
// 分镜需要知道每段说的是什么，才能把"凝结"对到具体的词上
writeFileSync('design/film/script.json', JSON.stringify({
  note: '由 design/tools/estimate-timing.mjs 从 script/short-3min.md 抽取，不要手改',
  segments: texts,
}, null, 2) + '\n');
console.log(`${segments.length} segments, total ${out.total}s`);
