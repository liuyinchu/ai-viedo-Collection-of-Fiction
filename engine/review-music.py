"""Build measured music comparisons, audition clips, and a visual review for Claude."""
import json, math, html, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties, fontManager
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from common import ROOT, read_json, write_json, digest, ffmpeg

SR=48000
OUT=ROOT/"out/review/music-v2"
OUT.mkdir(parents=True,exist_ok=True)
font_path=ROOT/"out/engineering/report-font-400.ttf"
if not font_path.exists():
    font=TTFont(ROOT/"assets/fonts/NotoSansSC-Variable.ttf")
    instantiateVariableFont(font,{"wght":400},inplace=True).save(font_path)
fontManager.addfont(str(font_path))
prop=FontProperties(fname=str(font_path))
plt.rcParams.update({"font.family":prop.get_name(),"axes.unicode_minus":False,
    "font.size":10,"axes.spines.top":False,"axes.spines.right":False,
    "figure.facecolor":"#f7f5ef","axes.facecolor":"#f7f5ef","savefig.facecolor":"#f7f5ef",
    "text.color":"#242c33","axes.labelcolor":"#46545d","xtick.color":"#46545d","ytick.color":"#46545d"})
timing=read_json(ROOT/"audio/vo/timing.json")
windows=read_json(ROOT/"audio/music/placement.json")["windows"]
plan=read_json(ROOT/"audio/music/synthetic-v2/score-plan.json")
old_manifest=read_json(ROOT/"audio/music/synthetic-v1/manifest.json")
new_manifest=read_json(ROOT/"audio/music/synthetic-v2/manifest.json")
v,_=sf.read(ROOT/"audio/vo/narration.wav",dtype="float32")
old,_=sf.read(ROOT/"audio/music/synthetic-v1/score.wav",dtype="float32")
new,_=sf.read(ROOT/"audio/music/synthetic-v2/score.wav",dtype="float32")
assert len(v)==len(old)==len(new)
names={"opening":"开场 / 两个不同答案","menard":"梅纳尔 / 同一句话，换一个人","ending":"片尾 / 回到那座图书馆"}
colors={"voice":"#47535f","v1":"#9fa8ad","v2":"#b34727"}
def rms(x):return float(20*np.log10(max(float(np.sqrt(np.mean(np.square(x,dtype=np.float64)))),1e-12)))
def levels(x,hop=12000):
    a=x.mean(axis=1) if x.ndim==2 else x
    # Stereo RMS uses energy across both channels, not the downmixed waveform.
    n=len(x)//hop
    b=x[:n*hop].reshape((n,hop,-1))
    return (np.arange(n)+.5)*hop/SR,20*np.log10(np.maximum(np.sqrt(np.mean(b.astype(np.float64)**2,axis=(1,2))),1e-6))
rows=[]
for w in windows:
    a,b=round(w["start"]*SR),round(w["end"]*SR)
    vf=v[a:b];o=old[a:b];n=new[a:b]
    hop=4800;nr=(b-a)//hop
    gate=np.sqrt(np.mean(vf[:nr*hop].reshape(nr,hop)**2,axis=1))>10**(-35/20)
    mask=np.repeat(gate,hop)
    vn=vf[:nr*hop][mask];on=o[:nr*hop][mask];nn=n[:nr*hop][mask]
    rows.append({"id":w["id"],"start":w["start"],"end":w["end"],"voiceRmsDbFS":rms(vf),
       "v1MusicRmsDbFS":rms(o),"v2MusicRmsDbFS":rms(n),"musicIncreaseDb":rms(n)-rms(o),
       "voiceMinusV1Db":rms(vf)-rms(o),"voiceMinusV2Db":rms(vf)-rms(n),
       "voiceActiveMinusV1Db":rms(vn)-rms(on),"voiceActiveMinusV2Db":rms(vn)-rms(nn),
       "v1Notes":len(next(e for e in old_manifest["events"] if e["window"]["id"]==w["id"])["notes"]),
       "v2Notes":len(plan["notes"][w["id"]])})
metrics={"version":"synthetic-v2","status":"awaiting-director-listening",
 "levelDefinition":"Original stems before final common mix normalization; RMS over complete placement window, stereo mean-square. Active-voice comparison gates 100 ms voice blocks above -35 dBFS.",
 "curveDefinition":"250 ms block RMS; display floor -65 dBFS; no per-track display normalization.",
 "windows":rows,"mixedWav":read_json(ROOT/"audio/mix/synthetic-v2-review.json")["verified"],
 "files":[{"path":p,"sha256":digest((ROOT/p).read_bytes())} for p in [
   "audio/music/synthetic-v1/score.wav","audio/music/synthetic-v2/score.wav","audio/vo/narration.wav",
   "audio/music/synthetic-v2/score-plan.json","audio/mix/synthetic-v2-review.wav"]],
 "approvalBoundary":"Claude 可核对时刻、强弱与乐句结构；悦耳程度和人声遮盖感由导演听审。"}
write_json(ROOT/"audio/music/synthetic-v2/analysis.json",metrics)
write_json(OUT/"analysis.json",metrics)

fig=plt.figure(figsize=(16,9),layout="constrained")
gs=fig.add_gridspec(3,3,height_ratios=[.72,1.25,1.45])
fig.suptitle("配乐 v2 · 从背景点缀到可辨认的乐句",x=.055,ha="left",fontsize=23,fontweight="normal")
ax=fig.add_subplot(gs[0,:])
ax.set_xlim(0,timing["total"]);ax.set_ylim(-.2,1.35);ax.set_yticks([])
ax.set_xlabel("成片时间 / 秒")
ax.set_title("音乐仍只出现三处 · 合计 59.5 秒 / 全片 195.1 秒",loc="left",fontsize=12)
for s in timing["segments"]:
    ax.broken_barh([(s["start"],s["end"]-s["start"])],(.05,.24),facecolors="#d5d8d8")
    ax.text((s["start"]+s["end"])/2,-.10,s["id"],ha="center",va="top",fontsize=7)
for w in windows:
    ax.broken_barh([(w["start"],w["end"]-w["start"])],(.55,.34),facecolors=colors["v2"],alpha=.85)
    ax.text((w["start"]+w["end"])/2,1.04,{"opening":"开场","menard":"梅纳尔","ending":"片尾"}[w["id"]],ha="center",fontsize=11)
ax.text(20,.67,"留白：人声 + 空气 + 镜头音效",color="#68747b",fontsize=10)
for j,(w,r) in enumerate(zip(windows,rows)):
    ax=fig.add_subplot(gs[1,j])
    a,b=round(w["start"]*SR),round(w["end"]*SR)
    for x,label,c,lw in [(v,"人声",colors["voice"],1.05),(old,"v1 配乐",colors["v1"],1.25),(new,"v2 配乐",colors["v2"],1.6)]:
        t,y=levels(x[a:b]);ax.plot(t,np.maximum(y,-65),label=label,c=c,lw=lw)
    ax.set_ylim(-65,-10);ax.set_xlim(0,w["end"]-w["start"])
    ax.set_title(names[w["id"]],loc="left",fontsize=12,pad=12)
    ax.set_xlabel("片段内时间 / 秒")
    if j==0:ax.set_ylabel("声轨电平 / dBFS（250 ms RMS）");ax.legend(loc="lower left",fontsize=8,ncol=3)
    ax.grid(alpha=.14)
    for s in timing["segments"]:
        if s["start"]>=w["start"] and s["start"]<w["end"]:
            t=s["start"]-w["start"]
            ax.axvline(t,c="#718096",lw=.6,ls=":",alpha=.7)
            ax.text(t+.15,-12,s["id"],fontsize=8,color="#53606a")
    bx=fig.add_subplot(gs[2,j]);bx.axis("off")
    bx.text(0,.92,f"+{r['musicIncreaseDb']:.1f} dB",fontsize=27,color=colors["v2"])
    bx.text(0,.78,"相对 v1 的配乐平均电平提升",fontsize=10)
    bx.text(0,.61,f"人声与配乐电平差：{r['voiceMinusV1Db']:.1f} → {r['voiceMinusV2Db']:.1f} dB",fontsize=11)
    bx.text(0,.47,f"人声活跃处电平差：{r['voiceActiveMinusV2Db']:.1f} dB",fontsize=11)
    bx.text(0,.33,f"音符起音：{r['v1Notes']} → {r['v2Notes']} 次",fontsize=11)
    bx.text(0,.14,{"opening":"主旋律保持，低音与短回应填补间隙。","menard":"同一动机换低音，再形成第二句回应。","ending":"口播后出现收束音，随后随画面消散。"}[w["id"]],fontsize=10,color="#53606a",wrap=True)
fig.text(.055,.006,"测量使用实际声轨、统一刻度；未将每条曲线分别放大。整体混音实测 −13.98 LUFS / −1.08 dBTP。听感仍待导演验收。",fontsize=9,color="#53606a")
fig.savefig(OUT/"levels.png",dpi=140)
plt.close(fig)

def midi(p):
    keys={"C":0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11}
    return (int(p[-1])+1)*12+keys[p[:-1]]
role_colors={"motif":"#a23f28","response":"#a23f28","cadence":"#a23f28","bass":"#246b69","answer":"#a17b22"}
fig,axs=plt.subplots(3,1,figsize=(16,10.2),layout="constrained")
fig.suptitle("把乐句画出来 · 同一动机，在不同语境中返回",x=.055,ha="left",fontsize=22)
for ax,w in zip(axs,windows):
    notes=plan["notes"][w["id"]]
    old_notes=next(e for e in old_manifest["events"] if e["window"]["id"]==w["id"])["notes"]
    for s in timing["segments"]:
        a=max(s["start"],w["start"])-w["start"];b=min(s["end"],w["end"])-w["start"]
        if b>a:
            ax.axvspan(a,b,color="#66717b",alpha=.055)
            ax.text((a+b)/2,78.4,s["id"]+" 口播",ha="center",fontsize=8,color="#6a737a")
    ax.scatter([n["offset"] for n in old_notes],[midi(n["pitch"]) for n in old_notes],
      s=160,facecolors="none",edgecolors="#a9b0b2",linewidths=1.1,zorder=3,label="v1 音符")
    lead=[n for n in notes if n["role"] in ("motif","response","cadence")]
    ax.plot([n["offset"] for n in lead],[midi(n["pitch"]) for n in lead],color=colors["v2"],alpha=.45,lw=1.3,zorder=2)
    for n in notes:
        ax.scatter(n["offset"],midi(n["pitch"]),s=35+90*n["velocity"],c=role_colors[n["role"]],zorder=4)
        ax.annotate(n["pitch"],(n["offset"],midi(n["pitch"])),xytext=(0,8),textcoords="offset points",ha="center",fontsize=9)
    ax.set_ylim(40,80);ax.set_xlim(-.1,w["end"]-w["start"]+.3)
    ax.set_yticks([43,50,57,62,69,76],["G2","D3","A3","D4","A4","E5"])
    ax.set_title(names[w["id"]]+f"  ·  成片 {w['start']:.2f}–{w['end']:.2f} 秒",loc="left",fontsize=12)
    ax.set_xlabel("片段内时间 / 秒");ax.grid(alpha=.15)
fig.text(.055,.003,"朱色：主旋律 / 回应 / 收束   青色：低音   金色：内声部回应   灰圈：v1 音符   阴影：口播区间。圆点大小表示设定力度，不表示响度测量。",fontsize=9)
fig.savefig(OUT/"score-map.png",dpi=140);plt.close(fig)

# Production-balance auditions: concatenate the actual normalized mix windows.
def montage(path):
    x,sr=sf.read(path,dtype="float32")
    assert sr==SR
    pieces=[]
    for w in windows:
        a,b=round(w["start"]*SR),round(w["end"]*SR)
        clip=x[a:b].copy()
        ramp=np.linspace(0,1,480);clip[:480]*=ramp[:,None];clip[-480:]*=ramp[::-1,None]
        pieces.extend([clip,np.zeros((38400,2),dtype=np.float32)])
    return np.concatenate(pieces[:-1])
def encode(x,stem):
    wav=OUT/(stem+".wav");mp3=OUT/(stem+".mp3")
    sf.write(wav,x,SR,subtype="PCM_24")
    p=subprocess.run([ffmpeg(),"-y","-hide_banner","-loglevel","error","-i",str(wav),"-c:a","libmp3lame","-b:a","256k",str(mp3)],capture_output=True,text=True)
    if p.returncode:raise RuntimeError(p.stderr)
    return mp3
v2mix=montage(ROOT/"audio/mix/synthetic-v2-review.wav")
v1mix=montage(ROOT/"audio/mix/synthetic-v1-word-sync-review.wav")
encode(v2mix,"v2-with-voice")
solo,_=sf.read(ROOT/"audio/music/synthetic-v2/solo-audition.wav",dtype="float32")
encode(solo,"v2-solo")
end=round(windows[0]["end"]*SR)
ab=np.concatenate([v1mix[:end],np.zeros((38400,2),dtype=np.float32),v2mix[:end]])
encode(ab,"opening-v1-then-v2")
table="".join(f"<tr><td>{names[r['id']]}</td><td>+{r['musicIncreaseDb']:.1f} dB</td><td>{r['voiceMinusV1Db']:.1f} → {r['voiceMinusV2Db']:.1f} dB</td><td>{r['v1Notes']} → {r['v2Notes']}</td></tr>" for r in rows)
page="""<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>《虚构集》配乐 v2 · 视觉听审说明</title>
<style>body{max-width:1180px;margin:48px auto;padding:0 24px;color:#242c33;background:#f7f5ef;font:16px/1.7 system-ui,sans-serif}h1{font-size:34px;line-height:1.3}h2{margin-top:42px;font-size:23px}p{max-width:850px}.badge{color:#a23f28;font-weight:600}img{width:100%;display:block;margin:24px 0}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px;border-bottom:1px solid #cfd3d2}audio{width:min(100%,680px)}a{color:#246b69}.muted{color:#66717b;font-size:14px}</style>
<p class="badge">候选 v2 · 等待导演听审 · 2026-10-20</p>
<h1>让音乐形成乐句，<br>也让它在口播下被听见。</h1>
<p>回应导演“音量小、存在感低”的反馈：合成前峰值目标提高 7 dB，口播时的最大压低从 4.5 dB 减到 2 dB；延长琴弦衰减，增强上部泛音，加入低音和内声部回应。主旋律保留 D–A–E–B，三处配乐窗口不变，没有鼓或固定节拍。</p>
<h2>01 · 实际电平与进入位置</h2><img src="levels.png" alt="三处配乐的时间轴与人声、v1、v2电平比较">
<table><thead><tr><th>片段</th><th>配乐电平提升</th><th>人声减配乐电平</th><th>音符起音数</th></tr></thead><tbody>TABLE</tbody></table>
<p class="muted">表格以整个窗口的 RMS 计算，包含停顿与衰减；图中另列人声活跃处的差值。dBFS 是相对数字满刻度的电平，并非播放设备上的分贝，也不等同于主观响度。</p>
<h2>02 · 乐句与叙事的关系</h2><img src="score-map.png" alt="音符起音时间、音高、角色与口播区间">
<p>开场：同一个四音动机被低音和短回应托住。梅纳尔：动机不变，底下的和声语境变了，随后给出回应句。片尾：再认出这组音，在口播结束后落向 D，并随拉远的画面消散。</p>
<p>Claude 可以据此验收音乐是否待在指定窗口、转折是否对应分镜、乐句是否足够稀疏。图表不能替代导演判断音色、悦耳程度和人声是否被遮盖。</p>
<h2>03 · 导演试听</h2><p>新版含口播，约 61 秒：开场 → 梅纳尔 → 片尾。使用正式混音的相对音量。</p><audio controls preload="metadata" src="v2-with-voice.mp3"></audio>
<p>开场 A/B：前 18.59 秒为 v1，0.8 秒空隙后为 v2。两版使用同一套新版音效，均按约 −14 LUFS 混音。</p><audio controls preload="metadata" src="opening-v1-then-v2.mp3"></audio>
<p>新版纯配乐：单独提高试听音量，不能用它判断配乐与人声的平衡。</p><audio controls preload="metadata" src="v2-solo.mp3"></audio>
<p class="muted">生成与分析代码：engine/synthesize-music-v2.py、engine/review-music.py。<a href="analysis.json">测量数据和输入哈希</a>。声轨无外部音乐或乐器采样。</p></html>""".replace("TABLE",table)
(OUT/"index.html").write_text(page)
print(json.dumps({"windows":rows,"report":str(OUT/"index.html")},ensure_ascii=False,indent=2))
