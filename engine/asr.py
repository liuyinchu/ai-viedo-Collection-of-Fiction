"""Independent local ASR. Never feed the approved script into the recognizer."""
import argparse, difflib, json, os, subprocess, unicodedata
from pathlib import Path
from common import ROOT, digest, read_json, write_json, ffmpeg
VO=ROOT/"audio/vo"
MODEL="mlx-community/whisper-large-v3-turbo-q4"
MODEL_PATH=ROOT/"out/models/whisper-large-v3-turbo-q4"
def normalized(text):
    text=unicodedata.normalize("NFKC",text).upper()
    return "".join(c for c in text if not c.isspace() and not unicodedata.category(c).startswith(("P","Z")))
def report():
    items=[]; md=["# 配音 ASR 差异报告","","模型："+MODEL+"；逐段独立识别，无台本提示。","仅统一大小写、全半角，并忽略标点与空白；不自动替换同音字。ASR 差异是复听线索，不等于确定读错。","","| 段落 | 状态 | 差异（台本 → 转写） |","|---|---|---|"]
    for seg in read_json(VO/"segments.json")["segments"]:
        p=VO/"asr"/f"{seg['id']}.json"
        if not p.exists():
            md.append(f"| {seg['id']} | 未生成转写 | — |");continue
        data=read_json(p)
        wav=VO/f"{seg['id']}.wav"
        if not wav.exists() or data["wavSha256"]!=digest(wav.read_bytes()):
            md.append(f"| {seg['id']} | 转写已过期 | 音频已变更 |");continue
        a,b=normalized(seg["text"]),normalized(data["text"])
        diff=[]
        for op,i,j,k,l in difflib.SequenceMatcher(None,a,b,autojunk=False).get_opcodes():
            if op!="equal":diff.append(f"{a[i:j] or '∅'} → {b[k:l] or '∅'}")
        md.append(f"| {seg['id']} | {'需复听' if diff else '一致'} | {'；'.join(diff) or '—'} |")
        items.append(f"## {seg['id']}\n\n台本：{seg['text']}\n\n转写：{data['text']}\n")
    (VO/"asr-diff.md").write_text("\n".join(md)+"\n\n"+"\n".join(items),encoding="utf-8")
def main():
    ap=argparse.ArgumentParser();ap.add_argument("ids",nargs="*");ap.add_argument("--report-only",action="store_true");args=ap.parse_args()
    if not args.report_only:
        import mlx_whisper
        import numpy as np
        segs=read_json(VO/"segments.json")["segments"]
        for seg in segs:
            sid=seg["id"];wav=VO/f"{sid}.wav";out=VO/"asr"/f"{sid}.json"
            if args.ids and sid not in args.ids:continue
            if not wav.exists():continue
            sha=digest(wav.read_bytes())
            if out.exists():
                old=read_json(out)
                if old.get("wavSha256")==sha and old.get("model")==MODEL and old.get("modelRevision")==read_json(MODEL_PATH/"provenance.json")["revision"]:continue
            # Decode explicitly so the bundled FFmpeg need not be on global PATH.
            pcm=subprocess.check_output([ffmpeg(),"-v","error","-i",str(wav),"-ar","16000","-ac","1","-f","f32le","-"])
            audio=np.frombuffer(pcm,dtype="<f4").copy()
            data=mlx_whisper.transcribe(audio,path_or_hf_repo=str(MODEL_PATH),language="zh",task="transcribe",temperature=0.0,condition_on_previous_text=False,word_timestamps=True,verbose=False)
            data.update({"model":MODEL,"modelRevision":read_json(MODEL_PATH/"provenance.json")["revision"],"modelProvenance":str((MODEL_PATH/"provenance.json").relative_to(ROOT)),"wavSha256":sha,"scriptPromptUsed":False})
            write_json(out,data)
            words=[w for s in data.get("segments",[]) for w in s.get("words",[])]
            write_json(VO/f"{sid}.words.json",{"source":"independent-asr-estimated","relativeTo":"segment audio start","words":words})
            print(sid,data.get("text",""),flush=True)
            report()
    report()
if __name__=="__main__":main()
