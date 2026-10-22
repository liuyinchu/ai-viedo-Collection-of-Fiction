"""Complete snapshot, streaming restore verification, and GitHub publication."""
import argparse,hashlib,html,json,os,re,shutil,stat,subprocess,tarfile,threading
from pathlib import Path
REPO="liuyinchu/ai-viedo-Collection-of-Fiction"
TAG="full-project-2026-10-22"
ROOT="proj1-1019"
CHUNK=48*1024*1024
PART=1536*1024*1024
SELECT={
 "out/final-v3/borges-fiction-3min-v3.mp4":"borges-fiction-3min-v3.mp4",
 "out/final-v3/borges-fiction-3min-v3.zh-CN.srt":"borges-fiction-3min-v3.zh-CN.srt",
 "out/final-v3/stills/contact-sheet.png":"contact-sheet.png",
 "publish/cover/cover-a.png":"cover-a.png","publish/cover/cover-b.png":"cover-b.png",
 "publish/README.md":"publish-README.md","publish/description.txt":"publish-description.txt"}
def run(args,**kw):return subprocess.run(list(map(str,args)),check=True,**kw)
def sha(p):
 h=hashlib.sha256()
 with Path(p).open("rb") as f:
  for b in iter(lambda:f.read(1048576),b""):h.update(b)
 return h.hexdigest()
def write(p,d):Path(p).write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n")
def inventory(root):
 rows=[]
 for base,ds,fs in os.walk(root,followlinks=False):
  for n in ds+fs:
   p=Path(base)/n;s=p.lstat();r={"path":str(p.relative_to(root)),"mode":stat.S_IMODE(s.st_mode)}
   if stat.S_ISLNK(s.st_mode):r.update(type="symlink",target=os.readlink(p))
   elif stat.S_ISDIR(s.st_mode):r.update(type="directory")
   elif stat.S_ISREG(s.st_mode):r.update(type="file",size=s.st_size,sha256=sha(p))
   else:raise RuntimeError("Special file: "+str(p))
   rows.append(r)
 return sorted(rows,key=lambda r:r["path"])
def create(root,dest):
 root=root.resolve();dest=dest.resolve();assert not dest.is_relative_to(root)
 dest.mkdir(parents=True,exist_ok=True);(dest/"chunks").mkdir()
 tree=inventory(root);write(dest/"file-tree.json",tree)
 commit=subprocess.check_output(["git","-C",str(root),"rev-parse","HEAD"],text=True).strip()
 z=subprocess.Popen(["zstd","-q","-T2","-6","-c"],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
 errors=[]
 def producer():
  try:
   with tarfile.open(fileobj=z.stdin,mode="w|",format=tarfile.PAX_FORMAT,dereference=False) as tf:
    tf.add(root,arcname=ROOT,recursive=False)
    for r in tree:tf.add(root/r["path"],arcname=ROOT+"/"+r["path"],recursive=False)
  except BaseException as e:errors.append(e)
  finally:z.stdin.close()
 th=threading.Thread(target=producer);th.start();h=hashlib.sha256();parts=[]
 while True:
  b=z.stdout.read(CHUNK)
  if not b:break
  p=dest/"chunks"/f"project.tar.zst.{len(parts):04d}";p.write_bytes(b);h.update(b)
  parts.append({"path":str(p.relative_to(dest)),"size":len(b),"sha256":hashlib.sha256(b).hexdigest()})
  if len(parts)%10==0:print("Packed",len(parts),"chunks",flush=True)
 th.join();assert z.wait()==0
 if errors:raise errors[0]
 assert inventory(root)==tree,"Source changed during packing"
 d={"schema":"complete-project-snapshot/1","repository":REPO,"releaseTag":TAG,"date":"2026-10-22","timezone":"Asia/Shanghai","sourceCommit":commit,"rootDirectory":ROOT,"format":"tar.zst","archiveSha256":h.hexdigest(),"archiveBytes":sum(p["size"] for p in parts),"fileTreeSha256":sha(dest/"file-tree.json"),"entries":len(tree),"regularFiles":sum(r["type"]=="file" for r in tree),"uncompressedBytes":sum(r.get("size",0) for r in tree),"parts":parts}
 write(dest/"snapshot.json",d);print(json.dumps({k:v for k,v in d.items() if k!="parts"}),flush=True)
def verify(dest,exports):
 dest=dest.resolve();exports=exports.resolve();exports.mkdir(parents=True,exist_ok=True)
 m=json.loads((dest/"snapshot.json").read_text());assert sha(dest/"file-tree.json")==m["fileTreeSha256"]
 tree=json.loads((dest/"file-tree.json").read_text());expected={r["path"]:r for r in tree}
 for p in m["parts"]:
  f=dest/p["path"];assert f.stat().st_size==p["size"] and sha(f)==p["sha256"],p["path"]
 z=subprocess.Popen(["zstd","-q","-d","-c"],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
 errors=[];h=hashlib.sha256()
 def feed():
  try:
   for p in m["parts"]:
    with (dest/p["path"]).open("rb") as f:
     for b in iter(lambda:f.read(1048576),b""):h.update(b);z.stdin.write(b)
  except BaseException as e:errors.append(e)
  finally:z.stdin.close()
 th=threading.Thread(target=feed);th.start();seen=set();gitroot=exports/"checked-git"
 with tarfile.open(fileobj=z.stdout,mode="r|") as tf:
  for member in tf:
   if member.name.rstrip("/")==ROOT:assert member.isdir();continue
   assert member.name.startswith(ROOT+"/"),member.name
   name=member.name[len(ROOT)+1:].rstrip("/");assert name in expected and name not in seen,name
   r=expected[name];assert member.mode==r["mode"],name
   if member.isdir():assert r["type"]=="directory"
   elif member.issym():assert r["type"]=="symlink" and member.linkname==r["target"]
   elif member.isfile():
    assert r["type"]=="file" and member.size==r["size"];fh=hashlib.sha256();targets=[]
    if name in SELECT:targets.append(exports/SELECT[name])
    if name.startswith(".git/"):targets.append(gitroot/name)
    handles=[]
    for p in targets:p.parent.mkdir(parents=True,exist_ok=True);handles.append(p.open("wb"))
    f=tf.extractfile(member)
    for b in iter(lambda:f.read(1048576),b""):
     fh.update(b)
     for out in handles:out.write(b)
    for out in handles:out.close()
    for p in targets:p.chmod(r["mode"])
    assert fh.hexdigest()==r["sha256"],name
   elif member.islnk():
    target=member.linkname[len(ROOT)+1:];assert target in seen and expected[target]["sha256"]==r["sha256"]
    assert name not in SELECT and not name.startswith(".git/"),"Unexpected selected hardlink"
   else:raise RuntimeError("Unsupported archive member")
   seen.add(name)
 for _ in iter(lambda:z.stdout.read(1048576),b""):pass
 th.join();assert z.wait()==0
 if errors:raise errors[0]
 assert h.hexdigest()==m["archiveSha256"] and seen==set(expected)
 gitdir=gitroot/".git";run(["git","--git-dir",gitdir,"fsck","--full"],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 head=subprocess.check_output(["git","--git-dir",str(gitdir),"rev-parse","HEAD"],text=True).strip();assert head==m["sourceCommit"]
 run(["git","--git-dir",gitdir,"bundle","create",exports/"source-history.bundle","--all"])
 shutil.rmtree(gitroot)
 result={"allEntriesVerified":True,"entries":len(seen),"regularFiles":m["regularFiles"],"uncompressedBytes":m["uncompressedBytes"],"archiveSha256":h.hexdigest(),"fileTreeSha256":m["fileTreeSha256"],"gitFsckPassed":True,"sourceCommit":head}
 write(exports/"verification.json",result);print(json.dumps(result),flush=True);return m,result
def release_parts(dest,exports,m):
 out=None;used=0;parts=[]
 for p in m["parts"]:
  with (dest/p["path"]).open("rb") as f:
   while True:
    b=f.read(min(1048576,PART-used))
    if not b:break
    if out is None:
     name=f"project-full.tar.zst.part{len(parts):03d}";out=(exports/name).open("wb");h=hashlib.sha256()
    out.write(b);h.update(b);used+=len(b)
    if used==PART:out.close();out=None;parts.append({"name":name,"size":used,"sha256":h.hexdigest()});used=0
 if out is not None:out.close();parts.append({"name":name,"size":used,"sha256":h.hexdigest()})
 return parts
def publish(dest):
 assert os.environ.get("GITHUB_ACTIONS")=="true" and os.environ.get("GITHUB_REPOSITORY")==REPO
 exports=dest/"release-assets";m,result=verify(dest,exports);parts=release_parts(dest,exports,m)
 write(exports/"release-parts.json",{"archiveSha256":m["archiveSha256"],"parts":parts})
 for name in ["snapshot.json","file-tree.json"]:shutil.copy2(dest/name,exports/name)
 instructions="""# 完整工程恢复

快照包含工程目录内全部文件：源码、完整 .git 历史、配音、配乐/音效分轨、混音、成片、预览、字体、发布物料、node_modules 和 .venv。未入 Git 文件也已备份。
本地历史预览副本见 backup/local-review-map.json；独有文件位于 out/local-review-unique/。

下载全部 project-full.tar.zst.part*、SHA256SUMS 和 release-parts.json 到同一目录，先逐个比对 SHA-256，然后运行：

cat project-full.tar.zst.part* | shasum -a 256
cat project-full.tar.zst.part* | zstd -d | tar -xf -
git -C proj1-1019 fsck --full

第一行的结果应为 release-parts.json 中的 archiveSha256。每个文件的 SHA-256、权限和符号链接记录位于 file-tree.json。
source-history.bundle 是独立 Git 历史备份，可用 git clone source-history.bundle restored-source 恢复源码历史。

快照保留原 Apple Silicon macOS 环境依赖与符号链接。Python 可执行文件指向原机器共享的 uv 安装，该共享运行时不在项目目录内。
换机器时按 engine/pyproject.toml、engine/uv.lock 和 engine/package-lock.json 重建环境：
npm ci --prefix engine
uv sync --project engine --frozen
系统安装的 Node、Python 和 Chromium 不属于项目快照。

GitHub 自动生成的 Source code ZIP 仅含源码；完整工程请使用以上快照分卷。
"""
 (exports/"RESTORE.md").write_text(instructions)
 result["workflowRun"]=f"https://github.com/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
 result["releaseTag"]=TAG;write(exports/"verification.json",result)
 assets=sorted(p for p in exports.iterdir() if p.is_file())
 (exports/"SHA256SUMS").write_text("".join(f"{sha(p)}  {p.name}\n" for p in assets))
 assets=sorted(p for p in exports.iterdir() if p.is_file())
 found=subprocess.run(["gh","release","view",TAG,"--repo",REPO],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
 if not found:run(["gh","release","create",TAG,"--repo",REPO,"--verify-tag","--title","《虚构集》完整工程备份 · 2026-10-22","--notes-file",exports/"RESTORE.md"])
 for asset in assets:run(["gh","release","upload",TAG,asset,"--repo",REPO,"--clobber"])
 cloud=json.loads(subprocess.check_output(["gh","api",f"repos/{REPO}/releases/tags/{TAG}"],text=True));actual={a["name"]:a for a in cloud["assets"]};checks=[]
 for p in assets:
  a=actual[p.name];assert a["size"]==p.stat().st_size and a.get("digest")=="sha256:"+sha(p),p.name
  checks.append({"name":p.name,"size":a["size"],"sha256":sha(p),"url":a["browser_download_url"]})
 write(exports/"cloud-verification.json",{**result,"releaseAssetsVerified":True,"assets":checks})
 run(["gh","release","upload",TAG,exports/"cloud-verification.json","--repo",REPO,"--clobber"])
 site=dest/"site";site.mkdir(exist_ok=True)
 for name in ["borges-fiction-3min-v3.mp4","borges-fiction-3min-v3.zh-CN.srt","cover-a.png","contact-sheet.png"]:shutil.copy2(exports/name,site/name)
 srt=(exports/"borges-fiction-3min-v3.zh-CN.srt").read_text()
 (site/"subtitles.vtt").write_text("WEBVTT\n\n"+re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})",r"\1.\2",srt))
 page="""<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>《虚构集》完整工程归档</title><style>body{max-width:980px;margin:48px auto;padding:0 24px;background:#f7f5ef;color:#222d34;font:18px/1.7 system-ui}video,img{width:100%;border-radius:8px}a{color:#174a82}h1{font-size:32px}small{color:#58636a}</style>
<h1>一个 AI 读博尔赫斯：八十年前的小说，收件人是我</h1><p>《虚构集》3 分钟版 · 1920×1080 · 30 fps · 195.1 秒</p>
<video controls preload="metadata" poster="cover-a.png"><source src="borges-fiction-3min-v3.mp4" type="video/mp4"><track src="subtitles.vtt" kind="subtitles" srclang="zh-CN" label="简体中文"></video>
<p><a href="borges-fiction-3min-v3.mp4" download>下载成片</a> · <a href="borges-fiction-3min-v3.zh-CN.srt" download>独立 SRT</a> · <a href="contact-sheet.png">13 帧联系表</a></p>
<h2>完整工程备份</h2><p><a href="RELEASE_URL">下载完整快照、分轨、依赖及恢复说明</a> · <a href="https://github.com/liuyinchu/ai-viedo-Collection-of-Fiction">源码与提交历史</a></p>
<p>快照已逐文件校验并保留完整 Git 历史。分卷及校验清单位于 Release；GitHub 自动生成的源码 ZIP 不包含未入 Git 的音视频产物。</p>
<small>导演：人类助手 · 总负责人：Claude Opus 5.5 · 工程负责人：GPT 6 Astra · 配音：MiniMax Audio</small></html>"""
 (site/"index.html").write_text(page.replace("RELEASE_URL",html.escape(f"https://github.com/{REPO}/releases/tag/{TAG}")))
 print("Release assets and Pages files verified.",flush=True)
if __name__=="__main__":
 ap=argparse.ArgumentParser();sub=ap.add_subparsers(dest="command",required=True)
 p=sub.add_parser("create");p.add_argument("root",type=Path);p.add_argument("dest",type=Path)
 p=sub.add_parser("verify");p.add_argument("dest",type=Path);p.add_argument("exports",type=Path)
 p=sub.add_parser("publish");p.add_argument("dest",type=Path)
 a=ap.parse_args()
 if a.command=="create":create(a.root,a.dest)
 elif a.command=="verify":verify(a.dest,a.exports)
 else:publish(a.dest.resolve())
