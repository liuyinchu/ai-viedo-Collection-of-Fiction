// 从分镜导出音效提示点 design/cues.json（docs/render-contract.md「音效提示点」）。
// 时间轴优先用 audio/vo/timing.json，没有就用估算。真实配音到了以后重跑一次。
// 用法：node design/tools/export-cues.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from '../film/storyboard.js';

const real = 'audio/vo/timing.json';
const timing = JSON.parse(readFileSync(existsSync(real) ? real : 'design/film/timing.estimate.json', 'utf8'));
const script = JSON.parse(readFileSync('design/film/script.json', 'utf8'));
const words = {};
if (existsSync(real)) {
  for (const s of timing.segments) {
    const f = `audio/vo/${s.id}.words.json`;
    if (existsSync(f)) words[s.id] = JSON.parse(readFileSync(f, 'utf8'));
  }
}
const board = build(timing, script, words);

const segs = timing.segments;
const segOf = (t) => [...segs].reverse().find((s) => s.start <= t) ?? segs[0];
const r = (x) => +x.toFixed(3);

const out = {
  note: '由 design/tools/export-cues.mjs 从分镜导出，不要手改。offset 相对所在段落的开始；t 是全片绝对时间（随时间轴而变）。',
  timing: existsSync(real) ? real : 'design/film/timing.estimate.json',
  wordSync: board.wordSync,
  duration: r(board.duration),
  types: {
    move: '镜头移动：很轻的气流声，长度 = dur，跟镜头的缓入缓出同形',
    settle: '一行字凝结完成：一声细小的纸响或轻击',
    collapse: 'S10 富内斯的过度一瞬间塌缩：短促、向内收的声音',
    dim: 'S16 所有有意义的字暗下去：环境声跟着变空',
    pullback: 'S19 最后的拉远：越来越远、越来越静，直到片尾',
  },
  cues: board.cues.map((c) => {
    const s = segOf(c.t);
    return { type: c.type, seg: s.id, offset: r(c.t - s.start), t: r(c.t), ...(c.dur ? { dur: r(c.dur) } : {}) };
  }),
};
writeFileSync('design/cues.json', JSON.stringify(out, null, 2) + '\n');
console.log(`${out.cues.length} cues → design/cues.json (${out.timing}; 逐字对齐 ${board.wordSync} 段)`);
