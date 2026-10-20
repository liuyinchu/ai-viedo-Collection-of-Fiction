"""Mix measured voice and deterministic effects, then normalize in two passes."""
import argparse,json,re,subprocess
from pathlib import Path
from common import ROOT,read_json,write_json,digest,ffmpeg
from voice import checked_segments
def ff(args):
    p=subprocess.run([ffmpeg(),"-hide_banner","-nostdin",*map(str,args)],capture_output=True,text=True)
    if p.returncode:raise RuntimeError(p.stderr[-5000:])
    return p
def measure(path):
    p=ff(["-i",path,"-af","loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json","-f","null","-"])
    return json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',p.stderr)[-1])
ap=argparse.ArgumentParser()
ap.add_argument("--music",type=Path)
ap.add_argument("--out",type=Path,default=ROOT/"audio/mix/no-music-review.wav")
a=ap.parse_args()
checked_segments()
timing=read_json(ROOT/"audio/vo/timing.json")
sfx=read_json(ROOT/"audio/sfx/manifest.json")
if sfx["designCuesSha256"]!=digest((ROOT/"design/cues.json").read_bytes()):
    raise RuntimeError("SFX cues are stale; synthesize again before mixing")
paths=[ROOT/"audio/vo/narration.wav",ROOT/"audio/sfx/sfx.wav",ROOT/"audio/sfx/ambience.wav"]
if a.music:paths.append(a.music.resolve())
a.out.parent.mkdir(parents=True,exist_ok=True)
raw=a.out.with_name(a.out.stem+".premix.wav")
args=["-y"]
for p in paths:args+=["-i",p]
filters=["[0:a]pan=stereo|c0=c0|c1=c0[voice]"]
mixins="[voice]"+"".join(f"[{i}:a]" for i in range(1,len(paths)))
filters.append(f"{mixins}amix=inputs={len(paths)}:normalize=0:duration=longest:dropout_transition=0[mix]")
ff(args+["-filter_complex",";".join(filters),"-map","[mix]","-t",timing["total"],"-ar","48000","-c:a","pcm_f32le",raw])
first=measure(raw)
norm=(f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={first['input_i']}:"
      f"measured_TP={first['input_tp']}:measured_LRA={first['input_lra']}:"
      f"measured_thresh={first['input_thresh']}:offset={first['target_offset']}:linear=true:print_format=json")
ff(["-y","-i",raw,"-af",norm,"-ar","48000","-ac","2","-c:a","pcm_s24le",a.out])
verified=measure(a.out)
# A small linear gain correction brings the measured integrated loudness onto target
# when the true-peak budget permits it; measure the actual corrected file again.
correction=-14-float(verified["input_i"])
if abs(correction)>0.01 and float(verified["input_tp"])+correction<=-1.05:
    corrected=a.out.with_name(a.out.stem+".corrected.wav")
    ff(["-y","-i",a.out,"-af",f"volume={correction}dB","-ar","48000","-c:a","pcm_s24le",corrected])
    corrected.replace(a.out)
    verified=measure(a.out)
passed=abs(float(verified["input_i"])+14)<=0.300001 and float(verified["input_tp"])<=-1
write_json(a.out.with_suffix(".json"),{"kind":"music-included" if a.music else "voice-and-effects-review-without-music","target":{"integratedLUFS":-14,"maxTruePeakDbTP":-1},"firstPass":first,"verified":verified,"passed":passed,"duration":timing["total"],"inputs":[{"path":str(p.relative_to(ROOT)),"sha256":digest(p.read_bytes())} for p in paths],"outputSha256":digest(a.out.read_bytes())})
if not passed:raise RuntimeError("Loudness check failed; review the measurement JSON")
print(f"{a.out}: {verified['input_i']} LUFS, {verified['input_tp']} dBTP")
