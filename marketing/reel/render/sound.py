"""Soundtrack for "You called that?" (15 s, no voice): room tone, phone buzzes, the TV in the next room (the stadium
crowd, the run-up, the crack, half a beat of silence, the eruption), the friends shouting and clapping, typing, and the
crowd fading over the end card. python sound.py out.wav"""
import sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

SR, DUR = 48000, 15.0
N = int(SR * DUR); t = np.arange(N) / SR
rng = np.random.default_rng(7)
out = np.zeros((N, 2))

def bp(x, a, b): return sosfilt(butter(2, [a, b], "band", fs=SR, output="sos"), x)
def lp(x, f): return sosfilt(butter(2, f, "low", fs=SR, output="sos"), x)
def hp(x, f): return sosfilt(butter(2, f, "high", fs=SR, output="sos"), x)
def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR); j = min(N, i + len(sig))
    if j <= i: return
    s = sig[: j - i] * gain
    out[i:j, 0] += s * (1 - max(0, pan)); out[i:j, 1] += s * (1 + min(0, pan))
def env(a, b, att, rel): return np.clip((t - a) / max(att, 1e-3), 0, 1) * np.clip((b - t) / max(rel, 1e-3), 0, 1)

# small room: a short decaying noise impulse
ir = rng.standard_normal(int(SR * 0.35)) * np.exp(-np.arange(int(SR * 0.35)) / SR * 14); ir[0] = 6; ir /= np.abs(ir).sum() / 4
def room(x, wet=0.35): return (1 - wet) * x + wet * fftconvolve(x, ir)[: len(x)]

def tv(x):  # through a TV speaker in the next room
    return room(bp(x, 220, 5200) * 0.9, 0.3)

# ── room tone and the stadium under the commentary (from the TV) ──
roomtone = lp(rng.standard_normal(N), 300) * 0.012
out[:, 0] += roomtone; out[:, 1] += np.roll(roomtone, 500)
crowd = bp(rng.standard_normal(N), 250, 2500)
murmur = 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 0.35 * t + rng.random()))
lev = 0.035 * murmur * env(0, 15, 0.5, 0.1)
lev += 0.05 * env(2.4, 6.5, 2.0, 0.05)           # the crowd builds with the run-up
lev *= np.where((t > 6.55) & (t < 6.95), 0.25, 1)   # half a beat of silence after the crack
lev += 0.55 * env(6.95, 15, 0.08, 4.5)            # the stadium erupts and slowly fades
stad = tv(crowd) * lev
out[:, 0] += stad; out[:, 1] += np.roll(stad, 300)

# ── phone on the coffee table ──
def buzz(dur=0.35):
    n = int(SR * dur); tt = np.arange(n) / SR
    s = np.sign(np.sin(2 * np.pi * 170 * tt)) * 0.5 + np.sin(2 * np.pi * 85 * tt)
    s *= (np.sin(2 * np.pi * 14 * tt) > -0.2) * np.exp(-tt * 2)            # the motor's pulse
    return lp(s, 900) + 0.3 * bp(rng.standard_normal(n), 1500, 5000) * np.exp(-tt * 9)   # rattle on wood
add(buzz(), 0.25, 0.25); add(buzz(), 1.15, 0.25); add(buzz(0.5), 7.55, 0.3)

# no commentary in this version: the TV is heard, not narrated
steps = np.zeros(int(SR * 0.9))
for k, d in enumerate(np.linspace(0, 0.7, 7)):                  # the bowler's last strides (on the TV)
    i = int(d * SR); n = int(SR * 0.05); tt = np.arange(n) / SR
    steps[i:i + n] += bp(rng.standard_normal(n), 120, 900) * np.exp(-tt * 70) * (0.4 + 0.1 * k)
add(tv(steps), 5.75, 0.6)
n = int(SR * 0.4); tt = np.arange(n) / SR                       # the crack of the bat
crack = hp(rng.standard_normal(n), 1800) * np.exp(-tt * 60) + 0.7 * np.sin(2 * np.pi * (1400 - 600 * tt) * tt) * np.exp(-tt * 40)
add(tv(crack), 6.5, 0.9)

# ── the room erupts: a few friends on the sofa ──
for k in range(5):
    n = int(SR * rng.uniform(1.0, 1.8)); tt = np.arange(n) / SR
    f0 = rng.uniform(140, 260); vib = np.sin(2 * np.pi * 5 * tt) * 8
    v = sum(a * np.sin(2 * np.pi * (f0 * m + vib) * tt) for m, a in [(1, 1), (2, .5), (3, .3), (4, .15)])
    v = bp(v + 0.4 * rng.standard_normal(n), 300, 3200) * np.clip(tt / 0.06, 0, 1) * np.exp(-tt * 1.4)
    add(room(v, 0.4), 7.0 + rng.uniform(0, 0.25), 0.11, rng.uniform(-.6, .6))
for k in range(9):                                              # claps and a slap on the table
    n = int(SR * 0.04); tt = np.arange(n) / SR
    add(room(bp(rng.standard_normal(n), 900, 6000) * np.exp(-tt * 120), 0.3), 7.3 + k * 0.17 + rng.uniform(0, .04), 0.25, rng.uniform(-.4, .4))

# ── typing the reply (10.75–12 s) ──
for k in range(18):
    n = int(SR * 0.025); tt = np.arange(n) / SR
    add(bp(rng.standard_normal(n), 2000, 7000) * np.exp(-tt * 200), 10.78 + k * 0.068 + rng.uniform(0, .03), 0.08, 0.2)

out *= np.clip((DUR - t) / 1.2, 0, 1)[:, None]
out /= np.abs(out).max() / 0.89
sf.write(sys.argv[1], out.astype(np.float32), SR)
print("wrote", sys.argv[1])
