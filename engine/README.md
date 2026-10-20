# 工程管线

全部命令在远端项目根目录执行。Node.js 24 已安装在 `/opt/homebrew/opt/node@24/bin/`；
SSH 非交互环境可先执行：

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$HOME/.local/bin:$PATH"
npm ci --prefix engine
uv venv --python 3.12 engine/.venv
uv pip install --python engine/.venv/bin/python --no-deps -r engine/requirements.lock
node engine/run.mjs doctor --json
```

工程配置、作业和模型留在工程内；包下载与 Playwright 浏览器可复用当前用户的缓存。Multiplane、Chromium、FFmpeg 版本由包锁固定；
字体的来源提交和 SHA-256 记录于 assets/fonts/manifest.json。

## 配音

`script/short-3min.md` 是唯一台本。运行 `engine/.venv/bin/python engine/prepare-vo.py`
提取口播、段后停顿和读音要求到 `audio/vo/segments.json` 与 `audio/vo/text/`。
生成的文本副本不可手动编辑。仅把 AI 替换为 A I 以落实已批准的读音，其余文字保留。
MiniMax 网页采用 `audio/vo/config.json` 中固定音色和参数。

网页下载的每段文件放入远端后：

```sh
engine/.venv/bin/python engine/voice.py import S01 audio/vo/S01.source.mp3
engine/.venv/bin/python engine/asr.py S01
```

保留原始文件，输出统一的 48 kHz 单声道 PCM WAV。元数据保存台本、参数和文件哈希。
ASR 使用独立模型，不把原文作为识别提示；差异只表示需要复听，不自动判定 TTS 读错。
`Sxx.words.json` 是 ASR 估计时间戳，不是 MiniMax 返回的精确字级对齐。

19 段完整且参数、文本、文件哈希一致后才能运行：

```sh
engine/.venv/bin/python engine/voice.py timeline
node design/tools/export-cues.mjs
engine/.venv/bin/python engine/voice.py subtitles
```

`timing.json` 的 start/end 只包围各段音频；段间静音在两段之间插入，
S19 的 6 秒静音纳入 total。字幕段内切分按字数估算，段落边界以实际音频为准。

## 字体与画面

```sh
engine/.venv/bin/python engine/fetch-fonts.py
node engine/run.mjs lint --json
node engine/run.mjs stills --at 0,7.6,80,151 --out out/review/stills --json
node engine/run.mjs verify --at 0,6,7.6,80,151 --workers 2 --json
node engine/run.mjs render --from 0 --to 10 --workers 2 --audio audio/vo/narration.wav --out out/review/preview-10s.mp4 --json
```

先交 10 秒样片给 Claude 验收。正式整片在验收后执行，输出不覆盖既有产物。
未拿到完整配音时，仅工程检查可显式加 `--estimate`；不生成冒充真实的 timing.json。

`engine/film.html` 仅适配设计模块，使用原始 `design/lib/blur.js` 的线性光子帧平均。
Multiplane 自己的运动模糊关闭，避免重复模糊。所有字体本地加载，静止帧保持清晰。

## 已知边界

设计侧 storyboard 的 word() 当前仍按段落字符权重估算词语时刻；
即使导出 ASR 时间戳，也不会自行接入设计逻辑。需要 Claude 决定是否修改。

ASR 直接载入已转换的 MLX 权重，不使用 PyTorch 转换工具。requirements.lock 列出完整推理依赖；按上面的 --no-deps 锁定安装。模型下载命令：engine/.venv/bin/python engine/fetch-asr-model.py。

## 音效、混音与交付

运行 node engine/export-audio-plan.mjs 导出真实镜头速度包络及音乐窗口，再运行
engine/.venv/bin/python engine/synthesize-sfx.py 生成确定性的纸响、气流和环境声。
engine/.venv/bin/python engine/mix.py 生成无配乐听审混音；实测响度结果保存在同名 JSON。
Suno 音乐确认并铺好全片时间轴之后，可用 --music audio/music/score.wav 加入总混音。
正式视频导出前要让 Claude 验收 10 秒样片，让导演确认读音疑点及配乐。

当前听审：out/review/preview-10s-sfx.mp4，out/review/voice-sfx-review.mp3。
字幕：out/film.zh-CN.srt。字幕段内时间按字数估算，段落边界为实测。

## 程序合成配乐候选 v1

按导演建议追加的试听路线，尚待听感确认：
engine/.venv/bin/python engine/synthesize-music.py --verify
engine/.venv/bin/python engine/mix.py --music audio/music/synthetic-v1/score.wav --out audio/mix/synthetic-v1-review.wav

生产声轨严格限制在三处配乐窗口；纯配乐试听版单独提高了电平。
小样：out/review/synthetic-v1-solo.mp3 与 synthetic-v1-with-voice.mp3。
两者均约 61 秒，顺序为开场、梅纳尔、片尾。参数与音符见 audio/music/synthetic-v1/manifest.json。
