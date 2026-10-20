"""Download unchanged Google Fonts variable fonts with pinned provenance and OFL files."""
import hashlib, json, urllib.request, urllib.parse
from pathlib import Path
from common import ROOT, write_json
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"borges-film/1.0"}),timeout=120).read()
out = ROOT / "assets/fonts"
out.mkdir(parents=True,exist_ok=True)
lock = out / "manifest.json"
if lock.exists():
    entries=json.loads(lock.read_text())
    for f in entries["files"]:
        p=out/f["file"]
        if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=f["sha256"]:
            data=get(f["url"])
            if hashlib.sha256(data).hexdigest()!=f["sha256"]:
                raise RuntimeError("Font checksum mismatch")
            p.write_bytes(data)
    print("Font manifest verified")
else:
    commit=json.loads(get("https://api.github.com/repos/google/fonts/commits/main"))["sha"]
    entries={"source":"https://github.com/google/fonts","commit":commit,"files":[]}
    for folder,stem in [("notoserifsc","NotoSerifSC"),("notosanssc","NotoSansSC")]:
        for src,dest in [(stem+"[wght].ttf",stem+"-Variable.ttf"),("OFL.txt",stem+"-OFL.txt")]:
            url=f"https://raw.githubusercontent.com/google/fonts/{commit}/ofl/{folder}/"+urllib.parse.quote(src)
            data=get(url)
            (out/dest).write_bytes(data)
            entries["files"].append({"file":dest,"url":url,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()})
            print(f"{dest}: {len(data)} bytes",flush=True)
    write_json(lock,entries)
import struct
for p in sorted(out.glob("*.ttf")):
    data=p.read_bytes()
    num=struct.unpack_from(">H",data,4)[0]
    tables={}
    for i in range(num):
        tag,check,offset,length=struct.unpack_from(">4sIII",data,12+16*i)
        tables[tag]=(offset,length)
    base=tables[b"fvar"][0]
    axis_offset=struct.unpack_from(">H",data,base+4)[0]
    count,size=struct.unpack_from(">HH",data,base+8)
    axes=[]
    for i in range(count):
        tag,mn,default,mx=struct.unpack_from(">4siii",data,base+axis_offset+i*size)
        axes.append((tag.decode(),mn/65536,default/65536,mx/65536))
    if not any(a[0]=="wght" and a[1]<=300 and a[3]>=600 for a in axes):
        raise RuntimeError("Required weight range is unavailable")
    print(p.name,axes)
