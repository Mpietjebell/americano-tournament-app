"""Soundtracks for the two vertical brag videos (host, player).
120 BPM in C major; every event sits on one beat grid counted from frame 0 (beat = 0.5 s).
Usage: python3 music2.py host|player"""
import sys, wave
import numpy as np

V = sys.argv[1]
SR = 44100
BEAT = 0.5
rng = np.random.default_rng(11)

CFG = {
    # groove_end: drums stop; then a two-bar breakdown and the final chord at final_at
    "host":   dict(dur=23.0, groove_end=20.0, final_at=22.0),
    "player": dict(dur=22.0, groove_end=18.0, final_at=20.0),
}[V]
DUR = CFG["dur"]; N = int(SR * DUR)

def buf(): return np.zeros(N)
def idx(t): return int(round(t * SR))
def env_exp(n, tau): return np.exp(-np.arange(n) / (tau * SR))
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def add(dst, sig, t, g=1.0):
    i = idx(t)
    if i >= N: return
    j = min(N, i + len(sig)); dst[i:j] += sig[: j - i] * g
def lowpass(x, c):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); return np.fft.irfft(X / np.sqrt(1 + (f / c) ** 4), len(x))
def highpass(x, c):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); return np.fft.irfft(X * (1 - 1 / np.sqrt(1 + (f / c) ** 4)), len(x))
def bandpass(x, lo, hi): return lowpass(highpass(x, lo), hi)

def kick():
    n = int(.32 * SR); tt = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(46 + 90 * np.exp(-tt / .035)) / SR
    return (np.sin(ph) * np.exp(-tt / .16) + np.exp(-tt / .002) * .25) * .95
CLAP = bandpass(rng.standard_normal(int(.22 * SR)), 900, 3200) * env_exp(int(.22 * SR), .055); CLAP /= np.abs(CLAP).max()
HAT = highpass(rng.standard_normal(int(.06 * SR)), 7000) * env_exp(int(.06 * SR), .012); HAT /= np.abs(HAT).max()
def saw(f, n, d=0.0):
    tt = np.arange(n) / SR; return sum(2 * ((tt * f * (1 + k)) % 1.0) - 1 for k in (-d, 0, d)) / 3
def pad_chord(ms, n):
    s = sum(saw(hz(m), n, .004) for m in ms) / len(ms)
    return s * np.minimum(1, np.arange(n) / (.08 * SR)) * np.minimum(1, (n - np.arange(n)) / (.12 * SR))
def bass_note(m, n):
    tt = np.arange(n) / SR; f = hz(m)
    return (np.sin(2 * np.pi * f * tt) * .8 + saw(f, n) * .25) * np.minimum(1, np.arange(n) / 80) * np.exp(-tt / .22)
def pluck(m, n=int(.3 * SR)):
    tt = np.arange(n) / SR; f = hz(m)
    return (2 * np.abs(2 * ((tt * f) % 1) - 1) - 1) * np.exp(-tt / .09) * np.minimum(1, np.arange(n) / 40)
def pock(m):
    n = int(.09 * SR); tt = np.arange(n) / SR; f = hz(m)
    body = np.sin(2 * np.pi * f * tt * (1 - .08 * tt / .09)) * np.exp(-tt / .018) + .35 * np.sin(2 * np.pi * f * 2.01 * tt) * np.exp(-tt / .008)
    return body + bandpass(rng.standard_normal(n), 1500, 6000) * np.exp(-tt / .0025) * .5
def bell(m, n=int(1.6 * SR)):
    tt = np.arange(n) / SR; f = hz(m)
    return sum(a * np.sin(2 * np.pi * f * k * tt) * np.exp(-tt / d) for k, a, d in ((1, 1, .9), (2.0, .5, .5), (3.01, .25, .3), (4.2, .12, .2))) * np.minimum(1, np.arange(n) / 30)
def riser(dur):
    n = int(dur * SR); x = rng.standard_normal(n); out = np.zeros(n); seg = int(.05 * SR)
    for k in range(0, n, seg):
        c = 600 + 7000 * (k / n) ** 2; part = x[k:k + seg]
        out[k:k + len(part)] = bandpass(part, c * .6, c * 1.4)
    return out * (np.arange(n) / n) ** 2 / max(1e-9, np.abs(out).max())
def crash(dur=1.4):
    n = int(dur * SR); return highpass(rng.standard_normal(n), 4500) * env_exp(n, .35) * .5

drums, bass, pads, plucks, sfx = buf(), buf(), buf(), buf(), buf()
K = kick()
CH = {"C": [60, 64, 67, 71], "G": [55, 59, 62, 67], "Am": [57, 60, 64, 67], "F": [53, 57, 60, 64]}
ROOT = {"C": 36, "G": 43, "Am": 45, "F": 41}
CYCLE = ["C", "G", "Am", "F"]
kicks = []
nbars = int(CFG["final_at"] // 2)
for bar in range(nbars):
    t0 = bar * 2.0
    hook = bar < 2
    breakdown = t0 >= CFG["groove_end"]
    ch = ["Am", "F"][bar] if hook else ("F" if breakdown else CYCLE[(bar - 2) % 4])
    add(pads, lowpass(pad_chord(CH[ch], int(2.0 * SR)), 900 if hook or breakdown else 2600), t0, .55 if hook or breakdown else .42)
    for b in range(4):
        tb = t0 + b * BEAT
        if hook:
            if b in (0, 2): add(drums, lowpass(K, 300), tb, .55); kicks.append(tb)
            continue
        if breakdown:
            add(drums, HAT, tb + .25, .06)
            continue
        add(drums, K, tb); kicks.append(tb)
        if b in (1, 3): add(drums, CLAP, tb, .32)
        for e in range(2):
            te = tb + e * .25
            add(drums, HAT, te + .25 if e == 0 else te, .10 if e else .06)
            add(bass, bass_note(ROOT[ch] + (12 if e else 0), int(.24 * SR)), te, .55)
        if bar >= 3:
            for s in range(4):
                add(plucks, pluck(CH[ch][(b * 4 + s) % 4] + 12), tb + s * .125, .16 if s == 0 else .1)

fa = CFG["final_at"]; ring = int((DUR - fa) * SR)
fin = lowpass(pad_chord(CH["C"] + [72], ring), 2200)
add(pads, fin * np.linspace(1, 0, ring) ** .6, fa, .5)
add(bass, bass_note(36, int(.9 * SR)), fa, .7)
add(drums, K, fa, .9); kicks.append(fa)
add(sfx, bell(84), fa, .14)
add(sfx, riser(1.0), 3.0, .22)
add(sfx, crash(), 4.0, .35)

# effects on the picture's events (times match vertical.html)
def P(t, m, g): add(sfx, pock(m), t, g)
def B(t, m, g, n=.8): add(sfx, bell(m, int(n * SR)), t, g)
for k, t in enumerate((0, .5, 1.0, 1.5, 2.0)): P(t, (79, 84, 88, 91, 96)[k], .18)     # ball bounces under the hook lines
P(2.5, 84, .1)
if V == "host":
    P(5.0, 91, .16); P(7.0, 88, .14)                                   # taps: Host, Americano
    for k in range(4): P(8.5 + k * .25, (84, 88, 91, 96)[k], .08)    # chips
    B(9.5, 84, .07)                                                    # stats card
    for k in range(6): P(11.5 + k * .25, 84 if k % 2 == 0 else 88, .08)   # code letters
    for k in range(8): P(12.25 + k * .125, 91, .035)                  # friends joining
    for t in (14.0, 14.25, 14.5, 14.75): P(t, 91, .06)                # score digits
    P(15.0, 79, .2)                                                    # submit
    B(15.25, 88, .07); B(16.0, 91, .07)                                # re-ranks
    add(sfx, riser(1.0), 17.5, .14)
    P(17.5, 76, .18); P(18.0, 79, .18)                                 # podium 3rd, 2nd
    B(18.5, 84, .2, 1.6); B(18.5, 88, .12, 1.6); add(sfx, crash(1.8), 18.5, .18)
    P(20.0, 79, .14); P(20.5, 84, .14)                                 # outro lines
else:
    for k in range(6): P(4.75 + k * .25, 84 if k % 2 == 0 else 88, .08)    # code letters
    P(6.5, 79, .2); B(6.75, 88, .07)                                   # find tournament, found
    for k in range(17): P(8.0 + k * .8 / 17, 96, .02)                 # email typing (light keys)
    P(9.0, 84, .12)
    for k in range(5): P(9.4 + k * .07, 96, .025)                     # name typing
    B(10.0, 91, .09)                                                   # you're in
    B(12.0, 88, .07); B(13.0, 91, .07)                                 # table re-ranks
    B(14.7, 72, .06, 1.2)                                              # sealed
    add(sfx, riser(.75), 15.25, .14)
    P(16.25, 76, .18); P(16.75, 79, .18)                               # podium 3rd, 2nd
    B(17.25, 84, .2, 1.6); B(17.25, 88, .12, 1.6); add(sfx, crash(1.8), 17.25, .18)
    P(18.5, 79, .14); P(19.0, 84, .14)                                 # outro lines

side = np.ones(N); dk = int(.18 * SR); shape = 1 - .55 * np.exp(-np.arange(dk) / (.06 * SR))
for kt in kicks:
    i = idx(kt); j = min(N, i + dk); side[i:j] = np.minimum(side[i:j], shape[: j - i])
pads *= side; bass *= side; plucks *= (.5 + .5 * side)
sfx = lowpass(sfx, 9000)
def spread(x, ms):
    d = int(ms / 1000 * SR); y = np.zeros_like(x); y[d:] = x[:-d]; return y
L = drums * .8 + bass * .8 + pads * .9 + plucks * .9 + sfx
R = drums * .8 + bass * .8 + spread(pads, 9) * .9 + spread(plucks, 6) * .75 + sfx
st = np.stack([L, R], 1)
fade = np.ones(N); fn = int(.6 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 1.5; fade[:441] = np.linspace(0, 1, 441)
st *= fade[:, None]
st = np.tanh(st * 1.15) / np.tanh(1.15)
st *= (10 ** (-1 / 20)) / np.abs(st).max()
with wave.open(f"music-{V}.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype("<i2").tobytes())
print(V, "wrote", DUR, "s")
