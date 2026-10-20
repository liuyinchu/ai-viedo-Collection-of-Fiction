"""Normalize downloaded MiniMax segments and assemble only a complete, current timeline."""
import argparse, json, math, re, shutil, subprocess, wave
from pathlib import Path
from common import ROOT, digest, read_json, write_json, run_ffmpeg
VO = ROOT/"audio/vo"
def source():
    data=read_json(VO/"segments.json")
    if data["sourceSha256"] != digest((ROOT/data["source"]).read_bytes()):
        raise RuntimeError("Script changed; run engine/prepare-vo.py first")
    return data
def signature(segment, config):
    return digest(json.dumps({"text":segment["ttsText"],"provider":config["provider"],"model":config["model"],"voice":config["voice"],"settings":config["settings"]},ensure_ascii=False,sort_keys=True).encode())
def info(path):
    with wave.open(str(path),"rb") as f:
        if (f.getframerate(),f.getnchannels(),f.getsampwidth()) != (48000,1,2):
            raise ValueError(f"Invalid canonical WAV format: {path}")
        return f.getnframes()
def import_audio(segment_id, path, replace=False):
    seg=next(s for s in source()["segments"] if s["id"]==segment_id)
    cfg=read_json(VO/"config.json")
    out=VO/f"{segment_id}.wav"
    if out.exists() and not replace:
        raise RuntimeError(f"{out.name} exists; use --replace deliberately")
    rawdir=VO/"raw"
    rawdir.mkdir(exist_ok=True)
    raw=rawdir/(segment_id+path.suffix.lower())
    if path.resolve()!=raw.resolve():
        shutil.copy2(path,raw)
    temp=out.with_name(out.stem+".tmp.wav")
    run_ffmpeg(["-y","-i",raw,"-vn","-ar","48000","-ac","1","-c:a","pcm_s16le","-map_metadata","-1",temp])
    n=info(temp)
    if n <= 0:
        raise RuntimeError("Empty audio")
    temp.replace(out)
    write_json(VO/f"{segment_id}.meta.json",{
        "id":segment_id,"source":str(raw.relative_to(ROOT)),"sourceSha256":digest(raw.read_bytes()),
        "wavSha256":digest(out.read_bytes()),"generationSha256":signature(seg,cfg),
        "textSha256":seg["textSha256"],"ttsText":seg["ttsText"],"samples":n,"duration":n/48000,
        "provider":cfg["provider"],"method":cfg["method"],"model":cfg["model"],"voice":cfg["voice"],"settings":cfg["settings"]
    })
    print(f"{segment_id}: {n/48000:.3f}s, 48 kHz mono WAV")
def checked_segments():
    cfg=read_json(VO/"config.json")
    result=[]
    for seg in source()["segments"]:
        sid=seg["id"]; path=VO/f"{sid}.wav"; meta=VO/f"{sid}.meta.json"
        if not path.exists() or not meta.exists():
            raise RuntimeError(f"Missing {sid}; refusing to publish a partial timing.json")
        data=read_json(meta)
        if data["generationSha256"]!=signature(seg,cfg) or data["wavSha256"]!=digest(path.read_bytes()):
            raise RuntimeError(f"{sid} changed or was generated with different parameters")
        result.append((seg,info(path)))
    return cfg,result
def timeline():
    cfg,segs=checked_segments()
    pos=round(cfg["preRoll"]*48000)
    timing=[]
    temp=VO/"narration.tmp.wav"
    with wave.open(str(temp),"wb") as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(48000)
        out.writeframes(b"\0\0"*pos)
        for seg,n in segs:
            sid=seg["id"]
            timing.append({"id":sid,"start":pos/48000,"end":(pos+n)/48000,"startSample":pos,"endSample":pos+n,"pauseAfter":seg["pauseAfter"],"wavSha256":digest((VO/f"{sid}.wav").read_bytes())})
            with wave.open(str(VO/f"{sid}.wav"),"rb") as src:
                while chunk:=src.readframes(65536):
                    out.writeframes(chunk)
            silence=round(seg["pauseAfter"]*48000)
            out.writeframes(b"\0\0"*silence)
            pos+=n+silence
    temp.replace(VO/"narration.wav")
    write_json(VO/"timing.json",{"source":"minimax-web-measured","scriptSha256":source()["sourceSha256"],"sampleRate":48000,"preRoll":cfg["preRoll"],"total":pos/48000,"segments":timing})
    print(f"Complete timeline: {len(timing)} segments, {pos/48000:.3f}s")
def stamp(s):
    ms=round(s*1000); h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"
def subtitles():
    checked_segments()
    t=read_json(VO/"timing.json"); texts={s["id"]:s["text"] for s in source()["segments"]}
    lines=[]
    # Paragraph timing is measured; in-paragraph splits are estimated by character weight.
    for s in t["segments"]:
        parts=re.findall(r".{1,24}(?:[，。？！；：、]|$)|.{1,24}",texts[s["id"]])
        if "".join(parts)!=texts[s["id"]]:
            raise RuntimeError("Subtitle split lost script characters")
        weights=[max(1,len(re.sub(r"\W","",p))) for p in parts]
        cursor=s["start"]
        for i,(part,w) in enumerate(zip(parts,weights)):
            end=s["end"] if i==len(parts)-1 else cursor+(s["end"]-s["start"])*w/sum(weights)
            lines.append(f"{len(lines)+1}\n{stamp(cursor)} --> {stamp(end)}\n{part}\n")
            cursor=end
    out=ROOT/"out/film.zh-CN.srt"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines),encoding="utf-8")
    print(str(out))
def main():
    ap=argparse.ArgumentParser()
    sp=ap.add_subparsers(dest="cmd",required=True)
    imp=sp.add_parser("import");imp.add_argument("id");imp.add_argument("file",type=Path);imp.add_argument("--replace",action="store_true")
    sp.add_parser("timeline");sp.add_parser("subtitles");sp.add_parser("check")
    a=ap.parse_args()
    if a.cmd=="import":import_audio(a.id,a.file,a.replace)
    elif a.cmd=="timeline":timeline()
    elif a.cmd=="subtitles":subtitles()
    else: checked_segments();print("All 19 segments are current")
if __name__=="__main__":main()
