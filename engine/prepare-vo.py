"""Extract only approved spoken text; all generated text files must be regenerated from script/."""
import re
from common import ROOT, digest, read_json, write_json
source = ROOT / "script/short-3min.md"
text = source.read_text(encoding="utf-8")
segments = []
for m in re.finditer(r"^\*\*(S\d\d)\*\*\s*$([\s\S]*?)(?=^\*\*S\d\d\*\*|\Z)", text, re.M):
    spoken = re.search(r"^- 口播：(.*)$", m[2], re.M)
    pause = re.search(r"^- 段后停：([0-9.]+)", m[2], re.M)
    if not spoken or not pause:
        raise ValueError(f"Missing spoken text or pause: {m[1]}")
    canonical = spoken[1].strip()
    # The only lexical substitution is the approved pronunciation instruction AI -> A I.
    tts = re.sub(r"\bAI\b", "A I", canonical)
    segments.append({"id":m[1],"text":canonical,"ttsText":tts,"pauseAfter":float(pause[1]),"textSha256":digest(canonical.encode())})
if [s["id"] for s in segments] != [f"S{i:02}" for i in range(1,20)]:
    raise ValueError("Expected exactly S01–S19 in order")
design = read_json(ROOT / "design/film/script.json")
for a,b in zip(segments, design["segments"], strict=True):
    if any(a[k] != b[k] for k in ["id","text","pauseAfter"]):
        raise ValueError(f"Design script differs from source: {a['id']}")
out = ROOT / "audio/vo"
(out / "text").mkdir(parents=True, exist_ok=True)
for s in segments:
    (out / "text" / (s["id"] + ".txt")).write_text(s["ttsText"] + "\n",encoding="utf-8")
write_json(out / "segments.json", {"source":"script/short-3min.md","sourceSha256":digest(source.read_bytes()),"pronunciationSubstitutions":{"AI":"A I"},"segments":segments})
print(f"Prepared {len(segments)} segments; {sum(len(s['text']) for s in segments)} characters; {sum(s['pauseAfter'] for s in segments):.1f}s pauses.")
