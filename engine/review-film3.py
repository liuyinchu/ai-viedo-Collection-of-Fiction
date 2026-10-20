"""Mux the film3 visual preview with the existing approved v2 soundtrack and extract review stills."""
import json,re,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from common import ROOT,read_json,write_json,digest,ffmpeg
OUT=ROOT/"out/review";PICS=OUT/"film-v3-stills";PICS.mkdir(exist_ok=True)
picture=OUT/"film-v3-picture-preview.mp4";video=OUT/"film-v3-preview.mp4"
audio=ROOT/"out/patch-s18/approved-v2.m4a"
def run(args):return subprocess.run(list(map(str,args)),capture_output=True,text=True,check=True)
def ff(args):return run([ffmpeg(),"-hide_banner","-nostdin",*args])
assert digest(audio.read_bytes())==read_json(ROOT/"audio/mix/final-aac-encode.json")["sha256"]
run(["git","diff","--exit-code","56710f5","--","design","script","assets/fonts","audio/vo"])
ff(["-y","-i",picture,"-i",audio,"-map","0:v:0","-map","1:a:0","-c","copy","-map_metadata","-1","-movflags","+faststart",video])
probe=ROOT/"engine/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe"
d=json.loads(run([probe,"-v","error","-count_frames","-show_streams","-show_format","-of","json",video]).stdout)
v=next(s for s in d["streams"] if s["codec_type"]=="video");a=next(s for s in d["streams"] if s["codec_type"]=="audio")
assert (v["width"],v["height"],v["avg_frame_rate"],int(v["nb_read_frames"]))==(960,540,"30/1",5853)
assert abs(float(v["duration"])-195.1)<.001 and abs(float(a["start_time"]))<.001
assert int(a["sample_rate"])==48000 and a["channels"]==2
ff(["-v","error","-xerror","-i",video,"-f","null","-"])
m=ff(["-i",video,"-vn","-af","loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json","-f","null","-"])
audio_metrics=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',m.stderr)[-1])
times=[5,14,26,45,63,80,86,113,130,150,186,193]
fontpath=ROOT/"out/engineering/report-font-400.ttf"
font=ImageFont.truetype(str(fontpath),23);small=ImageFont.truetype(str(fontpath),17)
sheet=Image.new("RGB",(1624,1416),"#f7f5ef");draw=ImageDraw.Draw(sheet)
draw.text((32,18),"《虚构集》第三版 · 字成画 · 完整预览",font=font,fill="#242c33")
draw.text((32,54),"960 × 540 / 30 fps · 运动模糊 + 景深 + 光 + 灰尘 · 暂用已确认的 v2 音轨",font=small,fill="#53606a")
stills=[]
for i,t in enumerate(times):
 p=PICS/f"t-{t:06.2f}.png"
 ff(["-y","-v","error","-ss",str(t),"-i",video,"-frames:v","1",p])
 im=Image.open(p).convert("RGB");assert im.size==(960,540)
 x=32+(i%3)*528;y=102+(i//3)*324
 sheet.paste(im.resize((504,284),Image.Resampling.LANCZOS),(x,y))
 draw.text((x,y+290),f"{t:.2f} s  ·  frame {t*30}",font=small,fill="#34424a")
 stills.append({"time":t,"path":str(p.relative_to(ROOT)),"sha256":digest(p.read_bytes())})
sheet.save(PICS/"contact-sheet.png")
paths=[]
for folder in ["design/film3","design/lib"]:
 paths.extend(p for p in (ROOT/folder).rglob("*") if p.is_file())
paths.extend(ROOT/p for p in ["design/v2/fx.js","design/film/script.json","design/film/fonts.css",
 "audio/vo/timing.json","engine/film3.html","engine/film3-shot.js"])
paths.extend((ROOT/"audio/vo").glob("S*.words.json"))
verify_events=[json.loads(l) for l in (ROOT/"out/engineering/film3-verify.ndjson").read_text().splitlines() if l.startswith("{")]
verify_result=next(x for x in reversed(verify_events) if x.get("type")=="result")
assert verify_result["ok"]
warnings=[x for x in verify_events if x.get("type")=="finding"]
r={"verification":{"passedWithinTolerance":True,"exactPixelMatch":not bool(warnings),"warnings":warnings},
"version":"film3-preview","status":"awaiting-director-visual-review","video":{"path":str(video.relative_to(ROOT)),
"sha256":digest(video.read_bytes()),"bytes":video.stat().st_size,"width":960,"height":540,"fps":30,"frames":5853,"duration":195.1},
"render":{"multiplane":"0.3.13","depthOfField":True,"motionBlur":"design reference 180-degree linear-light subframes",
"postOrder":"film.render per subframe, average motion blur, then film.post exactly once",
"sourceRevision":"56710f5","renderLog":"out/engineering/film3-preview-render.ndjson","verifyLog":"out/engineering/film3-verify.ndjson"},
"audio":{"version":"existing approved v2 mix (temporary)","source":str(audio.relative_to(ROOT)),"sha256":digest(audio.read_bytes()),"measurement":audio_metrics},
"completeDecodePassed":True,"stills":stills,"inputs":[{"path":str(p.relative_to(ROOT)),"sha256":digest(p.read_bytes())} for p in sorted(paths)]}
write_json(PICS/"manifest.json",r);write_json(ROOT/"engine/film3-preview.json",r)
print(json.dumps({k:v for k,v in r.items() if k not in ("stills","inputs")},ensure_ascii=False,indent=2),flush=True)
