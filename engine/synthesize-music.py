"""Original, deterministic modal-string score. No external music or instrument samples."""
import argparse, hashlib, math
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve
from common import ROOT, read_json, write_json, digest
SR = 48000
VERSION = "synthetic-v1"
OUT = ROOT/"audio/music"/VERSION
TARGET_PEAK_DB = -25.5
DUCK_DB = 4.5
SYNTHESIS_INFO = {"reference":"Same D4–A4–E5–B4 phrase over D3 then G2; ending keeps D4–A4–E5.", "fixedSeedNamespace":"borges-modal-v1 / borges-room-v1"}
# The same four-note phrase is heard over different bass notes in the first two cues.
# All offsets are seconds relative to the approved placement windows.
PHRASE = [
    (1.10, "D4", 0.78, -0.16),
    (4.80, "A4", 0.63, 0.12),
    (8.60, "E5", 0.51, -0.09),
    (12.90, "B4", 0.48, 0.18),
]
SCORES = {
    "opening": [(0.48,"D3",0.40,0.0), *PHRASE, (15.45,"A4",0.30,0.03)],
    "menard": [(0.48,"G2",0.36,0.0), *PHRASE, (16.40,"C3",0.25,0.02),
               (19.30,"D5",0.39,-0.12),(23.00,"A4",0.30,0.14),(26.10,"E4",0.24,-0.03)],
    "ending": [(0.35,"D3",0.30,0.0),(0.95,"D4",0.53,-0.12),
               (3.45,"A4",0.40,0.13),(6.30,"E5",0.28,-0.04)],
}
def db(x):
    return 10**(x/20)
def smooth(x):
    p=np.clip(x,0,1)
    return p*p*(3-2*p)
def seed(label):
    return int.from_bytes(hashlib.sha256(label.encode()).digest()[:8],"little")
def hz(note):
    pitches={"C":0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11}
    midi=(int(note[-1])+1)*12+pitches[note[:-1]]
    return 440*2**((midi-69)/12)
def modal_note(note):
    """Soft excitation plus damped string modes, with frequency-dependent decay."""
    f=hz(note)
    dur=8.5 if f<180 else 6.8
    t=np.arange(round(dur*SR))/SR
    rng=np.random.default_rng(seed("borges-modal-v1:"+note))
    signal=np.zeros(len(t))
    body_decay=2.8*(220/f)**0.18
    partials=[1.0,0.29,0.105,0.045,0.019,0.008]
    for k,amp in enumerate(partials,1):
        if k*f>8500:continue
        freq=f*k*math.sqrt(1+0.000025*k*k)
        decay=body_decay/(k**0.58)
        env=np.exp(-t/decay)
        phase=float(rng.uniform(-0.10,0.10))
        # Quiet, slightly separated string modes; no periodic vibrato or beat grid.
        component=0.68*np.sin(2*np.pi*freq*t+phase)
        component+=0.32*np.sin(2*np.pi*freq*2**(0.85/1200)*t-phase)
        signal+=amp*env*component
    attack=smooth(t/(0.032 if f>=180 else 0.055))
    tail=smooth((dur-t)/0.65)
    felt=rng.normal(0,1,len(t))
    felt=sosfilt(butter(2,[180,1500],fs=SR,btype="bandpass",output="sos"),felt)
    felt*=0.018*np.exp(-t/0.018)*smooth(t/0.002)
    signal=(signal*attack+felt)*tail
    return signal/max(np.max(np.abs(signal)),1e-12)
def room_ir(channel):
    n=round(0.82*SR)
    ir=np.zeros(n)
    # Short, fixed reflections; a quiet diffuse tail avoids a discrete echo.
    taps=[(0.017,0.070),(0.031,0.055),(0.053,0.045),(0.079,0.034),
          (0.113,0.025),(0.157,0.018),(0.211,0.012),(0.293,0.008)]
    for i,(delay,gain) in enumerate(taps):
        offset=0.004*(channel*2-1)*((i%3)-1)
        ir[round((delay+offset)*SR)]+=gain*(-1 if i%4==3 else 1)
    t=np.arange(n)/SR
    noise=np.random.default_rng(seed(f"borges-room-v1-{channel}")).normal(0,1,n)
    noise=sosfilt(butter(2,2200,fs=SR,output="sos"),noise)
    ir+=noise*np.exp(-t/0.15)*smooth(t/0.035)*0.00065
    return ir
def score_window(window):
    n=round((window["end"]-window["start"])*SR)
    dry=np.zeros((n,2))
    events=[]
    for offset,pitch,velocity,pan in SCORES[window["id"]]:
        start=round(offset*SR)
        if start>=n:raise ValueError("Note starts outside its placement window")
        note=modal_note(pitch)*velocity
        length=min(len(note),n-start)
        angle=(pan+1)*np.pi/4
        dry[start:start+length,0]+=note[:length]*math.cos(angle)
        dry[start:start+length,1]+=note[:length]*math.sin(angle)
        events.append({"offset":offset,"pitch":pitch,"frequencyHz":hz(pitch),
                       "velocity":velocity,"pan":pan})
    wet=np.column_stack([fftconvolve(dry[:,ch],room_ir(ch))[:n] for ch in range(2)])
    x=dry+wet
    t=np.arange(n)/SR
    gain=smooth(t/window["fadeIn"])*smooth(((n-1)/SR-t)/window["fadeOut"])
    x*=gain[:,None]
    return x,events
def build_score():
    placement=read_json(ROOT/"audio/music/placement.json")
    timing=read_json(ROOT/"audio/vo/timing.json")
    n=round(timing["total"]*SR)
    score=np.zeros((n,2))
    activity=np.zeros(n,dtype=bool)
    clips=[];events=[]
    for window in placement["windows"]:
        x,notes=score_window(window)
        a=round(window["start"]*SR)
        b=a+len(x)
        if a<0 or b>n+1:raise ValueError("Music window lies outside the measured film")
        b=min(b,n);x=x[:b-a]
        score[a:b]+=x
        activity[a:b]=True
        clips.append((window,x))
        events.append({"window":window,"notes":notes})
    # One fixed gain for all three cues, retaining their relative dynamics.
    gain=db(TARGET_PEAK_DB)/max(np.max(np.abs(score)),1e-12)
    score*=gain
    # Smooth 4.5 dB attenuation under actual narration, with 50 ms attack / 450 ms recovery.
    voice,sr=sf.read(ROOT/"audio/vo/narration.wav")
    if sr!=SR or len(voice)!=n:raise ValueError("Narration and music timeline differ")
    hop=480
    frame_levels=np.array([np.sqrt(np.mean(voice[i:i+hop]**2)) for i in range(0,n,hop)])
    target=1-(1-db(-DUCK_DB))*smooth((frame_levels-db(-44))/(db(-31)-db(-44)))
    current=1.0;envelope=[]
    for v in target:
        alpha=math.exp(-0.01/(0.05 if v<current else 0.45))
        current=alpha*current+(1-alpha)*float(v)
        envelope.append(current)
    duck=np.interp(np.arange(n),np.arange(len(envelope))*hop,envelope)
    score*=duck[:,None]
    if not np.isfinite(score).all() or np.max(np.abs(score))>=1:raise ValueError("Invalid music samples")
    if np.any(score[~activity]):raise ValueError("Music escaped its three placement windows")
    return score,clips,gain,events,activity
def metrics(x):
    return {"samples":len(x),"sampleRate":SR,"channels":2,
            "peakDbFS":20*np.log10(max(float(np.max(np.abs(x))),1e-12)),
            "rmsDbFS":20*np.log10(max(float(np.sqrt(np.mean(x*x))),1e-12))}
def main():
    ap=argparse.ArgumentParser();ap.add_argument("--verify",action="store_true");a=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    x,clips,gain,events,activity=build_score()
    deterministic=None
    if a.verify:
        y,*_=build_score()
        deterministic=bool(np.array_equal(x,y))
        if not deterministic:raise ValueError("Repeated synthesis differs")
        del y
    score=OUT/"score.wav"
    sf.write(score,x,SR,subtype="PCM_24")
    # Solo audition uses a louder fixed gain for hearing the tone, not the mix level.
    audition_gain=db(-12)/max(np.max(np.abs(clip)) for _,clip in clips)
    audition=[]
    for window,clip in clips:
        sf.write(OUT/(window["id"]+"-solo.wav"),clip*audition_gain,SR,subtype="PCM_24")
        audition.extend([clip*audition_gain,np.zeros((round(0.8*SR),2))])
    solo=np.concatenate(audition[:-1])
    sf.write(OUT/"solo-audition.wav",solo,SR,subtype="PCM_24")
    manifest={"version":VERSION,"status":"audition-awaiting-director","method":"original modal-string synthesis",
       "externalSamples":False,"sampleRate":SR,"timelineSha256":digest((ROOT/"audio/vo/timing.json").read_bytes()),
       "placementSha256":digest((ROOT/"audio/music/placement.json").read_bytes()),
       "narrationSha256":digest((ROOT/"audio/vo/narration.wav").read_bytes()),
       **SYNTHESIS_INFO,"peakBeforeDuckingDbFS":TARGET_PEAK_DB,"duckingDb":DUCK_DB,
       "determinismChecked":deterministic,"silenceOutsideWindows":True,
       "score":{**metrics(x),"path":str(score.relative_to(ROOT)),"sha256":digest(score.read_bytes())},
       "soloAudition":{**metrics(solo),"gainPurpose":"louder audition; not the production music level"},
       "events":events}
    write_json(OUT/"manifest.json",manifest)
    print(f"{VERSION}: three music windows; score {len(x)/SR:.3f}s; solo audition {len(solo)/SR:.3f}s.")
    print(f"Production score peak {manifest['score']['peakDbFS']:.2f} dBFS; deterministic={deterministic}.")
if __name__=="__main__":main()
