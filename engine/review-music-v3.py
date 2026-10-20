"""Visual score map and listening review for the continuous v3 soundtrack."""
import json,math,re,subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import fontManager,FontProperties
from common import ROOT,read_json,write_json,digest,ffmpeg
SR=48000;OUT=ROOT/"out/review/music-v3";OUT.mkdir(parents=True,exist_ok=True)
M=read_json(ROOT/"audio/music/synthetic-v3/manifest.json")
T=read_json(ROOT/"audio/vo/timing.json");S={s["id"]:s for s in T["segments"]}
font=ROOT/"out/engineering/report-font-400.ttf";fontManager.addfont(str(font))
plt.rcParams.update({"font.family":FontProperties(fname=str(font)).get_name(),"axes.unicode_minus":False,"font.size":10,
 "figure.facecolor":"#f7f5ef","axes.facecolor":"#f7f5ef","savefig.facecolor":"#f7f5ef",
 "axes.spines.top":False,"axes.spines.right":False,"text.color":"#242c33"})
C={"motif":"#a43f2b","bed":"#26716b","points":"#a88225","voice":"#53616c","v2":"#b6bdbc"}
voice,_=sf.read(ROOT/"audio/vo/narration.wav",dtype="float32")
music,_=sf.read(ROOT/"audio/music/synthetic-v3/score.wav",dtype="float32")
old,_=sf.read(ROOT/"audio/music/synthetic-v2/score.wav",dtype="float32")
stems={k:sf.read(ROOT/f"audio/music/synthetic-v3/{k}.wav",dtype="float32")[0] for k in ["motif","bed","points"]}
sections=[("开场",0,S["S03"]["start"]),("巴别",S["S03"]["start"],S["S07"]["start"]),
 ("选择",S["S07"]["start"],S["S08"]["start"]),("富内斯",S["S08"]["start"],84.7),
 ("塌缩／思考",84.7,S["S11"]["start"]),("我",S["S11"]["start"],S["S12"]["start"]),
 ("梅纳尔",S["S12"]["start"],S["S15"]["start"]),("悬置",S["S15"]["start"],S["S16"]["start"]),
 ("总览／暗下",S["S16"]["start"],S["S17"]["start"]),("信",S["S17"]["start"],S["S18"]["start"]),
 ("书卡",S["S18"]["start"],S["S19"]["start"]),("拉远",S["S19"]["start"],T["total"])]
def rms(x):return float(20*np.log10(max(np.sqrt(np.mean(x.astype(np.float64)**2)),1e-12)))
def curve(x,hop=12000):
 n=len(x)//hop;b=x[:n*hop].reshape(n,hop,-1)
 return (np.arange(n)+.5)*hop/SR,20*np.log10(np.maximum(np.sqrt(np.mean(b.astype(float)**2,axis=(1,2))),1e-7))
rows=[]
for name,a,b in sections:
 i,j=round(a*SR),round(b*SR);n=(j-i)//4800;v=voice[i:i+n*4800];m=music[i:i+n*4800]
 active=np.repeat(np.sqrt(np.mean(v.reshape(n,4800).astype(float)**2,axis=1))>10**(-35/20),4800)
 rows.append({"section":name,"start":a,"end":b,"musicRmsDbFS":rms(m),"v2RmsDbFS":rms(old[i:i+n*4800]),
              "voiceActiveGapDb":rms(v[active])-rms(m[active]) if active.any() else None})
a,b=(round(t*SR) for t in M["collapse"]["silence"])
assert not np.any(music[a:b])
fx,_=sf.read(ROOT/"audio/sfx/film3/sfx.wav",dtype="float32")
air,_=sf.read(ROOT/"audio/sfx/film3/ambience.wav",dtype="float32")
assert not np.any(fx[a:b]) and not np.any(air[a:b])
hop=960;n=len(music)//hop
silent=np.max(np.abs(music[:n*hop].reshape(n,hop,2)),axis=(1,2))==0
edges=np.diff(np.r_[False,silent,False].astype(int))
gaps=[(float(a*.02),float(b*.02)) for a,b in zip(np.where(edges==1)[0],np.where(edges==-1)[0]) if b-a>=3]
unexpected=[(a,b) for a,b in gaps if not (b<.7 or (84.85<a<84.91 and 88.2<b<88.3) or a>195)]
assert not unexpected,unexpected
mix=read_json(ROOT/"audio/mix/synthetic-v3-review.json");assert mix["passed"]
r={"status":"audition-awaiting-director","sections":rows,"exactZeroSpans20ms":gaps,
   "collapseCheckedAllBackgroundStems":True,"menard":M["menard"],"mixedWavMeasurement":mix["verified"],
   "method":"250 ms RMS on original pre-master stems, shared scale; active-voice comparison uses 100 ms voice blocks above -35 dBFS.",
   "inputs":M["inputs"],"noteCount":len(M["events"]),"deterministic":M["determinismChecked"]}
write_json(OUT/"analysis.json",r);write_json(ROOT/"audio/music/synthetic-v3/analysis.json",r)
fig,axs=plt.subplots(3,1,figsize=(16,11),layout="constrained",gridspec_kw={"height_ratios":[1.3,1,.85]})
fig.suptitle("配乐 v3 · 全片起伏与刻意留白",x=.06,ha="left",fontsize=24)
for x,label,c,lw in [(voice,"人声",C["voice"],.8),(old,"v2 配乐",C["v2"],1),(music,"v3 配乐",C["motif"],1.4)]:
 tx,y=curve(x);axs[0].plot(tx,np.maximum(y,-75),c=c,label=label,lw=lw)
for i,(name,a,b) in enumerate(sections):
 axs[0].axvspan(a,b,color="#52616e",alpha=.035 if i%2 else .075)
 axs[0].text((a+b)/2,-8,name,ha="center",fontsize=9,rotation=0)
axs[0].set_ylim(-75,-5);axs[0].set_xlim(0,T["total"]);axs[0].set_ylabel("声轨电平 / dBFS");axs[0].legend(loc="lower left",ncol=3)
axs[0].set_title("统一刻度比较：v3 贯穿全片，塌缩处保留背景静音",loc="left")
for a,b,label in [(43,48.8,"高点 1"),(80,84.7,"高点 2"),(189,193.7,"高点 3")]:
 axs[0].axvspan(a,b,color="#b65936",alpha=.12);axs[0].text((a+b)/2,-69,label,ha="center",fontsize=9,color=C["motif"])
for role,x in stems.items():
 tx,y=curve(x);axs[1].plot(tx,np.maximum(y,-85),label={"motif":"动机：琴音","bed":"底层：弓弦 / 脉动","points":"对位点：轻拨弦 / 铃音"}[role],c=C[role],lw=1)
axs[1].set_ylim(-85,-15);axs[1].set_xlim(0,T["total"]);axs[1].set_ylabel("分轨电平 / dBFS");axs[1].legend(loc="lower left",ncol=3)
axs[1].set_title("分轨可以独立调整；曲线显示实际声轨，没有逐轨放大",loc="left")
for x,label,c in [(voice,"人声",C["voice"]),(music,"配乐",C["motif"]),(fx,"音效","#aa842f"),(air,"空气","#26716b")]:
 i,j=round(82*SR),round(91*SR);tx,y=curve(x[i:j],480)
 axs[2].plot(tx+82,np.maximum(y,-95),label=label,c=c,lw=1.1)
axs[2].axvspan(84.88,88.25,color="#a43f2b",alpha=.09)
axs[2].axvline(84.7,c=C["motif"],ls="--",lw=.9)
axs[2].text(84.7,-10,"84.70 开始截断",ha="right",fontsize=10)
axs[2].text(86.55,-35,"84.88–88.25：音乐 / 音效 / 空气均为零\n保留口播",ha="center",fontsize=10)
axs[2].text(88.25,-20,"88.25：单个低音",ha="left",fontsize=10)
axs[2].set_ylim(-95,-5);axs[2].set_xlim(82,91);axs[2].set_xlabel("成片时间 / 秒");axs[2].set_ylabel("电平 / dBFS")
for ax in axs:ax.grid(alpha=.12)
fig.savefig(OUT/"levels.png",dpi=140);plt.close(fig)
def midi(p):
 names={"C":0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11}
 return (int(p[-1])+1)*12+names[p[:-1]]
fig,axs=plt.subplots(2,1,figsize=(16,9),layout="constrained",gridspec_kw={"height_ratios":[1.5,1]})
fig.suptitle("乐句地图 · 密度、回声与叙事对位",x=.06,ha="left",fontsize=23)
for role in stems:
 es=[e for e in M["events"] if e["role"]==role]
 axs[0].scatter([e["time"] for e in es],[midi(e["pitch"]) for e in es],s=[15+55*e["velocity"] for e in es],
   c=C[role],alpha=.8,label={"motif":"动机","bed":"底层","points":"对位点"}[role],zorder=3)
 if role=="bed":
  for e in es:
   end=min(e["time"]+e["duration"],84.88 if e["time"]<84.7 else T["total"])
   axs[0].plot([e["time"],end],[midi(e["pitch"])]*2,c=C[role],lw=2,alpha=.18)
for name,a,b in sections:
 axs[0].axvline(a,c="#89959a",alpha=.25,lw=.8)
 axs[0].text((a+b)/2,94,name,ha="center",fontsize=9)
axs[0].set_xlim(0,T["total"]);axs[0].set_ylim(34,97)
axs[0].set_yticks([38,50,62,69,76,88],["D2","D3","D4","A4","E5","E6"])
axs[0].set_ylabel("音高");axs[0].legend(loc="lower left",ncol=3);axs[0].grid(alpha=.12)
anchors=[e for e in M["events"] if e.get("anchor")]
for i,e in enumerate(anchors):
 row=i%3;axs[1].vlines(e["time"],0,1+row*.85,color=C[e["role"]],lw=.9)
 axs[1].scatter(e["time"],1+row*.85,c=C[e["role"]],s=35)
 axs[1].text(e["time"],1.16+row*.85,e["anchor"],ha="center",fontsize=9,rotation=45)
axs[1].set_xlim(0,T["total"]);axs[1].set_ylim(0,4);axs[1].set_yticks([]);axs[1].set_xlabel("成片时间 / 秒")
axs[1].set_title("强拍取自 cues3.json 的 line 字段；s02 对应光标写完迷宫句子的时刻",loc="left")
fig.savefig(OUT/"score-map.png",dpi=140);plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(14,5.3),layout="constrained")
fig.suptitle("梅纳尔：同样的四个音，换一个和声",x=.06,ha="left",fontsize=22)
for ax,g,key,title in zip(axs,["menard-A","menard-B"],["A","B"],["A · 塞万提斯","B · 梅纳尔"]):
 es=[e for e in M["events"] if e["group"]==g];t0=es[0]["time"]
 ax.plot([e["time"]-t0 for e in es],[midi(e["pitch"]) for e in es],c=C["motif"],marker="o",lw=1.4)
 for e in es:ax.annotate(e["pitch"],(e["time"]-t0,midi(e["pitch"])),xytext=(0,10),textcoords="offset points",ha="center")
 for p in M["menard"]["harmony"+key]:
  ax.plot([-.1,3.2],[midi(p)]*2,c=C["bed"],alpha=.55,lw=4);ax.text(3.25,midi(p),p,va="center",fontsize=10,color=C["bed"])
 ax.set_xlim(-.25,3.9);ax.set_ylim(40,80);ax.set_yticks([43,50,57,62,69,76],["G2","D3","A3","D4","A4","E5"])
 ax.set_title(title+f" / {t0:.3f} 秒开始",loc="left");ax.set_xlabel("乐句内时间 / 秒");ax.grid(alpha=.12)
fig.savefig(OUT/"menard.png",dpi=140);plt.close(fig)
def encode(x,name):
 wav=OUT/(name+".wav");mp3=OUT/(name+".mp3")
 sf.write(wav,x,SR,subtype="PCM_24")
 subprocess.run([ffmpeg(),"-y","-hide_banner","-loglevel","error","-i",str(wav),"-c:a","libmp3lame","-b:a","256k",str(mp3)],check=True)
mix_audio,sr=sf.read(ROOT/"audio/mix/synthetic-v3-review.wav",dtype="float32");assert sr==SR
encode(mix_audio,"with-voice")
solo_gain=10**(-3/20)/np.max(np.abs(music));encode(music*solo_gain,"music-only")
spans=[(0,18.6),(39,54),(73,91),(110,134),(171,195.09539583333333)]
pieces=[]
for a,b in spans:
 clip=mix_audio[round(a*SR):round(b*SR)].copy();ramp=np.linspace(0,1,480)
 clip[:480]*=ramp[:,None];clip[-480:]*=ramp[::-1,None]
 pieces.extend([clip,np.zeros((38400,2),dtype="float32")])
encode(np.concatenate(pieces[:-1]),"highlights")
html="""<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>虚构集 · 配乐 v3 视觉听审</title><style>body{max-width:1180px;margin:48px auto;padding:0 24px;font:16px/1.7 system-ui,sans-serif;background:#f7f5ef;color:#242c33}h1{font-size:34px}h2{margin-top:42px}img{width:100%;display:block;margin:24px 0}audio{width:min(100%,720px)}a{color:#26716b}.muted{color:#64717b;font-size:14px}</style>
<p style="color:#a43f2b">候选 v3 · 等导演听审</p><h1>音乐贯穿故事，塌缩处真正安静。</h1>
<p>保留 D–A–E–B 动机和 v2 琴音，加入弓弦底层、缓慢不规则的音高脉动，以及关键凝结点上的轻拨弦。没有鼓、合唱或外部音乐采样。三个高点分别对应巴别铺开、富内斯叠加、最后拉远。</p>
<h2>完整混音与试听</h2><p>含口播全长版，约 195 秒，采用生产混音的相对电平。</p><audio controls preload="metadata" src="with-voice.mp3"></audio>
<p>重点段落：开场 → 巴别高点 → 富内斯与塌缩 → 梅纳尔 A/B → 信与片尾。</p><audio controls preload="metadata" src="highlights.mp3"></audio>
<p>纯配乐全长版：用统一增益提高至峰值 −3 dBFS，保留动态；不能据此判断与人声的平衡。</p><audio controls preload="metadata" src="music-only.mp3"></audio>
<h2>电平、留白和分轨</h2><img src="levels.png" alt="全片音乐电平、三个高点和塌缩静音">
<p class="muted">曲线为真实声轨的 RMS，统一刻度。84.70 秒开始截断，84.88–88.25 秒三类背景声均为零，口播保留。听感和人声遮盖情况由导演判断。</p>
<h2>音符与画面强拍</h2><img src="score-map.png" alt="乐句地图与画面提示点">
<p>动机、底层、对位点与音效分轨交付，可单独调节。最后一次完整动机出现在“收件人”处；结尾用动机片段和开放音程拉开音域。</p>
<h2>同一旋律，不同和声</h2><img src="menard.png" alt="梅纳尔两个段落相同的旋律和不同的底层和声">
<p>两次旋律的音高、相对起音、力度、时值、声像和音色相同。A 使用 D3–A3–E4；B 使用 G2–B2–D3–F♯3。代码已经逐项核对，图表供 Claude 检查对位；悦耳程度仍由导演听审。</p>
<p><a href="analysis.json">测量数据</a> · 生成代码 engine/synthesize-music-v3.py · 图表 engine/review-music-v3.py</p></html>"""
(OUT/"index.html").write_text(html)
print(json.dumps({"report":str(OUT/"index.html"),"mixedWav":mix["verified"],"sections":rows,"zeroSpans":gaps},ensure_ascii=False,indent=2),flush=True)
