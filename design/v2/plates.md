# 铜版画插图：提示词与规格

> Claude 写，Codex 用图像生成制作。产物放在 `assets/plates/`，每张附 `manifest.json`（提示词、模型、日期、尺寸）。
> 用途：嵌在墙上，像旧书里的插页，镜头经过或停留。我会用"正片叠底"贴到纸面上，所以底色要接近纸色。
> **用途更新（导演要求画面加入图和动画之后）**：这些图还会当作"字成画"的墨量图，墙上的随机字按图的明暗调整浓淡，远看组成这幅画（见 `design/v3/`）。所以**主体要清楚、明暗对比要强、轮廓要大**，细碎的排线会在字格里丢失。

## 统一规格（每张都加在提示词末尾）

```
Copperplate engraving, fine cross-hatching and stippling, black-brown ink on warm cream paper (#EAE3D2),
monochrome, 19th-century book illustration plate, high detail, even lighting, generous empty margin around the subject.
No text, no letters, no numbers, no captions, no signature, no border frame, no watermark.
Not in the style of any specific living artist.
```

- 横幅 3:2，用能拿到的最高分辨率（至少 2400×1600）
- 纸色要平、要干净：底色均匀，不要做旧的污渍、折痕和暗角。纸的质感由我在代码里统一加
- **画里绝对不能有文字**：生成出来的假字和墙上的真字放在一起会很难看
- 每张出 2–3 个候选，我来挑

## 五张

### P1 · babel-gallery（巴别段、片尾）

```
The interior of one hexagonal gallery of an endless library: bookshelves lining four of the six walls,
a low railing in the center over an open shaft, a narrow passage leading to the next identical gallery,
two small spherical lamps, a spiral staircase visible through the passage. Symmetrical, deep perspective, no people.
```

### P2 · babel-shaft（巴别段，S05 拉远时用）

```
Looking straight down a vast circular air shaft surrounded by stacked hexagonal galleries,
railings and bookshelves repeating downward into darkness, a spiral staircase winding through them. Dizzying depth, no people.
```

### P3 · horse（富内斯段，S08）

```
A half-wild horse rearing in tall grass on an open plain at dusk, 1880s South American countryside,
a low ranch fence and a lone tree in the distance, storm clouds. The horse is the only figure. No rider visible.
```

### P4 · quixote（梅纳尔段，S12）

```
A small title-page vignette: a tall, thin knight in old armor on a bony horse holding a lance,
followed by a short squire on a donkey, crossing a dry plain with a windmill far away. Centered vignette, oval composition.
```

### P5 · forking-paths（开场，S01）

```
A formal garden labyrinth seen from directly above: hedged paths that fork again and again into branching corridors,
a small pavilion at the center. Orderly yet bewildering, high contrast hatching, no people.
```

## 版权与边界

- 不生成任何真人（包括博尔赫斯）的肖像
- 不仿制真实书封，不模仿任何在世艺术家的作品
- 《堂吉诃德》的骑士与侍从是公版题材，画成泛化的形象即可
