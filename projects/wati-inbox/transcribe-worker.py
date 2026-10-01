#!/usr/bin/env python3
"""Dictation worker for the Wati Inbox app (2026-10-01).

Reads one JSON request per line on stdin: {"id": "...", "path": "/abs/file.wav", "language": "fr"|null}
and answers one JSON line on stdout: {"id": "...", "text": "...", "language": "fr", "ms": 812} or {"id": ..., "error": "..."}.
The WAV must be 16 kHz, mono, 16-bit (the browser records it that way). The model (Whisper large-v3-turbo,
Apple MLX build) loads once per process and is downloaded from Hugging Face on first use (~1.6 GB, cached
under ~/.cache/huggingface). Started and kept alive by transcribe.mjs; nothing else calls it.
"""
import json
import os
import sys
import time
import wave

import numpy as np

MODEL = os.environ.get("WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")


def read_wav(path):
    with wave.open(path, "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError(f"expected 16 kHz mono 16-bit WAV, got {w.getframerate()} Hz, {w.getnchannels()} ch, {w.getsampwidth() * 8}-bit")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def main():
    # mlx_whisper imports scipy.signal only for word timestamps (timing.py), which dictation never asks for. The scipy
    # binaries shipped for Python 3.10 do not load on this macOS (dyld "__thread_bss" error, 2026-10-01), so a stub
    # module stands in for scipy.signal; everything else in mlx_whisper is untouched.
    import types
    stub = types.ModuleType("scipy.signal")
    stub.medfilt = None
    sys.modules.setdefault("scipy.signal", stub)
    try:
        import scipy  # noqa: F401
        scipy.signal = stub
    except Exception:  # noqa: BLE001
        pass
    import mlx_whisper  # imported here so a missing install is reported as a JSON error, not a crash before the loop

    sys.stdout.write(json.dumps({"ready": True, "model": MODEL}) + "\n")
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:  # noqa: BLE001
            sys.stdout.write(json.dumps({"error": f"bad request: {e}"}) + "\n")
            sys.stdout.flush()
            continue
        rid = req.get("id")
        try:
            t0 = time.time()
            audio = read_wav(req["path"])
            if len(audio) < 1600:  # under 0.1 s: nothing to hear
                out = {"id": rid, "text": "", "language": None, "ms": 0}
            else:
                res = mlx_whisper.transcribe(
                    audio,
                    path_or_hf_repo=MODEL,
                    language=req.get("language") or None,
                    fp16=True,
                    condition_on_previous_text=False,
                    no_speech_threshold=0.6,
                    initial_prompt=req.get("prompt") or None,
                )
                out = {"id": rid, "text": (res.get("text") or "").strip(), "language": res.get("language"), "ms": int((time.time() - t0) * 1000)}
        except Exception as e:  # noqa: BLE001
            out = {"id": rid, "error": str(e)[:300]}
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        sys.stdout.write(json.dumps({"error": f"worker failed: {e}"}) + "\n")
        sys.stdout.flush()
        sys.exit(1)
