"""Deterministic, quiet paper/air sound design at the measured storyboard cues."""
import hashlib, math
import numpy as np
from scipy.signal import butter,sosfilt
import soundfile as sf
from common import ROOT,read_json,write_json,digest
SR=48000
OUT=ROOT/"audio/sfx"
def seed(label):
    return int.from_bytes(hashlib.sha256(label.encode()).digest()[:8],"little")
def noise(n,label,low,high):
    x=np.random.default_rng(seed(label)).standard_normal(n)
    sos=butter(2,[low,high],btype="bandpass",fs=SR,output="sos")
    return sosfilt(sos,x)
def peak_normalize(x,target):
    peak=np.max(np.abs(x))
    return x*(target/max(peak,1e-12))
def stereo(x,pan):
    pan=np.asarray(pan)
    a=(pan+1)*np.pi/4
    return np.column_stack((x*np.cos(a),x*np.sin(a)))
def metrics(path,x):
    return {"path":str(path.relative_to(ROOT)),"samples":len(x),"sampleRate":SR,"channels":2,"peakDbFS":20*np.log10(max(float(np.max(np.abs(x))),1e-12)),"rmsDbFS":20*np.log10(max(float(np.sqrt(np.mean(x*x))),1e-12)),"sha256":digest(path.read_bytes())}
plan=read_json(OUT/"plan.json")
N=round(plan["duration"]*SR)
fx=np.zeros((N,2),dtype=np.float64)
notes=[]
for e in plan["events"]:
    typ=e["type"]
    if typ=="dim":
        notes.append({"index":e["index"],"type":typ,"operation":"ambience -8 dB fade"});continue
    d={"settle":0.12,"collapse":0.4}.get(typ,e.get("dur",0.2))
    n=max(2,round(d*SR))
    p=np.arange(n)/max(1,n-1)
    label=f"borges-v1:{e['index']}:{typ}"
    if typ=="settle":
        x=noise(n,label,900,7500)
        env=np.minimum(1,p/0.035)*np.exp(-p*8)
        target=0.016
    elif typ=="collapse":
        x=noise(n,label,140,2800)
        env=np.sin(np.pi*p)**2*(0.3+0.7*p)
        target=0.025
    else:
        x=noise(n,label,180,2400 if typ=="move" else 1500)
        env=np.interp(p,np.linspace(0,1,len(e["envelope"])),e["envelope"])**0.7
        edge=np.minimum(1,np.minimum(p,1-p)*35)
        env*=np.maximum(0,edge)
        if typ=="pullback":env*=(1-p)**1.5
        target=0.009 if typ=="move" else 0.004
    x=peak_normalize(x*env,target)
    pan=0.16*(2*p-1)*e.get("panDirection",1) if typ in ("move","pullback") else ((seed(label)%100)/100-0.5)*0.25
    clip=stereo(x,pan)
    start=round(e["t"]*SR);end=min(N,start+n)
    if start<0 or start>=N:raise ValueError("Cue outside measured timeline")
    fx[start:end]+=clip[:end-start]
    notes.append({"index":e["index"],"type":typ,"time":e["t"],"duration":n/SR,"seed":seed(label),"targetPeakDbFS":20*math.log10(target)})
# Two independent broad-band air channels, with no pitched oscillator or modulation.
air=np.column_stack([noise(N,f"library-air-v1-{ch}",90,4200) for ch in range(2)])
air*=10**(-58/20)/np.sqrt(np.mean(air*air))
time=np.arange(N)/SR
gain=np.minimum(1,time/1.5)
for e in plan["events"]:
    if e["type"]=="dim":
        u=np.clip((time-e["t"])/e["dur"],0,1)
        gain*=1-(1-10**(-8/20))*(u*u*(3-2*u))
    if e["type"]=="pullback":
        end=plan["duration"]
        gain*=1-np.clip((time-e["t"])/(end-e["t"]),0,1)
gain*=np.minimum(1,np.maximum(0,(plan["duration"]-time)/1.2))
air*=gain[:,None]
outputs=[]
for name,x in [("sfx.wav",fx),("ambience.wav",air)]:
    if not np.isfinite(x).all() or np.max(np.abs(x))>=1:raise ValueError("Invalid or clipping sound stem")
    path=OUT/name
    sf.write(path,x,SR,subtype="PCM_24")
    outputs.append(metrics(path,x))
write_json(OUT/"manifest.json",{"version":2,"wordSync":plan["wordSync"],"inputs":plan["inputs"],"designCuesSha256":digest((ROOT/"design/cues.json").read_bytes()),"planSha256":digest((OUT/"plan.json").read_bytes()),"duration":plan["duration"],"events":notes,"stems":outputs,"directorListening":"pending"})
print(f"{len(notes)} cues synthesized; {plan['duration']:.6f}s, 48 kHz stereo.")
for o in outputs:print(o["path"],"peak",round(o["peakDbFS"],2),"dBFS")
