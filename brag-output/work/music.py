"""Soundtrack for the NOPA Clubhouse brag: 120 BPM, C major, 21 s.
Every event sits on one beat grid counted from frame 0 (beat = 0.5 s)."""
import numpy as np, wave

SR = 44100
DUR = 21.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)

def buf(): return np.zeros(N)
def idx(t): return int(round(t * SR))
def env_exp(n, tau): return np.exp(-np.arange(n) / (tau * SR))
def note_hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)

def add(dst, sig, t, gain=1.0):
    i = idx(t)
    if i >= N: return
    j = min(N, i + len(sig))
    dst[i:j] += sig[: j - i] * gain

def lowpass(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / cutoff) ** 4), len(x))

def highpass(x, cutoff):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (1 - 1 / np.sqrt(1 + (f / cutoff) ** 4)), len(x))

def bandpass(x, lo, hi): return lowpass(highpass(x, lo), hi)

# ---- instruments -------------------------------------------------------
def kick():
    n = int(.32 * SR); tt = np.arange(n) / SR
    f = 46 + 90 * np.exp(-tt / .035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = np.exp(-tt / .002) * .25
    return (np.sin(ph) * np.exp(-tt / .16) + click) * .95

CLAP = bandpass(rng.standard_normal(int(.22 * SR)), 900, 3200) * env_exp(int(.22 * SR), .055)
CLAP /= np.abs(CLAP).max()
HAT = highpass(rng.standard_normal(int(.06 * SR)), 7000) * env_exp(int(.06 * SR), .012)
HAT /= np.abs(HAT).max()

def saw(f, n, detune=0.0):
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        ph = (tt * f * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / 3

def pad_chord(midis, n):
    s = sum(saw(note_hz(m), n, .004) for m in midis) / len(midis)
    a = np.minimum(1, np.arange(n) / (.08 * SR)); r = np.minimum(1, (n - np.arange(n)) / (.12 * SR))
    return s * a * r

def bass_note(m, n):
    tt = np.arange(n) / SR; f = note_hz(m)
    s = np.sin(2 * np.pi * f * tt) * .8 + saw(f, n) * .25
    return s * np.minimum(1, np.arange(n) / 80) * np.exp(-tt / .22)

def pluck(m, n=int(.3 * SR)):
    tt = np.arange(n) / SR; f = note_hz(m)
    tri = 2 * np.abs(2 * ((tt * f) % 1) - 1) - 1
    return tri * np.exp(-tt / .09) * np.minimum(1, np.arange(n) / 40)

def pock(m, gain=1.0):
    """A padel ball off a racquet: a short pitched knock tuned to the key, plus a felt click."""
    n = int(.09 * SR); tt = np.arange(n) / SR; f = note_hz(m)
    body = np.sin(2 * np.pi * f * tt * (1 - .08 * tt / .09)) * np.exp(-tt / .018)
    body += .35 * np.sin(2 * np.pi * f * 2.01 * tt) * np.exp(-tt / .008)
    click = bandpass(rng.standard_normal(n), 1500, 6000) * np.exp(-tt / .0025) * .5
    return (body + click) * gain

def bell(m, n=int(1.6 * SR)):
    tt = np.arange(n) / SR; f = note_hz(m)
    s = sum(a * np.sin(2 * np.pi * f * k * tt) * np.exp(-tt / d) for k, a, d in ((1, 1, .9), (2.0, .5, .5), (3.01, .25, .3), (4.2, .12, .2)))
    return s * np.minimum(1, np.arange(n) / 30)

def riser(dur):
    n = int(dur * SR); x = rng.standard_normal(n)
    out = np.zeros(n); seg = int(.05 * SR)
    for k in range(0, n, seg):
        c = 600 + 7000 * (k / n) ** 2
        out[k:k + seg] = bandpass(x[k:k + seg] if k + seg <= n else x[k:], c * .6, c * 1.4)[: len(out[k:k + seg])]
    return out * (np.arange(n) / n) ** 2 / max(1e-9, np.abs(out).max())

def crash(dur=1.4):
    n = int(dur * SR)
    return highpass(rng.standard_normal(n), 4500) * env_exp(n, .35) * .5

# ---- arrangement -------------------------------------------------------
drums, bass, pads, plucks, sfx = buf(), buf(), buf(), buf(), buf()
K = kick()
CH = {"C": [60, 64, 67, 71], "G": [55, 59, 62, 67], "Am": [57, 60, 64, 67], "F": [53, 57, 60, 64]}
ROOT = {"C": 36, "G": 43, "Am": 45, "F": 41}
# bars of 2 s; bar 0-1 hook (sparse), 2-8 groove, 9 outro, then the final chord at 20.0
prog = ["Am", "F", "C", "G", "Am", "F", "C", "G", "Am", "F"]

kick_times = []
for bar, ch in enumerate(prog):
    t0 = bar * 2.0
    n = int(2.0 * SR)
    pad = lowpass(pad_chord(CH[ch], n), 900 if bar < 2 else 2600)
    add(pads, pad, t0, .55 if bar < 2 else .42)
    for b in range(4):
        tb = t0 + b * BEAT
        if bar < 2:
            if b in (0, 2): add(drums, lowpass(K, 300), tb, .55); kick_times.append(tb)
            continue
        if bar <= 8 or (bar == 9 and b < 2):
            add(drums, K, tb); kick_times.append(tb)
            if b in (1, 3): add(drums, CLAP, tb, .32)
        for e in range(2):
            te = tb + e * .25
            if bar >= 2 and bar <= 8:
                add(drums, HAT, te + .25 if e == 0 else te, .10 if e else .06)
                add(bass, bass_note(ROOT[ch] + (12 if e else 0), int(.24 * SR)), te, .55)
        if 3 <= bar <= 8:  # 16th-note arpeggio from the join scene on
            for s in range(4):
                m = CH[ch][(b * 4 + s) % 4] + 12
                add(plucks, pluck(m), tb + s * .125, .16 if s == 0 else .1)

# final chord at 20.0, ringing out
fin = lowpass(pad_chord(CH["C"] + [72], int(1.0 * SR)), 2200)
add(pads, fin * np.linspace(1, 0, len(fin)) ** .6, 20.0, .5)
add(bass, bass_note(36, int(.9 * SR)), 20.0, .7)
add(drums, K, 20.0, .9); kick_times.append(20.0)
add(sfx, bell(84), 20.0, .16)

# transitions
add(sfx, riser(1.0), 3.0, .22)
add(sfx, crash(), 4.0, .35)
add(sfx, riser(1.0), 15.5, .16)
add(sfx, crash(1.8), 16.5, .2)

# ---- sound effects on the picture's beats -------------------------------
for t, m in ((0.0, 79), (0.5, 84), (1.0, 88), (1.5, 91)):          # hook lines + ball bounces
    add(sfx, pock(m), t, .2)
for k in range(6):                                                  # code letters
    add(sfx, pock(84 if k % 2 == 0 else 88), 7.75 + k * .25, .09)
for t in (11.25, 11.5, 11.75, 12.0):                                # score digits
    add(sfx, pock(91), t, .07)
add(sfx, pock(79), 12.25, .22)                                      # submit
add(sfx, bell(88, int(.8 * SR)), 12.5, .08)                         # re-rank 1
add(sfx, pock(86), 13.25, .14)                                       # court 2 toast
add(sfx, bell(91, int(.8 * SR)), 13.5, .08)                         # re-rank 2
add(sfx, pock(76), 15.5, .2); add(sfx, pock(79), 16.0, .2)        # podium 3rd, 2nd
add(sfx, bell(84), 16.5, .22); add(sfx, bell(88), 16.5, .14)        # winner
for t, m in ((18.5, 79), (19.0, 84), (19.5, 88)):                   # Host. Join. Play.
    add(sfx, pock(m), t, .16)

# ---- mix ----------------------------------------------------------------
side = np.ones(N)
dk = int(.18 * SR)
shape = 1 - .55 * np.exp(-np.arange(dk) / (.06 * SR))
for kt in kick_times:
    i = idx(kt); j = min(N, i + dk); side[i:j] = np.minimum(side[i:j], shape[: j - i])
pads *= side; bass *= side; plucks *= (.5 + .5 * side)

sfx = lowpass(sfx, 9000)  # nothing harsh

def spread(x, ms):
    d = int(ms / 1000 * SR); y = np.zeros_like(x); y[d:] = x[:-d]; return y

L = drums * .8 + bass * .8 + pads * .9 + plucks * .9 + sfx
R = drums * .8 + bass * .8 + spread(pads, 9) * .9 + spread(plucks, 6) * .75 + sfx
st = np.stack([L, R], 1)
fade = np.ones(N); fn = int(.5 * SR); fade[-fn:] = np.linspace(1, 0, fn) ** 1.5
fi = int(.01 * SR); fade[:fi] = np.linspace(0, 1, fi)
st *= fade[:, None]
st = np.tanh(st * 1.15) / np.tanh(1.15)
st *= (10 ** (-1 / 20)) / np.abs(st).max()

with wave.open("music.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype("<i2").tobytes())
print("wrote music.wav", st.shape[0] / SR, "s")
