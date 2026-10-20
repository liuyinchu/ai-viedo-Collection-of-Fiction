# 程序合成配乐小样 v1

导演提出这类稀疏配乐也可尝试程序合成。本版是试听候选，听感尚待导演验收。

沿用三个出场窗口及“少、稀疏、无鼓、纯器乐”的方向。
通过衰减弦振动模态、柔和起音和短房间反射生成琴音；没有使用外部乐器采样。
音色是程序生成的柔和弦音，不宣称真实钢琴或大提琴录音。

原创四音动机 D4–A4–E5–B4 在开场与梅纳尔段重复，低音从 D3 换为 G2。
结尾只保留 D4–A4–E5，衰减到静音。没有固定鼓点或持续铺满的合成器底音。
配乐严格限制在 placement.json 的三段窗口；口播出现时平滑降低约 4.5 dB。

- 生产电平声轨：synthetic-v1/score.wav
- 纯配乐试听：synthetic-v1/solo-audition.wav（为听清音色而提高播放电平）
- 各段独立试听：opening-solo.wav、menard-solo.wav、ending-solo.wav
- 参数、音符和输入校验值：synthetic-v1/manifest.json

复现：engine/.venv/bin/python engine/synthesize-music.py --verify
