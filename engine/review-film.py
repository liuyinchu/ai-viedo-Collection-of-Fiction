"""Extract the requested stills from the encoded full movie and verify delivery specs."""
import json, subprocess, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from common import ROOT, write_json, digest, ffmpeg
TIMES=[16.6,45,83.9,86.5,120,133,150,158,174,186,193]
VIDEO=ROOT/"out/review/film-picture-v1.mp4"
# This revision is the actual design/VO snapshot present when the full render started.
SOURCE_REVISION="a5c7788"
render_inputs=["design","script","assets/fonts","engine/film-shot.js","engine/film.html","audio/vo/timing.json",
               *[str(p.relative_to(ROOT)) for p in sorted((ROOT/"audio/vo").glob("S*.words.json"))]]
subprocess.run(["git","diff","--exit-code",SOURCE_REVISION,"--",*render_inputs],cwd=ROOT,check=True)
OUT=ROOT/"out/review/full-film-stills"
OUT.mkdir(parents=True,exist_ok=True)
probe=ROOT/"engine/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe"
if not probe.exists():
    candidates=list((ROOT/"engine/node_modules/ffprobe-static/bin/darwin").glob("*/ffprobe"))
    if not candidates:raise RuntimeError("Pinned ffprobe not found")
    probe=candidates[0]
p=subprocess.run([str(probe),"-v","error","-count_frames","-show_streams","-show_format","-of","json",str(VIDEO)],capture_output=True,text=True,check=True)
metadata=json.loads(p.stdout)
stream=next(s for s in metadata["streams"] if s["codec_type"]=="video")
assert stream["width"]==1920 and stream["height"]==1080
assert stream["avg_frame_rate"]=="30/1"
assert int(stream["nb_read_frames"])==5853
assert abs(float(stream["duration"])-195.1)<.001
assert stream["codec_name"]=="h264"
assert all(s["codec_type"]=="video" for s in metadata["streams"]), "Expected picture-only render"
subprocess.run([ffmpeg(),"-hide_banner","-v","error","-xerror","-i",str(VIDEO),"-f","null","-"],check=True)
fontpath=ROOT/"out/engineering/report-font-400.ttf"
font=ImageFont.truetype(str(fontpath),22)
small=ImageFont.truetype(str(fontpath),17)
sheet=Image.new("RGB",(1624,1416),"#f7f5ef")
draw=ImageDraw.Draw(sheet)
draw.text((32,18),"《虚构集》整片画面验收 · 逐字对齐版",font=font,fill="#242c33")
draw.text((32,54),"从最终编码的无声视频取帧 · 1920 × 1080 / 30 fps / 195.1 s",font=small,fill="#53606a")
files=[]
for i,t in enumerate(TIMES):
    frame=round(t*30)
    path=OUT/f"t-{t:06.2f}.png"
    subprocess.run([ffmpeg(),"-y","-hide_banner","-loglevel","error","-ss",str(t),"-i",str(VIDEO),"-frames:v","1",str(path)],check=True)
    im=Image.open(path).convert("RGB")
    assert im.size==(1920,1080)
    x=32+(i%3)*528;y=102+(i//3)*324
    sheet.paste(im.resize((504,284),Image.Resampling.LANCZOS),(x,y))
    draw.text((x,y+290),f"{t:.2f} s  ·  frame {frame}",font=small,fill="#34424a")
    files.append({"time":t,"frame":frame,"path":str(path.relative_to(ROOT)),"sha256":digest(path.read_bytes())})
sheet.save(OUT/"contact-sheet.png")
inputs=[]
for folder in ["design","script"]:
    for path in sorted((ROOT/folder).rglob("*")):
        if path.is_file() and path.suffix in {".js",".mjs",".html",".css",".json",".md"}:
            inputs.append({"path":str(path.relative_to(ROOT)),"sha256":digest(path.read_bytes())})
for path in [ROOT/"engine/film-shot.js",ROOT/"engine/film.html",ROOT/"audio/vo/timing.json",*sorted((ROOT/"audio/vo").glob("S*.words.json"))]:
    inputs.append({"path":str(path.relative_to(ROOT)),"sha256":digest(path.read_bytes())})
report={"status":"picture-rendered-awaiting-Claude-review","video":str(VIDEO.relative_to(ROOT)),"sha256":digest(VIDEO.read_bytes()),
 "width":1920,"height":1080,"fps":30,"frames":5853,"videoDuration":195.1,"audioTimeline":195.09539583333333,
 "tailFramePaddingSeconds":195.1-195.09539583333333,"decodeErrors":0,"stills":files,"inputs":inputs,
 "sourceRevision":SOURCE_REVISION,"verificationLog":"out/engineering/word-sync-verify.ndjson","renderLog":"out/engineering/full-render-v1.ndjson"}
write_json(OUT/"manifest.json",report)
write_json(ROOT/"engine/full-film-review.json",report)
print(json.dumps({k:v for k,v in report.items() if k not in ("inputs","stills")},ensure_ascii=False,indent=2))
