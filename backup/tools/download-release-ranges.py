"""Download Release snapshot through independently verified resumable byte ranges."""
import argparse,concurrent.futures,hashlib,json,time,urllib.request
from pathlib import Path
PREFIX="https://github.com/liuyinchu/ai-viedo-Collection-of-Fiction/releases/download/full-project-2026-10-22/"
def digest(p):
 h=hashlib.sha256()
 with p.open("rb") as f:
  for b in iter(lambda:f.read(1048576),b""):h.update(b)
 return h.hexdigest()
def main():
 ap=argparse.ArgumentParser()
 ap.add_argument("--manifest",type=Path,required=True)
 ap.add_argument("--parts",type=Path,required=True)
 ap.add_argument("--directory",type=Path,required=True)
 ap.add_argument("--report",type=Path,required=True)
 ap.add_argument("--workers",type=int,default=4)
 a=ap.parse_args();m=json.loads(a.manifest.read_text());p=json.loads(a.parts.read_text())
 assert m["archiveSha256"]==p["archiveSha256"]
 a.directory.mkdir(parents=True,exist_ok=True)
 offset=0;bounds=[]
 for part in p["parts"]:
  bounds.append((offset,offset+part["size"],part));offset+=part["size"]
 assert offset==m["archiveBytes"]
 jobs=[];offset=0
 for i,chunk in enumerate(m["parts"]):
  start,end,part=next(b for b in bounds if b[0]<=offset<b[1])
  assert offset+chunk["size"]<=end
  jobs.append((i,chunk,part,offset-start));offset+=chunk["size"]
 def fetch(job):
  i,chunk,part,start=job;path=a.directory/f"range-{i:04d}.bin"
  if path.exists() and path.stat().st_size==chunk["size"] and digest(path)==chunk["sha256"]:return i,"cached"
  stop=start+chunk["size"]-1
  headers={"Range":f"bytes={start}-{stop}","Accept-Encoding":"identity","Cache-Control":"no-cache","User-Agent":"project-backup-verification"}
  for attempt in range(5):
   tmp=path.with_suffix(".tmp")
   try:
    req=urllib.request.Request(PREFIX+part["name"],headers=headers)
    with urllib.request.urlopen(req,timeout=60) as r:
     assert r.status==206 and r.headers.get("Content-Range")==f"bytes {start}-{stop}/{part['size']}","Wrong byte range"
     count=0;h=hashlib.sha256()
     with tmp.open("wb") as f:
      for b in iter(lambda:r.read(1048576),b""):
       count+=len(b);assert count<=chunk["size"];h.update(b);f.write(b)
    assert count==chunk["size"] and h.hexdigest()==chunk["sha256"],"Range checksum mismatch"
    tmp.replace(path);return i,"downloaded"
   except Exception as e:
    if tmp.exists():tmp.unlink()
    print(json.dumps({"retryRange":i,"attempt":attempt+1,"error":type(e).__name__}),flush=True)
    if attempt==4:raise
    delay=2*(attempt+1)
    if getattr(e,"headers",None):delay=min(60,max(delay,int(e.headers.get("Retry-After",delay))))
    time.sleep(delay)
 with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
  futures=[pool.submit(fetch,j) for j in jobs]
  for done,future in enumerate(concurrent.futures.as_completed(futures),1):
   i,status=future.result();print(json.dumps({"verifiedRanges":done,"totalRanges":len(jobs),"range":i,"status":status}),flush=True)
 whole=hashlib.sha256();part_hashes={part["name"]:hashlib.sha256() for part in p["parts"]};sizes={part["name"]:0 for part in p["parts"]}
 for i,chunk,part,start in jobs:
  with (a.directory/f"range-{i:04d}.bin").open("rb") as f:
   for b in iter(lambda:f.read(1048576),b""):whole.update(b);part_hashes[part["name"]].update(b);sizes[part["name"]]+=len(b)
 for part in p["parts"]:assert part_hashes[part["name"]].hexdigest()==part["sha256"] and sizes[part["name"]]==part["size"]
 assert whole.hexdigest()==m["archiveSha256"]
 report={"allReleasePartsDownloadedAndVerified":True,"method":"HTTP byte ranges; every range, each complete Release part, and the concatenated archive hashed from downloaded bytes","verifiedRanges":len(jobs),"archiveBytes":m["archiveBytes"],"archiveSha256":whole.hexdigest(),"parts":[{**part,"url":PREFIX+part["name"]} for part in p["parts"]]}
 a.report.write_text(json.dumps(report,indent=2)+"\n");print(json.dumps(report),flush=True)
if __name__=="__main__":main()
