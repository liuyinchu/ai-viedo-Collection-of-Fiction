# 贯穿配乐候选 v3

状态：待导演听审。方向来自 docs/music-direction.md，提示点使用 design/cues3.json。

- 138 个音符事件；动机沿用 D–A–E–B 与 v2 琴音，增加弓弦底层、缓慢不规则的脉动和少量对位点。
- 开场第一音从 0.65 秒进入；随后除塌缩设计留白外保持音乐连贯。
- 三处局部高点在 S05 末、S09 末与 S19 拉远。S09 通过不同速度、不同音区的卡农叠加成为最密集段。
- 84.70 秒起用 0.18 秒截断；84.88–88.25 秒音乐、音效与空气都为零，口播继续。88.25 秒落单个 D2 低音。
- 梅纳尔 A/B 使用相同的音高、相对起音、力度、时值、声像、音色；A 为 D3–A3–E4，B 为 G2–B2–D3–F♯3。
- S16 暗下后只留 E3 持续声部；收件人处最后一次完整动机；片尾 193.695 秒开始随画面淡出。
- motif / bed / points / score 声轨在 audio/music/synthetic-v3/；sfx / ambience 在 audio/sfx/film3/。
  均为 48 kHz、24-bit、立体声、9364579 个采样；分轨重建误差不超过 24-bit 量化误差。
- 两次合成逐样本相同；无外部音乐或乐器采样。参数、随机种子来源和文件哈希均记录在 manifest.json。

听审母带 audio/mix/synthetic-v3-review.wav：−14.16 LUFS / −1.10 dBTP。
为 AAC 输出另外做了短时过采样峰值保护；独立分轨与源混音不变。
搭配第三版画面的试听 MP4：out/review/film-v3-music-v3-preview.mp4，
实测 −14.20 LUFS / −1.36 dBTP，完整解码及格式检查通过。

音乐图与可播放报告：out/review/music-v3/index.html。
levels.png 为电平与塌缩静音，score-map.png 为音符及强拍，menard.png 为同旋律换和声。
纯音乐 music-only.mp3 采用额外统一增益供试听，不代表口播混音里的音量。
