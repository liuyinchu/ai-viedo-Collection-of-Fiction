"""Export the approved film3 at full resolution and verify the delivered files."""
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from common import ROOT, digest, ffmpeg, read_json, write_json
from voice import subtitles, source

PLAN = ROOT / "engine/film3-final-plan.json"
DEST = ROOT / "out/final-v3"
PROBE = ROOT / "engine/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe"


def run(args):
    p = subprocess.run(list(map(str, args)), capture_output=True, text=True, cwd=ROOT)
    if p.returncode:
        raise RuntimeError(f"Command failed ({p.returncode}): {args[0]}\n{p.stderr[-6000:]}")
    return p


def ff(args):
    return run([ffmpeg(), "-hide_banner", "-nostdin", *args])


def file_info(path):
    path = Path(path)
    return {"path": str(path.relative_to(ROOT)), "sha256": digest(path.read_bytes()),
            "bytes": path.stat().st_size}


def frozen_inputs(plan):
    for item in plan["inputs"] + [plan["master"], plan["audio"]]:
        if digest((ROOT / item["path"]).read_bytes()) != item["sha256"]:
            raise RuntimeError("Input changed after freeze: " + item["path"])
    approval = read_json(ROOT / plan["approval"])
    assert approval["decision"] == "approved-for-final-film3"
    assert approval["mix"] == plan["master"]
    assert all(approval["deliveryAudio"][k] == plan["audio"][k] for k in ("path", "sha256"))
    return approval


def subtitle_check(path):
    text = path.read_text(encoding="utf-8")
    blocks = text.strip().split("\n\n")
    timeline = read_json(ROOT / "audio/vo/timing.json")
    paragraphs = source()["segments"]
    reconstructed = []
    previous_end = 0
    def seconds(stamp):
        h, m, s, ms = map(int, re.split(r"[:,]", stamp))
        assert m < 60 and s < 60 and ms < 1000
        return 3600 * h + 60 * m + s + ms / 1000
    for i, block in enumerate(blocks, 1):
        lines = block.splitlines()
        assert int(lines[0]) == i
        m = re.fullmatch(r"(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})", lines[1])
        assert m, lines[1]
        start, end = map(seconds, m.groups())
        assert 0 <= previous_end <= start < end <= timeline["total"]
        # Rounded millisecond timestamps must remain inside a spoken paragraph.
        assert any(start >= s["start"] - .001 and end <= s["end"] + .001
                   for s in timeline["segments"])
        previous_end = end
        reconstructed.append("".join(lines[2:]))
    assert len(blocks) == 43
    assert "".join(reconstructed) == "".join(s["text"] for s in paragraphs)
    return {**file_info(path), "cues": len(blocks), "separateFile": True,
            "completeScriptMatch": True, "monotonic": True,
            "timingMethod": "measured paragraph boundaries; existing character-weighted splits within paragraphs",
            "source": file_info(ROOT / "script/short-3min.md"),
            "segments": file_info(ROOT / "audio/vo/segments.json"),
            "timeline": file_info(ROOT / "audio/vo/timing.json")}


def prepare(plan):
    frozen_inputs(plan)
    DEST.mkdir(parents=True, exist_ok=True)
    subtitles()
    target = ROOT / plan["subtitles"]
    shutil.copy2(ROOT / "out/film.zh-CN.srt", target)
    info = subtitle_check(target)
    write_json(DEST / "subtitles.json", info)
    print(json.dumps({"subtitles": info}, ensure_ascii=False), flush=True)
    return info


def events(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.startswith("{")]


def stream_hash(path, kind):
    return ff(["-v", "error", "-i", path, "-map", f"0:{kind}:0", "-c", "copy",
               "-f", "hash", "-hash", "sha256", "-"]).stdout.strip()


def measure(path):
    p = ff(["-i", path, "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
            "-f", "null", "-"])
    return json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}', p.stderr)[-1])


def contact_sheet(video, plan, audio_metrics):
    out = DEST / "stills"
    out.mkdir(exist_ok=True)
    font_path = ROOT / "out/engineering/report-font-400.ttf"
    font = ImageFont.truetype(str(font_path), 29)
    small = ImageFont.truetype(str(font_path), 20)
    times = plan["reviewTimes"]
    columns, thumb_w, thumb_h, margin, gap, cell_h, header = 4, 464, 261, 32, 16, 304, 110
    rows = math.ceil(len(times) / columns)
    sheet = Image.new("RGB", (margin * 2 + columns * thumb_w + (columns - 1) * gap,
                             header + rows * cell_h + margin), "#f7f5ef")
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 21), "《虚构集》第三版 · 正式成片复核", font=font, fill="#222d34")
    draw.text((margin, 66), "取自最终 MP4 · 1920 × 1080 · 30 fps · 195.1 秒 · 配乐 v3", font=small, fill="#53616c")
    stills = []
    for i, t in enumerate(times):
        path = out / f"t-{t:06.2f}.png"
        ff(["-y", "-v", "error", "-ss", t, "-i", video, "-frames:v", "1", path])
        with Image.open(path) as im:
            assert im.size == (1920, 1080)
            thumb = im.convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = margin + i % columns * (thumb_w + gap)
        y = header + i // columns * cell_h
        sheet.paste(thumb, (x, y))
        draw.text((x, y + thumb_h + 8), f"{t:.2f} s  ·  frame {t * 30}", font=small, fill="#34424a")
        stills.append({"time": t, "frame": t * 30, **file_info(path)})
    # Use the unused last-row space for objective export facts, not another design.
    x = margin + thumb_w + gap
    y = header + (rows - 1) * cell_h + 28
    notes = [
        f"最终音轨：{audio_metrics['input_i']} LUFS / {audio_metrics['input_tp']} dBTP",
        "声音：直接复用已通过预览中的 AAC 音轨，未再次编码",
        "画面：子帧运动模糊平均后，每帧调用一次 post",
        "已纳入片尾灰尘与红色前景「我」字的两处修正",
        "完整解码、5853 帧、30 fps 时间戳及字幕文本校验通过",
    ]
    for j, note in enumerate(notes):
        draw.text((x, y + 38 * j), note, font=small, fill="#53616c")
    path = ROOT / plan["contactSheet"]
    sheet.save(path)
    return stills, file_info(path)


def assemble(plan):
    approval = frozen_inputs(plan)
    subtitle_info = prepare(plan)
    render_events = events(ROOT / plan["renderLog"])
    render_result = next(x for x in reversed(render_events) if x.get("type") == "result")
    assert render_result["ok"], render_result
    verify_events = events(ROOT / plan["verifyLog"])
    verify_result = next(x for x in reversed(verify_events) if x.get("type") == "result")
    assert verify_result["ok"], verify_result
    warnings = [x for x in verify_events if x.get("type") == "finding"]
    picture, audio, video = (ROOT / plan[k] if isinstance(plan[k], str)
                            else ROOT / plan[k]["path"] for k in ("picture", "audio", "video"))
    partial = video.with_name(video.stem + ".partial.mp4")
    ff(["-y", "-i", picture, "-i", audio, "-map", "0:v:0", "-map", "1:a:0",
        "-c", "copy", "-map_metadata", "-1", "-movflags", "+faststart", partial])
    data = json.loads(run([PROBE, "-v", "error", "-count_frames", "-show_streams",
                           "-show_format", "-of", "json", partial]).stdout)
    assert len(data["streams"]) == 2  # Separate SRT, no subtitle stream.
    v = next(s for s in data["streams"] if s["codec_type"] == "video")
    a = next(s for s in data["streams"] if s["codec_type"] == "audio")
    assert (v["codec_name"], v["pix_fmt"], v["width"], v["height"], v["avg_frame_rate"],
            int(v["nb_read_frames"])) == ("h264", "yuv420p", 1920, 1080, "30/1", plan["frames"])
    assert v["r_frame_rate"] == "30/1"
    assert abs(float(v["duration"]) - plan["duration"]) < .001
    assert abs(float(data["format"]["duration"]) - plan["duration"]) < .001
    assert (a["codec_name"], int(a["sample_rate"]), a["channels"]) == ("aac", 48000, 2)
    assert abs(float(v["start_time"])) < .000001 and abs(float(a["start_time"])) < .000001
    assert abs(float(a["duration"]) - read_json(ROOT / "audio/vo/timing.json")["total"]) < .0011
    frame_data = json.loads(run([PROBE, "-v", "error", "-select_streams", "v:0", "-show_frames",
                                "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", partial]).stdout)
    timestamps = [float(x["best_effort_timestamp_time"]) for x in frame_data["frames"]]
    assert len(timestamps) == plan["frames"]
    max_error = max(abs(t - i / 30) for i, t in enumerate(timestamps))
    assert max_error < 2e-6
    ff(["-v", "error", "-xerror", "-i", partial, "-f", "null", "-"])
    metrics = measure(partial)
    assert abs(float(metrics["input_i"]) + 14) <= .300001 and float(metrics["input_tp"]) <= -1
    picture_hash, final_picture_hash = stream_hash(picture, "v"), stream_hash(partial, "v")
    audio_hash, final_audio_hash = stream_hash(audio, "a"), stream_hash(partial, "a")
    assert picture_hash == final_picture_hash
    assert audio_hash == final_audio_hash
    assert digest((ROOT / approval["acceptedPreview"]["path"]).read_bytes()) == approval["acceptedPreview"]["sha256"]
    assert audio_hash == stream_hash(ROOT / approval["acceptedPreview"]["path"], "a")
    frozen_inputs(plan)
    partial.replace(video)
    stills, sheet = contact_sheet(video, plan, metrics)
    frozen_inputs(plan)
    delivery = {
        "version": "film3-final", "status": "final-export-ready-for-Claude-visual-review",
        "approval": approval, "plan": file_info(PLAN),
        "video": {**file_info(video), "width": v["width"], "height": v["height"], "fps": 30,
                  "frames": len(timestamps), "duration": float(data["format"]["duration"]),
                  "codec": v["codec_name"], "pixelFormat": v["pix_fmt"]},
        "subtitles": subtitle_info, "contactSheet": sheet, "stills": stills,
        "audio": {"source": plan["audio"], "master": plan["master"], "measurement": metrics,
                  "codec": a["codec_name"], "sampleRate": int(a["sample_rate"]), "channels": a["channels"],
                  "duration": float(a["duration"]), "startTime": float(a["start_time"]),
                  "copiedWithoutReencoding": True, "packetHash": audio_hash},
        "validation": {"fullDecodePassed": True, "frameCountPassed": True,
                       "frameTimeGridPassed": True, "maxTimestampErrorSeconds": max_error,
                       "picturePacketsUnchanged": True, "picturePacketHash": picture_hash,
                       "audioPacketsMatchApprovedPreview": True, "inputsUnchanged": True,
                       "rasterVerificationPassedWithinTolerance": True, "exactPixelMatch": not bool(warnings),
                       "rasterFindings": warnings},
        "render": {**plan["render"], "sourceRevision": plan["sourceRevision"],
                   "log": plan["renderLog"], "result": render_result},
        "verification": {"log": plan["verifyLog"], "result": verify_result},
        "inputs": plan["inputs"],
    }
    write_json(DEST / "delivery.json", delivery)
    write_json(ROOT / "engine/film3-final-delivery.json", delivery)
    print(json.dumps({k: delivery[k] for k in ("version", "status", "video", "subtitles", "audio", "validation")},
                     ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "assemble"))
    args = parser.parse_args()
    plan = read_json(PLAN)
    (prepare if args.command == "prepare" else assemble)(plan)
