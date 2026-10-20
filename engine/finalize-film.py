"""Replace a picture tail, preserve the accepted prefix, and validate the final delivery."""
import argparse,json,re,shutil,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from common import ROOT,read_json,write_json,digest,ffmpeg
WORK=ROOT/"out/patch-s18";OUT=ROOT/"out/final"
PROBE=ROOT/"engine/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe"
NAME="borges-fiction-3min-v1"
HEAD=WORK/"head-to-170.mp4";TAIL=WORK/"tail-from-170.mp4"
AUDIO=WORK/"approved-v2.m4a";PICTURE=WORK/"picture-patched.mp4";FINAL=OUT/(NAME+".mp4")
def run(args):
 p=subprocess.run([str(x) for x in args],capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stderr[-6000:])
 return p
def ff(args):return run([ffmpeg(),"-hide_banner","-nostdin",*args])
def probe(path,count=False):
 return json.loads(run([PROBE,"-v","error",*(["-count_frames"] if count else []),"-show_streams","-show_format","-of","json",path]).stdout)
def measure(path):
 p=ff(["-i",path,"-vn","-af","loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json","-f","null","-"])
 return json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',p.stderr)[-1])
def checked_inputs():
 p=read_json(ROOT/"engine/tail-patch-plan.json")
 for item in p["sourceInputs"]+[p["sourceVideo"],p["audioReuse"]]:
  if digest((ROOT/item["path"]).read_bytes())!=item["sha256"]:raise RuntimeError("Input changed: "+item["path"])
 approval=read_json(ROOT/"audio/music/approval.json")
 assert approval["mix"]["sha256"]==p["audioReuse"]["sha256"]
 WORK.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
 return p
def video_stream(path,frames):
 d=probe(path,True);s=next(x for x in d["streams"] if x["codec_type"]=="video")
 assert s["codec_name"]=="h264" and s["pix_fmt"]=="yuv420p"
 assert (s["width"],s["height"],s["avg_frame_rate"])==(1920,1080,"30/1")
 assert int(s["nb_read_frames"])==frames,(str(path),s["nb_read_frames"],frames)
 assert abs(float(s["duration"])-frames/30)<.001,(str(path),s["duration"])
 assert abs(float(s.get("start_time",0)))<1e-6
 return d,s
def prepare():
 p=checked_inputs()
 # 170 s is an original closed 10-second segment boundary.
 ff(["-y","-i",ROOT/p["sourceVideo"]["path"],"-map","0:v:0","-an","-c:v","copy",
     "-frames:v",str(p["cutFrame"]),"-map_metadata","-1","-movflags","+faststart",HEAD])
 video_stream(HEAD,p["cutFrame"])
 print("Original prefix preserved:",p["cutFrame"],"frames.",flush=True)
 gain=0.;attempts=[]
 for _ in range(3):
  args=["-y","-i",ROOT/p["audioReuse"]["path"],"-map","0:a:0","-vn"]
  if abs(gain)>1e-9:args+=["-af",f"volume={gain:.8f}dB"]
  ff(args+["-ar","48000","-ac","2","-c:a","aac","-b:a","320k","-map_metadata","-1","-movflags","+faststart",AUDIO])
  m=measure(AUDIO);attempts.append({"gainDb":gain,"measurement":m})
  loud=float(m["input_i"]);peak=float(m["input_tp"])
  if abs(loud+14)<=.300001 and peak<=-1:break
  if peak>-1:gain+=-1.08-peak
  elif abs(loud+14)>.3 and peak+(-14-loud)<=-1.05:gain+=-14-loud
  else:raise RuntimeError("AAC needs a revised master to meet both targets")
 else:raise RuntimeError("AAC verification failed after three encodes")
 r={"sourceMix":p["audioReuse"],"codec":"aac","bitRate":320000,"sampleRate":48000,"channels":2,
    "gainDb":gain,"attempts":attempts,"verified":m,"sha256":digest(AUDIO.read_bytes()),"passed":True}
 write_json(WORK/"audio-encode.json",r);write_json(ROOT/"audio/mix/final-aac-encode.json",r)
 print("Encoded audio:",m["input_i"],"LUFS,",m["input_tp"],"dBTP; gain",gain,"dB.",flush=True)
def framemd5(path,out,frames=None):
 args=["-i",path,"-map","0:v:0","-an"]
 if frames is not None:args+=["-frames:v",str(frames)]
 ff(["-y",*args,"-f","framemd5",out])
 return [l.split(",")[-1].strip() for l in out.read_text().splitlines() if l and not l.startswith("#")]
def subtitles():
 run([ROOT/"engine/.venv/bin/python",ROOT/"engine/voice.py","subtitles"])
 path=ROOT/"out/film.zh-CN.srt";blocks=path.read_text().strip().split("\n\n")
 def seconds(t):
  h,m,s=t.replace(",",".").split(":");return int(h)*3600+int(m)*60+float(s)
 text=[];last=0
 for n,b in enumerate(blocks,1):
  lines=b.splitlines();assert int(lines[0])==n
  a,z=map(seconds,lines[1].split(" --> "))
  assert a>=last-.001 and z>a and z<=195.1
  last=z;text.append("".join(lines[2:]))
 expected="".join(s["text"] for s in read_json(ROOT/"audio/vo/segments.json")["segments"])
 assert "".join(text)==expected,"SRT differs from canonical script"
 target=OUT/(NAME+".zh-CN.srt");shutil.copy2(path,target)
 return {"path":str(target.relative_to(ROOT)),"cues":len(blocks),"sha256":digest(target.read_bytes()),
         "timing":"Measured paragraph bounds; within-paragraph splits by character weight; not burned in."}
def assemble():
 p=checked_inputs();encoded=read_json(WORK/"audio-encode.json")
 assert digest(AUDIO.read_bytes())==encoded["sha256"]
 _,h=video_stream(HEAD,p["cutFrame"]);_,t=video_stream(TAIL,p["tailFrames"])
 for k in ["codec_name","profile","width","height","pix_fmt","r_frame_rate","time_base"]:
  assert h.get(k)==t.get(k),(k,h.get(k),t.get(k))
 concat=WORK/"concat.txt"
 concat.write_text("file 'head-to-170.mp4'\nduration 170.000000\nfile 'tail-from-170.mp4'\n")
 ff(["-y","-f","concat","-safe","0","-i",concat,"-map","0:v:0","-c:v","copy","-an","-map_metadata","-1","-movflags","+faststart",PICTURE])
 ff(["-y","-i",PICTURE,"-i",AUDIO,"-map","0:v:0","-map","1:a:0","-c","copy","-map_metadata","-1","-movflags","+faststart",FINAL])
 print("Picture stitched and audio muxed; validating encoded delivery.",flush=True)
 meta,v=video_stream(FINAL,p["totalFrames"])
 a=next(s for s in meta["streams"] if s["codec_type"]=="audio")
 assert a["codec_name"]=="aac" and int(a["sample_rate"])==48000 and a["channels"]==2
 assert len(meta["streams"])==2,"Subtitles must be separate"
 assert abs(float(a["start_time"]))<.001
 timeline=read_json(ROOT/"audio/vo/timing.json")
 assert abs(float(a["duration"])-timeline["total"])<.0011
 assert abs(float(meta["format"]["duration"])-195.1)<.001
 ff(["-v","error","-xerror","-i",FINAL,"-f","null","-"])
 print("Format, duration and complete decode passed.",flush=True)
 packets=json.loads(run([PROBE,"-v","error","-select_streams","v:0","-show_frames",
    "-show_entries","frame=best_effort_timestamp_time","-of","json",FINAL]).stdout)["frames"]
 pts=[float(f["best_effort_timestamp_time"]) for f in packets]
 assert len(pts)==p["totalFrames"]
 assert max(abs(t-i/30) for i,t in enumerate(pts))<.000002,"Frame timing drift"
 original=framemd5(ROOT/p["sourceVideo"]["path"],WORK/"original-prefix.framemd5",p["cutFrame"])
 tail=framemd5(TAIL,WORK/"new-tail.framemd5")
 final=framemd5(FINAL,WORK/"final-picture.framemd5")
 assert final==original+tail,"Stitch changed, dropped or duplicated decoded frames"
 print("All decoded frames match original prefix plus replacement tail.",flush=True)
 audio=measure(FINAL)
 assert abs(float(audio["input_i"])+14)<=.300001 and float(audio["input_tp"])<=-1,audio
 sub=subtitles();stills=[]
 for time in [186,190]:
  path=OUT/f"frame-{time}s.png"
  ff(["-y","-v","error","-ss",str(time),"-i",FINAL,"-frames:v","1",path])
  stills.append({"time":time,"frame":time*30,"path":str(path.relative_to(ROOT)),"sha256":digest(path.read_bytes())})
 fontpath=ROOT/"out/engineering/report-font-400.ttf"
 font=ImageFont.truetype(str(fontpath),25);small=ImageFont.truetype(str(fontpath),18)
 sheet=Image.new("RGB",(1632,584),"#f7f5ef");draw=ImageDraw.Draw(sheet)
 draw.text((24,16),"《虚构集》最终成片 · 片尾修正复核",font=font,fill="#242c33")
 draw.text((24,56),"186 秒：开场句完整入画    /    190 秒：拉远中的画面",font=small,fill="#53606a")
 for i,item in enumerate(stills):
  im=Image.open(ROOT/item["path"]).convert("RGB");assert im.size==(1920,1080)
  x=24+i*804;sheet.paste(im.resize((780,439),Image.Resampling.LANCZOS),(x,96))
  draw.text((x,545),f"{item['time']}.00 s  ·  frame {item['frame']}",font=small,fill="#34424a")
 sheet.save(OUT/"closing-review.png")
 r={"status":"final-mp4-delivered-awaiting-director-and-Claudes-last-look",
    "video":{"path":str(FINAL.relative_to(ROOT)),"sha256":digest(FINAL.read_bytes()),"bytes":FINAL.stat().st_size,
       "width":1920,"height":1080,"fps":30,"frames":len(pts),"duration":195.1,"codec":"h264","pixelFormat":"yuv420p"},
    "audio":{"target":{"integratedLUFS":-14,"toleranceLU":0.3,"maxTruePeakDbTP":-1},"codec":"aac","sampleRate":48000,"channels":2,"duration":float(a["duration"]),"approvedVersion":"synthetic-v2",
       "measurement":audio,"encodeGainDb":encoded["gainDb"]},
    "checks":{"fullDecode":True,"exactFrameGrid":True,"decodedPrefixAndTailIdentical":True,"prefixFrames":len(original),
       "tailFrames":len(tail),"loudnessAndTruePeak":True,"subtitleTextAndTimes":True,"sourcesMatchRenderPlan":True},
    "subtitles":sub,"stills":stills,"patchPlan":"engine/tail-patch-plan.json","audioApproval":"audio/music/approval.json",
    "renderLog":"out/engineering/tail-s18-render.ndjson"}
 write_json(OUT/"delivery.json",r);write_json(ROOT/"engine/final-delivery.json",r)
 print(json.dumps(r,ensure_ascii=False,indent=2),flush=True)
if __name__=="__main__":
 ap=argparse.ArgumentParser();ap.add_argument("step",choices=["prepare","assemble"]);args=ap.parse_args()
 (prepare if args.step=="prepare" else assemble)()
