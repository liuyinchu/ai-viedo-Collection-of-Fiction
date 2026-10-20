from pathlib import Path
import hashlib, json, os, shutil, subprocess
ROOT = Path(__file__).resolve().parent.parent
def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))
def write_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
def digest(data):
    return hashlib.sha256(data).hexdigest()
def ffmpeg():
    path = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    if path:
        return path
    path = ROOT / "engine/node_modules/ffmpeg-static/ffmpeg"
    if not path.exists():
        raise RuntimeError("Install engine dependencies first: npm ci --prefix engine")
    return str(path)
def run_ffmpeg(args):
    return subprocess.run([ffmpeg(), "-hide_banner", "-nostdin", *map(str, args)], check=True, capture_output=True, text=True)
