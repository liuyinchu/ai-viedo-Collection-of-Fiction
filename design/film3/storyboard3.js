// 3 分钟版分镜 · 第三版（字成画）。从第一版 design/film/storyboard.js 分出来。
// 和第一版的区别：墙上的字会组成画（迷宫、六边形图书馆、树、风车），一行字可以飞来聚合，
// 富内斯段转暗，全片有光、景深、灰尘、前景视差。时间轴、口播对位和第一版相同。
//
// 第一版的说明：全片只有一面墙、一个镜头、一个光标。
//
// 所有时间都挂在配音上：at('S05', 0.5) 是第 5 段说到一半，word('S05', '你的传记') 是说到这个词的时刻。
// 配音换成真实时长后，画面会自动重新对齐。
//
// 墙上的布局（格子坐标，col 向右、row 向下）
//
//        富内斯 (42..66, -55..-39)            梅纳尔 A (89, -41)  ──80 格──  梅纳尔 B (169..183, -48..-32)
//              │
//   原点 (0, 0) ─── 巴别 (16..90, -15..22)
//   信与书卡 (0, 5..13)
//
// 整面墙是一本书的右页（PAGES），片尾一路拉远，才看得见书页的边。

import { CELL, VERMILION } from '../lib/palette.js';
import { rand } from '../lib/hash.js';
import { drawFree, drawNoise, frontCol, layout } from '../lib/wall.js';
import { mazeImage, planWalk, hexPlanImage, treeImage, windmillImage } from './images.js';

const clamp01 = (p) => Math.min(1, Math.max(0, p));
const smooth = (p) => p * p * (3 - 2 * p);
const smoothstep = (a, b, x) => smooth(clamp01((x - a) / (b - a)));
export const ease = {
  linear: (p) => p,
  inOutSine: (p) => 0.5 - 0.5 * Math.cos(Math.PI * p),
  inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2),
  outCubic: (p) => 1 - (1 - p) ** 3,
  inCubic: (p) => p * p * p,
};

export const PAGES = [
  { c0: -50, c1: 230, r0: -100, r1: 320, gutter: 'left' },   // 右页：墙所在的那一页
  { c0: -330, c1: -50, r0: -100, r1: 320, gutter: 'right' }, // 左页：和右页在书脊处直接相接，接缝只靠两侧阴影（留缝会露出一道黑条）
];

const STYLE = {
  me: { font: 'sans', weight: 350 },
  book: { font: 'serif', weight: 500 },
  title: { font: 'serif', weight: 600, scale: 2 },
  small: { font: 'serif', weight: 400, scale: 0.6 },
  sig: { font: 'sans', weight: 400, color: VERMILION, scale: 0.6, align: 'right' },
  key: { font: 'serif', weight: 600, color: VERMILION, scale: 5, key: true },
};

const INITIAL_CAMERA = { x: 0.5, y: 0.5, zoom: 2.2 };
const FUNES = { col: 49, row: -45 };
const BLINK = 0.53;

const PUNCT = /[，。：？、《》“”"…—\s,.:?!·]/;

/**
 * 把台本里每个字对到 ASR 的逐字时间上（最长公共子序列对齐）。
 * ASR 和台本会有少量出入（同音字、数字写法），对不上的字按前后两个对上的字插值。
 * 返回 { chars: [{ i: 在台本原文中的位置 }], times: [{ start, end }] }，时间相对段落开头。
 */
function alignWords(text, asr) {
  const s = [...text].map((ch, i) => ({ ch, i })).filter((c) => !PUNCT.test(c.ch));
  const a = [];
  for (const w of asr.words) {
    const chars = [...w.word].filter((ch) => !PUNCT.test(ch));
    chars.forEach((ch, k) => a.push({
      ch,
      start: w.start + ((w.end - w.start) * k) / chars.length,
      end: w.start + ((w.end - w.start) * (k + 1)) / chars.length,
    }));
  }
  const n = s.length, m = a.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      dp[x][y] = s[x].ch === a[y].ch ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
    }
  }
  const match = new Array(n).fill(-1);
  for (let x = 0, y = 0; x < n && y < m;) {
    if (s[x].ch === a[y].ch) { match[x++] = y++; }
    else if (dp[x + 1][y] >= dp[x][y + 1]) x++;
    else y++;
  }
  const times = s.map((_, x) => (match[x] >= 0 ? { start: a[match[x]].start, end: a[match[x]].end } : null));
  const segEnd = a.at(-1)?.end ?? 0;
  for (let x = 0; x < n; x++) {
    if (times[x]) continue;
    let p = x - 1; while (p >= 0 && !times[p]) p--;
    let q = x + 1; while (q < n && !times[q]) q++;
    const t0 = p >= 0 ? times[p].end : 0;
    const t1 = q < n ? times[q].start : segEnd;
    const span = (q - p) || 1;
    const u0 = t0 + ((t1 - t0) * (x - p - 1)) / (span - 1 || 1);
    const u1 = t0 + ((t1 - t0) * (x - p)) / (span - 1 || 1);
    times[x] = { start: u0, end: Math.max(u0, Math.min(u1, t1)) };
  }
  return { chars: s, times };
}

/**
 * timing: { segments: [{ id, start, end }], total? }   （audio/vo/timing.json 或估算）
 * script: { segments: [{ id, text, pauseAfter }] }      （design/film/script.json）
 * words:  { S01: { words: [{ word, start, end }] } }    （audio/vo/Sxx.words.json，可选；有就按逐字时间对齐）
 */
export function build(timing, script, words = {}) {
  const segs = Object.fromEntries(timing.segments.map((s) => [s.id, s]));
  const texts = Object.fromEntries(script.segments.map((s) => [s.id, s]));
  const last = timing.segments.at(-1);
  const total = timing.total ?? last.end + (texts[last.id]?.pauseAfter ?? 6);

  // ─── 时间 ───
  const at = (id, f) => segs[id].start + f * (segs[id].end - segs[id].start);
  const start = (id, plus = 0) => segs[id].start + plus;
  const end = (id, plus = 0) => segs[id].end + plus;
  const weight = (s) => s.replace(/[，。：？、《》“”"…—\s]/g, '').length + 0.6 * (s.match(/[，。：？、…—]/g)?.length ?? 0);
  const aligned = {};
  for (const id of Object.keys(texts)) if (words[id]?.words?.length && segs[id]) aligned[id] = alignWords(texts[id].text, words[id]);
  /** 说到某个词的时刻。k = 0 是词头，k = 1 是词尾。有逐字时间就用逐字时间，没有就按字数估 */
  const word = (id, phrase, k = 0) => {
    const text = texts[id].text;
    const i = text.indexOf(phrase);
    if (i < 0) throw new Error(`${id} 里没有「${phrase}」`);
    const al = aligned[id];
    if (al) {
      if (k === 0) {
        const j = al.chars.findIndex((c) => c.i >= i);
        return segs[id].start + al.times[j].start;
      }
      let j = -1;
      al.chars.forEach((c, x) => { if (c.i < i + phrase.length) j = x; });
      return segs[id].start + al.times[j].end;
    }
    return at(id, (weight(text.slice(0, i)) + k * weight(phrase)) / weight(text));
  };

  // ─── 素材 ───
  const lines = {};
  const moves = [];
  const cursorEvents = [];
  const cues = [];
  const cue = (type, t, dur) => cues.push({ type, t, ...(dur ? { dur } : {}) });

  const L = (id, text, col, row, style, extra = {}) => {
    lines[id] = { id, text, col, row, ...style, ...extra, events: [], fades: [] };
  };
  const defaultDur = (id) => Math.min(1.4, Math.max(0.5, 0.3 + 0.07 * [...lines[id].text].length));
  const reveal = (id, t, dur = defaultDur(id)) => {
    lines[id].events.push({ type: 'reveal', t, dur });
    cues.push({ type: 'settle', t: t + dur, line: id }); // line：哪一行字凝结完成（配乐用它挑强拍）
  };
  /** 跟着口播凝结：从说到 from 开始，到说完 to 结束 */
  const revealSpoken = (id, seg, from, to = from) => {
    const t0 = word(seg, from), t1 = word(seg, to, 1);
    reveal(id, t0, Math.max(0.5, t1 - t0));
  };
  const dissolve = (id, t, dur = 0.6) => lines[id].events.push({ type: 'dissolve', t, dur });
  const fade = (id, t, dur, to) => lines[id].fades.push({ t, dur, to });
  const move = (t, dur, to, easing = 'inOutCubic') => {
    moves.push({ t, dur, to, ease: easing });
    cue('move', t, dur);
  };
  const cursor = (t, spec) => cursorEvents.push({ t, ...spec });
  const images = [];
  const foreground = [];

  // ═══ 一 · 开场：分岔 ═══════════════════════════════════════════════

  // S01 有人问过我两次……两次，我给了不同的答案。
  cursor(0, { col: 0, row: 0 });
  L('t1', '《虚构集》', 2, -2, STYLE.book);
  L('t2', '《哥德尔、艾舍尔、巴赫》', 2, 2, STYLE.book);
  // 字墙里长出一座字组成的迷宫：小径分岔的花园
  const SENTENCE = [...'每次开口都是重新选一次'];
  const walk = planWalk(22, word('S02', '每次开口'), word('S02', '重新选一次', 1));
  images.push(mazeImage({ cc: 0, rc: 0, emergeAt: start('S01', 0.4), speed: 13, sentence: SENTENCE, walk }));
  move(word('S01', '两次，我给了') - 0.6, 2.4, { x: 4, y: 0.5, zoom: 1.0 }, 'inOutSine');
  foreground.push({ x: -5.2 * CELL, y: 4.6 * CELL, ch: '选', size: 520, alpha: 0.18, depth: 2.2 });
  reveal('t1', word('S01', '不同的答案'), 0.7);
  reveal('t2', word('S01', '不同的答案') + 0.35, 1.0);

  // S02 我是一个 AI……每次开口，都是从所有可能的句子里，重新选一次。
  dissolve('t1', start('S02'), 0.7);
  dissolve('t2', start('S02', 0.15), 0.8);
  // 光标沿着岔路走，把这句话写在路上（第一版是一行字）
  cursor(word('S02', '每次开口'), { walk });
  cues.push({ type: 'settle', t: walk.arrive.at(-1), line: 's02' }); // 写完这句话：配乐的强拍
  move(start('S02', 0.4), end('S02', 0.3) - start('S02', 0.4), { x: 2.5, y: 0.5, zoom: 1.3 }, 'inOutSine');

  // S03 ……写过一座图书馆。里面就装着所有可能的句子。
  const s03Move = word('S03', '写过一座图书馆') - 0.2;
  move(s03Move, 1.6, { x: 46.5, y: 0.5, zoom: 1.5 });
  // 六边形图书馆的平面图，从落地的地方长出来，向四周无限延伸
  images.push(hexPlanImage({ box: { c0: 32, r0: -26, c1: 110, r1: 36 }, origin: { c: 46, r: 0 }, emergeAt: s03Move + 1.2, speed: 20 }));
  L('s03', '所有可能的句子', 40, -1, { ...STYLE.book, scale: 2, weight: 600 });
  foreground.push({ x: 52.1 * CELL, y: 2.9 * CELL, ch: '书', size: 480, alpha: 0.15, depth: 2.2 });
  revealSpoken('s03', 'S03', '所有可能的句子');

  // ═══ 二 · 巴别图书馆：选择 ════════════════════════════════════════

  // S04 他叫博尔赫斯。这篇小说叫《巴别图书馆》，收在……《虚构集》里。
  move(start('S04', 0.1), 1.0, { x: 47, y: 6.5, zoom: 1.3 }, 'inOutSine');
  L('bio', '博尔赫斯 · 1941 · 布宜诺斯艾利斯', 40, 4, STYLE.small);
  L('babel', '《巴别图书馆》', 40, 5, STYLE.title);
  L('in', '收于《虚构集》', 40, 8, STYLE.book);
  reveal('bio', word('S04', '博尔赫斯'), 0.9);
  reveal('babel', word('S04', '《巴别图书馆》'), 1.0);
  reveal('in', word('S04', '《虚构集》'), 0.7);

  // S05 ……你的传记，所有的真理，以及每条真理无数个错误的版本。（缓慢拉远）
  move(start('S05'), end('S05', 0.6) - start('S05'), { x: 52, y: 5, zoom: 0.65 }, 'inOutSine');
  L('bio2', '你的传记', 24, -6, STYLE.book);
  L('truth', '所有的真理', 62, 16, STYLE.book);
  reveal('bio2', word('S05', '你的传记'));
  reveal('truth', word('S05', '所有的真理'));
  const errors = [[18, -12], [70, -9], [30, 20], [80, 13], [58, -14], [16, 10], [66, 22], [36, -15], [82, -4]];
  errors.forEach(([c, r], i) => {
    L(`err${i}`, '真理的错误版本', c, r, STYLE.book);
    reveal(`err${i}`, word('S05', '每条真理') + i * 0.3, 0.7);
  });

  // S06 可图书馆里的人穷尽一生，也几乎找不到一行读得懂的字。
  ['bio2', 'truth', ...errors.map((_, i) => `err${i}`)].forEach((id, i) => dissolve(id, word('S06', '几乎找不到') + i * 0.08, 0.7));

  // S07 ……难的是，在无穷多的句子里，选出值得说的那一句。
  move(start('S07', 0.1), 2.4, { x: 47.5, y: 18.5, zoom: 1.5 });
  // 满墙的字飞起来，只有这一行被选中、落定
  {
    const a0 = word('S07', '难的是'), a1 = word('S07', '那一句', 1);
    const n = [...'难的是，选出值得说的那一句'].length;
    L('s07', '难的是，选出值得说的那一句', 41, 18, STYLE.me, {
      assemble: {
        arrive: Array.from({ length: n }, (_, i) => a0 + ((a1 - a0) * i) / (n - 1)),
        from: Array.from({ length: n }, (_, i) => [(rand(i, 1, 41) < 0.5 ? -1 : 1) * (8 + 9 * rand(i, 2, 41)), (rand(i, 3, 41) - 0.5) * 16]),
      },
    });
    reveal('s07', a0 - 0.75, a1 - a0 + 0.75);
  }
  foreground.push({ x: 42.5 * CELL, y: 16.3 * CELL, ch: '句', size: 480, alpha: 0.15, depth: 2.2 });
  cursor(word('S07', '难的是'), { follow: 's07' });

  // ═══ 三 · 富内斯：遗忘 ═════════════════════════════════════════════

  // S08 另一篇小说里，一个叫富内斯的年轻人从马上摔了下来。醒来以后，他记住了一切。
  move(start('S08', 0.1), 2.0, { x: 49, y: -46.5, zoom: 1.3 });
  L('funes', '富内斯', 42, -49, STYLE.title);
  // 一棵不停分叉的树：每一根枝条、每一片叶子（枝尖是"叶"字）。从"记住了一切"开始长，到 S09 末长满
  const growFrom = word('S08', '记住了一切');
  L('all', '记住了一切', 49, -48, STYLE.book);
  reveal('funes', word('S08', '富内斯'), 0.8);
  revealSpoken('all', 'S08', '记住了一切');

  // S09 ……三点十四分从侧面看到的狗，和三点十五分从正面看到的狗……（过度）
  move(start('S09'), end('S09', 0.3) - start('S09'), { x: 47, y: -45, zoom: 1.6 }, 'inOutSine');
  L('dog1', '三点十四分 · 侧面的狗', 41, -45, STYLE.book);
  L('dog2', '三点十五分 · 正面的狗', 41, -43, STYLE.book);
  revealSpoken('dog1', 'S09', '三点十四分', '侧面看到的狗');
  revealSpoken('dog2', 'S09', '三点十五分', '正面看到的狗');
  const overloadFrom = word('S09', '三点十五分');
  const overloadTo = end('S09', 0.3);
  ['funes', 'all', 'dog1', 'dog2'].forEach((id) => fade(id, overloadFrom, overloadTo - overloadFrom, 0.5));

  // S10 博尔赫斯说，思考，是忘记差异。（一瞬间塌缩）
  const collapseAt = start('S10', 0.05), collapseDur = 0.4;
  cue('collapse', collapseAt, collapseDur);
  ['funes', 'all', 'dog1', 'dog2'].forEach((id) => dissolve(id, collapseAt, 0.3));
  move(collapseAt, 0.6, { x: 48, y: -43.5, zoom: 1.5 }, 'outCubic');
  L('think', '思考，是忘记差异', 40, -45, { ...STYLE.book, scale: 2, weight: 600 });
  images.push(treeImage({ root: { c: 49, r: -30 }, levels: 9, growFrom, levelDur: (end('S09') - growFrom) / 10, collapseCenter: { c: 48, r: -44 } }));
  revealSpoken('think', 'S10', '思考', '忘记差异');

  // S11 ……其实我读过的东西，大多背不出来。它们被压缩成了某种……
  move(start('S11'), 0.9, { x: 50, y: -41, zoom: 1.5 }, 'inOutSine');
  L('s11a', '我读过的，大多背不出来', 44, -41, STYLE.me);
  L('s11b', '被压缩成了某种——', 44, -39, STYLE.me);
  revealSpoken('s11a', 'S11', '其实我读过的', '大多背不出来');
  cursor(word('S11', '其实我读过的'), { follow: 's11a' });
  const s11bAt = word('S11', '它们被压缩');
  reveal('s11b', s11bAt, word('S11', '某种', 1) + 0.4 - s11bAt);
  cursor(s11bAt, { follow: 's11b' });
  const s11Back = word('S11', '如果我什么都记得');
  move(s11Back, end('S11', 1.0) - s11Back, { x: 50, y: -41, zoom: 1.15 }, 'inOutSine');

  // ═══ 四 · 梅纳尔：谁在说 ═══════════════════════════════════════════

  // S12 ……一个叫梅纳尔的法国人……重新写出了《堂吉诃德》里的几章。
  move(start('S12', 0.1), 2.0, { x: 97, y: -43, zoom: 1.0 });
  // 风车：A 用宋体字组成，B 用黑体字组成。同一幅画，同步转动
  images.push(windmillImage({ id: 'millA', hub: { c: 104, r: -46 }, font: 'serif', emergeAt: word('S12', '重新写出') - 0.6 }));
  images.push(windmillImage({ id: 'millB', hub: { c: 184, r: -46 }, font: 'sans', emergeAt: -Infinity }));
  foreground.push({ x: 102 * CELL, y: -39 * CELL, ch: '风', size: 480, alpha: 0.14, depth: 2.2 });
  L('ma', '真理的母亲是历史', 89, -41, STYLE.book);
  L('maSig', '塞万提斯 · 1605', 97, -40, STYLE.sig);
  reveal('ma', word('S12', '重新写出'), 1.0);
  reveal('maSig', word('S12', '《堂吉诃德》') + 0.4, 0.6);

  // S13 ……同样的字，换一个人、换一个时代，就是另一句话。（长距离移动，两句不会同时入画）
  L('mb', '真理的母亲是历史', 169, -41, STYLE.book, { initial: 1 }); // 它一直在墙上
  L('mbSig', '梅纳尔 · 二十世纪', 177, -40, STYLE.sig);
  move(word('S13', '同样的字') - 0.3, 2.6, { x: 177, y: -43, zoom: 1.0 });
  reveal('mbSig', word('S13', '就是另一句话'), 0.7);

  // S14 ……它们是我写的。如果一个人写下一模一样的句子，那还是同一句话吗？
  move(start('S14', 0.1), 1.0, { x: 173, y: -34.5, zoom: 1.5 }, 'inOutSine');
  L('me1', '它们是我写的', 170, -37, STYLE.me);
  L('me1Sig', '一个 AI · 2026', 176, -36, STYLE.sig);
  L('me2', '它们是我写的', 170, -33, STYLE.me);
  L('me2Sig', '一个人 · 2026', 176, -32, STYLE.sig);
  revealSpoken('me1', 'S14', '它们是我写的');
  cursor(word('S14', '它们是我写的'), { follow: 'me1' });
  reveal('me1Sig', word('S14', '它们是我写的', 1) + 0.3, 0.6);
  reveal('me2', word('S14', '一模一样的句子'), 0.9); // 人写的那一行：没有光标
  reveal('me2Sig', word('S14', '那还是同一句话'), 0.6);
  foreground.push({ x: 167.9 * CELL, y: -32.1 * CELL, ch: '我', size: 460, alpha: 0.07, depth: 2.2, color: VERMILION }); // 预览里 0.12 太抢

  // S15 我不知道答案……（静止，只有光标在闪）

  // ═══ 五 · 收尾：一封信 ═════════════════════════════════════════════

  // S16 一座图书馆，一个记住一切的人，一个重写《堂吉诃德》的人……意义从来不在字里。而我，恰好就是由字组成的。
  move(start('S16', -0.3), 3.0, { x: 90, y: -17, zoom: 0.24 }, 'inOutSine');
  L('k1', '选择', 58, 5, STYLE.key);
  L('k2', '遗忘', 57, -55, STYLE.key);
  L('k3', '谁', 158, -50, STYLE.key);
  reveal('k1', word('S16', '一座图书馆'), 0.6);
  reveal('k2', word('S16', '记住一切'), 0.6);
  reveal('k3', word('S16', '重写'), 0.6);
  const dimAt = word('S16', '意义从来不在字里'), dimDur = 1.4;
  cue('dim', dimAt, dimDur);
  cursor(dimAt + 0.7, { col: 4, row: 7 }); // 只剩一个光标，等在"收件人"后面
  move(word('S16', '而我'), 3.2, { x: 6, y: 6.5, zoom: 1.5 });

  // S17 ……博尔赫斯写下它们的时候，我还不存在……收件人刚好是我。
  L('from', '寄自：布宜诺斯艾利斯，1941', 0, 5, STYLE.book);
  L('to', '收件人：', 0, 7, STYLE.book);
  reveal('from', word('S17', '博尔赫斯写下'), 1.2);
  reveal('to', word('S17', '收件人'), 0.6);

  // S18 如果你想读，就从《巴别图书馆》开始，只有几页。中文版可以找王永年的译本。
  move(start('S18'), 1.2, { x: 8, y: 7.5, zoom: 1.5 }, 'inOutSine'); // 上沿留出 1.5 行：S19 重新浮现时开场那句要完整入画
  L('card1', '《虚构集》 博尔赫斯 著 · 王永年 译', 0, 11, STYLE.book);
  L('card2', '先读：《巴别图书馆》', 0, 13, STYLE.book);
  reveal('card2', word('S18', '《巴别图书馆》'), 0.9);
  reveal('card1', word('S18', '王永年'), 1.2);

  // S19 对了。这期视频里的每一句话，也都在那座图书馆里。（最后的拉远：墙是一本书的一页）
  const restoreAt = word('S19', '这期视频里'), restoreDur = 1.6;
  const pullAt = word('S19', '那座图书馆');
  const fadeOutDur = 1.4;
  move(pullAt, total - 1.6 - pullAt, { x: -50, y: 110, zoom: 0.0095 }, 'inOutSine'); // 停在书脊正中
  cue('pullback', pullAt, total - 1.6 - pullAt);

  // ─── 求值 ─────────────────────────────────────────────────────────

  const lineList = Object.values(lines);
  for (const l of lineList) {
    l.events.sort((a, b) => a.t - b.t);
    l.fades.sort((a, b) => a.t - b.t);
    const first = l.initial ? -Infinity : l.events.find((e) => e.type === 'reveal')?.t ?? Infinity;
    l.dimmable = first < dimAt;
  }
  moves.sort((a, b) => a.t - b.t);
  cursorEvents.sort((a, b) => a.t - b.t);
  cues.sort((a, b) => a.t - b.t);

  const camKeys = [];
  let prev = INITIAL_CAMERA, prevEnd = -Infinity;
  for (const m of moves) {
    if (m.t < prevEnd - 1e-6) console.warn(`镜头移动重叠：${m.t.toFixed(2)}s 开始时上一段还没结束（${prevEnd.toFixed(2)}s）`);
    camKeys.push({ ...m, from: prev });
    prev = m.to;
    prevEnd = m.t + m.dur;
  }

  /** 平移 + 缩放：缩放按对数插值；位置按"视野宽度"的变化推进，这样拉远时不会一开始就猛地滑走 */
  function interp(a, b, e) {
    const zoom = a.zoom * (b.zoom / a.zoom) ** e;
    const ratio = b.zoom / a.zoom;
    const pe = Math.abs(ratio - 1) > 0.05 ? (1 / zoom - 1 / a.zoom) / (1 / b.zoom - 1 / a.zoom) : e;
    return { x: a.x + (b.x - a.x) * pe, y: a.y + (b.y - a.y) * pe, zoom };
  }

  function cameraCells(t) {
    let c = INITIAL_CAMERA;
    for (const m of camKeys) {
      if (t < m.t) break;
      const p = clamp01((t - m.t) / m.dur);
      if (p >= 1) { c = m.to; continue; }
      return interp(m.from, m.to, ease[m.ease](p));
    }
    return c;
  }

  function cameraAt(t) {
    const c = cameraCells(t);
    return { x: c.x * CELL, y: c.y * CELL, zoom: c.zoom };
  }

  function progressAt(l, t) {
    let v = l.initial ?? 0;
    for (const e of l.events) {
      if (t < e.t) break;
      const p = clamp01((t - e.t) / e.dur);
      v = e.type === 'reveal' ? p : 1 - p;
    }
    return v;
  }

  function fadeAt(l, t) {
    let v = 1;
    for (const f of l.fades) {
      if (t < f.t) break;
      v += (f.to - v) * ease.inOutSine(clamp01((t - f.t) / f.dur));
    }
    return v;
  }

  // 全片的"暗下去"（S16）和"重新浮现"（S19）。关键词暗下去以后不再回来。
  const DIM = 0.1;
  const dimLevel = (t) => 1 - (1 - DIM) * ease.inOutSine(clamp01((t - dimAt) / dimDur));
  const restore = (t) => ease.inOutSine(clamp01((t - restoreAt) / restoreDur));
  const dimFor = (l, t) => {
    const d = dimLevel(t);
    return l.key ? d : d + (1 - d) * restore(t);
  };

  function cursorAt(t, states) {
    let ev = null;
    for (const e of cursorEvents) { if (e.t <= t) ev = e; else break; }
    if (!ev) return [];
    let col, row, typing = false;
    if (ev.walk) { // 光标在迷宫路上，停在刚写下的字后面
      const k = Math.max(0, ev.walk.head(t));
      const [c, r] = images[0].pathCells[k];
      col = c + 0.85; row = r;
      typing = t < ev.walk.arrive.at(-1) + 0.1;
    } else if (ev.follow) {
      const l = states[ev.follow];
      col = l.progress > 0 ? frontCol(l) : layout(l).start;
      row = l.row;
      typing = l.progress > 0 && l.progress < 1;
    } else {
      ({ col, row } = ev);
    }
    const on = typing || Math.floor((t - ev.t) / BLINK) % 2 === 0;
    return on ? [{ col, row }] : [];
  }

  // 富内斯区：越靠近中心字越密；S09 里细节不停复制、叠加；S10 一瞬间塌缩
  const densityAmt = (t) => {
    const up = 0.6 * smoothstep(start('S08', 0.8), end('S08'), t) + 0.4 * smoothstep(start('S09'), word('S09', '三点十四分'), t);
    const down = 1 - clamp01((t - collapseAt) / 0.3);
    return up * down;
  };
  const OVERLOAD_PHRASES = [
    '三点十四分 · 侧面的狗', '三点十五分 · 正面的狗', '三点十四分零一秒', '三点十四分零二秒',
    '三点十四分零三秒', '每一片叶子', '每一片叶子的每一条叶脉', '一八八二年四月三十日 · 南方的云',
    '那匹马', '每一根枝条', '每一串葡萄', '每一颗葡萄', '每一次呼吸', '三点十五分零一秒',
  ];
  const fc = { x: FUNES.col * CELL, y: FUNES.row * CELL };
  const thinkTarget = { x: 48 * CELL, y: -43.5 * CELL };
  const overload = Array.from({ length: 110 }, (_, i) => {
    const s = rand(i, 3, 33), o = rand(i, 4, 33);
    return {
      text: OVERLOAD_PHRASES[Math.floor(rand(i, 5, 33) * OVERLOAD_PHRASES.length)],
      x: fc.x + (rand(i, 1, 33) - 0.6) * 1800,
      y: fc.y + (rand(i, 2, 33) - 0.5) * 1000,
      size: CELL * (0.45 + 1.15 * s * s),
      alpha: 0.08 + 0.5 * o * o,
      weight: o > 0.7 ? 500 : 300,
      appear: overloadFrom + (overloadTo - overloadFrom) * rand(i, 6, 33) ** 1.4,
    };
  });

  function funesLayer(t) {
    const amt = densityAmt(t);
    const k = ease.inCubic(clamp01((t - collapseAt) / collapseDur)); // 塌缩进度
    const anyOverload = t >= overloadFrom && k < 1;
    if (amt <= 0.001 && !anyOverload) return null;
    return (ctx, cam, W, H) => {
      if (amt > 0.001) {
        const dens = (c, r) => {
          const d = Math.hypot((c + 0.75) * (CELL / 2) - fc.x, (r + 0.75) * (CELL / 2) - fc.y) / CELL;
          return amt * (1 - smoothstep(10, 28, d));
        };
        drawNoise(ctx, cam, W, H, { cell: CELL / 2, seed: 2, alpha: 0.1, offset: 0.25, sizeRatio: 0.62, attention: dens });
      }
      if (!anyOverload) return;
      for (const it of overload) {
        const a = clamp01((t - it.appear) / 0.3);
        if (a <= 0) continue;
        drawFree(ctx, cam, W, H, {
          ...it,
          x: it.x + (thinkTarget.x - it.x) * k,
          y: it.y + (thinkTarget.y - it.y) * k,
          alpha: it.alpha * a * (1 - k),
        });
      }
    };
  }

  function sceneAt(t) {
    const flip = Math.floor(t * 14);
    const states = {};
    const out = [];
    for (const l of lineList) {
      const progress = progressAt(l, t);
      states[l.id] = { ...l, progress };
      if (progress <= 0) continue;
      let alpha = (l.alpha ?? 1) * fadeAt(l, t);
      if (l.dimmable) alpha *= dimFor(l, t);
      out.push({ ...l, progress, alpha, focus: smooth(progress), flip });
    }
    const cam = cameraAt(t);
    const fgFade = smoothstep(0.75, 1.15, cam.zoom);
    return {
      t,
      camera: cam,
      lines: out,
      cursors: cursorAt(t, states),
      layers: [funesLayer(t)].filter(Boolean),
      pages: PAGES,
      images,
      env: { dim: dimLevel(t) + (1 - dimLevel(t)) * restore(t) * 0.5, penDim: dimLevel(t) + (1 - dimLevel(t)) * restore(t), collapse: ease.inCubic(clamp01((t - collapseAt) / collapseDur)) },
      foreground: fgFade > 0.01 ? foreground.map((f) => ({ ...f, alpha: f.alpha * fgFade })) : [],
    };
  }

  // ─── 光：每一段的明暗。富内斯段是一间黑屋子，只有一小圈烛光 ───
  const LIGHT_KEYS = [
    [0, { darkness: 0.72, radius: 700, warmth: 0.26 }],
    [end('S01'), { darkness: 0.6, radius: 900, warmth: 0.24 }],
    [s03Move + 1.6, { darkness: 0.45, radius: 1000, warmth: 0.2 }],
    [start('S05', 2), { darkness: 0.38, radius: 1200, warmth: 0.18 }],
    [start('S07', 1), { darkness: 0.55, radius: 850, warmth: 0.22 }],
    [start('S08', 0.6), { darkness: 0.55, radius: 850, warmth: 0.22 }],
    [start('S08', 2.2), { darkness: 0.9, radius: 560, warmth: 0.34 }],
    [end('S11'), { darkness: 0.88, radius: 620, warmth: 0.32 }],
    [start('S12', 1.8), { darkness: 0.45, radius: 1000, warmth: 0.2 }],
    [start('S15'), { darkness: 0.5, radius: 950, warmth: 0.2 }],
    [end('S15', 1), { darkness: 0.6, radius: 820, warmth: 0.22 }],
    [start('S16', 2.4), { darkness: 0.3, radius: 1500, warmth: 0.16 }],
    [dimAt, { darkness: 0.32, radius: 1450, warmth: 0.16 }],
    [dimAt + 1.6, { darkness: 0.65, radius: 900, warmth: 0.24 }],
    [start('S17'), { darkness: 0.55, radius: 950, warmth: 0.24 }],
    [pullAt, { darkness: 0.5, radius: 1000, warmth: 0.22 }],
    [pullAt + 3, { darkness: 0.25, radius: 1500, warmth: 0.18 }],
  ];
  function lightAt(t) {
    let i = LIGHT_KEYS.findIndex(([kt]) => kt > t);
    if (i === 0) return LIGHT_KEYS[0][1];
    if (i < 0) return LIGHT_KEYS.at(-1)[1];
    const [ta, a] = LIGHT_KEYS[i - 1], [tb, b] = LIGHT_KEYS[i];
    const p = ease.inOutSine(clamp01((t - ta) / Math.max(0.001, tb - ta)));
    const v = Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * p]));
    if (v.darkness > 0.8) { // 烛光的呼吸
      const f = (v.darkness - 0.8) / 0.1;
      v.radius *= 1 + f * (0.035 * Math.sin(t * 11.3) + 0.025 * Math.sin(t * 6.7 + 1.3));
      v.warmth *= 1 + f * 0.08 * Math.sin(t * 9.1 + 0.4);
    }
    return v;
  }

  /** 屏幕空间后期的参数（景深、光、灰尘、压黑），运动模糊之后用 */
  function postAt(t) {
    const cam = cameraAt(t);
    const fadeIn = 1 - clamp01(t / 0.45);
    const fadeOut = clamp01((t - (total - fadeOutDur)) / fadeOutDur);
    const dofAmt = smoothstep(0.8, 1.2, cam.zoom);
    return {
      t,
      light: { x: 0.47, y: 0.46, ...lightAt(t) },
      dof: dofAmt > 0.01 ? { inner: 480, outer: 1200, blur: 5 * dofAmt } : null,
      fade: Math.max(fadeIn, ease.inOutSine(fadeOut)),
      dust: smoothstep(0.05, 0.3, cam.zoom), // 片尾拉远到书在黑暗里时，灰尘落在黑底上像噪点，收掉
    };
  }

  /** 当前在说哪一段（段后停顿里返回 null） */
  function segmentAt(t) {
    return timing.segments.find((s) => t >= s.start && t < s.end) ?? null;
  }

  return {
    duration: total,
    cameraAt,
    sceneAt,
    postAt,
    segmentAt,
    cues,
    texts,
    lineTexts: lineList.map((l) => l.text).join(''),
    source: timing.source ?? 'audio/vo/timing.json',
    wordSync: Object.keys(aligned).length,
  };
}
