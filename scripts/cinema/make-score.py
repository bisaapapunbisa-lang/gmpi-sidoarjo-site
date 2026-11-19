"""Original, deterministic cinematic score. No samples or third-party music.
Requires numpy/scipy. Writes a 24-second stereo WAV to the ignored cache.
"""
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt
import wave

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.cache' / 'cinema'
OUT.mkdir(parents=True, exist_ok=True)
sr = 48000
duration = 24
n = sr * duration
t = np.arange(n) / sr
rng = np.random.default_rng(20261031)
mix = np.zeros((n, 2), dtype=np.float64)

def filter_noise(cutoff, order=3):
    x = rng.normal(0, 1, n)
    return sosfilt(butter(order, cutoff, fs=sr, output='sos'), x)

def add(signal, pan=0, gain=1):
    angle = (pan + 1) * np.pi / 4
    mix[:, 0] += signal * np.cos(angle) * gain
    mix[:, 1] += signal * np.sin(angle) * gain

def env(at, attack, decay):
    x = np.maximum(0, t-at)
    return (1-np.exp(-x/max(attack,.001))) * np.exp(-x/decay) * (t >= at)

# A low D pedal with open fifths: restrained, original trailer sound design.
fade = np.clip(t/3,0,1) * np.clip((duration-t)/2.2,0,1)
pulse = .68 + .32*np.sin(2*np.pi*t/3.2)**2
for f, amp, pan in [(36.708,.15,0),(73.416,.075,-.2),(110,.035,.25),(146.832,.025,-.35)]:
    tone = np.sin(2*np.pi*f*t + .12*np.sin(2*np.pi*.13*t))
    add(tone*fade*pulse,pan,amp)
# Air and distant thunder, not a repeating strobe or siren.
add(filter_noise(260)*fade*(.025+.045*np.exp(-((t-2.5)/2.2)**2)), -.3)
add(filter_noise(1800)*fade*.009, .45)
# Lightning impact and sub-bass tail.
thunder = filter_noise(650)*env(2.12,.012,1.25)
add(thunder, -.12, .34)
add(np.sin(2*np.pi*(42*t+18*.08*(1-np.exp(-t/.08))))*env(2.12,.008,.85),0,.34)
# Slow rising pressure before the final light explosion.
rise_t = np.clip((t-14.4)/3.85,0,1)
rise = filter_noise(2400)*rise_t**2*(t<18.3)
add(rise,0,.12)
add(np.sin(2*np.pi*(80*t+9*t**2))*rise_t**2*(t<18.3),0,.025)
# Final impact: sub, broadband air, and a warm D-major-ish open chord.
add(filter_noise(900)*env(18.28,.009,.8),0,.36)
add(np.sin(2*np.pi*(38*t+22*.09*(1-np.exp(-t/.09))))*env(18.28,.006,1.3),0,.4)
for f, pan in [(146.832,-.5),(220,.4),(293.665,-.25),(440,.25),(587.33,.5)]:
    chord = (np.sin(2*np.pi*f*t)+.18*np.sin(2*np.pi*f*2.003*t))*env(18.3,.22,3.1)
    add(chord,pan,.038)
# Quiet metallic shimmer settles into the end card.
for f, pan in [(1174.66,-.6),(1760,.6),(2349.32,.1)]:
    add(np.sin(2*np.pi*f*t)*env(18.4,.04,2.4),pan,.008)
# Gentle short delays give stereo width without a copyrighted recording.
for delay, gain in [(0.021,.12),(.047,.07)]:
    d=int(delay*sr)
    mix[d:,0]+=mix[:-d,1]*gain
    mix[d:,1]+=mix[:-d,0]*gain
mix *= np.clip((duration-t)/1.2,0,1)[:,None]
mix = np.tanh(mix*1.25)
mix *= .82 / max(np.max(np.abs(mix)), .001)
pcm = (mix*32767).astype('<i2')
with wave.open(str(OUT/'score.wav'),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes(pcm.tobytes())
print(OUT/'score.wav')
