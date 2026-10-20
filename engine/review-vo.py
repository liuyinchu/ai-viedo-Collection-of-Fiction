"""Build a clearly labelled listening montage from ASR-flagged segments."""
import numpy as np,soundfile as sf
from common import ROOT,read_json,write_json
out=ROOT/"out/review"
out.mkdir(exist_ok=True,parents=True)
parts=[];entries=[];t=0.0
notes={"S04":"收在；《虚构集》里","S10":"博尔赫斯","S12":"《堂吉诃德》；一字不差","S16":"《堂吉诃德》","S18":"你／您；王永年的译本"}
for sid,focus in notes.items():
    x,sr=sf.read(ROOT/f"audio/vo/{sid}.wav")
    entries.append({"id":sid,"start":t,"end":t+len(x)/sr,"focus":focus})
    parts.extend([x,np.zeros(sr)])
    t+=len(x)/sr+1
sf.write(out/"pronunciation-review.wav",np.concatenate(parts),48000,subtype="PCM_16")
write_json(out/"pronunciation-review.json",{"purpose":"ASR differences for human listening; not confirmed TTS errors","segments":entries})
print(f"Listening montage: {t:.3f}s")
