"""Fetch a pinned pre-converted MLX Whisper checkpoint; no executable model code."""
from pathlib import Path
import hashlib, json, urllib.request
from common import ROOT,write_json
REPO="mlx-community/whisper-large-v3-turbo-q4"
REV="660c343bbf4e52ac257f0b7d952e5388e6f93bef"
out=ROOT/"out/models/whisper-large-v3-turbo-q4"
out.mkdir(parents=True,exist_ok=True)
manifest={"repo":REPO,"revision":REV,"files":[]}
for name in ["config.json","weights.npz"]:
    url=f"https://huggingface.co/{REPO}/resolve/{REV}/{name}"
    path=out/name
    if not path.exists():
        part=path.with_suffix(path.suffix+".part")
        offset=part.stat().st_size if part.exists() else 0
        headers={"Range":f"bytes={offset}-"} if offset else {}
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=120) as response:
            append=offset>0 and response.status==206
            if not append:offset=0
            size=int(response.headers.get("Content-Length","0"))+offset
            print(f"{name}: {offset}/{size} bytes",flush=True)
            with part.open("ab" if append else "wb") as f:
                done=offset
                report=done
                while data:=response.read(1024*1024):
                    f.write(data);done+=len(data)
                    if done-report>=16*1024*1024:
                        print(f"{name}: {done}/{size} bytes",flush=True);report=done
            if size and done!=size:raise RuntimeError("Incomplete download")
        part.replace(path)
    h=hashlib.sha256()
    with path.open("rb") as f:
        while data:=f.read(1024*1024):h.update(data)
    manifest["files"].append({"file":name,"url":url,"bytes":path.stat().st_size,"sha256":h.hexdigest()})
write_json(out/"provenance.json",manifest)
print("Pinned ASR model ready",flush=True)
