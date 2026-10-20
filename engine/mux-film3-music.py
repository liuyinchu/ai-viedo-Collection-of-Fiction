"""Additional film3 audition with the new, unapproved v3 score; retain the v2-audio preview."""
import json,re,subprocess
from pathlib import Path
from common import ROOT,read_json,write_json,digest,ffmpeg
DIR=ROOT/"out/review/music-v3";DIR.mkdir(exist_ok=True)
MASTER=ROOT/"audio/mix/synthetic-v3-review.wav";AUDIO=DIR/"with-voice.m4a"
PICTURE=ROOT/"out/review/film-v3-picture-preview.mp4"
VIDEO=ROOT/"out/review/film-v3-music-v3-preview.mp4"
def ff(args):
 p=subprocess.run([ffmpeg(),"-hide_banner","-nostdin",*map(str,args)],capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stderr[-6000:])
 return p
def measure(path):
 p=ff(["-i",path,"-vn","-af","loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json","-f","null","-"])
 return json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',p.stderr)[-1])
mix=read_json(MASTER.with_suffix(".json"));assert mix["passed"]
assert digest(MASTER.read_bytes())==mix["outputSha256"]
# Reserve codec headroom with a short oversampled master-peak limiter.
# This is only for the delivery encoding; the source mix and separate stems stay intact.
codec_source=DIR/"aac-source.wav"
peak_filter="aresample=192000,alimiter=limit=0.812830516:attack=2:release=80:level=false:latency=true,aresample=48000"
duration=read_json(ROOT/"audio/vo/timing.json")["total"]
ff(["-y","-i",MASTER,"-af",peak_filter,"-t",duration,"-ar","48000","-ac","2","-c:a","pcm_s24le",codec_source])
source_measure=measure(codec_source)
wanted=-14-float(source_measure["input_i"])
gain=min(wanted,-1.55-float(source_measure["input_tp"])) if wanted>0 else wanted
attempts=[]
for _ in range(3):
 args=["-y","-i",codec_source,"-map","0:a:0","-vn"]
 if gain:args+=["-af",f"volume={gain:.8f}dB"]
 ff(args+["-c:a","aac","-b:a","320k","-ar","48000","-ac","2","-map_metadata","-1","-movflags","+faststart",AUDIO])
 m=measure(AUDIO);attempts.append({"gainDb":gain,"measurement":m})
 if abs(float(m["input_i"])+14)<=.300001 and float(m["input_tp"])<=-1:break
 if float(m["input_tp"])>-1:gain+=-1.04-float(m["input_tp"])
 else:raise RuntimeError("AAC level requires master revision: "+json.dumps(m))
else:raise RuntimeError("AAC verification failed")
ff(["-y","-i",PICTURE,"-i",AUDIO,"-map","0:v:0","-map","1:a:0","-c","copy","-map_metadata","-1","-movflags","+faststart",VIDEO])
ff(["-v","error","-xerror","-i",VIDEO,"-f","null","-"])
final=measure(VIDEO)
assert abs(float(final["input_i"])+14)<=.300001 and float(final["input_tp"])<=-1
probe=ROOT/"engine/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe"
p=subprocess.run([str(probe),"-v","error","-show_streams","-show_format","-of","json",str(VIDEO)],capture_output=True,text=True,check=True)
data=json.loads(p.stdout);v=next(s for s in data["streams"] if s["codec_type"]=="video");a=next(s for s in data["streams"] if s["codec_type"]=="audio")
assert (v["width"],v["height"],v["avg_frame_rate"],int(v["nb_frames"]))==(960,540,"30/1",5853)
assert abs(float(a["start_time"]))<.001 and abs(float(data["format"]["duration"])-195.1)<.001
r={"status":"audition-awaiting-director","encodingHeadroom":{"filter":peak_filter,"sourceMeasurement":source_measure},"pictureVersion":"film3","musicVersion":"synthetic-v3","gainDb":gain,
"master":{"path":str(MASTER.relative_to(ROOT)),"sha256":digest(MASTER.read_bytes())},
"audio":{"path":str(AUDIO.relative_to(ROOT)),"sha256":digest(AUDIO.read_bytes()),"attempts":attempts},
"video":{"path":str(VIDEO.relative_to(ROOT)),"sha256":digest(VIDEO.read_bytes()),"width":960,"height":540,"frames":5853,"fps":30,"duration":195.1},
"verified":final,"fullDecodePassed":True,"passed":True}
write_json(DIR/"encoded-review.json",r);write_json(ROOT/"audio/mix/synthetic-v3-aac.json",r)
html=DIR/"index.html";s=html.read_text().replace('src="with-voice.mp3"','src="with-voice.m4a"');html.write_text(s)
print(json.dumps(r,ensure_ascii=False,indent=2),flush=True)
