"""Mix the selected Indonesian voiceover into the original cinematic score.

Cues (film time):
  00:00.00  sub-boom / tense silence
  00:02.05  VO 1 — Di bawah satu bendera...
  00:05.05  VO 2 — Kami lahir... dan berjuang...
  00:08.05  VO 3 — Setia Bersaudara Sampai Urat Nadi!

Requires: numpy, scipy, imageio-ffmpeg. The source MP3s live in
assets/cinema/voiceover/ and are committed; intermediate WAVs stay in .cache/.
"""
from pathlib import Path
import subprocess
import wave
import numpy as np
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache' / 'cinema'
CACHE.mkdir(parents=True, exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
DURATION = 24.0
N = int(SR * DURATION)
t = np.arange(N) / SR

CUES = [
    ('vo-01-bendera', 2.05, 2.90, 1.00),
    ('vo-02-masyarakat', 5.05, 2.90, 1.00),
    ('vo-03-setia', 8.05, 3.20, 1.08),
]


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def read_wav(path):
    with wave.open(str(path), 'rb') as w:
        assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2
        return np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768.0


def write_wav(path, x):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


def decode_mp3(name):
    out = CACHE / f'{name}-raw.wav'
    run([FF, '-v', 'error', '-y', '-i', str(ROOT / 'assets/cinema/voiceover' / f'{name}.mp3'),
         '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s16le', str(out)])
    return read_wav(out)


def trim_silence(x):
    win = 960
    rms = np.sqrt(np.convolve(x * x, np.ones(win) / win, mode='same'))
    threshold = max(0.004, float(np.percentile(rms, 95)) * 0.08)
    active = rms > threshold
    idx = np.flatnonzero(active)
    if len(idx) == 0:
        return x
    segments = []
    start = prev = idx[0]
    for i in idx[1:]:
        if i - prev > int(0.20 * SR):
            segments.append((start, prev))
            start = i
        prev = i
    segments.append((start, prev))
    gap = int(0.08 * SR)
    parts = []
    for i, (a, b) in enumerate(segments):
        a = max(0, a - int(0.025 * SR))
        b = min(len(x), b + int(0.055 * SR))
        if i:
            parts.append(np.zeros(gap))
        parts.append(x[a:b])
    y = np.concatenate(parts)
    f = int(0.012 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y


def fit_duration(x, target, name):
    duration = len(x) / SR
    if duration <= target:
        return x
    ratio = duration / target
    if ratio > 2.0:
        raise RuntimeError(f'{name} needs atempo {ratio:.2f}; re-record a shorter take.')
    src = CACHE / f'{name}-trim.wav'
    dst = CACHE / f'{name}-fit.wav'
    write_wav(src, x)
    run([FF, '-v', 'error', '-y', '-i', str(src), '-af', f'atempo={ratio:.6f}',
         '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s16le', str(dst)])
    return read_wav(dst)


def env(at, attack, decay):
    x = np.maximum(0, t - at)
    return (1 - np.exp(-x / max(attack, 0.001))) * np.exp(-x / decay) * (t >= at)


def main():
    score_path = CACHE / 'score.wav'
    if not score_path.exists():
        raise SystemExit('Generate the score first: .venv/bin/python scripts/cinema/make-score.py')
    with wave.open(str(score_path), 'rb') as w:
        assert w.getnchannels() == 2 and w.getframerate() == SR
        score = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64).reshape(-1, 2) / 32768.0
    if len(score) < N:
        score = np.pad(score, ((0, N - len(score)), (0, 0)))
    score = score[:N]

    vo = np.zeros(N)
    duck = np.ones(N)
    for name, start, target, gain in CUES:
        x = trim_silence(decode_mp3(name))
        x = fit_duration(x, target, name)
        x = x / max(np.max(np.abs(x)), 0.001) * 0.92
        a = int(start * SR)
        b = min(N, a + len(x))
        vo[a:b] += x[:b - a] * gain
        # Smooth music duck so the words stay forward without pumping.
        ramp = int(0.09 * SR)
        d0 = max(0, a - ramp)
        d1 = min(N, b + ramp)
        duck[d0:a] = np.minimum(duck[d0:a], np.linspace(1, 0.34, a - d0))
        duck[a:b] = np.minimum(duck[a:b], 0.34)
        duck[b:d1] = np.minimum(duck[b:d1], np.linspace(0.34, 1, d1 - b))
        print(f'{name}: start={start:.2f}s length={(b-a)/SR:.2f}s')

    # Gentle center-voice widening and a short trailer tail, kept intelligible.
    vo_stereo = np.zeros((N, 2))
    vo_stereo[:, 0] = vo
    vo_stereo[:, 1] = vo
    for delay, g in [(0.023, 0.10), (0.047, 0.05)]:
        d = int(delay * SR)
        vo_stereo[d:, 0] += vo[:-d] * g
        vo_stereo[d:, 1] += vo[:-d] * g

    # Cue 0: sub-boom in the opening darkness.
    rng = np.random.default_rng(8)
    boom = np.sin(2 * np.pi * (38 * t + 16 * 0.09 * (1 - np.exp(-t / 0.09)))) * env(0.02, 0.006, 1.15)
    boom += rng.normal(0, 1, N) * env(0.02, 0.004, 0.35) * 0.10
    # Cue 3: a firm impact under the final motto (the 18.28s light climax remains).
    hit = np.sin(2 * np.pi * (40 * t + 18 * 0.08 * (1 - np.exp(-t / 0.08)))) * env(8.02, 0.006, 0.9)
    hit += rng.normal(0, 1, N) * env(8.02, 0.004, 0.45) * 0.12

    mix = score * duck[:, None] + vo_stereo * 0.95
    mix[:, 0] += boom * 0.30 + hit * 0.26
    mix[:, 1] += boom * 0.30 + hit * 0.26
    mix *= np.clip((DURATION - t) / 1.2, 0, 1)[:, None]
    mix = np.tanh(mix * 1.18)
    mix *= 0.89 / max(np.max(np.abs(mix)), 0.001)

    out_wav = CACHE / 'score-vo.wav'
    with wave.open(str(out_wav), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((mix * 32767).astype('<i2').tobytes())
    out_m4a = ROOT / 'assets/cinema/score-vo.m4a'
    run([FF, '-v', 'error', '-y', '-i', str(out_wav), '-c:a', 'aac', '-b:a', '160k',
         '-movflags', '+faststart', str(out_m4a)])
    print(out_wav)
    print(out_m4a)


if __name__ == '__main__':
    main()
