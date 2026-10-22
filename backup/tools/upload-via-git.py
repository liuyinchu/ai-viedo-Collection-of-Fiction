import subprocess,json,shutil,time,os
from pathlib import Path
BASE=Path("/Users/ysyspace/workspace/dev/open-helper/.proj3-archive-20261022")
ROOT=BASE/"transport"
SOURCE=BASE.parent/"remote-proj3"
BRANCH="archive/full-project-2026-10-22"
def git(*args,capture=False):
 attempts=5 if args[0] in ["push","ls-remote"] else 1
 for attempt in range(attempts):
  p=subprocess.run(["git",*map(str,args)],cwd=ROOT,text=True,stdout=subprocess.PIPE if capture else None,
      env={**os.environ,"GIT_SSH_COMMAND":"ssh -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3"})
  if p.returncode==0:return p.stdout.strip() if capture else None
  if attempt+1==attempts:raise subprocess.CalledProcessError(p.returncode,p.args)
  print("Retrying transient Git network failure",args[0],attempt+1,flush=True)
  time.sleep(2*(attempt+1))
def commit(message):
 if subprocess.run(["git","diff","--cached","--quiet"],cwd=ROOT).returncode:git("commit","-m",message)
def push():
 git("push","origin",BRANCH)
 head=git("rev-parse","HEAD",capture=True)
 remote=git("ls-remote","origin","refs/heads/"+BRANCH,capture=True).split()[0]
 assert head==remote
 return head
assert json.loads((BASE/"local-verification/verification.json").read_text())["allEntriesVerified"]
(ROOT/".github/workflows").mkdir(parents=True,exist_ok=True)
shutil.copy2(SOURCE/".github/workflows/archive.yml",ROOT/".github/workflows/archive.yml")
shutil.copy2(SOURCE/"engine/archive-project.py",ROOT/"archive-project.py")
(ROOT/"README.md").write_text("# Complete project archive transport\n\n48 MiB verified chunks. Restore instructions and reassembled archives are published by GitHub Actions to the full-project-2026-10-22 Release. Main contains source and complete project history.\n")
if not (ROOT/".git").exists():
 git("init","-b",BRANCH)
 for name in ["user.name","user.email"]:
  value=subprocess.check_output(["git","-C",str(SOURCE),"config",name],text=True).strip()
  git("config",name,value)
 git("config","gc.auto","0");git("config","core.compression","0");git("config","pack.window","0");git("config","pack.threads","2")
 git("remote","add","origin","git@github.com:liuyinchu/ai-viedo-Collection-of-Fiction.git")
git("add","snapshot.json","file-tree.json","README.md","archive-project.py",".github/workflows/archive.yml")
commit("chore: add complete archive manifest and reconstruction workflow")
push()
m=json.loads((ROOT/"snapshot.json").read_text())
files=[p["path"] for p in m["parts"]]
for i in range(0,len(files),8):
 assert shutil.disk_usage(ROOT).free>1200*1024*1024,"Low local disk space"
 tracked=set(git("ls-files",capture=True).splitlines())
 batch=[p for p in files[i:i+8] if p not in tracked]
 if batch:
  git("add","--",*batch)
  commit(f"backup: archive chunks {i+1}-{min(i+8,len(files))} of {len(files)}")
 head=push()
 progress={"uploadedChunks":min(i+8,len(files)),"totalChunks":len(files),"remoteCommit":head}
 (BASE/"upload-progress.json").write_text(json.dumps(progress))
 print(json.dumps(progress),flush=True)
(ROOT/"READY.json").write_text(json.dumps({"sourceCommit":m["sourceCommit"],"archiveSha256":m["archiveSha256"],"fileTreeSha256":m["fileTreeSha256"],"allChunksUploaded":True},indent=2)+"\n")
git("add","READY.json");commit("backup: all chunks uploaded; verify and publish full snapshot")
head=push()
(BASE/"upload-complete.json").write_text(json.dumps({"branch":BRANCH,"commit":head,"sourceCommit":m["sourceCommit"]},indent=2)+"\n")
print("READY pushed: "+head,flush=True)
