#!/usr/bin/env node
// All pipeline state is scoped to the remote project; use from any working directory.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const command = args.shift() || 'doctor';
const estimate = args.includes('--estimate');
if (estimate) args.splice(args.indexOf('--estimate'), 1);
const shotCommands = ['lint', 'inspect', 'stills', 'verify', 'render'];
if (shotCommands.includes(command) && !estimate && !existsSync(resolve(root,'audio/vo/timing.json'))) {
  console.error('No complete measured voice timeline. Use --estimate only for engineering checks.');
  process.exit(2);
}
if (command === 'render' && !estimate) {
  const check = spawnSync(resolve(here,'.venv/bin/python'), [resolve(here,'voice.py'),'check'], {cwd:root,stdio:'inherit'});
  if (check.status !== 0) process.exit(check.status || 1);
}
const cli = resolve(here,'node_modules/.bin/multiplane');
const argv = [cli, command, ...(shotCommands.includes(command) ? ['engine/film.html','--root',root] : []), ...args];
const result = spawnSync(process.execPath, argv, {
  cwd:root, stdio:'inherit',
  env:{...process.env, MULTIPLANE_HOME:resolve(root,'out/.multiplane'), MULTIPLANE_NO_INDEX:'1', MULTIPLANE_FFMPEG:ffmpeg}
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
