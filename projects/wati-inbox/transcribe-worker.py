#!/usr/bin/env python3
"""Dictation worker for the Wati Inbox app (2026-10-01).

Reads one JSON request per line on stdin:
  {"id": "...", "path": "/abs/file.wav", "language": "fr"|"en"|null, "prompt": "...", "fast": true|false}
and answers one JSON line on stdout:
  {"id": "...", "text": "...", "language": "fr", "ms": 812}  or  {"id": ..., "error": "..."}

Two models (Apple MLX builds, downloaded from Hugging Face on first use, cached under ~/.cache/huggingface):
  - fast=true  → WHISPER_FAST (small): the provisional text while Ali is still speaking, ~0.3 s a piece
  - fast=false → WHISPER_MODEL (large-v3-turbo): the final text of a piece once he paused, ~1 s
Language: Ali dictates in French or English only (2026-10-01). With no language given, the fast model picks the more
likely of the two on the piece; the client then passes that language for the rest of the dictation.
The WAV must be 16 kHz, mono, 16-bit (the browser records it that way). Started and kept alive by transcribe.mjs.
"""
import json
import os
import re
import sys
import time
import types
import wave

import numpy as np

MODEL = os.environ.get("WHISPER_MODEL", "mlx-community/whisper-large-v3-turbo")
FAST = os.environ.get("WHISPER_FAST", "mlx-community/whisper-small-mlx")
LANGS = ("fr", "en")


def read_wav(path):
    with wave.open(path, "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError(f"expected 16 kHz mono 16-bit WAV, got {w.getframerate()} Hz, {w.getnchannels()} ch, {w.getsampwidth() * 8}-bit")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


# Whisper invents words on silence or room noise ("Okay.", "Thank you.", "Merci.", subtitle credits). Ali, 2026-10-03: a
# dictation left running for 21 min filled the box with them. Keep only segments Whisper itself does not flag as
# no-speech, and drop a piece that is nothing but filler when the no-speech score is doubtful.
FILLER = {"okay", "ok", "thank you", "thanks", "thank you very much", "merci", "merci beaucoup", "d'accord", "bye", "au revoir",
          "sous-titres réalisés par la communauté d'amara.org", "sous-titrage st' 501", "thanks for watching", "you", "oui", "hmm", "mm"}


# Ali, 2026-10-04: the box fills with numbers (« 1 2 3 4 », « 100 100 100 ») when the mic hears noise or a breath. Whisper
# decodes digits on non-speech. Three guards: a piece too quiet to be speech is not decoded at all; a segment that is mostly
# digits, that repeats one token, or that Whisper itself flags (compression ratio, low confidence) is dropped; and the
# previous text passed as context loses its digits so a hallucinated number cannot breed the next one.
SILENCE_RMS, SILENCE_PEAK = 0.006, 0.03


def is_silence(samples):
    if not len(samples):
        return True
    rms = float(np.sqrt(np.mean(samples * samples)))
    return rms < SILENCE_RMS or float(np.max(np.abs(samples))) < SILENCE_PEAK


def hallucinated(txt, sg):
    bare = "".join(ch for ch in txt.lower() if ch.isalnum() or ch in " '").strip()
    alnum = [ch for ch in bare if ch.isalnum()]
    digits = sum(ch.isdigit() for ch in alnum)
    if len(alnum) >= 8 and digits / len(alnum) > 0.5:  # a string of numbers, not a sentence (« 15h » or « 990 euros » stay)
        return True
    tokens = bare.split()
    if len(tokens) >= 4 and len(set(tokens)) <= max(1, len(tokens) // 3):  # the same word over and over
        return True
    if float(sg.get("compression_ratio") or 0.0) > 2.4:  # Whisper's repetition-loop signature
        return True
    if float(sg.get("avg_logprob") or 0.0) < -1.2 and float(sg.get("no_speech_prob") or 0.0) > 0.25:  # low confidence on doubtful speech
        return True
    return False


def clean_prompt(prompt):
    if not prompt:
        return None
    p = re.sub(r"\d[\d\s.,:h€%]*", " ", prompt)  # digits out of the context: they are what Whisper copies on noise
    p = re.sub(r"\s+", " ", p).strip()[-200:]
    return p or None


def clean_text(res):
    segs = res.get("segments") or []
    if not segs:
        txt = (res.get("text") or "").strip()
        return "" if hallucinated(txt, {}) else txt
    kept = []
    for sg in segs:
        txt = (sg.get("text") or "").strip()
        if not txt:
            continue
        nsp = float(sg.get("no_speech_prob") or 0.0)
        if nsp > 0.5:  # Whisper's own verdict: more likely silence than speech
            continue
        bare = "".join(ch for ch in txt.lower() if ch.isalnum() or ch in " '").strip().rstrip(".!?")
        if bare in FILLER and nsp > 0.15:  # a bare "okay"/"thank you" with a doubtful score: the classic hallucination
            continue
        if hallucinated(txt, sg):
            continue
        kept.append(txt)
    return " ".join(kept).strip()


def main():
    # mlx_whisper imports scipy.signal only for word timestamps (timing.py), which dictation never asks for. The scipy
    # binaries shipped for Python 3.10 do not load on this macOS (dyld "__thread_bss" error, 2026-10-01), so a stub
    # module stands in for scipy.signal; everything else in mlx_whisper is untouched.
    stub = types.ModuleType("scipy.signal")
    stub.medfilt = None
    sys.modules.setdefault("scipy.signal", stub)
    try:
        import scipy  # noqa: F401
        scipy.signal = stub
    except Exception:  # noqa: BLE001
        pass
    import mlx.core as mx
    import mlx_whisper
    from mlx_whisper import audio as wa
    from mlx_whisper import decoding
    from mlx_whisper.transcribe import ModelHolder
    from mlx_whisper.load_models import load_model

    # mlx_whisper keeps ONE model in memory and reloads from disk when the repo changes: alternating fast/final would
    # cost ~1.5 s per call. Keep both resident instead, and load them now so the first piece is not slow.
    cache = {}

    def get_model(path, dtype=mx.float16):
        key = (path, str(dtype))
        if key not in cache:
            cache[key] = load_model(path, dtype=dtype)
        return cache[key]

    ModelHolder.get_model = staticmethod(get_model)
    get_model(FAST)
    get_model(MODEL)

    def pick_language(samples):
        """fr or en, whichever the fast model finds more likely on this piece (restricted detection)."""
        model = ModelHolder.get_model(FAST, mx.float16)
        mel = wa.log_mel_spectrogram(samples, n_mels=model.dims.n_mels, padding=wa.N_SAMPLES)
        seg = wa.pad_or_trim(mel, wa.N_FRAMES, axis=-2).astype(mx.float16)
        _, probs = decoding.detect_language(model, seg)
        p = probs[0] if isinstance(probs, list) else probs
        return max(LANGS, key=lambda l: float(p.get(l, 0.0)))

    sys.stdout.write(json.dumps({"ready": True, "model": MODEL, "fast": FAST}) + "\n")
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
            samples = read_wav(req["path"])
            if len(samples) < 1600 or is_silence(samples):  # under 0.1 s, or too quiet to be speech: nothing to decode (no hallucination possible)
                out = {"id": rid, "text": "", "language": req.get("language") if req.get("language") in LANGS else None, "ms": 0}
            else:
                lang = req.get("language") if req.get("language") in LANGS else pick_language(samples)
                res = mlx_whisper.transcribe(
                    samples,
                    path_or_hf_repo=FAST if req.get("fast") else MODEL,
                    language=lang,
                    fp16=True,
                    temperature=0.0,  # one pass, no fallback decodes: speed over the last percent of quality
                    condition_on_previous_text=False,
                    no_speech_threshold=0.6,
                    initial_prompt=clean_prompt(req.get("prompt")),
                )
                out = {"id": rid, "text": clean_text(res), "language": lang, "ms": int((time.time() - t0) * 1000)}
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
