"""Full-film original score, derived from film3 cue IDs; separate motif, bed and accent stems."""
import argparse,hashlib,importlib.util,math
from functools import lru_cache
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt
from common import ROOT,read_json,write_json,digest
SR=48000;OUT=ROOT/"audio/music/synthetic-v3";N=round(read_json(ROOT/"audio/vo/timing.json")["total"]*SR)
spec=importlib.util.spec_from_file_location("instrument_v2",ROOT/"engine/synthesize-music-v2.py")
instrument=importlib.util.module_from_spec(spec);spec.loader.exec_module(instrument)
hz=instrument.base.hz;db=lambda n:10**(n/20)
def smooth(x):
 p=np.clip(x,0,1);return p*p*(3-2*p)
timing=read_json(ROOT/"audio/vo/timing.json")
seg={s["id"]:s for s in timing["segments"]}
cues=read_json(ROOT/"design/cues3.json")["cues"]
line={c["line"]:c for c in cues if c.get("line")}
CUT=next(c["t"] for c in cues if c["type"]=="collapse")
THINK=line["think"]["t"];DIM=next(c["t"] for c in cues if c["type"]=="dim")
PULL=next(c["t"] for c in cues if c["type"]=="pullback")
TOTAL=N/SR;FADE=TOTAL-1.4
def start(s):return seg[s]["start"]
def end(s):return seg[s]["end"]
events=[]
def note(role,t,pitch,vel=.65,dur=5,pan=0,group="",anchor=None):
 assert 0<=t<TOTAL,(role,t,pitch)
 events.append({"role":role,"time":float(t),"pitch":pitch,"velocity":vel,"duration":dur,"pan":pan,"group":group,**({"anchor":anchor} if anchor else {})})
def chord(t,pitches,dur,vel=.25,group=""):
 for i,p in enumerate(pitches):
  note("bed",t,p,vel,dur,(-.22+i*.44/max(1,len(pitches)-1)),group)
def theme(t,offsets,pitches=("D4","A4","E5","B4"),vel=.65,group="",anchors=None,dur=5):
 for i,(off,p) in enumerate(zip(offsets,pitches)):
  note("motif",t+off,p,vel*[1,.88,.82,.90][i],dur,[-.12,.10,-.07,.14][i],group,(anchors or {}).get(i))
def cue_note(name,pitch="D5",vel=.24):
 note("points",line[name]["t"],pitch,vel,2,.16 if len(name)%2 else -.16,"cue",name)

# A close solo opening; the written maze sentence lands on D at its actual settle cue.
theme(.65,[0,3.7,7.47,11.8],vel=.72,group="opening",dur=7.8)
note("motif",line["s02"]["t"],"D4",.85,7.8,0,"opening-tonic","s02")
# Babel: irregular low pulses, then wider registers and voices toward S05's end.
chord(start("S03"),["D3","A3"],9,.18,"babel-entry")
pulse=next(c["t"] for c in cues if c["type"]=="move" and c["seg"]=="S03")
for i,dt in enumerate([0,3.3,6.1,9.6,13.2,16.1,18.6,21.0,23.2,25.3]):
 note("bed",pulse+dt,["D3","A3","E3","A3"][i%4],.42,3.2,-.12 if i%2 else .12,"babel-pulse")
for t,ps,d,v in [(28.5,["E3","B3"],8,.18),(35.5,["D3","A3","E4"],8,.24),(41,["G2","D3","B3","E4"],8,.27)]:
 chord(t,ps,d,v,"babel-expansion")
theme(28.1,[0,4.2,7.7,11.5],vel=.50,group="babel-phrase",dur=7)
theme(40.8,[0,2.0,4.0,6.2],("D5","A5","E5","B4"),.56,"babel-high",dur=5)
cue_note("s03","A5",.20);cue_note("babel","D5",.20)
chord(end("S05")+.6,["E3","B3"],start("S07")-end("S05")+.1,.19,"babel-suspension")
# Selection: one melodic line; no chord pulse underneath.
theme(start("S07")+.7,[0,2.2,4.4,6.6],vel=.53,group="selection",dur=5)
note("motif",line["s07"]["t"],"D4",.64,5,0,"selection-anchor","s07")
# Funes: lower, increasingly interleaved canons; the most crowded passage.
chord(start("S08"),["D3","A3"],8,.24,"funes-dark")
theme(start("S08")+.5,[0,2.5,5,7.5],("D3","A3","E4","B3"),.62,"funes-low",dur=6)
chord(start("S09"),["D3","F3","B3"],10.3,.28,"funes-build")
for j,(t,step,pitches,vel) in enumerate([
 (start("S09")+.2,1.7,("D4","A4","E5","B4"),.58),
 (start("S09")+2.1,1.2,("D3","A3","E4","B3"),.60),
 (start("S09")+4.2,.85,("D5","A5","E5","B4"),.57),
 (start("S09")+6.2,.65,("D4","A4","E5","B4"),.57)]):
 theme(t,[0,step,2*step,3*step],pitches,vel,"funes-canon-"+str(j),dur=5)
# Everything before the collapse is truncated. No background until the single low note.
note("motif",THINK,"D2",.80,4.7,0,"think","think")
# The dash hangs on B; no tonal resolution is added.
for t,p,v,a in [(start("S11")+.5,"D4",.48,None),(94.0,"A4",.43,None),(line["s11b"]["t"],"B4",.54,"s11b")]:
 note("motif",t,p,v,7.8,0,"self",a)
# Menard: identical melody, timing, velocity and instrument; different harmonic bed.
A=line["ma"]["t"];B=line["mbSig"]["t"]-2.36
IDENTICAL=[0,.72,1.48,2.36]
chord(start("S12"),["D3","A3","E4"],B-start("S12")+.5,.24,"harmony-A")
note("motif",start("S12")+.45,"D4",.47,7.8,-.1,"menard-pickup")
theme(A,IDENTICAL,vel=.69,group="menard-A",anchors={0:"ma"},dur=5.3)
theme(B,IDENTICAL,vel=.69,group="menard-B",anchors={3:"mbSig"},dur=5.3)
chord(B,["G2","B2","D3","F#3"],7.2,.27,"harmony-B")
cue_note("maSig","A5",.15)
# Identical fragments under the two signatures, with A and B harmonies.
for name,ps,group in [("me1",["D3","A3","E4"],"signature-A"),("me2",["G2","B2","D3","F#3"],"signature-B")]:
 t=line[name]["t"];chord(t-.22,ps,2.8,.23,group)
 for i,p in enumerate(["D4","A4","E5"]):
  note("motif",t+i*.57,p,.57*[1,.88,.82][i],3.2,0,group,name if i==0 else None)
chord(start("S15"),["B2","F#3","E4"],line["k1"]["t"]-start("S15")+.3,.14,"suspension")
note("motif",start("S15")+2.2,"B4",.30,7.8,.05,"suspension")
# Recall the three stories at the three red keywords.
for off,p in [(0,"D3"),(.65,"A3")]:
 note("bed",line["k1"]["t"]+off,p,.44,2.0,0,"recall-babel","k1" if off==0 else None)
theme(line["k2"]["t"],[0,.35,.7,1.05],("D3","A3","E4","B3"),.41,"recall-funes",anchors={0:"k2"},dur=3.3)
chord(line["k3"]["t"],["G2","B2","D3","F#3"],DIM-line["k3"]["t"],.26,"recall-menard")
note("motif",line["k3"]["t"],"B4",.52,3.8,.1,"recall-menard","k3")
# At dim, all melodic voices recede; only a single bowed E remains.
chord(DIM,["E3"],line["to"]["t"]-DIM+.2,.22,"single-held-tone")
# Last complete statement of the motif, at the recipient.
theme(line["to"]["t"],[0,.62,1.32,2.17],vel=.70,group="recipient-last-full-theme",anchors={0:"to"},dur=5.8)
chord(start("S18"),["D3","F#3","A3"],start("S19")-start("S18")+.35,.22,"book-card")
cue_note("card2","D5",.27)
# Broad rather than triumphant: open intervals, fragments, slow rise with the pullback.
chord(start("S19"),["D3","A3","E4"],8.7,.24,"outro")
chord(PULL,["D2","A3","E4","A4"],TOTAL-PULL,.30,"outro-wide")
for off,p,v in [(0,"D5",.57),(1.7,"A5",.49),(3.1,"E5",.54),(4.1,"D5",.43)]:
 note("motif",PULL+off,p,v,7,[-.18,.18,-.08,.1][int(off)%4],"outro-fragment")
note("points",PULL+2.65,"E6",.15,3,.22,"outro-light")

LEVELS=[
 (0,0),(.6,.85),(start("S03"),.78),(pulse,1.0),(start("S05"),1.08),(end("S05"),1.65),
 (start("S06")+.1,.45),(start("S07"),.48),(line["s07"]["t"],.72),(start("S08"),.65),
 (start("S09"),.95),(CUT-.28,1.95),(CUT,1.95),(CUT+.18,0),(THINK,.75),
 (start("S11"),.55),(start("S12"),.80),(A,1.02),(B,1.10),(start("S15"),.45),
 (start("S16"),.70),(line["k3"]["t"],1.05),(DIM,.70),(DIM+.9,.20),
 (start("S17"),.23),(line["to"]["t"]-.7,.34),(line["to"]["t"],.88),
 (start("S18"),.70),(start("S19"),.70),(PULL,1.10),(191.25,1.65),(FADE,1.05),(TOTAL,0)]
LEVELS=sorted(LEVELS)
# Keep sparse passages audible without lifting the crowded Funes climax.
PRESENCE=[(0,2.0),(18.6,2.0),(22.1,1.6),(34.5,1.5),(35.836,1.35),(47.7,1.25),
 (49,1.8),(55.1,2.6),(65.476,2.6),(66.791,1.3),(74.436,1),(CUT,1),(THINK,1.7),
 (90.04,2.5),(98.42,2.5),(104.712,1.8),(A,2.0),(B,2.0),(133.826,2.1),
 (145.15,1.8),(149.449,1.4),(DIM,.9),(DIM+.9,2.2),(159.8,2.3),(171.8,1.5),
 (line["to"]["t"],1.5),(175.29,2.3),(183.848,2.0),(PULL,1.4),(191.25,1.0),(FADE,.9),(TOTAL,.9)]

@lru_cache(maxsize=64)
def piano(p):return instrument.modal_note(p).astype(np.float32)
def seed(label):return int.from_bytes(hashlib.sha256(label.encode()).digest()[:8],"little")
def bowed(p,dur):
 f=hz(p);t=np.arange(round(dur*SR))/SR
 rng=np.random.default_rng(seed("bow-v3:"+p+":"+str(dur)))
 wobble=.00045*np.sin(2*np.pi*4.7*t+.3)
 phase=2*np.pi*f*(t+np.cumsum(wobble)/SR)
 x=np.zeros(len(t))
 for k in range(1,9):
  x+=np.sin(k*phase+rng.uniform(-.15,.15))*(1/k**1.5)
 breath=sosfilt(butter(2,[140,1800],fs=SR,btype="bandpass",output="sos"),rng.normal(0,1,len(t)))
 x+=.035*breath
 x*=.82+.10*np.sin(2*np.pi*.37*t)+.06*np.sin(2*np.pi*.61*t+.8)
 x*=smooth(t/.60)*smooth((dur-t)/min(1.15,dur*.35))
 return (x/max(float(np.max(np.abs(x))),1e-9)).astype(np.float32)
def point(p,dur):
 t=np.arange(round(dur*SR))/SR;f=hz(p)
 x=sum(a*np.sin(2*np.pi*f*r*t)*np.exp(-t/d) for r,a,d in [(1,1,.65),(2,.23,.33),(3.003,.08,.20),(4.16,.025,.12)])
 x*=smooth(t/.008)*smooth((dur-t)/.2)
 return (x/max(float(np.max(np.abs(x))),1e-9)).astype(np.float32)
def build():
 stems={r:np.zeros((N,2),dtype=np.float32) for r in ["motif","bed","points"]}
 for e in events:
  t=e["time"];dur=e["duration"]
  x=piano(e["pitch"])[:round(dur*SR)] if e["role"]=="motif" else bowed(e["pitch"],dur) if e["role"]=="bed" else point(e["pitch"],dur)
  # Make sustained piano notes end smoothly when their specified duration truncates them.
  x=x.copy()
  nfade=min(round(.22*SR),len(x)//3);x[-nfade:]*=np.linspace(1,0,nfade,dtype=np.float32)
  i=round(t*SR);n=min(len(x),N-i)
  if t<CUT:n=min(n,max(0,round((CUT+.18-t)*SR)))
  angle=(e["pan"]+1)*np.pi/4
  x=x[:n]*e["velocity"]
  level=.50 if e["role"]=="bed" else .60 if e["role"]=="points" else 1.
  stems[e["role"]][i:i+n,0]+=x*(math.cos(angle)*level)
  stems[e["role"]][i:i+n,1]+=x*(math.sin(angle)*level)
 # Fixed short room reflections, cut by the collapse together with all instruments.
 for role,x in stems.items():
  dry=x.copy()
  for delay,g in [(.023,.09),(.047,.065),(.083,.045),(.137,.025),(.211,.012)]:
   shift=round(delay*SR);x[shift:]+=dry[:-shift]*g
  del dry
 time=np.arange(N)/SR
 env=np.interp(time,[t for t,v in LEVELS],[v for t,v in LEVELS]).astype(np.float32)
 env*=np.interp(time,[t for t,v in PRESENCE],[v for t,v in PRESENCE]).astype(np.float32)
 collapse=np.ones(N,dtype=np.float32)
 mask=(time>=CUT)&(time<CUT+.18);collapse[mask]=1-smooth((time[mask]-CUT)/.18)
 collapse[round((CUT+.18)*SR):round(THINK*SR)]=0
 # The ending follows the actual 1.4 s visual fade.
 ending=1-smooth((time-FADE)/(TOTAL-FADE))
 for role,x in stems.items():
  x*= (env*collapse*ending)[:,None]
  if role!="bed":
   silence=(time>=DIM)&(time<line["to"]["t"]-.1)
   gate=np.ones(N,dtype=np.float32);gate[silence]=1-smooth((time[silence]-DIM)/.9)
   x*=gate[:,None]
 voice,sr=sf.read(ROOT/"audio/vo/narration.wav",dtype="float32");assert sr==SR and len(voice)==N
 hop=480
 levels=np.array([np.sqrt(np.mean(voice[i:i+hop].astype(np.float64)**2)) for i in range(0,N,hop)])
 target=1-(1-db(-3))*smooth((levels-db(-44))/(db(-31)-db(-44)))
 envelope=[];current=1.
 for v in target:
  a=math.exp(-.01/(.045 if v<current else .32));current=a*current+(1-a)*float(v);envelope.append(current)
 duck=np.interp(np.arange(N),np.arange(len(envelope))*hop,envelope).astype(np.float32)
 for x in stems.values():x*=duck[:,None]
 score=sum(stems.values())
 count=N//4800;vo=voice[:count*4800].reshape(count,4800)
 active=np.sqrt(np.mean(vo.astype(np.float64)**2,axis=1))>db(-35)
 sample_mask=np.repeat(active,4800)
 a=round((CUT+.18)*SR);b=round(THINK*SR);sample_mask[a:min(b,len(sample_mask))]=False
 vr=np.sqrt(np.mean(voice[:len(sample_mask)][sample_mask].astype(np.float64)**2))
 mr=np.sqrt(np.mean(score[:len(sample_mask)][sample_mask].astype(np.float64)**2))
 gain=min(vr*db(-13)/max(mr,1e-12),db(-16)/max(float(np.max(np.abs(score))),1e-12))
 for x in stems.values():x*=gain;x[-1]=0
 score=sum(stems.values())
 assert np.isfinite(score).all() and np.max(np.abs(score))<1
 assert not np.any(score[a:b])
 return stems,score,float(gain)
def metrics(x):
 return {"peakDbFS":float(20*np.log10(max(np.max(np.abs(x)),1e-12))),
         "rmsDbFS":float(20*np.log10(max(np.sqrt(np.mean(x.astype(np.float64)**2)),1e-12)))}
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--verify",action="store_true");args=ap.parse_args()
 OUT.mkdir(parents=True,exist_ok=True)
 stems,score,gain=build()
 verified=None
 if args.verify:
  hashes={k:hashlib.sha256(x.tobytes()).hexdigest() for k,x in stems.items()}
  del stems,score
  stems,score,gain=build()
  verified=all(hashlib.sha256(x.tobytes()).hexdigest()==hashes[k] for k,x in stems.items())
  assert verified,"Synthesis is not deterministic"
 files=[]
 for name,x in {**stems,"score":score}.items():
  path=OUT/(name+".wav");sf.write(path,x,SR,subtype="PCM_24")
  files.append({"role":name,"path":str(path.relative_to(ROOT)),"sha256":digest(path.read_bytes()),**metrics(x)})
 inputs=["docs/music-direction.md","design/cues3.json","audio/vo/timing.json","audio/vo/narration.wav",
         "engine/synthesize-music-v3.py","engine/synthesize-music-v2.py","engine/synthesize-music.py"]
 ma=[e for e in events if e["group"]=="menard-A"];mb=[e for e in events if e["group"]=="menard-B"]
 def relative(es):return [(round(e["time"]-es[0]["time"],5),e["pitch"],e["velocity"],e["duration"],e["pan"]) for e in es]
 assert relative(ma)==relative(mb)
 plan={"version":"synthetic-v3","status":"audition-awaiting-director","sampleRate":SR,"samples":N,"duration":TOTAL,
       "externalSamples":False,"gain":gain,"duckingDb":3,"determinismChecked":verified,
       "collapse":{"start":CUT,"fadeSeconds":.18,"silence":[CUT+.18,THINK]},
       "dim":{"start":DIM,"singleTone":"E3"},"finalFade":{"start":FADE,"end":TOTAL},
       "menard":{"identicalMelody":True,"A":A,"B":B,"offsets":IDENTICAL,"pitches":["D4","A4","E5","B4"],
                 "harmonyA":["D3","A3","E4"],"harmonyB":["G2","B2","D3","F#3"]},
       "presencePlan":[{"time":t,"relativeGain":v} for t,v in PRESENCE],
       "levelPlan":[{"time":t,"relativeGain":v} for t,v in LEVELS],"events":sorted(events,key=lambda e:e["time"]),
       "files":files,"inputs":[{"path":p,"sha256":digest((ROOT/p).read_bytes())} for p in inputs]}
 write_json(OUT/"manifest.json",plan)
 print("Full-film score:",N/SR,"seconds;",len(events),"note events; deterministic =",verified,flush=True)
 print("Collapse silence:",CUT+.18,"to",THINK,"; same Menard melody =",relative(ma)==relative(mb),flush=True)
 print(files[-1],flush=True)
if __name__=="__main__":main()
