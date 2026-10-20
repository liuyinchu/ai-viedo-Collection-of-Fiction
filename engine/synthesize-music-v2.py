"""Second original score: more audible body, motif and harmonic response."""
import importlib.util
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt
from common import ROOT, read_json

spec=importlib.util.spec_from_file_location("music_base",Path(__file__).with_name("synthesize-music.py"))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.VERSION="synthetic-v2"
base.OUT=ROOT/"audio/music"/base.VERSION
plan=read_json(base.OUT/"score-plan.json")
base.TARGET_PEAK_DB=plan["peakBeforeDuckingDbFS"]
base.DUCK_DB=plan["duckingDb"]
base.SCORES={k:[(n["offset"],n["pitch"],n["velocity"],n["pan"]) for n in v] for k,v in plan["notes"].items()}
base.SYNTHESIS_INFO={
    "reference":"D4–A4–E5–B4 motif returns over D then G; lower answers connect the phrases; ending resolves to D5 after the voice.",
    "fixedSeedNamespace":"borges-modal-v2 / borges-room-v1",
    "scorePlan":"audio/music/synthetic-v2/score-plan.json",
    "scorePlanSha256":base.digest((base.OUT/"score-plan.json").read_bytes()),
    "changesFromV1":{"peakGainDb":7.0,"duckReductionDb":2.5,"arrangement":"bass/support answers; longer body; stronger upper partials; ending cadence"},
}

def modal_note(pitch):
    f=base.hz(pitch)
    dur=9.0 if f<180 else 7.8
    t=np.arange(round(dur*base.SR))/base.SR
    rng=np.random.default_rng(base.seed("borges-modal-v2:"+pitch))
    body_decay=3.5*(220/f)**0.15
    signal=np.zeros(len(t))
    # More audible string body and upper modes, still with a soft felt excitation.
    for k,amp in enumerate([1.0,0.46,0.19,0.095,0.043,0.020,0.009,0.004],1):
        freq=f*k*np.sqrt(1+0.000035*k*k)
        decay=body_decay/(k**0.52)
        phase=float(rng.uniform(-0.1,0.1))
        component=0.64*np.sin(2*np.pi*freq*t+phase)
        component+=0.36*np.sin(2*np.pi*freq*2**(1.15/1200)*t-phase)
        signal+=amp*np.exp(-t/decay)*component
    felt=rng.normal(0,1,len(t))
    felt=sosfilt(butter(2,[200,2200],fs=base.SR,btype="bandpass",output="sos"),felt)
    felt*=0.025*np.exp(-t/0.024)*base.smooth(t/0.002)
    signal=(signal*base.smooth(t/(0.022 if f>=180 else 0.045))+felt)*base.smooth((dur-t)/0.7)
    return signal/max(float(np.max(np.abs(signal))),1e-12)

base.modal_note=modal_note
if __name__=="__main__":
    base.main()
