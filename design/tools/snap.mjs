// 把样张页面里的画布导出成原尺寸 PNG（设计验收用，不是正式渲染管线）。
// 用法：node design/tools/snap.mjs <页面 URL> <输出目录>
// 需要本地已启动静态服务（.claude/launch.json 里的 design-static）和 Google Chrome。

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, outDir = 'out/styleframes'] = process.argv.slice(2);
if (!url) { console.error('usage: node design/tools/snap.mjs <url> [outDir]'); process.exit(1); }

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'snap-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=1920,1080', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chrome did not start');
}

try {
  const ws = new WebSocket(await pageTarget());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
    return res.result?.result?.value;
  };

  await send('Page.navigate', { url });
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const s = await evaluate('JSON.stringify({ ready: !!window.__ready, error: window.__error || null })').catch(() => null);
    if (s) {
      const { ready, error } = JSON.parse(s);
      if (error) throw new Error(error);
      if (ready) break;
    }
    await sleep(300);
  }
  const frames = JSON.parse(await evaluate(
    'JSON.stringify([...document.querySelectorAll("canvas[data-id]")].map(c => ({ id: c.dataset.id, data: c.toDataURL("image/png") })))',
  ));
  mkdirSync(outDir, { recursive: true });
  for (const f of frames) {
    const file = join(outDir, `${f.id}.png`);
    writeFileSync(file, Buffer.from(f.data.split(',')[1], 'base64'));
    console.log(file);
  }
  ws.close();
} finally {
  chrome.kill();
}
