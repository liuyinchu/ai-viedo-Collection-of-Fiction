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
音乐确认并铺好全片时间轴之后，可用 --music <score.wav> 加入总混音。
10 秒样片和配音读音已通过；导演已确认当前版本采用配乐 v2，确认与音频哈希见 audio/music/approval.json；整片画面已通过；S18 修正已完成并输出最终 MP4，186 / 190 秒成片帧交 Claude 最后复核。

当前听审：out/review/preview-10s-sfx.mp4，out/review/voice-sfx-review.mp3。
字幕：out/film.zh-CN.srt。字幕段内时间按字数估算，段落边界为实测。

## 程序合成配乐候选 v1

按导演建议追加的试听路线，尚待听感确认：
engine/.venv/bin/python engine/synthesize-music.py --verify
engine/.venv/bin/python engine/mix.py --music audio/music/synthetic-v1/score.wav --out audio/mix/synthetic-v1-review.wav

生产声轨严格限制在三处配乐窗口；纯配乐试听版单独提高了电平。
小样：out/review/synthetic-v1-solo.mp3 与 synthetic-v1-with-voice.mp3。
两者均约 61 秒，顺序为开场、梅纳尔、片尾。参数与音符见 audio/music/synthetic-v1/manifest.json。


## 配乐 v2 与可视化听审

导演要求提高配乐音量和存在感。v2 的音符与力度由
audio/music/synthetic-v2/score-plan.json 描述，原 v1 保留用于比较。

```sh
engine/.venv/bin/python engine/synthesize-music-v2.py --verify
engine/.venv/bin/python engine/mix.py --music audio/music/synthetic-v1/score.wav --out audio/mix/synthetic-v1-word-sync-review.wav
engine/.venv/bin/python engine/mix.py --music audio/music/synthetic-v2/score.wav --out audio/mix/synthetic-v2-review.wav
engine/.venv/bin/python engine/review-music.py
```

报告：out/review/music-v2/index.html。两张图分别是 levels.png、score-map.png，
测量数据保存到 audio/music/synthetic-v2/analysis.json。RMS 比较使用真实声轨和共同刻度，
不要把图表当成听感通过。含口播试听沿用生产混音音量；solo 版本单独抬高试听电平。

## 整片画面验收

```sh
node engine/run.mjs verify --at 16.6,83.9,120,150,186 --workers 2 --json
node engine/run.mjs render --workers 2 --out out/review/film-picture-v1.mp4 --json
engine/.venv/bin/python engine/review-film.py
```

review-film.py 从编码后的整片取出 Claude 指定的 11 个时间点，并检查帧率、尺寸、5853 帧、
完整解码与 195.1 秒视频时长。报告和联系表位于 out/review/full-film-stills/。
视频相对 195.095396 秒音频多 4.604 毫秒，是 30 fps 的整帧取整，属于片尾黑场。

## Git 备份范围

按制作节点提交本远端仓库。台本、设计、工程、配音原始素材、批准的逐段 WAV、
ASR、字体和生成参数都纳入版本控制；可再生成的整段声轨、视频、图表、下载缓存和依赖忽略。
目前没有 Git remote；提交历史保存在这台制作机器。


## S18 修正与最终封装

Claude 的最后一处修改仅将 S18 镜头 y 从 9.5 改到 7.5，避免 S19 恢复文字时裁掉开场句。
设计快照为 513b07a；具体输入哈希、拼接点与已批准混音见 engine/tail-patch-plan.json。
沿用原有声音是 Claude 的明确决定；直接验证并使用批准的混音 SHA，不重跑音效或混音。

```sh
node engine/run.mjs render --from 170 --workers 2 --out out/patch-s18/tail-from-170.mp4 --json
engine/.venv/bin/python engine/finalize-film.py prepare
engine/.venv/bin/python engine/finalize-film.py assemble
```

170 秒是原片的闭合关键帧 / 分段边界。前 5100 帧直接复制，新尾段按绝对时间 170 秒起渲染 753 帧，
从而覆盖 175.289521 秒开始的修改。合成后逐帧核对：解码结果必须恰好等于旧前段 + 新尾段，
且全部 5853 帧严格落在 30 fps 时间网格上。

声音先编码为 AAC 320 kb/s、48 kHz、双声道，再回读测量。若编码导致真峰值超标，
仅对批准的母带做微小统一增益调整后重新编码，避免重复压缩；原始批准 WAV 保持不变。
最终 MP4 再次测量，目标 −14 LUFS（容差 ±0.3 LU）、真峰值 ≤ −1 dBTP。

交付目录 out/final/ 包含最终 MP4、独立 SRT、186/190 秒静帧、联系表和 delivery.json。
engine/final-delivery.json 保留可提交的校验记录；out/ 产物可重建，不入 Git。


最终交付已生成：`out/final/borges-fiction-3min-v1.mp4`（195.1 秒）与同名 `.zh-CN.srt`（43 条）。
从最终 MP4 回读实测 −14.17 LUFS、−1.06 dBTP；前 5100 帧与原片解码结果逐帧一致，
后 753 帧与新尾段逐帧一致，视频共 5853 帧、30 fps，无丢帧、重帧或时间漂移。
`out/final/closing-review.png` 以及两张原尺寸帧供 Claude 复核片尾修正。


## 第三版：字成画预览与贯穿配乐

最新设计入口为 design/film3/film3.js，工程入口 engine/film3.html。
engine/film3-shot.js 在每个运动模糊子帧调用 render，平均后只调用一次 post。
半分辨率预览保留景深、光、灰尘和黑场；原版入口不变。

```sh
node engine/run.mjs verify --film3 --scale 0.5 --at 6,17.9,82,120,190 --workers 2 --json
node engine/run.mjs render --film3 --scale 0.5 --workers 2 --out out/review/film-v3-picture-preview.mp4 --json
engine/.venv/bin/python engine/review-film3.py
node design/tools/export-cues.mjs film3
node engine/export-audio-plan.mjs film3
engine/.venv/bin/python engine/synthesize-sfx.py --profile film3
engine/.venv/bin/python engine/synthesize-music-v3.py --verify
engine/.venv/bin/python engine/mix.py --sfx-dir audio/sfx/film3 --music audio/music/synthetic-v3/score.wav --out audio/mix/synthetic-v3-review.wav
engine/.venv/bin/python engine/review-music-v3.py
```

按设计要求，film-v3-preview.mp4 暂时复用现有已确认的 v2 AAC 音轨。
v3 配乐另行听审，不能把 v2 的确认当作 v3 已通过。
音乐分轨为 audio/music/synthetic-v3/{motif,bed,points,score}.wav；
新版音效和空气位于 audio/sfx/film3/，原版声轨保留。
v3 音乐与背景在 84.70 秒开始用 0.18 秒截断，84.88–88.25 秒严格静音，口播保留。
梅纳尔 A/B 的旋律参数逐项相同、和声不同；参数和校验值见 manifest.json。

GPU 一致性检查在工具容差内通过；190 秒处 reorder/reload/workers:2 各有 69 个像素，
最大单通道差 1/255（gpu_raster_jitter）。该预览不宣称逐像素哈希完全一致。


第三版完整预览已交付：out/review/film-v3-preview.mp4（960×540 / 30 fps / 195.1 秒，暂用 v2 音轨）。
联系表和静帧位于 out/review/film-v3-stills/；来源、校验与 GPU 舍入容差说明见 engine/film3-preview.json。


v3 音乐试听与可视化：out/review/music-v3/index.html。分轨索引见 audio/music/synthetic-v3/stems.json。
运行 `engine/.venv/bin/python engine/mux-film3-music.py` 额外生成
out/review/film-v3-music-v3-preview.mp4，保留按要求使用 v2 音轨的原预览。
AAC 输出使用短时过采样峰值保护，源混音和分轨保持不变；
编码后的实测指标、处理参数和 SHA 记录在 audio/mix/synthetic-v3-aac.json。

本次实际预览固定使用 GPU 栅格。另试的软件栅格后端未通过一致性检查，
未用于交付；记录在 out/engineering/film3-software-verify.ndjson。更换后端需要重新验证。


## 第三版正式导出

导演已通过画面和配乐 v3；批准由 Claude 在留言板转达，记录见
`audio/music/approval-v3.json`。旧合成/试听报告的 awaiting-director 状态保留为生成当时的历史，
本次正式导出使用这份新批准记录。第一版保留为存档，原定黑条修正和铜版画插图取消。

设计快照 `f6f6ebe` 包含片尾 dust 系数和红色前景「我」字透明度的小修正。
`engine/film3-final-plan.json` 冻结相关设计、字体、时间轴和音频输入。
声音直接复制已通过预览中的 AAC，源混音是 `audio/mix/synthetic-v3-review.wav`；
编码峰值保护参数沿用 `audio/mix/synthetic-v3-aac.json`，不重新合成或混音。

```sh
node engine/run.mjs render --film3 --scale 1 --workers 2 --out out/final-v3/film-v3-picture-1080p.mp4 --json > out/engineering/film3-final-render.ndjson
node engine/run.mjs verify --film3 --scale 1 --at 17,130,193 --workers 2 --json > out/engineering/film3-final-verify.ndjson
engine/.venv/bin/python engine/finalize-film3.py prepare
engine/.venv/bin/python engine/finalize-film3.py assemble
```

导出脚本核对冻结输入、渲染与一致性检查结果，再封装 MP4。
检查完整解码、5853 帧、30 fps 时间戳、1920×1080 H.264 yuv420p、
48 kHz 双声道 AAC、起点/时长、实际编码响度和真峰值；
同时比较声音/画面压缩数据，确认封装未重新编码。
独立 SRT 共 43 条，校验完整台本和段落边界，不烧入画面。
13 张 1080p 静帧与联系表从最终 MP4 提取，供 Claude 最后画面复核。

交付目录 `out/final-v3/`；可提交的记录位于 `engine/film3-final-delivery.json`。
输出文件不入 Git，源码与来源、校验记录持续提交至远端机器的本地仓库。
